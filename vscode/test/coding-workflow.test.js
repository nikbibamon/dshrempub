"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const coding = require('../lib/coding');
const hash = 'a'.repeat(64), context = 'b'.repeat(64);
const requirements = [{id:'sum',text:'The source adds both arguments.',scope:'implemented',mandatory:true,critical:false}];
function quote(workflow = 'review') {
  const limits = coding.workflowLimits(workflow);
  const workflow_plan = {version:'coding-workflow-v1',workflow,limits,requirements,snapshot_hash:hash,context_hash:coding.sha256(coding.canonicalJson([{role:'user',content:'Add arguments'}])),max_tokens:1000,tariff_version:'tariff-v1',template_hashes:{proposer:hash,judge:context},calibration_status:'passed',nodes:(workflow === 'review' ? ['proposal-1','judge'] : ['proposal-1','proposal-2','judge']).map((id,step) => ({id,step,role:id === 'judge'?'judge':'proposer',request_bytes_max:20000,output_bytes_max:id !== 'judge' && workflow === 'swarm' ? 1024 : 2048,token_upper:3000}))};
  return {workflow,workflow_plan,plan_hash:coding.sha256(coding.canonicalJson(workflow_plan)),limits,requirements,tariff_version:'tariff-v1'};
}
test('review and swarm have exact finite sequential bounds; unknown workflow refuses',() => {
  assert.deepEqual(coding.workflowLimits(),{max_calls:1,max_parallel:1,max_depth:1,attempts_per_node:1});
  assert.equal(coding.workflowLimits('review').max_calls,2);
  assert.equal(coding.workflowLimits('swarm').max_calls,3);
  assert.throws(() => coding.workflowLimits('recursive'));
});
test('multi project key requires explicit agents scope; old coding key stays single',() => {
  const old = ['coding:execute','tasks:write'];
  coding.requireWorkflowScope({kind:'project'},old);
  for (const mode of ['review','swarm']) {
    assert.throws(() => coding.requireWorkflowScope({kind:'project'},old,mode),/agents:execute/);
    coding.requireWorkflowScope({kind:'project'},[...old,'agents:execute'],mode);
  }
});
test('requirements are bounded atomic caller data with exact scope and flags',() => {
  assert.deepEqual(coding.normalizeRequirements(requirements),requirements);
  for (const value of [[],Array(9).fill(requirements[0]),[...requirements,...requirements],[{...requirements[0],scope:'tests_passed'}],[{...requirements[0],text:' '}],[{...requirements[0],mandatory:undefined}],[{...requirements[0],text:'x'.repeat(1001)}]]) assert.throws(() => coding.normalizeRequirements(value));
});
test('canonical sorted Unicode plan hashes are deterministic and match exact quote',() => {
  assert.equal(coding.canonicalJson({z:[{b:1,a:'é'}],a:true}),'{' + '"a":true,"z":[{"a":"é","b":1}]}');
  for (const mode of ['review','swarm']) coding.validateWorkflowQuote(quote(mode),mode,requirements,hash);
});
test('quote mutated workflow, limits, requirements, templates, graph, context or snapshot refuses',() => {
  for (const mutate of [q=>q.workflow='single',q=>q.limits={...q.limits,max_parallel:2},q=>q.requirements=[],q=>q.plan_hash='0'.repeat(64),q=>q.workflow_plan.snapshot_hash=context,q=>q.workflow_plan.context_hash='unknown',q=>q.workflow_plan.template_hashes={},q=>q.workflow_plan.nodes[0].token_upper=0,q=>q.workflow_plan.nodes[1].role='proposer',q=>q.workflow_plan.nodes[0].output_bytes_max=2049,q=>q.workflow_plan.requirements=[]]) {
    const q=quote();mutate(q);
    // Even rehashing cannot make altered authority match the frozen client choice.
    if(q.plan_hash!=='0'.repeat(64)) q.plan_hash=coding.sha256(coding.canonicalJson(q.workflow_plan));
    assert.throws(() => coding.validateWorkflowQuote(q,'review',requirements,hash));
  }
});

function acceptedArtifact() {
  const content='def add(a,b): return a+b\n';
  const edits=[{path:'calc.py',content,base_sha256:coding.sha256('def add(a,b): return a-b\n'),new_sha256:coding.sha256(content)}];
  const artifact_hash='c'.repeat(64),context_hash='d'.repeat(64);
  const criteria=[{id:'sum',scope:'implemented',status:'pass',reason:'The selected source uses addition.',evidence:[{artifact_id:'proposal-1_proposal',sha256:hash}]}];
  const decision={status:'accepted',proposal_id:'proposal-1',snapshot_hash:hash,artifact_hash,context_hash,criteria};
  return {task_id:'task',project_id:'p',thread_id:'t',snapshot_hash:hash,workflow:'review',workflow_plan:quote().workflow_plan,context_hash,plan_hash:quote().plan_hash,limits:coding.workflowLimits('review'),requirements,selected_proposal_id:'proposal-1',edits,
    financial_status:'completed',receipt:{held_micro_tvijo:0},execution_status:'exited_zero',tests:{exit_code:0,reported_test_count:37,result_trust:'untrusted_test_process',test_result_verified:false},
    branches:[{proposal_id:'proposal-1',snapshot_hash:hash,requirements,artifact_hash,edits,deterministic:{valid_proposal:true,isolation_verified:true,integrity_verified:true,cleanup_verified:true}}],
    evidence_artifacts:[{artifact_id:'proposal-1_proposal',sha256:hash}],review:{...decision,decisions:[structuredClone(decision)],calibration_status:'passed'},
    agent_tree:[{id:'proposal-1',role:'proposer',step:0,parent_id:'task',status:'completed',attempt:1,request_hash:hash,artifact_hash,served_model:'PRIVATE_MODEL',session_id:'PRIVATE_SESSION',tool_events:[]},{id:'judge',role:'judge',step:1,parent_id:'task',status:'completed',attempt:1,request_hash:hash,artifact_hash:hash,tool_events:[]}]};
}
test('only exact accepted server selection with complete evidence is applicable',() => {
  const a=acceptedArtifact();coding.requireApplyWorkflow(a);assert.equal(coding.canApplyWorkflow(a),true);
  for (const mutate of [a=>a.selected_proposal_id=null,a=>a.review.status='insufficient_evidence',a=>a.review.calibration_status='stale',a=>a.plan_hash='unknown',a=>a.review.context_hash='unknown',a=>a.review.artifact_hash=hash,a=>a.branches[0].deterministic.integrity_verified=false,a=>a.edits=[],a=>a.review.criteria=[],a=>a.review.decisions=[],a=>a.review.decisions[0].context_hash=hash,a=>a.evidence_artifacts=[],a=>a.evidence_artifacts[0].sha256=context]) {
    const a=acceptedArtifact();mutate(a);assert.equal(coding.canApplyWorkflow(a),false);assert.throws(()=>coding.requireApplyWorkflow(a));
  }
});
test('mandatory failures, missing evidence, wrong scope, unknown and cross-proposal references block apply',() => {
  for (const mutate of [i=>i.status='fail',i=>i.status='insufficient_evidence',i=>i.status='not_applicable',i=>i.evidence=[],i=>i.scope='runtime_verified',i=>i.evidence[0].artifact_id='invented',i=>i.evidence[0].artifact_id='proposal-2_proposal']) {
    const a=acceptedArtifact();mutate(a.review.criteria[0]);a.review.decisions[0].criteria=structuredClone(a.review.criteria);assert.equal(coding.canApplyWorkflow(a),false);
  }
});
test('durable tree and criteria display preserves untrusted counts and omits private model/session names',() => {
  const text=coding.evidenceText(acceptedArtifact());
  for(const value of ['sequential','proposal-1','judge','criteria','implemented','untrusted','37']) assert.ok(text.includes(value),value);
  assert.doesNotMatch(text,/PRIVATE_MODEL|PRIVATE_SESSION/);
  const rejected=acceptedArtifact();rejected.review.status='rejected';rejected.selected_proposal_id=null;rejected.edits=[];
  assert.match(coding.evidenceText(rejected),/rejected/);
});
function runFixture(changedQuote, options={}) {
  const calls=[],journals=[];
  const files=[{path:'calc.py',content:'def add(a,b): return a-b\n',editable:true},{path:'test_calc.py',content:'import unittest\n',editable:false}].map(file=>({...file,sha256:coding.sha256(file.content)}));
  const snapshot={files,profile:'python-unittest',test_files:['test_calc.py']};
  const q={...quote(),quote_id:'quote',service_id:'coding',project_id:'p',thread_id:'t',snapshot_id:'snapshot',snapshot_hash:hash,profile:'python-unittest',expires_at:Date.now()/1000+60,ceiling_micro_tvijo:1000};
  const history=options.threadHistory || [];
  q.workflow_plan.context_hash=coding.sha256(coding.canonicalJson([...history.map(({role,content})=>({role,content})),{role:'user',content:'Add arguments'}]));q.plan_hash=coding.sha256(coding.canonicalJson(q.workflow_plan));
  if(changedQuote)changedQuote(q);
  const api={request:async(url,opts)=>{calls.push({url,...opts});if(url.endsWith('/coding-snapshots')) return{snapshot_id:'snapshot',snapshot_hash:hash,profile:snapshot.profile,files};if(url==='/projects/p/threads/t')return options.threadResponse || {id:'t',project_id:'p',messages:history};if(url==='/services/quote')return q;if(url==='/tasks')return{id:'task'};return {...acceptedArtifact(),plan_hash:q.plan_hash,workflow_plan:q.workflow_plan};}};
  return {calls,journals,run:()=>coding.codingClient(api,'test-key').run({snapshot,projectId:'p',threadId:'t',prompt:'Add arguments',workflow:'review',requirements,maxMicroTvijo:10000,idempotencyKey:'request',guard:async()=>{},journal:async j=>journals.push(j),...options})};
}
test('multi quote and one root grant bind workflow and frozen requirements with no per-node task',async()=>{
  const f=runFixture();const artifact=await f.run();assert.equal(artifact.workflow,'review');assert.equal(f.calls.length,5);
  assert.equal(f.calls[2].body.workflow,'review');assert.deepEqual(f.calls[2].body.requirements,requirements);
  assert.equal(f.calls.filter(c=>c.url==='/tasks').length,1);assert.equal(f.calls.filter(c=>c.url.endsWith('/coding')).length,1);
  assert.doesNotMatch(JSON.stringify(f.journals),/test-key|Add arguments|def add/);
});
test('mutated multi quote refuses before grant and retains no paid retry path',async()=>{
  for(const mutate of [q=>q.workflow='swarm',q=>q.plan_hash='0'.repeat(64),q=>q.limits.max_parallel=2,q=>q.requirements=[],q=>q.workflow_plan.template_hashes={}]) {
    const f=runFixture(mutate);await assert.rejects(f.run(),e=>e.definitiveGrantRefusal===true);assert.equal(f.calls.length,3);
  }
});
async function applyFixture() {
  const fs=require('node:fs/promises'),path=require('node:path');
  const root=await fs.mkdtemp(require('node:path').join(process.env.TVIJO_TEST_ARTIFACTS || require('node:os').tmpdir(),'workflow-fixture-'));
  await fs.writeFile(path.join(root,'calc.py'),'def add(a,b): return a-b\n');await fs.writeFile(path.join(root,'test_calc.py'),'import unittest\n');
  const docs=[];let edits=0;
  const vscode={Uri:{file:fsPath=>({fsPath})},Range:class{},Position:class{},WorkspaceEdit:class{replace(){}},workspace:{textDocuments:docs,openTextDocument:async uri=>{let d=docs.find(d=>d.uri.fsPath===uri.fsPath);if(!d){const text=await fs.readFile(uri.fsPath,'utf8');d={uri,isDirty:false,version:1,getText:()=>text,positionAt:x=>x};docs.push(d);}return d;},applyEdit:async()=>{edits++;return true;}}};
  const snapshot=await coding.capture({root,selected:['calc.py','test_calc.py'],testFiles:['test_calc.py'],profile:'python-unittest',vscode});
  return{vscode,snapshot,artifact:acceptedArtifact(),edits:()=>edits};
}
test('multi apply requires fresh artifact after confirmation and rejects review/plan drift with unchanged edits',async()=>{
  const f=await applyFixture();await assert.rejects(coding.apply({...f,confirm:async()=>true}),/fresh server/);assert.equal(f.edits(),0);
  for(const mutate of [a=>a.plan_hash=context,a=>{a.review.context_hash=context;a.review.decisions[0].context_hash=context;},a=>a.review.status='rejected',a=>a.receipt.held_micro_tvijo=1,a=>a.financial_status='frozen']) {
    const f=await applyFixture();const fresh=structuredClone(f.artifact);mutate(fresh);let confirmed=false,gets=0;
    await assert.rejects(coding.apply({...f,confirm:async()=>{confirmed=true;return true;},revalidate:async()=>{assert.equal(confirmed,true);gets++;return fresh;}}));assert.equal(gets,1);assert.equal(f.edits(),0);
  }
  const good=await applyFixture();assert.equal(await coding.apply({...good,confirm:async()=>true,revalidate:async()=>structuredClone(good.artifact)}),true);assert.equal(good.edits(),1);
});

test('exact tree parent, step, role and selected branch hash are mandatory for apply',()=>{
  for(const mutate of [a=>a.agent_tree[0].parent_id='foreign',a=>a.agent_tree[0].step=1,a=>a.agent_tree[1].role='proposer',a=>a.agent_tree[0].artifact_hash=hash,a=>delete a.agent_tree[0].request_hash,a=>delete a.agent_tree[1].artifact_hash]) {
    const a=acceptedArtifact();mutate(a);assert.equal(coding.canApplyWorkflow(a),false);
  }
});

test('mandatory runtime execution refuses before upload and accepted runtime labels never enable apply',async()=>{
  const runtime=requirements.map(item=>({...item,scope:'runtime_verified'}));
  const f=runFixture(undefined,{requirements:runtime});
  await assert.rejects(f.run(),error=>error.definitiveGrantRefusal===true);assert.equal(f.calls.length,0);
  const a=structuredClone(acceptedArtifact());a.requirements[0].scope='runtime_verified';a.branches[0].requirements=structuredClone(a.requirements);
  a.workflow_plan.requirements=structuredClone(a.requirements);a.plan_hash=coding.sha256(coding.canonicalJson(a.workflow_plan));
  a.review.criteria[0].scope='runtime_verified';a.review.decisions[0].criteria=structuredClone(a.review.criteria);
  assert.equal(coding.canApplyWorkflow(a),false);
});

test('swarm permits an unselected functional failure but every branch keeps exact OS safety gates',()=>{
  const a=structuredClone(acceptedArtifact()),q=quote('swarm');a.workflow='swarm';a.limits=q.limits;a.workflow_plan=q.workflow_plan;a.plan_hash=q.plan_hash;
  const other=structuredClone(a.branches[0]);other.proposal_id='proposal-2';other.artifact_hash='e'.repeat(64);other.deterministic.valid_proposal=false;a.branches.push(other);
  const otherDecision=structuredClone(a.review.decisions[0]);otherDecision.proposal_id='proposal-2';otherDecision.artifact_hash=other.artifact_hash;otherDecision.status='rejected';otherDecision.criteria[0].status='fail';otherDecision.criteria[0].evidence[0].artifact_id='proposal-2_proposal';a.evidence_artifacts.push({artifact_id:'proposal-2_proposal',sha256:hash});a.review.decisions.push(otherDecision);
  const judge=a.agent_tree.pop();judge.step=2;a.agent_tree.push({...a.agent_tree[0],id:'proposal-2',step:1,artifact_hash:other.artifact_hash},judge);
  coding.requireApplyWorkflow(a);
  a.branches[1].deterministic.cleanup_verified=false;assert.equal(coding.canApplyWorkflow(a),false);
});

test('mandatory documented contract needs a selected Markdown or text document before upload',async()=>{
  const documented=requirements.map(item=>({...item,scope:'documented'}));
  const f=runFixture(undefined,{requirements:documented});
  await assert.rejects(f.run(),error=>error.definitiveGrantRefusal===true);assert.equal(f.calls.length,0);
});

test('documented review accepts a smaller frozen proposal tier and refuses caps above mode ceiling',()=>{
  const documented=requirements.map(item=>({...item,scope:'documented'})),q=quote();q.requirements=documented;q.workflow_plan.requirements=documented;q.workflow_plan.nodes[0].output_bytes_max=1024;q.plan_hash=coding.sha256(coding.canonicalJson(q.workflow_plan));
  coding.validateWorkflowQuote(q,'review',documented,hash);
  for(const [mode,cap] of [['review',2049],['swarm',1025],['review',0]]) {
    const bad=quote(mode);bad.workflow_plan.nodes[0].output_bytes_max=cap;bad.plan_hash=coding.sha256(coding.canonicalJson(bad.workflow_plan));assert.throws(()=>coding.validateWorkflowQuote(bad,mode,requirements,hash));
  }
});

test('second coding task binds complete current shared history and metadata-free canonical turns',async()=>{
  const history=[{id:'m1',thread_id:'t',role:'user',content:'Prior request',created:1},{id:'m2',thread_id:'t',role:'assistant',content:'Prior result',created:2}];
  const f=runFixture(undefined,{threadHistory:history});await f.run();
  assert.equal(f.calls[1].url,'/projects/p/threads/t');assert.equal(f.calls[2].url,'/services/quote');
  assert.deepEqual(f.calls[2].body.messages,[{role:'user',content:'Add arguments'}]);assert.equal(f.calls.filter(c=>c.url==='/tasks').length,1);
  assert.deepEqual(coding.conversationContext({id:'t',project_id:'p',messages:history},'p','t',[{role:'user',content:'Add arguments'}]),[...history.map(({role,content})=>({role,content})),{role:'user',content:'Add arguments'}]);
});
test('stale history quote refuses before any root reservation',async()=>{
  const f=runFixture(q=>{q.workflow_plan.context_hash=coding.sha256(coding.canonicalJson([{role:'user',content:'Concurrent appended turn'},{role:'user',content:'Add arguments'}]));q.plan_hash=coding.sha256(coding.canonicalJson(q.workflow_plan));});
  await assert.rejects(f.run(),e=>e.definitiveGrantRefusal===true);assert.equal(f.calls.length,3);assert.equal(f.calls.filter(c=>c.url==='/tasks').length,0);
});
test('cross-project/thread, malformed or overfull history refuses before quoting or reserving',async()=>{
  for(const threadResponse of [{id:'t',project_id:'foreign',messages:[]},{id:'foreign',project_id:'p',messages:[]},{id:'t',project_id:'p',messages:Array(79).fill({role:'user',content:'x'})},{id:'t',project_id:'p',messages:[{role:'tool',content:'x'}]},{id:'t',project_id:'p',messages:[{role:'user',content:'x'.repeat(98305)}]}]) {
    const f=runFixture(undefined,{threadResponse});await assert.rejects(f.run(),e=>e.definitiveGrantRefusal===true);assert.equal(f.calls.length,2);assert.equal(f.calls.filter(c=>c.url==='/services/quote'||c.url==='/tasks').length,0);
  }
});
