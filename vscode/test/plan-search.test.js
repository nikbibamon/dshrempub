'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { search } = require('../lib/plan-search');

async function fixture(fn) {
  const root = await fs.mkdtemp(path.join(process.env.TMPDIR || os.tmpdir(), 'plan-search-'));
  const outside = await fs.mkdtemp(path.join(process.env.TMPDIR || os.tmpdir(), 'plan-search-outside-'));
  const safePath = (workspace, relative) => {
    const target = path.resolve(workspace, relative);
    const rel = path.relative(workspace, target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('scope denied');
    return target;
  };
  await fn({ root, outside, safePath });
}

test('search treats metacharacters as literal text', async () => fixture(async ({ root, safePath }) => {
  await fs.writeFile(path.join(root, 'notes.txt'), 'star * and bracket [ match\nother\n');
  const result = await search({ root, query: '[', safePath });
  assert.equal(result.mode, 'literal');
  assert.deepEqual(result.matches.map((row) => [row.path, row.line]), [['notes.txt', 1]]);
  assert.match(result.matches[0].text, /bracket \[/);
}));

test('search excludes hidden, secret, symlink, and outside content', async () => fixture(async ({ root, outside, safePath }) => {
  await fs.writeFile(path.join(root, 'visible.txt'), 'allowed needle\n');
  await fs.mkdir(path.join(root, '.private'));
  await fs.writeFile(path.join(root, '.private', 'hidden.txt'), 'needle hidden\n');
  await fs.writeFile(path.join(root, '.env'), 'needle secret\n');
  await fs.writeFile(path.join(outside, 'outside.txt'), 'needle outside\n');
  await fs.symlink(path.join(outside, 'outside.txt'), path.join(root, 'linked.txt'));
  const result = await search({ root, query: 'needle', safePath });
  assert.deepEqual(result.matches.map((row) => row.path), ['visible.txt']);
  assert.equal(result.partial, true);
  await assert.rejects(search({ root, relative: '../outside.txt', query: 'needle', safePath }), /scope denied/);
}));

test('snippets are UTF-8 bounded without splitting Unicode characters', async () => fixture(async ({ root, safePath }) => {
  const line = `${'🙂'.repeat(180)}target${'漢'.repeat(180)}`;
  await fs.writeFile(path.join(root, 'unicode.txt'), line);
  const result = await search({ root, query: 'target', safePath });
  const text = result.matches[0].text;
  assert.ok(Buffer.byteLength(text, 'utf8') <= 300);
  assert.equal(Buffer.from(text, 'utf8').toString('utf8'), text);
  assert.match(text, /target/);
}));

test('oversized files and entry/result budgets are reported as partial', async () => fixture(async ({ root, safePath }) => {
  await fs.writeFile(path.join(root, 'large.txt'), `${'needle\n'.repeat(22000)}`);
  await fs.writeFile(path.join(root, 'a.txt'), 'needle one\nneedle two\n');
  const limited = await search({ root, query: 'needle', max: 1, safePath });
  assert.equal(limited.matches.length, 1);
  assert.equal(limited.truncated, true);

  const capped = await search({ root, query: 'needle', max: 50, safePath });
  assert.ok(Buffer.byteLength(JSON.stringify(capped), 'utf8') <= 7680);
  assert.equal(capped.partial, true);
  assert.ok(capped.skipped.oversized >= 1);
}));

test('cancellation and scope guard stop before further file reads', async () => fixture(async ({ root, safePath }) => {
  await fs.writeFile(path.join(root, 'one.txt'), 'needle\n');
  const controller = new AbortController();
  controller.abort();
  const cancelled = await search({ root, query: 'needle', safePath, signal: controller.signal });
  assert.equal(cancelled.cancelled, true);
  assert.deepEqual(cancelled.matches, []);

  await assert.rejects(search({ root, query: 'needle', safePath, guard: async () => { throw new Error('scope changed'); } }), /scope changed/);
}));


test('guard failures during file IO propagate without returning stale results', async () => fixture(async ({ root, safePath }) => {
  await fs.writeFile(path.join(root, 'one.txt'), 'needle');
  let calls = 0; const denied = new Error('authority revoked with an arbitrary message');
  await assert.rejects(search({ root, query: 'needle', safePath, guard: async () => { if (++calls === 7) throw denied; } }), error => error === denied);
}));

test('a match at the end of a long Unicode line remains bounded and responsive', async () => fixture(async ({ root, safePath }) => {
  await fs.writeFile(path.join(root, 'long.txt'), '漢'.repeat(40000) + 'target');
  const result = await search({ root, query: 'target', safePath });
  assert.match(result.matches[0].text, /target/);
  assert.ok(Buffer.byteLength(result.matches[0].text, 'utf8') <= 300);
}));
