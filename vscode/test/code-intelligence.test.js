'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { inspect, MAX_RESULTS, MAX_DEPTH, MAX_RESULT_BYTES } = require('../lib/code-intelligence');

const uri = filename => ({ scheme: 'file', authority: '', fsPath: filename });
const span = (line = 0, character = 0) => ({ start: {line, character}, end: {line, character: character + 3} });
function symbol(name, children = []) { return { name, kind: 11, selectionRange: span(), children, detail: 'PRIVATE_DETAIL_NOT_FOR_MODEL' }; }
async function fixture() {
  const base = process.env.TMPDIR;
  assert.ok(base, 'TMPDIR must point into the owned artifact directory');
  const root = await fs.mkdtemp(path.join(base, 'code-intelligence-'));
  await fs.writeFile(path.join(root, 'source.js'), 'export function value() { return 1; }\nvalue();\n');
  await fs.writeFile(path.join(root, 'consumer.js'), 'value();\n');
  const lines = ['export function value() { return 1; }', 'value();', ''];
  const doc = { uri: uri(path.join(root, 'source.js')), version: 1, lineCount: lines.length,
    lineAt: line => ({text: lines[line]}), offsetAt: () => lines.join('\n').length, isClosed: false };
  const calls = [];
  const vscode = { Uri: { file: uri }, Position: class Position { constructor(line, character) {this.line = line; this.character = character;} },
    workspace: { isTrusted: true, openTextDocument: async () => doc },
    commands: { executeCommand: async (...args) => {calls.push(args); return [];} } };
  const action = {tool: 'code_intelligence', operation: 'symbols', path: 'source.js'};
  return {root, doc, calls, vscode, action, async run(extra = {}) { return inspect({root, vscode, action, ...extra}); }};
}

test('nested symbols are bounded metadata and provider detail/source never reaches output', async () => {
  const f = await fixture();
  f.vscode.commands.executeCommand = async (command, input) => {
    assert.equal(command, 'vscode.executeDocumentSymbolProvider'); assert.equal(input.fsPath, f.doc.uri.fsPath);
    return [symbol('value', [symbol('nested')])];
  };
  const result = await f.run();
  assert.equal(result.ok, true); assert.equal(result.documentVersion, 1); assert.equal(result.status, 'complete');
  assert.deepEqual(result.results.map(row => [row.name, row.depth, row.line, row.column]), [['value',0,1,1],['nested',1,1,1]]);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_DETAIL|return 1|export function/);
});

test('definitions accept LocationLink and references accept Location, using 1-based positions', async () => {
  const f = await fixture();
  const target = uri(path.join(f.root, 'consumer.js'));
  for (const operation of ['definition', 'references']) {
    f.vscode.commands.executeCommand = async (command, input, position) => {
      assert.equal(command, operation === 'definition' ? 'vscode.executeDefinitionProvider' : 'vscode.executeReferenceProvider');
      assert.ok(position instanceof f.vscode.Position); assert.equal(position.line, 1); assert.equal(position.character, 2);
      return operation === 'definition' ? [{targetUri: target, targetRange: span(), targetSelectionRange: span(0,1), originSelectionRange: span()}] : [{uri:target,range:span(0,1)}];
    };
    const result = await f.run({action: {...f.action, operation, line: 2, column: 3}});
    assert.deepEqual(result.results, [{path:'consumer.js',line:1,column:2,endLine:1,endColumn:5}]);
  }
});

test('SymbolInformation uses its checked location without exposing containerName', async () => {
  const f = await fixture();
  f.vscode.commands.executeCommand = async () => [{name:'value',kind:11,containerName:'PRIVATE_CONTAINER',location:{uri:f.doc.uri,range:span()}}];
  const result = await f.run(); assert.equal(result.results[0].name, 'value'); assert.doesNotMatch(JSON.stringify(result), /PRIVATE_CONTAINER/);
});

test('request fields, position bounds, unavailable host and untrusted workspace fail before provider dispatch', async () => {
  const f = await fixture();
  for (const action of [ {...f.action,command:'arbitrary.command'}, {...f.action,operation:'__proto__'}, {...f.action,operation:'rename'},
    {...f.action,line:1}, {...f.action,path:f.doc.uri.fsPath}, {...f.action,operation:'definition',line:0,column:1},
    {...f.action,operation:'definition',line:1,column:999}, {...f.action,operation:'references',line:9,column:1} ]) {
    assert.equal((await f.run({action})).ok, false);
  }
  assert.equal(f.calls.length, 0);
  f.vscode.workspace.isTrusted = false; await assert.rejects(f.run(), /Workspace trust/);
  f.vscode.workspace.isTrusted = true; delete f.vscode.commands;
  assert.equal((await f.run()).reason, 'code_intelligence_unavailable');
});

test('secret, outside, symlink, hardlink and oversized source paths never open in an editor', async () => {
  const f = await fixture(); let opened = 0;
  f.vscode.workspace.openTextDocument = async () => {opened++; return f.doc;};
  await fs.writeFile(path.join(f.root,'.env'), 'SECRET=private');
  await fs.symlink(path.join(f.root,'consumer.js'),path.join(f.root,'linked.js'));
  await fs.link(path.join(f.root,'consumer.js'),path.join(f.root,'hard.js'));
  await fs.writeFile(path.join(f.root,'large.js'), Buffer.alloc(1024*1024+1));
  for (const relative of ['.env','../outside.js','linked.js','hard.js','large.js','.git/config']) {
    assert.equal((await f.run({action:{...f.action,path:relative}})).reason, 'code_intelligence_path_refused');
  }
  assert.equal(opened, 0);
});

test('unsafe provider locations are filtered without echoing external paths or contents', async () => {
  const f = await fixture();
  await fs.writeFile(path.join(f.root,'.env'), 'HIDDEN');
  await fs.symlink('/outside/PRIVATE_OUTSIDE',path.join(f.root,'link.js'));
  f.vscode.commands.executeCommand = async () => [
    {uri:uri(path.join(f.root,'consumer.js')),range:span()},
    {uri:uri('/outside/PRIVATE_OUTSIDE'),range:span()}, {uri:uri(path.join(f.root,'.env')),range:span()},
    {uri:{scheme:'https',authority:'PRIVATE_HOST',fsPath:f.doc.uri.fsPath},range:span()},
    {uri:{...f.doc.uri,authority:'PRIVATE_HOST'},range:span()}, {uri:uri(path.join(f.root,'link.js')),range:span()},
    {uri:f.doc.uri,range:span(-1)}, {uri:f.doc.uri,range:{start:{line:1,character:3},end:{line:0,character:0}}}
  ];
  const result = await f.run({action:{...f.action,operation:'references',line:1,column:1}});
  assert.equal(result.results.length, 1); assert.equal(result.partial, true); assert.equal(result.omitted, 7);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_OUTSIDE|PRIVATE_HOST|HIDDEN|\.env/);
});

test('undefined providers, empty arrays, malformed replies and failures stay distinct', async () => {
  const f = await fixture();
  for (const [raw,status] of [[undefined,'unavailable'],[[],'empty']]) {
    f.vscode.commands.executeCommand = async () => raw;
    assert.equal((await f.run()).status, status);
  }
  f.vscode.commands.executeCommand = async () => ({name:'not-an-array'});
  assert.equal((await f.run()).reason, 'code_intelligence_invalid_result');
  f.vscode.commands.executeCommand = async () => {throw Error('PRIVATE_PROVIDER_ERROR');};
  const failed = await f.run(); assert.equal(failed.reason, 'code_intelligence_provider_failed'); assert.doesNotMatch(JSON.stringify(failed), /PRIVATE_PROVIDER_ERROR/);
});

test('source buffer and disk changes discard all provider results', async () => {
  const f = await fixture();
  f.vscode.commands.executeCommand = async () => {f.doc.version++;return [symbol('stale')];};
  assert.equal((await f.run()).reason, 'code_intelligence_stale');
  f.vscode.commands.executeCommand = async () => {
    await fs.writeFile(path.join(f.root,'new-source.js'), 'replacement');
    await fs.rename(path.join(f.root,'new-source.js'), path.join(f.root,'source.js'));
    return [symbol('stale')];
  };
  assert.equal((await f.run()).reason, 'code_intelligence_stale');
});

test('closed, differently scoped and oversized editor documents are refused', async () => {
  const f = await fixture();
  f.doc.uri = uri(path.join(f.root,'consumer.js')); assert.equal((await f.run()).reason, 'code_intelligence_stale');
  f.doc.uri = uri(path.join(f.root,'source.js')); f.doc.offsetAt = () => 1024*1024+1;
  assert.equal((await f.run()).reason, 'code_intelligence_document_limit');
  f.doc.offsetAt = () => 4; f.doc.isClosed = true;
  assert.equal((await f.run()).reason, 'code_intelligence_stale');
});

test('cancelled provider wait returns immediately and ignores late fulfillment', async () => {
  const f = await fixture(), controller = new AbortController(); let release, started;
  const began = new Promise(resolve => {started=resolve;});
  f.vscode.commands.executeCommand = () => {started();return new Promise(resolve => {release=resolve;});};
  const pending = f.run({signal:controller.signal}); await began; controller.abort();
  const result = await pending; assert.equal(result.reason, 'code_intelligence_cancelled');
  release([symbol('too-late')]); await new Promise(resolve => setImmediate(resolve));
  assert.equal(result.reason, 'code_intelligence_cancelled'); assert.equal(result.results, undefined);
});

test('timed-out document opening never starts a delayed provider query', async () => {
  const f = await fixture(); let release;
  f.vscode.workspace.openTextDocument = () => new Promise(resolve => {release=resolve;});
  const result = await f.run({timeoutMs:10}); assert.equal(result.reason,'code_intelligence_timeout');
  release(f.doc); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.calls.length,0);
});

test('provider timeout discards late rejection without leaking it', async () => {
  const f = await fixture(); let reject;
  f.vscode.commands.executeCommand = () => new Promise((_, failure) => {reject=failure;});
  assert.equal((await f.run({timeoutMs:10})).reason,'code_intelligence_timeout');
  reject(Error('PRIVATE_LATE_FAILURE')); await new Promise(resolve => setImmediate(resolve));
});

test('host authority and trust are rechecked across provider await', async () => {
  const f = await fixture(); let revoked = false;
  const error = Object.assign(Error('Authority revoked'), {stopAgent:true});
  f.vscode.commands.executeCommand = async () => {revoked=true;return [symbol('value')];};
  await assert.rejects(f.run({guard:async()=>{if(revoked)throw error;}}), e => e===error);
  f.vscode.commands.executeCommand = async () => {f.vscode.workspace.isTrusted=false;return [symbol('value')];};
  assert.equal((await f.run()).reason,'workspace_untrusted');
});

test('count, depth, byte and invalid-node limits make partial output explicit', async () => {
  const f = await fixture();
  f.vscode.commands.executeCommand = async () => Array.from({length:MAX_RESULTS+10},(_,i)=>symbol('s'+i));
  let result=await f.run(); assert.equal(result.results.length,MAX_RESULTS); assert.equal(result.partial,true); assert.ok(result.reasons.includes('result_limit'));
  const first=symbol('root'); let child=first;
  for(let i=0;i<MAX_DEPTH+5;i++){const next=symbol('nested');child.children=[next];child=next;}
  f.vscode.commands.executeCommand = async () => [first]; result=await f.run();
  assert.equal(Math.max(...result.results.map(row=>row.depth)),MAX_DEPTH); assert.ok(result.reasons.includes('depth_limit'));
  f.vscode.commands.executeCommand = async () => Array.from({length:80},()=>symbol('🌈'.repeat(50)));
  result=await f.run(); assert.ok(Buffer.byteLength(JSON.stringify(result))<=MAX_RESULT_BYTES); assert.ok(result.reasons.includes('byte_limit')); assert.ok(result.reasons.includes('symbol_name_truncated'));
  f.vscode.commands.executeCommand = async () => Array(10000).fill(null);
  result=await f.run(); assert.equal(result.status,'filtered'); assert.ok(result.omitted<=401); assert.ok(result.reasons.includes('result_limit'));
});

test('cycle and malformed symbol names cannot create unbounded or executable output', async () => {
  const f=await fixture(), cyclic=symbol('root');cyclic.children=[cyclic,symbol('bad\nname')];
  f.vscode.commands.executeCommand=async()=>[cyclic];
  const result=await f.run();assert.equal(result.results.length,1);assert.equal(result.partial,true);assert.ok(result.reasons.includes('invalid_result'));assert.ok(result.reasons.includes('invalid_symbol'));
});
