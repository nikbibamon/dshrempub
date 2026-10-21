'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { parseMentions, resolveMention, diagnosticContext, MAX_CAPTURE_BYTES } = require('../lib/context-captures');
const { prepareAttachment, questionWithAttachments } = require('../lib/attachments');

const base = process.env.TVijO_TEST_ARTIFACTS || process.env.TVIJO_TEST_ARTIFACTS;
const fixture = path.join(base, 'mention-fixture');

test('inline file mention parsing supports quoted spaces and skips non-file captures', () => {
  assert.deepEqual(parseMentions('Review @src/a.js and @"folder with spaces/b.ts" @problems @terminal').map(item => item.raw), ['src/a.js', 'folder with spaces/b.ts', 'problems', 'terminal']);
  assert.deepEqual(parseMentions('mail user@example.com, then check @src/a.js!').map(item => item.raw), ['src/a.js']);
});

test('workspace mentions resolve uniquely, reject secrets and outside paths, and report ambiguity', async () => {
  const root = path.join(fixture, 'workspace');
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.mkdir(path.join(root, 'other'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'unique.js'), 'export {}');
  await fs.writeFile(path.join(root, 'src', 'same.js'), 'one');
  await fs.writeFile(path.join(root, 'other', 'same.js'), 'two');
  await fs.mkdir(path.join(fixture, 'outside'), { recursive: true });
  await fs.writeFile(path.join(fixture, 'outside', 'outside.js'), 'outside');
  const resolved = await resolveMention('src/unique.js', [root]);
  assert.equal(resolved.relative, 'src/unique.js');
  await assert.rejects(resolveMention('../outside/outside.js', [root]));
  await assert.rejects(resolveMention('.env', [root]));
  assert.equal((await resolveMention('same.js', [root])).ambiguous, true);
  const alias = path.join(root, 'src', 'linked.js');
  try { await fs.symlink(path.join(root, 'src', 'unique.js'), alias); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  await assert.rejects(resolveMention('src/linked.js', [root]));
});

test('problems captures include only safe workspace Error and Warning rows and fit UTF-8 bound', async () => {
  const root = path.join(fixture, 'diagnostics-workspace');
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'a.ts'), 'const a = 1;');
  try { await fs.symlink(path.join(root, 'src'), path.join(root, 'linked-src')); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const uri = value => ({ scheme: 'file', fsPath: value });
  const text = diagnosticContext([
    { severity: 'Error', uri: uri(path.join(root, 'src', 'a.ts')), line: 7, message: 'ошибка' },
    { severity: 'Warning', uri: uri(path.join(root, 'a.js')), line: 1, message: 'warn' },
    { severity: 'Error', uri: uri(path.join(root, 'linked-src', 'a.ts')), line: 1, message: 'symlink-parent' },
    { severity: 'Information', uri: uri(path.join(root, 'a.js')), line: 1, message: 'ignore' },
    { severity: 'Error', uri: uri('/outside/a.js'), line: 1, message: 'outside' },
    { severity: 'Error', uri: uri(path.join(root, '.env')), line: 1, message: 'secret' }
  ], root);
  assert.match(text, /untrusted captured data/);
  assert.match(text, /src\\?\/a\.ts/);
  assert.ok(text.includes('warn'), 'an unsaved file under the real workspace may be represented');
  assert.ok(!text.includes('ignore') && !text.includes('outside') && !text.includes('secret') && !text.includes('symlink-parent'));
  assert.ok(Buffer.byteLength(text, 'utf8') <= MAX_CAPTURE_BYTES);
  const huge = diagnosticContext(Array.from({ length: 5000 }, (_, index) => ({ severity: 'Error', uri: uri(path.join(root, 'src', 'a.ts')), line: index + 1, message: 'x'.repeat(500) })), root);
  assert.ok(Buffer.byteLength(huge, 'utf8') <= MAX_CAPTURE_BYTES);
  assert.ok(!huge.includes('"line":5000'));
  const item = await prepareAttachment('workspace-problems.txt', Buffer.from(text));
  assert.ok(Buffer.byteLength(questionWithAttachments('Check these problems', [item]), 'utf8') <= 8 * 1024);
});
