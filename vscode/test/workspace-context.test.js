'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { collect } = require('../lib/workspace-context');

function host() {
  const root = '/repo';
  const files = new Map([
    ['README.md', 'Project README\n'],
    ['package.json', '{"name":"demo"}\n'],
    ['.env', 'SECRET=do-not-send\n'],
    ['image.png', Buffer.from([0, 1, 2, 3])],
    ['src/index.js', 'console.log("hello")\n'],
    ['node_modules/pkg/index.js', 'module.exports = 1\n'],
    ['.git/config', '[core]\n']
  ]);
  const dirs = new Map([
    [root, [['.git', 2], ['.env', 1], ['README.md', 1], ['image.png', 1], ['node_modules', 2], ['package.json', 1], ['src', 2]]],
    [path.join(root, 'src'), [['index.js', 1]]],
    [path.join(root, 'node_modules'), [['pkg', 2]]],
    [path.join(root, '.git'), [['config', 1]]]
  ]);
  const Uri = {
    joinPath: (base, ...parts) => ({ fsPath: path.join(base.fsPath, ...parts), path: path.join(base.fsPath, ...parts) }),
    file: value => ({ fsPath: value, path: value })
  };
  const vscode = {
    Uri,
    FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
    workspace: {
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
