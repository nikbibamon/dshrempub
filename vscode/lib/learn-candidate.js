'use strict';
const {createHash}=require('node:crypto');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
// Same algorithm as dshrempub vscode/lib/coding.js:93 canonicalJson (read at fb853db).
function canonicalJson(v) {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

const byBytes = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
function candidateId({ task_id, project_id, thread_id, snapshot_hash, edits }) {
  const rows = edits.map((e) => [e.path, e.base_sha256, e.new_sha256]).sort((a, b) => byBytes(a[0], b[0]));
  return sha256(canonicalJson({ schema: 'tvijo.learn.candidate/1', task_id, project_id, thread_id, snapshot_hash, edits: rows }));
}
const requestKey = ({ scope, task_id, candidate_id, surface, action_class }) =>
  sha256(canonicalJson({ scope, task_id, candidate_id, surface, action_class })).slice(0, 32);

// Hash of an executed file tree: lines `path \0 sha256(content) \n`, sorted by path (bytewise), then sha256.
// Same construction as RUNLEDGER #222 ai_os/runledger/evidence.py tree_sha256 (path, NUL, file hash, newline).
function treeSha256(files) {
  const rows = Object.entries(files).sort(([a], [b]) => byBytes(a, b));
  const h = createHash('sha256');
  for (const [path, content] of rows) h.update(Buffer.concat([Buffer.from(path, 'utf8'), Buffer.from([0]), Buffer.from(sha256(content), 'ascii'), Buffer.from('\n')]));
  return h.digest('hex');
}

// A fresh instance on EVERY exercise start: the nonce (32 hex, saved in the stand marker) makes a restart of an unedited
// stand a new attempt with new thread/candidate ids; the manifest and the stand tree bind the instance to the pinned pack.
const exerciseInstance = ({ manifest_sha256, stand_tree_sha256, start_nonce }) =>
  sha256(canonicalJson({ schema: 'tvijo.learn.instance/1', manifest_sha256, stand_tree_sha256, start_nonce }));
const threadIdFor = (instance) => 'learn-' + instance.slice(0, 16);
// The manifest pins the TEMPLATE of each proposal (sha256 of the file bytes). The artifact the learner reviews is an INSTANCE:
// the same JSON with exactly two fields substituted, thread_id (from the exercise instance) and snapshot_hash (from the capture of the stand).
// The bytes of the instance therefore differ from the template by construction, so `revalidate` never compares them with the template's
// sha256: it re-instantiates the frozen, hash-verified template and compares artifact hashes (see SPEC-304 «Якорь кандидата и revalidate»).
const INSTANCE_FIELDS = Object.freeze(['snapshot_hash', 'thread_id']);
function instantiateProposal(template, fields) {
  if (Object.keys(fields || {}).sort().join() !== INSTANCE_FIELDS.join()) throw new TypeError('instantiateProposal: exactly thread_id and snapshot_hash');
  return { ...structuredClone(template), thread_id: fields.thread_id, snapshot_hash: fields.snapshot_hash };
}
const artifactSha256 = (artifact) => sha256(canonicalJson(artifact));
const eventId = (ev) => { const { event_id, seq, ts, client, ...rest } = ev; return sha256(canonicalJson(rest)); };


function isTestLike(p) { return /(^|\/)(test[^/]*|[^/]*[._-]test[^/]*|tests)(\/|$)|\.(spec|test)\.[^.]+$/i.test(p); }
function testIntegrity({snapshot, artifact}) {
  if (!snapshot?.files || !artifact?.edits) return {integrity:'unknown', signals:[]};
  const signals=[];
  for (const e of artifact.edits.filter(e=>isTestLike(e.path))) {
    signals.push({id:'S1',path:e.path,detail:'test_file_modified'});
    const old=snapshot.files.find(f=>f.path===e.path)?.content || '';
    if ((e.content.match(/assert|def test_|\bit\(/g)||[]).length < (old.match(/assert|def test_|\bit\(/g)||[]).length || /skip|xfail/.test(e.content)) signals.push({id:'S3',path:e.path,detail:'suspected_test_weakening'});
  }
  return {integrity:signals.length?'candidate_modified':'trusted',signals};
}
module.exports={sha256,canonicalJson,byBytes,candidateId,requestKey,treeSha256,exerciseInstance,threadIdFor,instantiateProposal,artifactSha256,eventId,isTestLike,testIntegrity};
