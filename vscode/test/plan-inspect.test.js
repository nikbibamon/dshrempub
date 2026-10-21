'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { inspect } = require('../lib/plan-inspect');

const MAX_FILE_BYTES = 128 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;

async function workspace(t) {
  const base = process.env.TMPDIR;
  assert.ok(base, 'TMPDIR must point into the owned artifact directory');
  const root = await fs.mkdtemp(path.join(base, 'plan-inspect-'));
  return root;
}

function document(root, relative, text, overrides = {}) {
  let current = text;
  let reads = 0;
  const uri = overrides.uri || { scheme: 'file', authority: '', fsPath: path.join(root, relative) };
  const doc = {
    uri,
    version: overrides.version === undefined ? 1 : overrides.version,
    isDirty: overrides.isDirty === undefined ? true : overrides.isDirty,
    lineCount: Math.max(1, current.split('\n').length),
    offsetAt(position) { return position.line >= this.lineCount ? current.length : current.length; },
    positionAt(offset) { return { line: 0, character: Math.min(offset, current.length) }; },
    getText() {
      reads++;
      if (typeof overrides.getText === 'function') return overrides.getText(reads, current);
      return current;
    },
  };
  return { doc, setText(value) { current = value; }, reads: () => reads };
}

function vscode(docs) {
  return { workspace: { textDocuments: docs } };
}

async function put(root, relative, content) {
  const filename = path.join(root, relative);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, content);
  return filename;
}

test('reports bounded dirty-buffer diff stats without returning source text', async (t) => {
  const root = await workspace(t);
  await put(root, 'src/safe.js', 'const secretBody = 1;\nkeep\n');
  const dirty = document(root, 'src/safe.js', 'const secretBody = 2;\nkeep\n');
  const result = await inspect({ vscode: vscode([dirty.doc]), root, operation: 'buffer_diff_stat' });
  assert.equal(result.files.length, 1);
  assert.deepEqual(result.files[0], {
    path: 'src/safe.js', version: 1, addedLines: 1, removedLines: 1,
    approximate: true, rawBytesChanged: true, diskMissing: false,
  });
  assert.equal(JSON.stringify(result).includes('secretBody'), false);
  assert.equal(result.scope, 'open dirty buffers');
});

test('excludes secret, hidden, symlink, outside, and untitled documents', async (t) => {
  const root = await workspace(t);
  const safeTarget = await put(root, 'src/target.js', 'ok\n');
  await put(root, '.env', 'credential');
  await put(root, '.hidden/file.js', 'hidden');
  const link = path.join(root, 'src/link.js');
  await fs.symlink(safeTarget, link);
  const outside = await fs.mkdtemp(path.join(process.env.TMPDIR, 'outside-'));
  await fs.writeFile(path.join(outside, 'external.js'), 'external');
  const docs = [
    document(root, '.env', 'credential').doc,
    document(root, '.hidden/file.js', 'hidden').doc,
    document(root, 'src/link.js', 'unsafe').doc,
    document(root, 'unused.js', 'outside', { uri: { scheme: 'file', authority: '', fsPath: path.join(outside, 'external.js') } }).doc,
    document(root, 'untitled', 'untitled', { uri: { scheme: 'untitled', authority: '', fsPath: '/untitled' } }).doc,
  ];
  const result = await inspect({ vscode: vscode(docs), root, operation: 'buffer_status' });
  assert.equal(result.files.length, 0);
  assert.equal(result.partial, true);
  assert.ok(result.skipped.every((item) => !('path' in item)));
});

test('counts a missing-disk dirty buffer as added lines', async (t) => {
  const root = await workspace(t);
  const fresh = document(root, 'src/new.js', 'one\ntwo\n');
  const result = await inspect({ vscode: vscode([fresh.doc]), root, operation: 'buffer_diff_stat' });
  assert.equal(result.files[0].diskMissing, true);
  assert.equal(result.files[0].addedLines, 2);
  assert.equal(result.files[0].removedLines, 0);
});

test('flags oversized and binary disk files as partial without reading their bodies', async (t) => {
  const root = await workspace(t);
  await put(root, 'large.js', Buffer.alloc(MAX_FILE_BYTES + 1, 120));
  await put(root, 'binary.js', Buffer.from([0x61, 0, 0x62]));
  const docs = [document(root, 'large.js', 'small').doc, document(root, 'binary.js', 'small').doc];
  const result = await inspect({ vscode: vscode(docs), root, operation: 'buffer_diff_stat' });
  assert.equal(result.files.length, 0);
  assert.deepEqual(new Set(result.skipped.map((item) => item.reason)), new Set(['oversized_disk', 'binary_disk']));
});

test('enforces the aggregate input byte cap', async (t) => {
  const root = await workspace(t);
  const text = 'x'.repeat(MAX_FILE_BYTES);
  const docs = [];
  for (let i = 0; i < Math.floor(MAX_TOTAL_BYTES / MAX_FILE_BYTES) + 1; i++) {
    const relative = `src/file-${i}.js`;
    await put(root, relative, text);
    docs.push(document(root, relative, text).doc);
  }
  const result = await inspect({ vscode: vscode(docs), root, operation: 'buffer_diff_stat' });
  assert.equal(result.files.length, MAX_TOTAL_BYTES / (MAX_FILE_BYTES * 2));
  assert.ok(result.skipped.some((item) => item.reason === 'total_byte_limit'));
  assert.equal(Buffer.byteLength(JSON.stringify(result), 'utf8') <= 7680, true);
});

test('discards a buffer that changes during inspection', async (t) => {
  const root = await workspace(t);
  await put(root, 'src/stale.js', 'old\n');
  let calls = 0;
  const stale = document(root, 'src/stale.js', 'new\n', { getText: () => (++calls === 1 ? 'new\n' : 'changed\n') });
  const result = await inspect({ vscode: vscode([stale.doc]), root, operation: 'buffer_diff_stat' });
  assert.equal(result.files.length, 0);
  assert.ok(result.skipped.some((item) => item.reason === 'stale_buffer'));
});

test('honors abort before reading buffers and pwd never reads file contents', async (t) => {
  const root = await workspace(t);
  let calls = 0;
  const doc = document(root, 'src/file.js', 'body', { getText: () => { calls++; throw new Error('must not read'); } });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(inspect({ vscode: vscode([doc.doc]), root, operation: 'buffer_status', signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
  const pwd = await inspect({ vscode: vscode([doc.doc]), root: '/not-read', operation: 'pwd' });
  assert.deepEqual(pwd, { operation: 'pwd', scope: 'selected workspace', path: '.' });
  assert.equal(calls, 0);
});

test('buffer status reads metadata only, including for large dirty buffers', async (t) => {
  const root = await workspace(t);
  const dirty = document(root, 'new.js', 'not read', { getText() { throw new Error('status must not read source'); } });
  const result = await inspect({ vscode: vscode([dirty.doc]), root, operation: 'buffer_status' });
  assert.deepEqual(result.files, [{ path: 'new.js', version: 1, dirty: true }]);
  assert.equal(dirty.reads(), 0);
});


test('diff inspection passes a real host Position to offsetAt', async t => {
  const root = await workspace(t); await put(root,'typed.js','old\n');
  const dirty = document(root,'typed.js','new\n'); class Position { constructor(line,character){this.line=line;this.character=character;} }
  dirty.doc.offsetAt = position => { assert.ok(position instanceof Position); return 4; };
  const result=await inspect({vscode:{...vscode([dirty.doc]),Position},root,operation:'buffer_diff_stat'});
  assert.equal(result.files[0].addedLines,1); assert.equal(result.files[0].removedLines,1);
});
