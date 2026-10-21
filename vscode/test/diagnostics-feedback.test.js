'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { MAX_BYTES, MAX_ITEMS, createTracker, captureBaseline, collect } = require('../lib/diagnostics-feedback');

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
    const baseline = captureBaseline({vscode:env.vscode,root:env.root,uri:env.uri,version:8});
    env.vscode.items = [diag(0, 'compile error'), diag(1, 'lint warning'), diag(2, 'information omitted')];
    setTimeout(() => env.vscode.emit(), 5);
    const feedback = await collect({ vscode: env.vscode, root: env.root, tracker: env.tracker, changedFiles: [{ uri: env.uri, version: 9, startedAt, baseline }], waitMs: 80 });
    const result = unpack(feedback);
    assert.deepEqual(result.files[0].new.map(item => item.severity), ['Error', 'Warning']);
    assert.equal(result.files[0].documentVersion, 9);
    assert.equal(result.files[0].freshness, 'observed after edit; provider document version unknown');
    const nextBaseline = captureBaseline({vscode:env.vscode,root:env.root,uri:env.uri,version:9});
    env.vscode.items = [];
    const empty = await collect({ vscode: env.vscode, root: env.root, tracker: env.tracker, changedFiles: [{ uri: env.uri, version: 10, baseline:nextBaseline, startedAt: Date.now() }], waitMs: 1 });
    const emptyResult = unpack(empty);
    assert.deepEqual(emptyResult.files[0].new, []);
    assert.equal(emptyResult.files[0].resolved.length,2);
    assert.match(emptyResult.note, /does not mean compilation or tests passed/);
    assert.equal(emptyResult.files[0].freshness, 'current snapshot; provider freshness unknown');
  } finally { env.tracker.dispose(); }
});

test('feedback caps delta items and total serialized UTF-8 bytes including labels', async () => {
  const env = await setup();
  try {
    const baseline = captureBaseline({vscode:env.vscode,root:env.root,uri:env.uri,version:1});
    env.vscode.items = Array.from({ length: 35 }, (_, i) => diag(0, 'ошибка'.repeat(200) + i, i));
    const feedback = await collect({ vscode: env.vscode, root: env.root, tracker: env.tracker, changedFiles: [{ uri: env.uri, version: 2, baseline, startedAt: Date.now() }], waitMs: 1 });
    const result = unpack(feedback);
    assert.ok(result.files[0].new.length > 0 && result.files[0].new.length <= MAX_ITEMS);
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
    assert.deepEqual(feedback.files[0].new,[]);
    assert.deepEqual(feedback.files[0].resolved,[]);
    assert.equal(feedback.files[0].unchangedCount,null);
    env.vscode.workspace.textDocuments=[];
    env.vscode.languages.getDiagnostics=()=>{throw Error('provider unavailable');};
    feedback=unpack(await collect({vscode:env.vscode,root:env.root,tracker:env.tracker,changedFiles:[{uri:env.uri,version:3}],waitMs:1}));
    assert.equal(feedback.files[0].snapshotAvailable,false);
    assert.equal(feedback.files[0].freshness,'diagnostics unavailable');
  }finally{env.tracker.dispose();}
});


test('pre-edit baseline emits only new and resolved items and counts unchanged pre-existing diagnostics',async()=>{
  const env=await setup();
  try{
    const old=diag(0,'RESOLVED_ERROR'),same=diag(1,'UNCHANGED_PRIVATE_DETAIL',3);
    env.vscode.items=[old,same];
    const baseline=captureBaseline({vscode:env.vscode,root:env.root,uri:env.uri,version:1});
    old.message='mutated object after capture';
    env.vscode.items=[same,diag(0,'NEW_ERROR',8)];
    const startedAt=env.tracker.markApply();env.vscode.emit();
    const text=await collect({vscode:env.vscode,root:env.root,tracker:env.tracker,changedFiles:[{uri:env.uri,version:2,baseline,startedAt}],waitMs:1});
    const row=unpack(text).files[0];
    assert.equal(row.deltaAvailable,true);assert.equal(row.baselineDocumentVersion,1);assert.equal(row.unchangedCount,1);
    assert.deepEqual(row.new.map(item=>item.message),['NEW_ERROR']);assert.deepEqual(row.resolved.map(item=>item.message),['RESOLVED_ERROR']);
    assert.equal(row.new[0].line,9);assert.equal(row.new[0].code,'23');assert.doesNotMatch(text,/UNCHANGED_PRIVATE_DETAIL|mutated object/);
  }finally{env.tracker.dispose();}
});

test('item cap is shared by new and resolved items across every changed file',async()=>{
  const env=await setup();
  try{
    const other={scheme:'file',fsPath:path.join(env.root,'src','other.js')};await fs.writeFile(other.fsPath,'x');
    const items=new Map([[env.file,Array.from({length:15},(_,n)=>diag(0,'OLD_A_'+n,n))],[other.fsPath,Array.from({length:15},(_,n)=>diag(0,'OLD_B_'+n,n))]]);
    env.vscode.languages.getDiagnostics=uri=>items.get(uri.fsPath);
    const baselines=[env.uri,other].map(uri=>captureBaseline({vscode:env.vscode,root:env.root,uri,version:1}));
    items.set(env.file,Array.from({length:10},(_,n)=>diag(0,'NEW_'+n,n)));items.set(other.fsPath,[]);
    const result=unpack(await collect({vscode:env.vscode,root:env.root,tracker:env.tracker,changedFiles:[env.uri,other].map((uri,n)=>({uri,version:2,baseline:baselines[n]})),waitMs:1}));
    assert.equal(result.truncated,true);assert.equal(result.files.reduce((n,file)=>n+file.new.length+file.resolved.length,0),20);
    assert.equal(result.files[0].newCount,10);assert.equal(result.files[0].resolvedCount,15);assert.equal(result.files[1].resolvedCount,15);
  }finally{env.tracker.dispose();}
});

test('missing, unavailable or cross-file baselines never manufacture clean deltas',async()=>{
  const env=await setup();
  try{
    env.vscode.items=[diag(0,'OLD_ERROR')];
    const valid=captureBaseline({vscode:env.vscode,root:env.root,uri:env.uri,version:1});
    for(const baseline of [undefined,{...valid,key:path.join(env.root,'different.js')},{...valid,available:false}]){
      const row=unpack(await collect({vscode:env.vscode,root:env.root,tracker:env.tracker,changedFiles:[{uri:env.uri,version:2,baseline}],waitMs:1})).files[0];
      assert.equal(row.deltaAvailable,false);assert.equal(row.unchangedCount,null);assert.equal(row.newCount,null);assert.deepEqual(row.resolved,[]);
    }
    env.vscode.languages.getDiagnostics=()=>{throw Error('provider unavailable');};
    assert.equal(captureBaseline({vscode:env.vscode,root:env.root,uri:env.uri,version:1}).available,false);
  }finally{env.tracker.dispose();}
});

test('empty delta and unchanged errors retain freshness uncertainty and never claim success',async()=>{
  const env=await setup();
  try{
    for(const items of [[],[diag(0,'OLD_ERROR')]]){
      env.vscode.items=items;const baseline=captureBaseline({vscode:env.vscode,root:env.root,uri:env.uri,version:1});
      const result=unpack(await collect({vscode:env.vscode,root:env.root,tracker:env.tracker,changedFiles:[{uri:env.uri,version:2,baseline}],waitMs:1}));
      assert.deepEqual(result.files[0].new,[]);assert.deepEqual(result.files[0].resolved,[]);assert.equal(result.files[0].unchangedCount,items.length);
      assert.match(result.note,/does not mean compilation or tests passed/);assert.match(result.files[0].freshness,/freshness unknown/);
    }
  }finally{env.tracker.dispose();}
});

test('changed document or mismatched applied content suppresses resolutions from stale data',async()=>{
  const env=await setup();
  try{
    env.vscode.items=[diag(0,'OLD_ERROR')];const baseline=captureBaseline({vscode:env.vscode,root:env.root,uri:env.uri,version:1});env.vscode.items=[];
    for(const changed of [{version:2,stale:true},{version:2}]){
      env.vscode.workspace.textDocuments=[{uri:env.uri,version:3}];
      const row=unpack(await collect({vscode:env.vscode,root:env.root,tracker:env.tracker,changedFiles:[{uri:env.uri,baseline,...changed}],waitMs:1})).files[0];
      assert.equal(row.deltaAvailable,false);assert.equal(row.snapshotAvailable,false);assert.equal(row.resolvedCount,null);assert.deepEqual(row.resolved,[]);assert.match(row.freshness,/changed again/);
    }
  }finally{env.tracker.dispose();}
});

test('baseline capture refuses outside and symlink paths before consulting the provider',async()=>{
  const env=await setup();let reads=0;
  try{
    env.vscode.languages.getDiagnostics=()=>{reads++;return [];};
    const link=path.join(env.root,'link.js');await fs.symlink(env.file,link);
    for(const fsPath of [link,path.join(env.root,'..','outside.js')])assert.equal(captureBaseline({vscode:env.vscode,root:env.root,uri:{scheme:'file',fsPath},version:1}).available,false);
    assert.equal(reads,0);
  }finally{env.tracker.dispose();}
});
