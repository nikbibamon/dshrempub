'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createInbox, MAX_FILE_BYTES } = require('../lib/inbox');
const { sidebar } = require('./helpers/sidebar');

const tmp = () => fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'tvijo-bridge22-'));
function windowAt(root, options = {}) {
  const got = [];
  const inbox = createInbox({ dir: path.join(root, 'inbox'), outbox: path.join(root, 'outbox'),
    deliver: message => { got.push(message); return true; }, isAlive: () => true, ...options });
  inbox.ensure();
  return { inbox, got };
}

test('0.10.22 a claim another window has just made is not taken over before its status exists', () => {
  const root = tmp();
  const early = windowAt(root, { pid: 11 });
  fs.writeFileSync(path.join(root, 'inbox', '.claimed', 'a.json'), JSON.stringify({ id: 'a', text: 'task' }));
  const other = windowAt(root, { pid: 22 });
  other.inbox.recover();
  assert.deepEqual(other.got, [], 'window B must not hand over a claim window A is still recording');
  const later = windowAt(root, { pid: 22, now: () => Date.now() + 11000 });
  later.inbox.recover();
  assert.deepEqual(later.got.map(item => item.id), ['a'], 'an abandoned claim is recovered after the grace period');
  assert.equal(early.got.length, 0);
});

test('0.10.22 a file the bridge refuses gets a failed status with the reason, not silence', () => {
  const root = tmp();
  const { inbox } = windowAt(root, { pid: 11 });
  fs.writeFileSync(path.join(root, 'inbox', 'big-1.json'), JSON.stringify({ id: 'big-1', text: 'я'.repeat(17000) }));
  fs.writeFileSync(path.join(root, 'inbox', 'bad-1.json'), 'not json');
  inbox.poll();
  assert.ok(Buffer.byteLength(JSON.stringify({ text: 'я'.repeat(17000) })) > MAX_FILE_BYTES);
  assert.equal(inbox.status('big-1').state, 'failed');
  assert.equal(inbox.status('big-1').error, 'file_too_large');
  assert.equal(inbox.status('bad-1').error, 'invalid_json');
  assert.deepEqual(fs.readdirSync(path.join(root, 'inbox')).filter(name => name.endsWith('.json')), []);
});

test('0.10.22 a hand-over the chat view never confirmed is repeated, a confirmed one is not', () => {
  const root = tmp();
  let clock = 1000000;
  const { inbox, got } = windowAt(root, { pid: 11, now: () => clock });
  fs.writeFileSync(path.join(root, 'inbox', 'a.json'), JSON.stringify({ id: 'a', text: 'one' }));
  fs.writeFileSync(path.join(root, 'inbox', 'b.json'), JSON.stringify({ id: 'b', text: 'two' }));
  inbox.poll();
  assert.deepEqual(got.map(item => item.id), ['a', 'b']);
  inbox.ack('a');
  inbox.recover();
  assert.equal(got.length, 2, 'inside the confirmation window nothing is repeated');
  clock += 9000;
  inbox.recover();
  assert.deepEqual(got.map(item => item.id), ['a', 'b', 'b'], 'only the unconfirmed message is handed over again');
});

test('0.10.22 an answer longer than the limit is cut and says so', () => {
  const root = tmp();
  const { inbox } = windowAt(root, { pid: 11 });
  inbox.mark('t', 'running');
  inbox.finish('t', 'completed', { answer: 'x'.repeat(25000) });
  const status = inbox.status('t');
  assert.equal(status.answer.length, 20000);
  assert.equal(status.answer_truncated, true);
  assert.equal(status.answer_chars, 25000);
});

test('0.10.22 the first state of a loaded view keeps messages that arrived before it and acknowledges them', () => {
  const view = sidebar({}, { scopeKey: null });
  view.emit('window:message', { data: { type: 'inbox', id: 'a', text: 'task', from: 'Codex' } });
  assert.deepEqual(view.outgoing.filter(item => item.type === 'inboxAck').map(item => item.id), ['a']);
  view.emit('window:message', { data: { type: 'state', scopeKey: 'tenant-a', busy: false, messages: [] } });
  assert.deepEqual(view.outgoing.filter(item => item.type === 'bridgeCancel'), []);
  const asks = view.outgoing.filter(item => item.type === 'ask');
  assert.equal(asks.length, 1);
  assert.equal(asks[0].bridgeId, 'a');
});

test('0.10.22 leaving a real scope still cancels what waited for it', () => {
  const view = sidebar({}, { busy: true });
  view.emit('window:message', { data: { type: 'inbox', id: 'a', text: 'task' } });
  view.emit('window:message', { data: { type: 'state', scopeKey: 'tenant-b', busy: false, messages: [] } });
  const cancel = view.outgoing.filter(item => item.type === 'bridgeCancel');
  assert.equal(cancel.length, 1);
  assert.equal(cancel[0].reason, 'scope');
});
