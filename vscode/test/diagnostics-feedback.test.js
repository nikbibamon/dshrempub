'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { MAX_BYTES, MAX_PER_FILE, createTracker, collect } = require('../lib/diagnostics-feedback');

async function setup() {
  const root = await fs.mkdtemp(path.join(process.env.TVIJO_TEST_ARTIFACTS || os.tmpdir(), 'tvijo-diagnostics-'));
  const file = path.join(root, 'src', 'changed.js');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, 'const value = 2;\n');
  const uri = { scheme: 'file', fsPath: file };
  const listeners = new Set();
  const vscode = {
    workspace: {
      getWorkspaceFolder: candidate => candidate.fsPath.startsWith(root + path.sep) ? { uri: { fsPath: root } } : undefined
    },
    languages: { onDidChangeDiagnostics: fn => { listeners.add(fn); return { dispose: () => listeners.delete(fn) }; }, getDiagnostics: candidate => candidate.fsPath === file ? (vscode.items || []) : [] },
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2 },
    emit(candidate = uri) { for (const listener of listeners) listener({ uris: [candidate] }); },
    items: []
  };
  const tracker = createTracker(vscode);
  return { root, file, uri, vscode, tracker };
}

function diag(severity, message, line = 0) {
  return { severity, message, source: 'synthetic', code: 23, range: { start: { line, character: 2 } } };
}

function unpack(text) {
  const lines = text.split('\n');
  const metadata = JSON.parse(lines[1]);
  const files = [];
  for (const line of lines.slice(2)) {
    if (!line.startsWith('{')) continue;
    try { files.push(JSON.parse(line)); } catch { /* The bounded truncation can end inside a row. */ }
  }
  return {
    files,
    note: metadata.note,
    truncated: metadata.truncated || text.endsWith('\n[truncated]')
  };
}

test('feedback filters to errors and warnings, keeps actual version and states honest empty snapshots', async () => {
  const env = await setup();
  try {
    const startedAt = env.tracker.markApply();
    env.vscode.items = [diag(0, 'compile error'), diag(1, 'lint warning'), diag(2, 'information omitted')];
    setTimeout(() => env.vscode.emit(), 5);
    const feedback = await collect({ vscode: env.vscode, root: env.root, tracker: env.tracker, changedFiles: [{ uri: env.uri, version: 9, startedAt }], waitMs: 80 });
    const result = unpack(feedback);
    assert.deepEqual(result.files[0].diagnostics.map(item => item.severity), ['Error', 'Warning']);
    assert.equal(result.files[0].documentVersion, 9);
    assert.equal(result.files[0].freshness, 'observed after edit; provider document version unknown');
    env.vscode.items = [];
    const empty = await collect({ vscode: env.vscode, root: env.root, tracker: env.tracker, changedFiles: [{ uri: env.uri, version: 10, startedAt: Date.now() }], waitMs: 1 });
    const emptyResult = unpack(empty);
    assert.deepEqual(emptyResult.files[0].diagnostics, []);
    assert.match(emptyResult.note, /does not mean compilation or tests passed/);
    assert.equal(emptyResult.files[0].freshness, 'current snapshot; provider freshness unknown');
  } finally { env.tracker.dispose(); }
});

test('feedback caps diagnostics per file and total serialized UTF-8 bytes including labels', async () => {
  const env = await setup();
  try {
    env.vscode.items = Array.from({ length: 35 }, (_, i) => diag(0, 'ошибка'.repeat(200) + i, i));
    const feedback = await collect({ vscode: env.vscode, root: env.root, tracker: env.tracker, changedFiles: [{ uri: env.uri, version: 2, startedAt: Date.now() }], waitMs: 1 });
    const result = unpack(feedback);
    assert.ok(result.files[0].diagnostics.length > 0 && result.files[0].diagnostics.length <= MAX_PER_FILE);
    assert.equal(result.truncated, true);
    assert.ok(Buffer.byteLength(JSON.stringify({ diagnostics_feedback: feedback }), 'utf8') <= MAX_BYTES);
  } finally { env.tracker.dispose(); }
});

test('feedback refuses outside and symlink paths, and scope failure or cancellation stops collection', async () => {
  const env = await setup();
  try {
    const outside = { scheme: 'file', fsPath: path.join(env.root, '..', 'outside.js') };
    assert.equal(await collect({ vscode: env.vscode, root: env.root, tracker: env.tracker, changedFiles: [{ uri: outside, version: 1 }] }), null);
    const link = path.join(env.root, 'src', 'link.js');
    await fs.symlink(env.file, link);
    assert.equal(await collect({ vscode: env.vscode, root: env.root, tracker: env.tracker, changedFiles: [{ uri: { scheme: 'file', fsPath: link }, version: 1 }] }), null);
    await assert.rejects(() => collect({ vscode: env.vscode, root: env.root, tracker: env.tracker, changedFiles: [{ uri: env.uri, version: 1, startedAt: Date.now() }], waitMs: 30, guard: () => { throw new Error('scope changed'); } }), /scope changed/);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 2);
    const cancelled = await collect({ vscode: env.vscode, root: env.root, tracker: env.tracker, signal: controller.signal, changedFiles: [{ uri: env.uri, version: 1, startedAt: Date.now() }], waitMs: 50 });
    assert.equal(cancelled, null);
  } finally { env.tracker.dispose(); }
});

test('a concurrent document edit or unavailable diagnostic provider is never reported as a clean snapshot', async()=>{
  const env=await setup();
  try{
    env.vscode.workspace.textDocuments=[{uri:env.uri,version:4}];
    env.vscode.items=[diag(0,'STALE_ERROR')];
    let feedback=unpack(await collect({vscode:env.vscode,root:env.root,tracker:env.tracker,changedFiles:[{uri:env.uri,version:3}],waitMs:1}));
    assert.equal(feedback.files[0].snapshotAvailable,false);
    assert.match(feedback.files[0].freshness,/changed again/);
    assert.deepEqual(feedback.files[0].diagnostics,[]);
    env.vscode.workspace.textDocuments=[];
    env.vscode.languages.getDiagnostics=()=>{throw Error('provider unavailable');};
    feedback=unpack(await collect({vscode:env.vscode,root:env.root,tracker:env.tracker,changedFiles:[{uri:env.uri,version:3}],waitMs:1}));
    assert.equal(feedback.files[0].snapshotAvailable,false);
    assert.equal(feedback.files[0].freshness,'diagnostics unavailable');
  }finally{env.tracker.dispose();}
});
