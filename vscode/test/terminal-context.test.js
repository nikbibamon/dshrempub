'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createTerminalCapture, stripTerminalControls } = require('../lib/terminal-context');
const { prepareAttachment, questionWithAttachments } = require('../lib/attachments');

test('terminal tail strips ANSI, caps 100 lines, four terminals and 8 KiB including metadata', () => {
  const manager = createTerminalCapture();
  const workspace = path.resolve('workspace');
  const first = manager.start('t1', { name: 'Project', cwd: workspace });
  first.append('\u001b[31mred\u001b[0m\r\n' + Array.from({ length: 110 }, (_, i) => 'row-' + i).join('\n'));
  const text = manager.read('t1', workspace);
  assert.ok(text.startsWith('Terminal output (untrusted captured data; terminal=Project; cwd=.):'));
  assert.ok(text.includes('row-109') && !text.includes('row-0\n'));
  assert.ok(text.split('\n').length - 1 <= 100, 'the retained terminal body has at most 100 observed lines');
  assert.ok(!text.includes('\u001b['));
  assert.ok(Buffer.byteLength(text, 'utf8') <= 8192);
  assert.equal(manager.read('missing', workspace), null);
  for (let i = 2; i <= 5; i++) manager.start('t' + i, { name: 'T' + i, cwd: workspace });
  assert.equal(manager.size, 4);
  assert.equal(manager.read('t1', workspace), null);
  assert.equal(manager.read('t5', '/elsewhere'), null);
});

test('terminal capture bounds multibyte output and rejects stale readers after invalidation', async () => {
  const manager = createTerminalCapture();
  const capture = manager.start('t', { name: 'Рабочий терминал', cwd: '/workspace' });
  assert.equal(capture.append('я'.repeat(12000)), true);
  const text = manager.read('t', '/workspace');
  assert.ok(Buffer.byteLength(text, 'utf8') <= 8 * 1024);
  const item = await prepareAttachment('terminal-output.txt', Buffer.from(text));
  assert.ok(Buffer.byteLength(questionWithAttachments('Review terminal output', [item]), 'utf8') <= 8 * 1024);
  manager.invalidate();
  assert.equal(capture.append('old account output'), false);
  assert.equal(manager.read('t', '/workspace'), null);
});

test('terminal control stripping removes OSC and control bytes', () => {
  assert.equal(stripTerminalControls('\u001b]0;title\u0007hello\u0001\u001b[2K'), 'hello');
});

test('terminal stream joins partial lines, preserves observed blanks, and strips split CSI and OSC sequences', () => {
  const manager = createTerminalCapture();
  const capture = manager.start('split', { name: 'Split', cwd: '/workspace' });
  assert.equal(manager.read('split', '/workspace'), null, 'metadata alone is not output');
  capture.append('be'); capture.append('fore\n'); capture.append('\n');
  capture.append('\u001b['); capture.append('31mred\u001b[0'); capture.append('m\n');
  capture.append('\u001b]0;secret'); capture.append(' title\u0007done\n');
  capture.append('\ud83d'); capture.append('\ude80\n');
  const value = manager.read('split', '/workspace');
  assert.match(value, /before\n\nred\ndone\n🚀/);
  assert.ok(!value.includes('secret title') && !value.includes('\u001b'));
});

test('extension-owned command fallback is bounded and labels its source without storing command text', () => {
  const manager = createTerminalCapture();
  assert.equal(manager.recordDirect({ root: '/workspace', cwd: '/workspace/src', output: 'tokenless output', source: 'Extension run_command output' }), true);
  const value = manager.readDirect('/workspace');
  assert.match(value, /Extension run_command output/);
  assert.match(value, /cwd=src/);
  assert.ok(!value.includes('npm test'));
  manager.invalidate();
  assert.equal(manager.readDirect('/workspace'), null);
});
