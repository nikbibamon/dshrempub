'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {performance} = require('node:perf_hooks');
const {collect} = require('../lib/workspace-context');
const {createRulesHost} = require('../lib/rules-host');
const {MAX_BYTES, MAX_SYMBOLS, MAX_DEPTH, MAX_VISITS, PROVIDER_TIMEOUT_MS} = require('../lib/symbol-context');

const uri = fsPath => ({scheme:'file', authority:'', fsPath, path:fsPath});
const range = (start = 0, end = start) => ({start:{line:start, character:0}, end:{line:end, character:1}});
const symbol = (name = 'greet', start = 0, end = start, children = []) => ({name, kind:11, range:range(start, end), children});

async function fixture(source = 'function greet() { return "hello"; }\n') {
  // Artifacts intentionally preserved for the supervisor; no cleanup of shared paths.
  const root = await fs.mkdtemp(path.join(process.env.TVIJO_TEST_ARTIFACTS || os.tmpdir(), 'semantic-'));
  await fs.mkdir(path.join(root, 'src'));
  const file = path.join(root, 'src', 'main.js');
  await fs.writeFile(file, source);
  const folder = {uri:uri(root), name:path.basename(root)};
  const settings = {semanticContext:true, workspaceContext:'on'};
  const document = {uri:uri(file), version:1, lineCount:source.split('\n').length, isDirty:false,
    getText:() => source};
  let calls = 0;
  const vscode = {
    Uri:{file:uri, joinPath:(base, ...parts) => uri(path.join(base.fsPath, ...parts))},
    FileType:{File:1, Directory:2, SymbolicLink:64},
    workspace:{isTrusted:true, workspaceFolders:[folder], getWorkspaceFolder:() => folder,
      getConfiguration:(section, resource) => {
        assert.equal(section, 'tvijo'); assert.equal(resource, document.uri);
        return {get:(key, fallback) => settings[key] ?? fallback};
      },
      fs:{readDirectory:async () => [], stat:async () => { throw Error('no manifests'); }}},
    commands:{executeCommand:async (command, target) => {
      calls++; assert.equal(command, 'vscode.executeDocumentSymbolProvider'); assert.equal(target, document.uri);
      return [symbol()];
    }}
  };
  return {root, file, folder, settings, document, vscode, calls:() => calls};
}

function outlineBlock(text) {
  return text.match(/\n--- active symbol outline:[\s\S]*?(?=\[END WORKSPACE CONTEXT\]|$)/)?.[0] || '';
}

test('default remains byte-compatible; opt-in replaces only the active source block', async () => {
  const f = await fixture();
  delete f.settings.semanticContext;
  const disabled = await collect(f.vscode, {document:f.document});
  assert.equal(f.calls(), 0);
  delete f.vscode.workspace.getConfiguration;
  assert.deepEqual(await collect(f.vscode, {document:f.document}), disabled);
  f.vscode.workspace.getConfiguration = () => ({get:key => key === 'semanticContext' ? true : 'on'});
  const enabled = await collect(f.vscode, {document:f.document});
  assert.match(enabled.text, /active symbol outline: src\/main.js/);
  assert.match(enabled.text, /Function L1-1: greet/);
  assert.doesNotMatch(enabled.text, /return "hello"|active file:/);
  assert.equal(f.calls(), 1);
  assert.ok(enabled.summary.bytes <= 200000);
  f.vscode.workspace.getConfiguration = () => ({get:key => key === 'semanticContext' ? false : 'on'});
  assert.deepEqual(await collect(f.vscode, {document:f.document}), disabled);
});

test('existing rules-host collector picks up the scoped flag without call-site changes', async () => {
  const f = await fixture();
  const host = createRulesHost({vscode:f.vscode, state:{get:() => undefined}, storageRoot:path.join(f.root, 'storage')});
  const result = await host.collect({document:f.document, folder:f.folder});
  assert.match(result.text, /Function L1-1: greet/);
  assert.equal(f.calls(), 1);
});

for (const [name, modify, options] of [
  ['off argument', () => {}, {contextMode:'off'}],
  ['off setting despite preview', f => { f.settings.workspaceContext = 'off'; }, {contextMode:'preview'}],
  ['untrusted', f => { f.vscode.workspace.isTrusted = false; }, {}],
  ['unknown trust', f => { delete f.vscode.workspace.isTrusted; }, {}],
  ['deselected root', () => {}, {selectedPaths:[]}],
  ['excluded source directory', f => { f.document.uri = uri(path.join(f.root, 'node_modules', 'main.js')); }, {}],
  ['credential filename', f => { f.document.uri = uri(path.join(f.root, 'src', 'credentials.json')); }, {}],
  ['credential parent', f => { f.document.uri = uri(path.join(f.root, 'credentials', 'main.js')); }, {}],
  ['credential token in filename', f => { f.document.uri = uri(path.join(f.root, 'src', 'prefix_tvijo_pk_' + 'A'.repeat(20) + '.js')); }, {}],
  ['rules document', f => { f.document.uri = uri(path.join(f.root, 'AGENTS.md')); }, {}],
  ['external file', f => { f.document.uri = uri(path.join(f.root, '..', 'outside.js')); }, {}],
  ['remote authority', f => { f.document.uri.authority = 'other-host'; }, {}],
  ['non-file URI', f => { f.document.uri.scheme = 'untitled'; }, {}],
  ['query URI', f => { f.document.uri.query = 'other'; }, {}],
  ['closed document', f => { f.document.isClosed = true; }, {}],
  ['selection scope only', f => { f.document.selection = {start:{line:0}, end:{line:0}}; }, {selectionText:'safe selection'}]
]) test('provider is never called for ' + name, async () => {
  const f = await fixture(); modify(f);
  const result = await collect(f.vscode, {document:f.document, ...options});
  assert.equal(f.calls(), 0); assert.equal(outlineBlock(result.text), '');
  assert.doesNotMatch(result.text, /--- active file:/, 'refused source cannot bypass policy through fallback');
});

test('enabled secret boundary applies before provider admission with default null selection', async () => {
  const secret = 'known-private-canary';
  const f = await fixture(`function example() { return "${secret}"; }\n`);
  await fs.mkdir(path.join(f.root, 'credentials'));
  f.document.uri = uri(path.join(f.root, 'credentials', 'main.js'));
  const options = {document:f.document, selectionForFolder:() => null, knownSecrets:[secret]};
  f.settings.semanticContext = false;
  const legacy = await collect(f.vscode, options);
  assert.match(legacy.text, /known-private-canary/, 'record inherited default-off behavior separately');
  f.settings.semanticContext = true;
  const enabled = await collect(f.vscode, options);
  assert.doesNotMatch(enabled.text, /known-private-canary|--- active file:|active symbol outline/);
  assert.equal(f.calls(), 0);
});

test('explicit selected folder and selection callback govern the active document', async () => {
  const f = await fixture();
  const second = {uri:uri(await fs.mkdtemp(path.join(f.root, 'second-')))};
  f.vscode.workspace.workspaceFolders.push(second);
  const result = await collect(f.vscode, {folder:second, document:f.document});
  assert.equal(f.calls(), 0); assert.equal(outlineBlock(result.text), '');
  const excluded = await collect(f.vscode, {document:f.document, selectionForFolder:() => []});
  assert.equal(f.calls(), 0); assert.equal(outlineBlock(excluded.text), '');
});

test('symlink file, parent directory and root alias are refused despite provider metadata', async () => {
  const f = await fixture();
  const target = await fs.mkdtemp(path.join(f.root, 'outside-'));
  await fs.writeFile(path.join(target, 'main.js'), 'function outside() {}');
  await fs.symlink(path.join(target, 'main.js'), path.join(f.root, 'src', 'linked.js'));
  await fs.symlink(target, path.join(f.root, 'linked-dir'));
  for (const relative of ['src/linked.js', 'linked-dir/main.js']) {
    f.document.uri = uri(path.join(f.root, relative));
    assert.equal(outlineBlock((await collect(f.vscode, {document:f.document})).text), '');
  }
  await fs.symlink(f.root, path.join(target, 'root-alias'));
  f.folder.uri = uri(path.join(target, 'root-alias'));
  f.document.uri = uri(path.join(f.folder.uri.fsPath, 'src', 'main.js'));
  assert.equal(outlineBlock((await collect(f.vscode, {document:f.document})).text), '');
  assert.equal(f.calls(), 0);
});

for (const source of [
  'a'.repeat(13000) + '\npassword=synthetic-sensitive-value',
  'function ordinary() {}\n' + 'a'.repeat(13000) + '\nknown-private-canary',
  'const prefix_tvijo_pk_' + 'A'.repeat(20) + ' = 1;',
  'known-private-canary\nfunction ordinary() {}',
  'x'.repeat(512 * 1024 + 1),
  'binary\0value',
  'bad\ufffdencoding'
]) test('whole source scan refuses secret, oversized or unsupported text before dispatch: ' + source.length, async () => {
  const f = await fixture(source);
  const result = await collect(f.vscode, {document:f.document, knownSecrets:['known-private-canary']});
  assert.equal(f.calls(), 0); assert.equal(outlineBlock(result.text), '');
  assert.doesNotMatch(result.text, /--- active file:|known-private-canary|prefix_tvijo_pk_/);
  assert.equal(result.summary.skippedSensitive, 1);
});

test('secret-shaped symbol names, controls, and known secrets are filtered before formatting', async () => {
  const f = await fixture();
  const unsafe = ['prefix_sk-' + 'A'.repeat(20), 'github_pat_' + 'B'.repeat(24),
    'access_token=synthetic', 'account-private-canary', 'line\ninjection', 'bidi\u202espoof',
    'tvijo_pk_' + 'C'.repeat(20), 'prefix_ghp_' + 'D'.repeat(24)];
  f.vscode.commands.executeCommand = async () => [...unsafe.map(name => symbol(name)), symbol('safeName')];
  const result = await collect(f.vscode, {document:f.document, knownSecrets:['account-private-canary']});
  const block = outlineBlock(result.text);
  assert.match(block, /safeName/);
  for (const name of unsafe) assert.ok(!block.includes(name));
});

test('SymbolInformation must refer to the same normalized local URI', async () => {
  const f = await fixture();
  const information = (name, target) => ({name, kind:4, location:{uri:target, range:range()}});
  f.vscode.commands.executeCommand = async () => [
    information('outside', uri(path.join(f.root, 'other.js'))),
    information('remote', {...f.document.uri, authority:'server'}),
    information('fragment', {...f.document.uri, fragment:'alias'}),
    information('wrongScheme', {...f.document.uri, scheme:'vscode-remote'}),
    {name:'missingURI', kind:4, range:range(), location:{}},
    information('same', uri(path.join(f.root, 'src', '..', 'src', 'main.js')))
  ];
  const result = await collect(f.vscode, {document:f.document});
  assert.match(result.text, /Class L1-1: same/);
  assert.doesNotMatch(outlineBlock(result.text), /outside|remote|fragment|wrongScheme|missingURI/);
});

test('malformed, nested, cyclic and huge provider output stays bounded', async () => {
  const f = await fixture('line\n'.repeat(100));
  const cycle = symbol('cycle'); cycle.children.push(cycle);
  let deep = symbol('deep0'); const top = deep;
  for (let i = 1; i < 100; i++) { const child = symbol('deep' + i); deep.children = [child]; deep = child; }
  const malformed = [null, 1, [], {}, symbol('negative', -1), symbol('outsideLines', 200),
    symbol('largeName' + 'x'.repeat(1000000)),
    {...symbol('badKind'), kind:999}, {...symbol('badRange'), range:range(2, 1)},
    {...symbol('fractional'), range:{start:{line:0.5, character:0}, end:{line:1, character:0}}}];
  f.vscode.commands.executeCommand = async () => [...malformed, cycle, top, ...Array.from({length:10000}, (_, i) => symbol('item' + i))];
  const block = outlineBlock((await collect(f.vscode, {document:f.document})).text);
  assert.ok(Buffer.byteLength(block) <= MAX_BYTES);
  const lines = block.trim().split('\n').slice(1);
  assert.ok(lines.length <= MAX_SYMBOLS);
  assert.equal((block.match(/Function L1-1: cycle/g) || []).length, 1);
  assert.match(block, /deep3/); assert.doesNotMatch(block, /deep4|negative|outsideLines|badKind|badRange|fractional/);
  assert.ok(lines.every(line => (line.match(/^ */)[0].length / 2) < MAX_DEPTH));
  const sparse = []; sparse.length = 1000000000; sparse[MAX_VISITS] = symbol('beyondVisitBudget');
  f.vscode.commands.executeCommand = async () => sparse;
  assert.equal(outlineBlock((await collect(f.vscode, {document:f.document})).text), '');
});

test('Unicode outline uses complete UTF-8 lines within both outline and total budgets', async () => {
  const f = await fixture();
  f.vscode.commands.executeCommand = async () => Array.from({length:100}, (_, i) => symbol('Метод😀' + i + '界'.repeat(70)));
  const result = await collect(f.vscode, {document:f.document, maxBytes:4096});
  const block = outlineBlock(result.text);
  assert.ok(block.length > 0); assert.ok(Buffer.byteLength(block) <= MAX_BYTES);
  assert.ok(Buffer.byteLength(result.text) <= 4096); assert.match(result.text, /\[END WORKSPACE CONTEXT\]\n$/);
  assert.doesNotMatch(block, /\ufffd/);
  assert.equal(Buffer.from(block).toString('utf8'), block);
  assert.ok(block.trim().split('\n').slice(1).every(line => /界$/.test(line)));
});

for (const [name, provider] of [
  ['no command API', null], ['missing provider', async () => undefined],
  ['empty provider', async () => []], ['wrong result type', async () => ({name:'not an array'})],
  ['throwing provider', () => { throw Error('provider failed'); }],
  ['rejected provider', async () => { throw Error('provider rejected'); }],
  ['hanging provider', () => new Promise(() => {})],
  ['throwing property', async () => [{get name() { throw Error('malformed'); }}]]
]) test(name + ' gracefully preserves the existing source block', async () => {
  const f = await fixture();
  if (provider) f.vscode.commands.executeCommand = provider; else delete f.vscode.commands;
  const start = performance.now();
  const result = await collect(f.vscode, {document:f.document});
  assert.match(result.text, /active file: src\/main.js/); assert.equal(outlineBlock(result.text), '');
  assert.ok(performance.now() - start < 1500);
  assert.ok(PROVIDER_TIMEOUT_MS <= 250);
});

test('late rejected provider is handled after timeout', async () => {
  const f = await fixture(); let reject;
  f.vscode.commands.executeCommand = () => new Promise((resolve, fail) => { reject = fail; });
  assert.equal(outlineBlock((await collect(f.vscode, {document:f.document})).text), '');
  reject(Error('late failure'));
  await new Promise(resolve => setImmediate(resolve));
});

for (const [name, drift] of [
  ['version', f => { f.document.version++; }],
  ['URI', f => { f.document.uri = uri(path.join(f.root, 'src', 'other.js')); }],
  ['URI alias spelling', f => { f.document.uri = uri(f.root + '/src/../src/main.js'); }],
  ['trust', f => { f.vscode.workspace.isTrusted = false; }],
  ['flag', f => { f.settings.semanticContext = false; }],
  ['selected paths', f => { f.selected.length = 0; }],
  ['selected root removed', f => { f.vscode.workspace.workspaceFolders = []; }],
  ['symlink introduced', async f => { await fs.rename(f.file, f.file + '.preserved'); await fs.symlink(f.file + '.preserved', f.file); }]
]) test('provider result is rejected after drift in ' + name, async () => {
  const f = await fixture(); f.selected = ['src'];
  f.vscode.commands.executeCommand = async () => { await new Promise(resolve => setImmediate(resolve)); await drift(f); return [symbol('staleCanary')]; };
  const result = await collect(f.vscode, {document:f.document, selectionForFolder:() => f.selected});
  assert.doesNotMatch(result.text, /staleCanary|active symbol outline/);
  assert.doesNotMatch(result.text, /--- active file:/, 'stale or revoked source must not re-enter through fallback');
});

test('deterministic byte benchmark: representative source versus outline, three repeats', async t => {
  const functions = Array.from({length:48}, (_, i) => [
    `export function transform${i}(records) {`,
    '  // Нормализация записей перед обработкой; deterministic fixture.',
    '  return records.filter(record => record.enabled).map(record => ({',
    '    id: record.id, label: String(record.label).trim(), value: Number(record.value)',
    '  })).sort((left, right) => left.id - right.id);',
    '}\n'
  ].join('\n'));
  const source = functions.join('\n');
  const f = await fixture(source);
  const symbols = functions.map((_, i) => symbol('transform' + i, i * 7, i * 7 + 5));
  f.vscode.commands.executeCommand = async () => symbols;
  const measurements = [];
  for (let repeat = 1; repeat <= 3; repeat++) {
    f.settings.semanticContext = false;
    const before = await collect(f.vscode, {document:f.document});
    f.settings.semanticContext = true;
    const after = await collect(f.vscode, {document:f.document});
    const outline = outlineBlock(after.text);
    const sourceBytes = Buffer.byteLength(source), outlineBytes = Buffer.byteLength(outline);
    assert.equal((outline.match(/Function L/g) || []).length, 48);
    assert.ok(outlineBytes > 0 && outlineBytes <= MAX_BYTES && outlineBytes < sourceBytes * 0.9);
    measurements.push({repeat, full_source_bytes:sourceBytes, bounded_outline_bytes:outlineBytes,
      collector_before_bytes:before.summary.bytes, collector_after_bytes:after.summary.bytes,
      symbol_count:48, reduction_percent:Number(((1 - outlineBytes / sourceBytes) * 100).toFixed(2))});
  }
  assert.ok(measurements.every(row => row.bounded_outline_bytes === measurements[0].bounded_outline_bytes));
  t.diagnostic('SEMANTIC_BYTE_BENCHMARK ' + JSON.stringify(measurements));
});

for (const dirty of [false, true]) test('enabled selection never expands the authorized excerpt; dirty=' + dirty, async () => {
  const selected = 'const chosen = 1;';
  const outside = 'UNSELECTED_PRIVATE_BODY_CANARY';
  const f = await fixture(selected + '\n' + outside);
  f.document.isDirty = dirty;
  f.document.selection = {start:{line:0}, end:{line:0}};
  const result = await collect(f.vscode, {document:f.document, selectionText:selected});
  assert.match(result.text, /active selection: src\/main.js \(lines 1-1\)/);
  assert.ok(result.text.includes(selected));
  assert.ok(!result.text.includes(outside));
  assert.equal(f.calls(), 0);
});

test('flag-off dirty selection retains the recorded legacy behavior', async () => {
  const f = await fixture('const chosen = 1;\nUNSELECTED_LEGACY_CANARY');
  f.settings.semanticContext = false;
  f.document.isDirty = true;
  f.document.selection = {start:{line:0}, end:{line:0}};
  const result = await collect(f.vscode, {document:f.document, selectionText:'const chosen = 1;'});
  assert.match(result.text, /UNSELECTED_LEGACY_CANARY/);
  assert.equal(f.calls(), 0);
});
