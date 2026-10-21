'use strict';
const byok = require('./byok');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const { constants } = require('node:fs');
const { createHash } = require('node:crypto');
const { ServiceError } = require('./client');
const MAX_FILES = 20, MAX_FILE_BYTES = 24576, MAX_TOTAL_BYTES = 65536;
const sha256 = text => createHash('sha256').update(text).digest('hex');
const refuse = message => { throw new ServiceError('coding_refused', message); };
function safePath(value) {
  if (typeof value !== 'string' || value.length > 240 || !value || value.includes('\\') || value.startsWith('/') || /[\x00-\x1f:]/.test(value) || value.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.')) || /(?:^|\/)(?:.*(?:secret|credential|private[_-]?key).*|id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx|sqlite|db)|.*lock)$/i.test(value)) refuse('Choose ordinary source files with safe relative paths; credential and hidden files are excluded.');
  if (/credential|secret|id_rsa|id_ed25519|token|password/i.test(value) || !/\.(?:py|js|mjs|cjs|json|txt|md)$/i.test(value)) refuse('Credential names and unsupported file types cannot be uploaded.');
  return value;
}
async function checked(guard, promise) { const result = await promise; await guard(); return result; }
async function safeTarget(root, relative, guard, absent = false) {
  safePath(relative);
  const rootStat = await checked(guard, fs.lstat(root));
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) refuse('The selected workspace root must be a real directory.');
  if (await checked(guard, fs.realpath(root)) !== root) refuse('The workspace root changed.');
  const parts = relative.split('/'); let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let stat;
    try { stat = await checked(guard, fs.lstat(current)); }
    catch (e) { if (e.code === 'ENOENT' && absent && i === parts.length - 1) { await guard(); return current; } throw e; }
    if (stat.isSymbolicLink() || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) refuse('Links and special files cannot be captured or changed.');
    if (absent && i === parts.length - 1) refuse('A proposed new file already exists.');
  }
  return current;
}
async function readSafe(root, relative, guard) {
  const target = await safeTarget(root, relative, guard);
  const handle = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await guard();
    const stat = await checked(guard, handle.stat());
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES || stat.nlink !== 1) refuse('Only bounded regular files with one link can be captured.');
    const buffer = await checked(guard, handle.readFile());
    await safeTarget(root, relative, guard);
    const current = await checked(guard, fs.lstat(target));
    if (current.dev !== stat.dev || current.ino !== stat.ino || current.size !== buffer.length || current.mtimeMs !== stat.mtimeMs) refuse('A selected file changed while being read.');
    return buffer;
  } finally { await handle.close(); await guard(); }
}
function dirty(vscode, target) { return (vscode.workspace.textDocuments || []).some(d => path.resolve(d.uri.fsPath || '') === target && d.isDirty); }
async function selectFiles({ choose, next, guard = async () => {} }) {
  const selected = new Map();
  for (let attempt=0;attempt<MAX_FILES*2;attempt++) {
    const picked = await checked(guard,choose());
    if (!Array.isArray(picked) || !picked.length) return null;
    for (const uri of picked) {
      if (!uri || typeof uri.fsPath !== 'string' || !uri.fsPath) refuse('The selected source file path is invalid.');
      selected.set(path.resolve(uri.fsPath),uri);
    }
    if (selected.size>MAX_FILES) refuse('Select no more than '+MAX_FILES+' coding files.');
    const choice = await checked(guard,next([...selected.values()]));
    if (choice==='done') {
      if (selected.size<2) refuse('Select at least one source and one immutable test file.');
      return [...selected.values()];
    }
    if (choice!=='add') return null;
    if(selected.size===MAX_FILES) refuse('The coding file selection is full.');
  }
  refuse('The explicit file-selection attempt limit was reached. Start a fresh selection.');
}
async function capture({ root, selected, testFiles, profile, guard = async () => {}, vscode }) {
  if (!['python-unittest','node-test'].includes(profile) || !Array.isArray(selected) || selected.length < 2 || selected.length > MAX_FILES || !Array.isArray(testFiles) || (!testFiles.length || testFiles.length >= selected.length)) refuse('Select bounded source files and at least one immutable test file.');
  root = path.resolve(root);
  const paths = selected.map(safePath);
  if (new Set(paths).size !== paths.length || testFiles.some(p => !paths.includes(safePath(p)))) refuse('Tests must be distinct selected files.');
  let total = 0; const files = [];
  for (const relative of paths) {
    const target = await safeTarget(root, relative, guard);
    if (dirty(vscode, target)) refuse('Save or discard conflicting editor changes before capturing files.');
    const buffer = await readSafe(root, relative, guard);
    total += buffer.length;
    const content = buffer.toString('utf8');
    if (buffer.length > MAX_FILE_BYTES || total > MAX_TOTAL_BYTES || content.includes('\0') || /-----BEGIN .*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9]{20,}|tvijo_pk_[A-Za-z0-9_-]{15,})/.test(content) || !Buffer.from(content).equals(buffer)) refuse('Only bounded UTF-8 text files can be captured.');
    files.push({ path: relative, content, sha256: sha256(content), editable: !testFiles.includes(relative) });
  }
  if (Buffer.byteLength(JSON.stringify(Object.fromEntries(files.map(f => [f.path, f.content])))) > MAX_TOTAL_BYTES) refuse('The selected snapshot is too large.');
  await guard();
  return { root, files, test_files: [...testFiles], profile };
}
const HASH = /^[a-f0-9]{64}$/;
function workflowLimits(workflow = 'single') {
  if (!['single','review','swarm'].includes(workflow)) refuse('Choose a known coding workflow.');
  return { max_calls: workflow === 'single' ? 1 : workflow === 'review' ? 2 : 3, max_parallel:1, max_depth:1, attempts_per_node:1 };
}
function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function normalizeRequirements(requirements) {
  if (!Array.isArray(requirements) || requirements.length < 1 || requirements.length > 8) refuse('Provide one to eight atomic review requirements.');
  if (!requirements.some(item => item?.mandatory === true)) refuse('At least one mandatory review requirement is required.');
  const seen = new Set();
  return requirements.map(item => {
    if (!item || Object.keys(item).sort().join(',') !== 'critical,id,mandatory,scope,text' || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(item.id) || seen.has(item.id) || typeof item.text !== 'string' || !item.text.trim() || item.text.trim().length > 1000 || !['documented','implemented','runtime_verified'].includes(item.scope) || typeof item.mandatory !== 'boolean' || typeof item.critical !== 'boolean') refuse('Each review requirement needs a distinct ID, bounded text, scope and explicit mandatory/critical flags.');
    seen.add(item.id);
    return {id:item.id,text:item.text.trim(),scope:item.scope,mandatory:item.mandatory,critical:item.critical};
  });
}
// Limits v2 mirrors the gateway table (coding_workflow.LIMITS_V2): every node bound
// stays finite and max_tokens must equal what this client requests. A plan without
// limits_version is v1 with its original tiers, so stored v1 artifacts still validate.
function workflowPlanLimits(plan, workflow, requirements) {
  const version = plan.limits_version === undefined ? 1 : plan.limits_version;
  if (version !== 1 && version !== 2) refuse('The review quote uses an unknown limits version.');
  const documented = requirements.some(requirement => requirement.scope === 'documented');
  return { version, max_tokens: version === 2 ? 8192 : 1000, proposer_max: version === 2 ? (workflow === 'swarm' ? 8192 : documented ? 12288 : 24576) : (workflow === 'swarm' || documented ? 1024 : 2048), request_max: version === 2 ? 163840 : 98304, snapshot_max: version === 2 ? (workflow === 'swarm' ? 40960 : 57344) : 16384 };
}
function validateWorkflowQuote(quote, workflow, requirements, snapshotHash, contextHash, expectedVersion) {
  const limits = workflowLimits(workflow), plan = quote.workflow_plan;
  const same = (a,b) => canonicalJson(a) === canonicalJson(b);
  if (quote.workflow !== workflow || !HASH.test(quote.plan_hash || '') || !plan || sha256(canonicalJson(plan)) !== quote.plan_hash || !same(quote.limits,limits) || !same(quote.requirements,requirements) || plan.workflow !== workflow || !same(plan.limits,limits) || !same(plan.requirements,requirements) || plan.snapshot_hash !== snapshotHash || !HASH.test(plan.context_hash || '') || (contextHash !== undefined && plan.context_hash !== contextHash) || plan.tariff_version !== quote.tariff_version || typeof plan.version !== 'string' || !plan.version || !plan.template_hashes || !Object.values(plan.template_hashes).length || Object.values(plan.template_hashes).some(hash => !HASH.test(hash)) || plan.calibration_status !== 'passed') refuse('The review quote does not bind the selected requirements, templates, snapshot and bounded workflow plan.');
  const versioned = workflowPlanLimits(plan,workflow,requirements);
  if ((expectedVersion !== undefined && versioned.version !== expectedVersion) || plan.max_tokens !== versioned.max_tokens) refuse('The review plan token limit does not match its limits version or the requested ceiling.');
  const expected = workflow === 'review' ? ['proposal-1','judge'] : ['proposal-1','proposal-2','judge'];
  if (!Array.isArray(plan.nodes) || plan.nodes.length !== limits.max_calls || plan.nodes.some((node,index) => node.id !== expected[index] || node.step !== index || node.role !== (node.id === 'judge' ? 'judge' : 'proposer') || !['request_bytes_max','output_bytes_max','token_upper'].every(key => Number.isSafeInteger(node[key]) && node[key] > 0) || (node.role === 'proposer' ? node.output_bytes_max > versioned.proposer_max : node.output_bytes_max > 98304) || node.request_bytes_max > versioned.request_max)) refuse('The review quote has an unexpected node graph or byte/token limits.');
  return quote;
}
function conversationContext(thread, projectId, threadId, messages) {
  if (!thread || thread.id !== threadId || thread.project_id !== projectId || !Array.isArray(thread.messages) || thread.messages.length >= 79) refuse('The shared coding conversation is missing, changed scope or exceeds its bounded history.');
  const prior = thread.messages.map(message => {
    if (!message || !['system','user','assistant'].includes(message.role) || typeof message.content !== 'string') refuse('The shared coding conversation contains an invalid message.');
    return {role:message.role,content:message.content};
  });
  const turns = [...prior,messages[messages.length - 1]];
  if (Buffer.byteLength(canonicalJson(turns)) > 98304) refuse('The complete shared coding conversation exceeds the bounded context size. Start a fresh thread.');
  return turns;
}
function workflowText(artifact) {
  if (!artifact.workflow || artifact.workflow === 'single') return '';
  const limits = workflowLimits(artifact.workflow);
  return ['Workflow: ' + artifact.workflow + '; at most ' + limits.max_calls + ' calls, sequential; depth 1; one attempt per node.',
    'Review is an AI assessment of cited evidence. Test-process output and counts remain untrusted.',
    JSON.stringify({ plan_hash:artifact.plan_hash, selected_proposal_id:artifact.selected_proposal_id || null, requirements:artifact.requirements, agent_tree:(artifact.agent_tree || []).map(node => ({id:node.id,parent_id:node.parent_id,role:node.role,status:node.status,attempt:node.attempt,request_hash:node.request_hash,artifact_hash:node.artifact_hash,started_at:node.started_at,finished_at:node.finished_at,tool_events:(node.tool_events || []).map(event => ({id:event.id,kind:event.kind,status:event.status,artifact_hash:event.artifact_hash,started_at:event.started_at,finished_at:event.finished_at,created_at:event.created_at}))})), review:artifact.review, branches:(artifact.branches || []).map(branch => ({proposal_id:branch.proposal_id,summary:branch.summary,artifact_hash:branch.artifact_hash,diff:branch.diff,process_exit_code:branch.tests?.exit_code,reported_test_count:branch.tests?.reported_test_count,result_trust:'untrusted_test_process'})) }, null, 2)].join('\n\n');
}
function requireWorkflowScope(auth, scopes, workflow = 'single') {
  workflowLimits(workflow);
  requireCodingScope(auth,scopes);
  if (workflow !== 'single' && auth.kind === 'project' && (!Array.isArray(scopes) || !scopes.includes('agents:execute'))) refuse('This project key needs explicit agents:execute permission for review or swarm. Existing coding permission does not authorize agents.');
}
function evidenceText(artifact) {
  const tests = artifact.tests;
  const exit = Number.isInteger(tests?.exit_code) ? String(tests.exit_code) : 'unknown';
  const count = Number.isSafeInteger(tests?.reported_test_count) && tests.reported_test_count >= 0 ? String(tests.reported_test_count) : 'unknown';
  return ['# Tvijo coding evidence', 'Task: ' + artifact.task_id,
    'Model proposal: ' + (artifact.model_status || 'unknown'),
    'Process exit code: ' + exit + '; runner reported ' + count + ' tests.',
    artifact.workflow && artifact.workflow !== 'single' ? 'Test output and reported counts are untrusted. Review is an AI assessment; applying edits requires explicit human review.' : 'Test output and reported counts are untrusted. Correctness requires human review. No independent judge has accepted this proposal.',
    workflowText(artifact),
    JSON.stringify({ execution_status:artifact.execution_status, tests, receipt:artifact.receipt, actual_model_tokens:artifact.usage, ...(artifact.billing_mode === 'byok' ? {billing_mode:'byok',byok:artifact.byok} : {}) }, null, 2),
    artifact.diff || 'No diff supplied.'].join('\n\n');
}
function byokArtifactBinding(artifact) {
  if (!artifact.byok && artifact.billing_mode !== 'byok') return null;
  const r = artifact.byok;
  if (artifact.billing_mode !== 'byok' || !r || r.cancel_requested === true || r.managed_fallback !== false || r.provider_bill_payer !== 'customer_provider_account' || r.service_fee_micro_tvijo !== 1000 || !['reported','estimated'].includes(r.provider_cost_status) || typeof r.connection_id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(r.connection_id) || !Number.isSafeInteger(r.connection_epoch) || r.connection_epoch < 1 || typeof r.provider_cost_usd !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(r.provider_cost_usd)) refuse('The BYOK payer receipt is missing, unknown or changed. No Managed fallback or unsettled Apply is allowed.');
  return canonicalJson({billing_mode:'byok',connection_id:r.connection_id,connection_epoch:r.connection_epoch,provider_bill_payer:r.provider_bill_payer,provider_max_usd:r.provider_max_usd,provider_cost_usd:r.provider_cost_usd,provider_cost_status:r.provider_cost_status,provider_cost_source:r.provider_cost_source,cancel_requested:r.cancel_requested === true,service_fee_micro_tvijo:r.service_fee_micro_tvijo,managed_fallback:r.managed_fallback});
}
function validateArtifact(artifact, snapshot) {
  if (artifact?.billing_mode === 'byok' || artifact?.byok) byokArtifactBinding(artifact);
  if (!artifact || !Array.isArray(artifact.edits) || artifact.edits.length > MAX_FILES || typeof artifact.task_id !== 'string') refuse('The coding artifact is incomplete.');
  if (artifact.tests && (artifact.tests.test_result_verified !== false || artifact.tests.result_trust !== 'untrusted_test_process')) refuse('The coding artifact does not disclose its untrusted test-process boundary.');
  if (['passed','accepted','verified'].includes(artifact.execution_status)) refuse('The test process cannot independently verify or accept a proposal.');
  if (artifact.workflow !== undefined) workflowLimits(artifact.workflow);
  const originals = new Map(snapshot.files.map(f => [f.path, f])); const seen = new Set(); let bytes = 0;
  for (const edit of artifact.edits) {
    safePath(edit.path);
    if (seen.has(edit.path) || typeof edit.content !== 'string' || edit.content.includes('\0')) refuse('The proposed edits are invalid.');
    seen.add(edit.path); bytes += Buffer.byteLength(edit.content);
    if (Buffer.byteLength(edit.content) > MAX_FILE_BYTES || bytes > MAX_TOTAL_BYTES || edit.new_sha256 !== sha256(edit.content)) refuse('The proposed content hash or size is invalid.');
    const original = originals.get(edit.path);
    if (!original || !original.editable || edit.base_sha256 !== original.sha256) refuse('A proposal changed an immutable test or has an unknown base.');
  }
  return artifact;
}
function requireApplyWorkflow(artifact) {
  if (!artifact.workflow || artifact.workflow === 'single') return;
  const limits = workflowLimits(artifact.workflow), review = artifact.review;
  if (artifact.financial_status !== 'completed' || artifact.receipt?.held_micro_tvijo !== 0 || !HASH.test(artifact.plan_hash || '') || canonicalJson(artifact.limits) !== canonicalJson(limits) || !review || review.status !== 'accepted' || review.calibration_status !== 'passed' || !artifact.selected_proposal_id || review.proposal_id !== artifact.selected_proposal_id || review.snapshot_hash !== artifact.snapshot_hash || !HASH.test(review.artifact_hash || '') || !HASH.test(review.context_hash || '')) refuse('Only the server-selected accepted proposal with exact review, plan and calibration bindings can be applied.');
  const requirements = normalizeRequirements(artifact.requirements);
  validateWorkflowQuote({...artifact,tariff_version:artifact.workflow_plan?.tariff_version},artifact.workflow,requirements,artifact.snapshot_hash);
  if (artifact.context_hash !== review.context_hash) refuse('The selected judge context binding changed.');
  const branches = artifact.branches;
  if (!Array.isArray(branches) || branches.length !== limits.max_calls - 1 || new Set(branches.map(branch => branch.proposal_id)).size !== branches.length || branches.some(branch => branch.snapshot_hash !== artifact.snapshot_hash || canonicalJson(branch.requirements) !== canonicalJson(requirements) || !branch.deterministic || !Object.values(branch.deterministic).length || Object.keys(branch.deterministic).sort().join(',') !== 'cleanup_verified,integrity_verified,isolation_verified,valid_proposal' || ['cleanup_verified','integrity_verified','isolation_verified'].some(key => branch.deterministic[key] !== true) || typeof branch.deterministic.valid_proposal !== 'boolean')) refuse('Every workflow branch must have matching requirements and complete deterministic safety evidence.');
  const expectedNodes = artifact.workflow === 'review' ? ['proposal-1','judge'] : ['proposal-1','proposal-2','judge'];
  if (!Array.isArray(artifact.agent_tree) || artifact.agent_tree.length !== limits.max_calls || artifact.agent_tree.some((node,index) => node.id !== expectedNodes[index] || node.parent_id !== artifact.task_id || node.step !== index || node.role !== (node.id === 'judge' ? 'judge' : 'proposer') || node.status !== 'completed' || node.attempt !== 1 || !HASH.test(node.request_hash || '') || !HASH.test(node.artifact_hash || ''))) refuse('The bounded workflow tree is incomplete.');
  if (branches.some(branch => !expectedNodes.slice(0,-1).includes(branch.proposal_id) || artifact.agent_tree.find(node => node.id === branch.proposal_id)?.artifact_hash !== branch.artifact_hash)) refuse('The proposal set changed from the bounded node graph.');
  const selected = branches.find(branch => branch.proposal_id === artifact.selected_proposal_id);
  if (!selected || selected.deterministic.valid_proposal !== true || artifact.agent_tree.find(node => node.id === selected.proposal_id)?.artifact_hash !== selected.artifact_hash || selected.artifact_hash !== review.artifact_hash || canonicalJson(selected.edits) !== canonicalJson(artifact.edits)) refuse('The selected branch edits or artifact binding changed.');
  const decisions = review.decisions;
  if (!Array.isArray(decisions) || decisions.length !== branches.length || decisions.some(item => !['accepted','rejected','insufficient_evidence'].includes(item.status) || !HASH.test(item.context_hash || '')) || new Set(decisions.map(item => item.proposal_id)).size !== decisions.length || branches.some(branch => !decisions.some(item => item.proposal_id === branch.proposal_id && item.snapshot_hash === branch.snapshot_hash && item.artifact_hash === branch.artifact_hash))) refuse('The workflow decisions do not cover the immutable proposal set.');
  const accepted = decisions.filter(item => item.status === 'accepted').map(item => item.proposal_id).sort();
  if (accepted[0] !== artifact.selected_proposal_id) refuse('The selected proposal does not match the stable server selection.');
  const decision = decisions.find(item => item.proposal_id === selected.proposal_id);
  if (!decision || decision.status !== 'accepted' || ['snapshot_hash','proposal_id','artifact_hash','context_hash'].some(key => decision[key] !== review[key]) || canonicalJson(decision.criteria) !== canonicalJson(review.criteria)) refuse('The selected review does not match its exact proposal decision.');
  const catalog = artifact.evidence_artifacts;
  if (!Array.isArray(catalog) || catalog.some(item => typeof item.artifact_id !== 'string' || !HASH.test(item.sha256 || ''))) refuse('The workflow evidence catalog is missing or malformed.');
  for (const candidate of decisions) {
    const criteria = candidate.criteria;
  if (!Array.isArray(criteria) || criteria.length !== requirements.length || new Set(criteria.map(item => item.id)).size !== criteria.length) refuse('Every frozen requirement needs exactly one review criterion.');
  for (const requirement of requirements) {
    const item = criteria.find(criterion => criterion.id === requirement.id);
    if (!item || item.scope !== requirement.scope || !['pass','fail','insufficient_evidence','not_applicable'].includes(item.status) || typeof item.reason !== 'string' || !item.reason.trim() || (candidate.status === 'accepted' && requirement.mandatory && item.status !== 'pass') || (candidate.status === 'accepted' && requirement.critical && item.status === 'fail') || (item.status === 'pass' && item.scope === 'runtime_verified') || !Array.isArray(item.evidence) || (['pass','fail'].includes(item.status) && !item.evidence.length) || item.evidence.some(ref => !ref.artifact_id?.startsWith(candidate.proposal_id + '_') || !catalog.some(known => known.artifact_id === ref.artifact_id && known.sha256 === ref.sha256))) refuse('Missing, failed or mismatched requirement evidence blocks applying this proposal.');
  }
  }
}
function canApplyWorkflow(artifact) { try { requireApplyWorkflow(artifact); return true; } catch { return false; } }
async function prepareApply({ vscode, snapshot, artifact, guard = async () => {} }) {
  validateArtifact(artifact, snapshot);
  requireApplyWorkflow(artifact);
  if (artifact.financial_status !== 'completed' || artifact.receipt?.held_micro_tvijo !== 0) refuse('The coding task is not financially completed with an exact zero hold. Resolve its receipt before applying.');
  if (!artifact.edits.length) refuse('There are no proposed edits to apply.');
  const checks = [];
  for (const edit of artifact.edits) {
    const target = await safeTarget(snapshot.root, edit.path, guard, edit.base_sha256 === null);
    if (dirty(vscode, target)) refuse('A target has conflicting unsaved editor changes.');
    if (edit.base_sha256 !== null) {
      const buffer = await readSafe(snapshot.root, edit.path, guard);
      if (sha256(buffer) !== edit.base_sha256) refuse('A target changed since capture. Review a fresh task.');
      const document = await checked(guard, vscode.workspace.openTextDocument(vscode.Uri.file(target)));
      if (document.isDirty || sha256(document.getText()) !== edit.base_sha256) refuse('The editor target changed since capture.');
      checks.push({ edit, target, document, version: document.version });
    } else checks.push({ edit, target });
  }
  await guard();
  return checks;
}
function finalChecks(snapshot, checks, vscode) {
  if (syncFs.realpathSync(snapshot.root) !== snapshot.root || syncFs.lstatSync(snapshot.root).isSymbolicLink()) refuse('The workspace root changed before apply.');
  for (const entry of checks) {
    let current = snapshot.root;
    const parts = entry.edit.path.split('/');
    for (let i=0;i<parts.length;i++) {
      current = path.join(current,parts[i]); let stat;
      try { stat=syncFs.lstatSync(current); }
      catch (error) { if (error.code==='ENOENT' && !entry.document && i===parts.length-1) continue; throw error; }
      if (stat.isSymbolicLink() || (i<parts.length-1 ? !stat.isDirectory() : !stat.isFile())) refuse('A target or parent changed before apply.');
      if (!entry.document && i===parts.length-1) refuse('A new target appeared before apply.');
    }
    if (dirty(vscode,entry.target)) refuse('A target became dirty before apply.');
    if (entry.document) {
      const fd=syncFs.openSync(entry.target,constants.O_RDONLY|constants.O_NOFOLLOW);
      try { const stat=syncFs.fstatSync(fd); if(!stat.isFile() || stat.nlink!==1 || stat.size>MAX_FILE_BYTES) refuse('A target changed before apply.'); if(sha256(syncFs.readFileSync(fd))!==entry.edit.base_sha256) refuse('A target changed before apply.'); } finally {syncFs.closeSync(fd);}
      if(entry.document.version!==entry.version || entry.document.isDirty || sha256(entry.document.getText())!==entry.edit.base_sha256) refuse('The editor target changed before apply.');
    }
  }
}
function sameProposal(before, after) {
  const fields = ['task_id','project_id','thread_id','snapshot_hash'];
  if (byokArtifactBinding(before) !== byokArtifactBinding(after)) refuse('The BYOK payer or provider receipt changed after confirmation.');
  if ((before.workflow || 'single') !== (after.workflow || 'single')) refuse('The coding workflow changed after review.');
  if (before.workflow && before.workflow !== 'single') {
    const bindings = value => canonicalJson({workflow:value.workflow,plan_hash:value.plan_hash,workflow_plan:value.workflow_plan,context_hash:value.context_hash,limits:value.limits,requirements:value.requirements,selected_proposal_id:value.selected_proposal_id,review:value.review,evidence_artifacts:value.evidence_artifacts,branches:value.branches});
    if (bindings(before) !== bindings(after)) refuse('The selected proposal, review decision or evidence bindings changed after review.');
    requireApplyWorkflow(after);
  }
  if (fields.some(field => typeof before[field] !== 'string' || before[field] !== after[field])) refuse('The coding task scope or snapshot changed after review.');
  const edits = value => JSON.stringify(value.edits.map(edit => [edit.path,edit.base_sha256,edit.new_sha256]).sort((a,b)=>a[0].localeCompare(b[0])));
  if (edits(before) !== edits(after)) refuse('The proposed edit hashes changed after review.');
}
async function apply({ vscode, snapshot, artifact, guard = async () => {}, guardSync = () => {}, confirm, revalidate, beforeWrite = () => {} }) {
  if (artifact.workflow && artifact.workflow !== 'single' && typeof revalidate !== 'function') refuse('Review workflows require a fresh server artifact after confirmation.');
  await prepareApply({ vscode, snapshot, artifact, guard });
  const approved = await checked(guard, confirm());
  if (approved !== true) return false;
  if (revalidate) {
    const fresh = await checked(guard,revalidate());
    validateArtifact(fresh,snapshot);
    sameProposal(artifact,fresh);
    artifact = fresh;
  }
  // Review may have been open for minutes. Recheck bytes, parents, dirty state and scope.
  const checks = await prepareApply({ vscode, snapshot, artifact, guard });
  const edit = new vscode.WorkspaceEdit();
  for (const entry of checks) {
    const uri = vscode.Uri.file(entry.target);
    if (!entry.document) { edit.createFile(uri, { overwrite: false, ignoreIfExists: false }); edit.insert(uri, new vscode.Position(0, 0), entry.edit.content); }
    else {
      if (entry.document.version !== entry.version || entry.document.isDirty || sha256(entry.document.getText()) !== entry.edit.base_sha256) refuse('The editor target changed before apply.');
      edit.replace(uri, new vscode.Range(entry.document.positionAt(0), entry.document.positionAt(entry.document.getText().length)), entry.edit.content);
    }
  }
  await beforeWrite(checks);
  await guard();
  guardSync();
  finalChecks(snapshot,checks,vscode);
  guardSync();
  // Existing-file text edits only: VS Code's extension-host converter attaches
  // each open document version synchronously here. A changed model version
  // causes the workbench text bulk edit to fail rather than replace newer text.
  const result = await vscode.workspace.applyEdit(edit);
  await guard();
  return result;
}
function requireCodingScope(auth, scopes) { if (auth.kind === 'project' && (!Array.isArray(scopes) || !scopes.includes('coding:execute') || !scopes.includes('tasks:write'))) refuse('This project key does not authorize coding execution. Create a key with coding:execute and tasks:write before uploading code.'); }
function codingClient(api, token) {
  const request = (url, options = {}) => api.request(url, { ...options, token });
  return {
    artifact: taskId => request('/tasks/' + encodeURIComponent(taskId) + '/coding'),
    async run({ snapshot, projectId, threadId, prompt, workflow = 'single', requirements, payer = null, maxMicroTvijo, idempotencyKey, guard, journal, onQuote, signal }) {
      const check = async () => { await guard(); if (signal?.aborted) throw new ServiceError('interrupted', 'Coding was interrupted. Resolve the task before retrying.'); };
      let uploaded, quote, normalized;
      try {
        workflowLimits(workflow);
        if (payer && workflow !== 'single') refuse('BYOK supports single only; choose Managed explicitly for review or swarm.');
        normalized = workflow === 'single' ? undefined : normalizeRequirements(requirements);
        if (normalized?.some(requirement => requirement.mandatory && requirement.scope === 'runtime_verified')) refuse('Mandatory runtime review is unavailable without independent semantic proof. Choose implemented source behavior or a documented claim.');
        if (normalized?.some(requirement => requirement.mandatory && requirement.scope === 'documented') && !snapshot.files.some(file => /\.(?:md|txt)$/i.test(file.path))) refuse('A mandatory documented contract needs a selected Markdown or text document before upload.');
        if (!Number.isSafeInteger(maxMicroTvijo) || maxMicroTvijo <= 0 || maxMicroTvijo > 50000000) refuse('A verified coding task limit is required.');
        if (workflow !== 'single' && snapshot.files.reduce((total,file) => total + Buffer.byteLength(file.content),0) > (workflow === 'swarm' ? 40960 : 57344)) refuse(workflow === 'swarm' ? 'Swarm snapshots are limited to 40 KiB of selected UTF-8 source.' : 'Review snapshots are limited to 56 KiB of selected UTF-8 source.');
        await check();
        uploaded = await checked(check, request('/projects/' + encodeURIComponent(projectId) + '/coding-snapshots', { method: 'POST', signal, body: { files: snapshot.files.map(({path,content}) => ({path,content})), test_files: snapshot.test_files, profile: snapshot.profile } }));
        if (!uploaded?.snapshot_id || !/^[a-f0-9]{64}$/.test(uploaded.snapshot_hash || '') || uploaded.profile !== snapshot.profile) refuse('The uploaded snapshot could not be verified.');
        if (!Array.isArray(uploaded.files) || uploaded.files.length !== snapshot.files.length || snapshot.files.some(file => !uploaded.files.some(remote => remote.path === file.path && remote.sha256 === file.sha256 && remote.editable === file.editable))) refuse('The server snapshot file hashes do not match the selected files.');
        const messages = [{ role: 'user', content: prompt }];
        // Match services.context: a quoted shared thread includes every persisted
        // role/content turn plus this final user turn, without truncation.
        let turns = messages;
        if (workflow !== 'single' && threadId) {
          const thread = await checked(check,request('/projects/' + encodeURIComponent(projectId) + '/threads/' + encodeURIComponent(threadId),{signal}));
          turns = conversationContext(thread,projectId,threadId,messages);
        }
        quote = await checked(check, request('/services/quote', { method: 'POST', signal, body: { service_id:'coding', snapshot_id:uploaded.snapshot_id, project_id:projectId, thread_id:threadId, title:'VS Code coding task', messages, max_tokens:workflow === 'single' ? 2048 : 8192, max_micro_tvijo:maxMicroTvijo, method:'evidence-first', ...(workflow !== 'single' ? {workflow,requirements:normalized,limits_version:2} : {}), ...byok.quoteFields(payer), idempotency_key:idempotencyKey } }));
        const expires = typeof quote?.expires_at === 'number' ? quote.expires_at * 1000 : Date.parse(quote?.expires_at);
        if (!quote?.quote_id || quote.service_id !== 'coding' || quote.project_id !== projectId || quote.thread_id !== threadId || quote.snapshot_id !== uploaded.snapshot_id || quote.snapshot_hash !== uploaded.snapshot_hash || quote.profile !== snapshot.profile || !quote.tariff_version || !Number.isFinite(expires) || expires <= Date.now() || !Number.isSafeInteger(quote.ceiling_micro_tvijo) || quote.ceiling_micro_tvijo <= 0 || quote.ceiling_micro_tvijo > maxMicroTvijo) refuse('The coding quote does not match the selected snapshot or limit.');
        byok.validateQuote(quote,payer);
        if (payer && workflow !== 'single') refuse('BYOK review and swarm are unavailable; no Managed fallback.');
        if (workflow === 'single' && quote.workflow !== undefined && quote.workflow !== 'single') refuse('A single coding task cannot authorize an agent workflow.');
        if (workflow !== 'single') validateWorkflowQuote(quote,workflow,normalized,uploaded.snapshot_hash,sha256(canonicalJson(turns)),2);
        await checked(check, journal({ idempotencyKey, quoteId:quote.quote_id, snapshotId:uploaded.snapshot_id, snapshotHash:uploaded.snapshot_hash }));
        if (onQuote) await checked(check, onQuote(quote));
      } catch (error) { error.definitiveGrantRefusal = true; throw error; }
      await check();
      const grant = await request('/tasks', { method:'POST', signal, body:{ quote_id:quote.quote_id, service_id:'coding', idempotency_key:idempotencyKey } });
      if (!grant?.id) throw new ServiceError('incomplete', 'A coding reservation may exist. Resolve the pending task before retrying.');
      // Preserve the exact task even if identity changes while reservation is in flight.
      await journal({ idempotencyKey, quoteId:quote.quote_id, snapshotId:uploaded.snapshot_id, snapshotHash:uploaded.snapshot_hash, taskId:grant.id });
      await check();
      const artifact = await checked(check, request('/tasks/' + encodeURIComponent(grant.id) + '/coding', { method:'POST', signal, body:{}, timeoutMs:240000 }));
      if (artifact.task_id !== grant.id || artifact.snapshot_hash !== uploaded.snapshot_hash || artifact.project_id !== projectId || artifact.thread_id !== threadId) refuse('The returned coding artifact has another task or snapshot.');
      if (workflow === 'single' && artifact.workflow !== undefined && artifact.workflow !== 'single') refuse('The returned artifact changed the selected single workflow.');
      if (workflow !== 'single' && (artifact.workflow !== workflow || artifact.plan_hash !== quote.plan_hash)) refuse('The coding workflow or plan changed after its quote.');
      return validateArtifact(artifact, snapshot);
    }
  };
}
module.exports = { conversationContext, requireApplyWorkflow, canApplyWorkflow, validateWorkflowQuote, workflowLimits, canonicalJson, normalizeRequirements, workflowText, requireWorkflowScope, selectFiles, evidenceText, codingClient, MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, sha256, safePath, safeTarget, capture, validateArtifact, prepareApply, apply, requireCodingScope };
