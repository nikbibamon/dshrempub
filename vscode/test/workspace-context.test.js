'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { collect } = require('../lib/workspace-context');
const {createContextSelection} = require('../lib/context-selection');

test('local context selection excludes deselected paths, manifests and active files', async () => {
  const {vscode,document} = host();
  const result = await collect(vscode,{document,selectedPaths:['src']});
  assert.match(result.text,/src\/index.js/);
  assert.doesNotMatch(result.text,/Project README|package.json|AGENTS.md/);
  const empty = await collect(vscode,{document,selectedPaths:[]});
  assert.doesNotMatch(empty.text,/src|console.log|README/);
});

test('local multi-select preferences persist per folder and reject scope changes', async () => {
  const {vscode} = host();
  const values = new Map();
  const state = {get:key=>values.get(key),update:async(key,value)=>values.set(key,value)};
  let choices;
  vscode.window = {showQuickPick:async(items,options)=>{choices=items;assert.equal(options.canPickMany,true);return items.filter(item=>item.label==='src');}};
  const selector = createContextSelection({vscode,state});
  const folder = vscode.workspace.workspaceFolders[0];
  await selector.choose(folder);
  assert.deepEqual(selector.selected(folder),['src']);
  assert.ok(!choices.some(item=>item.label==='.env'||item.label==='node_modules'));
  assert.equal(selector.selected({uri:vscode.Uri.file('/other')}),null);
  let calls=0;
  await assert.rejects(selector.choose(folder,async()=>{if(++calls===3)throw Error('scope changed');}),/scope changed/);
  assert.deepEqual(selector.selected(folder),['src']);
});

test('selected oversized or unknown-size files are skipped before read',async()=>{
 const {vscode}=host();
 const read=[];
 vscode.workspace.fs.stat=async uri=>({type:1,...(uri.fsPath.endsWith('large.txt')?{size:1000000000}:{})});
 vscode.workspace.fs.readFile=async uri=>{read.push(uri.fsPath);throw Error('must not read');};
 const result=await collect(vscode,{selectedPaths:['large.txt','unknown.txt']});
 assert.deepEqual(read,[]);
 assert.equal(result.summary.skippedLarge,2);
});

test('selected credential JSON and known secrets never enter context',async()=>{
 const root=await fs.mkdtemp(path.join(process.env.TVIJO_TEST_ARTIFACTS || os.tmpdir(),'selected-sensitive-'));
 const {vscode}=host(root);
 const data={'config.json':'{"api_key":"DO_NOT_SEND_THIS_VALUE"}','notes.txt':'account supplied token: hidden-session-value','safe.txt':'safe project overview'};
 for(const [name,text] of Object.entries(data)) await fs.writeFile(path.join(root,name),text);
 vscode.workspace.fs.stat=async uri=>({type:1,size:Buffer.byteLength(data[path.basename(uri.fsPath)]||'')});
 vscode.workspace.fs.readFile=async uri=>Buffer.from(data[path.basename(uri.fsPath)]||'');
 const result=await collect(vscode,{selectedPaths:Object.keys(data),knownSecrets:['hidden-session-value']});
 assert.doesNotMatch(result.text,/DO_NOT_SEND_THIS_VALUE|hidden-session-value/);
 assert.match(result.text,/safe project overview/);
 assert.equal(result.summary.skippedSensitive,2);
});

test('selected local files use bounded no-follow reads despite stale provider metadata',async()=>{
 const root=await fs.mkdtemp(path.join(process.env.TVIJO_TEST_ARTIFACTS || os.tmpdir(),'selected-local-'));
 await fs.writeFile(path.join(root,'large.txt'),'x'.repeat(12001));
 await fs.writeFile(path.join(root,'safe.txt'),'LOCAL SAFE CONTENT');
 await fs.symlink(path.join(root,'safe.txt'),path.join(root,'linked.txt'));
 const {vscode}=host(root);
 // Provider metadata can be stale or miss a symlink; the descriptor decides.
 vscode.workspace.fs.stat=async()=>({type:1,size:1});
 vscode.workspace.fs.readFile=async()=>{throw Error('unbounded provider read must not run');};
 const result=await collect(vscode,{selectedPaths:['large.txt','safe.txt','linked.txt']});
 assert.equal(result.summary.skippedLarge,1);
 assert.match(result.text,/--- safe.txt ---\nLOCAL SAFE CONTENT/);
 assert.doesNotMatch(result.text,/--- linked.txt ---|xxx/);
});

test('custom selected content from non-file providers is skipped without an unbounded read',async()=>{
 const {vscode}=host();
 vscode.workspace.workspaceFolders[0].uri.scheme='remote';
 vscode.workspace.fs.stat=async()=>({type:1,size:5});
 let reads=0;
 vscode.workspace.fs.readFile=async()=>{reads++;return Buffer.from('data');};
 const result=await collect(vscode,{selectedPaths:['custom.txt']});
 assert.equal(reads,0);
 assert.equal(result.summary.skippedUnsupported,1);
 assert.doesNotMatch(result.text,/--- custom.txt ---/);
});

function host(root = '/repo') {
  const files = new Map([
    ['README.md', 'Project README\n'],
    ['AGENTS.md', 'Keep existing agent notes.\n'],
    ['package.json', '{"name":"demo"}\n'],
    ['.env', 'SECRET=do-not-send\n'],
    ['image.png', Buffer.from([0, 1, 2, 3])],
    ['src/index.js', 'console.log("hello")\n'],
    ['node_modules/pkg/index.js', 'module.exports = 1\n'],
    ['.git/config', '[core]\n']
  ]);
  const dirs = new Map([
    [root, [['.git', 2], ['.env', 1], ['AGENTS.md', 1], ['README.md', 1], ['image.png', 1], ['node_modules', 2], ['package.json', 1], ['src', 2]]],
    [path.join(root, 'src'), [['index.js', 1]]],
    [path.join(root, 'node_modules'), [['pkg', 2]]],
    [path.join(root, '.git'), [['config', 1]]]
  ]);
  const Uri = {
    joinPath: (base, ...parts) => ({ fsPath: path.join(base.fsPath, ...parts), path: path.join(base.fsPath, ...parts), scheme: base.scheme, authority: base.authority || '' }),
    file: value => ({ fsPath: value, path: value, scheme: 'file', authority: '' })
  };
  const vscode = {
    Uri,
    FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
    workspace: {
      isTrusted: true,
      workspaceFolders: [{ uri: Uri.file(root), name: 'repo' }],
      getWorkspaceFolder: uri => uri?.fsPath?.startsWith(root) ? { uri: Uri.file(root), name: 'repo' } : undefined,
      fs: {
        readDirectory: async uri => {
          const listing = dirs.get(uri.fsPath);
          if (!listing) throw new Error('not a directory: ' + uri.fsPath);
          return listing;
        },
        stat: async uri => {
          if (dirs.has(uri.fsPath)) return { type: 2 };
          if (files.has(path.relative(root, uri.fsPath))) return { type: 1 };
          throw new Error('not found: ' + uri.fsPath);
        },
        readFile: async uri => {
          const value = files.get(path.relative(root, uri.fsPath));
          if (value === undefined) throw new Error('not found: ' + uri.fsPath);
          return Buffer.isBuffer(value) ? value : Buffer.from(value);
        }
      }
    }
  };
  const document = {
    uri: Uri.file(path.join(root, 'src/index.js')),
    fileName: path.join(root, 'src/index.js'),
    languageId: 'javascript',
    isDirty: false,
    getText: () => 'console.log("hello")\n',
    selection: { start: { line: 0 }, end: { line: 0 } }
  };
  return { vscode, document };
}

test('project context includes a bounded tree, README and active file', async () => {
  const { vscode, document } = host();
  const value = await collect(vscode, { document, maxBytes: 48000 });
  assert.match(value.text, /\[WORKSPACE CONTEXT\]/);
  assert.match(value.text, /README\.md/);
  assert.match(value.text, /Project README/);
  assert.doesNotMatch(value.text, /--- AGENTS\.md ---\nKeep existing agent notes/);
  assert.match(value.text, /active file: src\/index\.js/);
  assert.match(value.text, /console\.log/);
  assert.equal(value.summary.root, 'repo');
  assert.ok(value.summary.files >= 3);
  assert.equal(value.summary.activePath, 'src/index.js');
});

test('project context excludes secrets, dot directories, dependencies and binaries', async () => {
  const { vscode, document } = host();
  const value = await collect(vscode, { document, maxBytes: 48000 });
  assert.doesNotMatch(value.text, /SECRET=do-not-send/);
  assert.doesNotMatch(value.text, /node_modules/);
  assert.doesNotMatch(value.text, /\.git\//);
  assert.doesNotMatch(value.text, /image\.png/);
});

test('project context obeys the byte limit and reports truncation', async () => {
  const { vscode, document } = host();
  const value = await collect(vscode, { document, maxBytes: 4096 });
  assert.ok(Buffer.byteLength(value.text, 'utf8') <= 4096);
  assert.equal(typeof value.summary.truncated, 'boolean');
});

test('no workspace folder yields an empty block', async () => {
  const { vscode } = host();
  vscode.workspace.workspaceFolders = [];
  const value = await collect(vscode, {});
  assert.equal(value.text, '');
  assert.equal(value.summary.files, 0);
});

test('scoped rules use active and explicit known paths; Off and Preview correspond', async () => {
  const base = process.env.TVIJO_FIT_TEST_TMP || path.join(os.tmpdir(), 'tvijo-worker-fit-rules');
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'context-'));
  await fs.mkdir(path.join(root, '.tvijo'));
  await fs.writeFile(path.join(root, '.tvijo', 'rules.md'), '<!-- tvijo-globs: ["src/**/*.js"] -->\nUse the project formatter.\n');
  const uri = { fsPath: root, path: root };
  const vscode = {
    Uri: { joinPath: (baseUri, ...parts) => ({ fsPath: path.join(baseUri.fsPath, ...parts), path: path.join(baseUri.fsPath, ...parts), scheme: baseUri.scheme, authority: baseUri.authority || '' }) },
    FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
    workspace: {
      workspaceFolders: [{ uri: { ...uri, scheme: 'file', authority: '' } }],
      isTrusted: true,
      getWorkspaceFolder: () => undefined,
      fs: {
        readDirectory: async directory => directory.fsPath === root ? [['.tvijo', 2]] : [],
        stat: async target => { const stat = await fs.stat(target.fsPath); return { type: stat.isDirectory() ? 2 : 1 }; },
        readFile: target => fs.readFile(target.fsPath)
      }
    }
  };
  const off = await collect(vscode, { maxBytes: 4096, contextMode: 'off', knownPaths: ['src/a.js'] });
  assert.equal(off.summary.rules.status, 'separate');
  assert.doesNotMatch(off.text, /Use the project formatter/);
  const unmatched = await collect(vscode, { maxBytes: 4096, knownPaths: ['README.md'] });
  assert.equal(unmatched.summary.rules.status, 'separate');
  const preview = await collect(vscode, { maxBytes: 4096, contextMode: 'preview', knownPaths: ['src/a.js'], allowRules: () => true });
  assert.equal(preview.summary.rules.status, 'separate');
  assert.doesNotMatch(preview.text, /applies to: src\/a\.js/);
  assert.doesNotMatch(preview.text, /Use the project formatter/);
});

test('rules are omitted whole when wrapper plus metadata cannot fit the aggregate limit', async () => {
  const base = process.env.TVIJO_FIT_TEST_TMP || path.join(os.tmpdir(), 'tvijo-worker-fit-rules');
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'context-limit-'));
  await fs.mkdir(path.join(root, '.tvijo'));
  await fs.writeFile(path.join(root, '.tvijo', 'rules.md'), 'x'.repeat(12000));
  const uri = { fsPath: root, path: root, scheme: 'file', authority: '' };
  const vscode = { Uri: { joinPath: (baseUri, ...parts) => ({ fsPath: path.join(baseUri.fsPath, ...parts), path: path.join(baseUri.fsPath, ...parts), scheme: baseUri.scheme, authority: baseUri.authority || '' }) }, FileType: { File: 1, Directory: 2 }, workspace: { isTrusted: true, workspaceFolders: [{ uri }], getWorkspaceFolder: () => undefined, fs: { readDirectory: async () => [], stat: async target => ({ type: (await fs.stat(target.fsPath)).isDirectory() ? 2 : 1 }), readFile: target => fs.readFile(target.fsPath) } } };
  const result = await collect(vscode, { maxBytes: 4096, allowRules: () => true });
  assert.equal(result.summary.rules.status, 'separate');
  assert.doesNotMatch(result.text, /PROJECT RULES|x{20}/);
  assert.ok(Buffer.byteLength(result.text, 'utf8') <= 4096);
});

test('rules default deny and fail closed in Restricted Mode and when approval throws', async () => {
  const root = await fs.mkdtemp(path.join(process.env.TVIJO_FIT_TEST_TMP || os.tmpdir(), 'context-gate-'));
  await fs.mkdir(path.join(root, '.tvijo'));
  await fs.writeFile(path.join(root, '.tvijo', 'rules.md'), 'RULES_CANARY: never send without approval\n');
  const uri = { fsPath: root, path: root, scheme: 'file', authority: '' };
  const vscode = {
    Uri: { joinPath: (baseUri, ...parts) => ({ fsPath: path.join(baseUri.fsPath, ...parts), path: path.join(baseUri.fsPath, ...parts), scheme: baseUri.scheme, authority: baseUri.authority || '' }) },
    FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
    workspace: {
      isTrusted: true,
      workspaceFolders: [{ uri }],
      getWorkspaceFolder: () => undefined,
      fs: { readDirectory: async () => [], stat: async target => ({ type: (await fs.stat(target.fsPath)).isDirectory() ? 2 : 1 }), readFile: target => fs.readFile(target.fsPath) }
    }
  };
  const denied = await collect(vscode, { maxBytes: 4096 });
  assert.equal(denied.summary.rules.status, 'separate');
  assert.doesNotMatch(denied.text, /RULES_CANARY/);
  const thrown = await collect(vscode, { maxBytes: 4096, allowRules: () => { throw new Error('no'); } });
  assert.equal(thrown.summary.rules.status, 'separate');
  vscode.workspace.isTrusted = false;
  const restricted = await collect(vscode, { maxBytes: 4096, allowRules: () => true });
  assert.equal(restricted.summary.rules.status, 'separate');
  vscode.workspace.isTrusted = undefined;
  const missingTrust = await collect(vscode, { maxBytes: 4096, allowRules: () => true });
  assert.equal(missingTrust.summary.rules.status, 'separate');
});

test('explicit listed folder wins over active folder and unlisted folder is refused', async () => {
  const { vscode, document } = host();
  const second = { uri: vscode.Uri.file('/second'), name: 'second' };
  vscode.workspace.workspaceFolders.push(second);
  const selected = await collect(vscode, { document, folder: second, maxBytes: 4096 });
  assert.equal(selected.summary.root, 'second');
  const unlisted = { uri: vscode.Uri.file('/outside'), name: 'outside' };
  await assert.rejects(collect(vscode, { document, folder: unlisted, maxBytes: 4096 }), /no longer available/);
});

test('rules file opened as an active document never enters ordinary project context', async () => {
  const { vscode, document } = host();
  document.uri = vscode.Uri.file('/repo/.tvijo/rules.md');
  document.getText = () => 'PRIVATE_PREVIEW_CANARY';
  const value = await collect(vscode, { document, selectionText: 'PRIVATE_SELECTION_CANARY', maxBytes: 48000 });
  assert.equal(value.summary.activePath, '.tvijo/rules.md');
  assert.doesNotMatch(value.text, /PRIVATE_(?:PREVIEW|SELECTION)_CANARY/);
});

test('non-file roots and local URIs with an authority cannot send rules', async () => {
  const { vscode } = host();
  vscode.workspace.workspaceFolders[0].uri = { fsPath: '/repo', path: '/repo', scheme: 'vscode-remote', authority: 'ssh-host' };
  const value = await collect(vscode, { maxBytes: 4096, allowRules: () => true });
  assert.equal(value.summary.rules.status, 'separate');
  vscode.workspace.workspaceFolders[0].uri = { fsPath: '/repo', path: '/repo', scheme: 'file', authority: 'server' };
  const remoteAuthority = await collect(vscode, { maxBytes: 4096, allowRules: () => true });
  assert.equal(remoteAuthority.summary.rules.status, 'separate');
});
