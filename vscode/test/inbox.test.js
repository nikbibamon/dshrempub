'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createInbox, parseMessage } = require('../lib/inbox');

const tmp = () => fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'tvijo-inbox-'));
function box(root, options = {}) {
  const got = [];
  const inbox = createInbox({ dir: path.join(root, 'inbox'), outbox: path.join(root, 'outbox'),
    deliver: message => { got.push(message); return options.open !== false; }, ...options });
  inbox.ensure();
  return { inbox, got, drop: (name, value) => fs.writeFileSync(path.join(root, 'inbox', name), JSON.stringify(value)) };
}

test('inbox parses a bounded message, keeps a safe id and defaults to agent mode', () => {
  assert.deepEqual(parseMessage('{"text":" hi ","from":"Claude Code","id":"abc-1"}'), { id: 'abc-1', text: 'hi', mode: 'agent', from: 'Claude Code' });
  assert.equal(parseMessage('{"text":"a","id":"../x"}').id, null);
  assert.equal(parseMessage('{"text":"   "}'), null);
  assert.equal(parseMessage('not json'), null);
  assert.equal(parseMessage(JSON.stringify({ text: 'x'.repeat(20001) })), null);
  assert.equal(parseMessage('{"text":"a","mode":"shell","from":"<b>"}').mode, 'agent');
});

test('claimed messages move out of the inbox, get an accepted status and are handed over in order', () => {
  const root = tmp();
  const { inbox, got, drop } = box(root);
  drop('2.json', { text: 'second', id: 'b' });
  drop('1.json', { text: 'first', mode: 'plan', id: 'a' });
  inbox.poll();
  assert.deepEqual(got.map(item => [item.id, item.text, item.mode]), [['a', 'first', 'plan'], ['b', 'second', 'agent']]);
  assert.deepEqual(fs.readdirSync(path.join(root, 'inbox')).filter(n => n.endsWith('.json')), []);
  assert.equal(inbox.status('a').state, 'accepted');
  assert.deepEqual(fs.readdirSync(path.join(root, 'inbox', '.claimed')).sort(), ['a.json', 'b.json']);
});

test('a status follows running to completed with the answer, and the claim is released', () => {
  const root = tmp();
  const { inbox, drop } = box(root);
  drop('m.json', { text: 'q', id: 'm1' });
  inbox.poll();
  const seen = [];
  const waiting = inbox.wait('m1', { onStatus: value => seen.push(value.state) });
  inbox.mark('m1', 'running');
  inbox.finish('m1', 'completed', { answer: 'done' });
  return waiting.then(result => {
    assert.equal(result.answer, 'done');
    assert.deepEqual(seen, ['accepted', 'running', 'completed']);
    assert.deepEqual(fs.readdirSync(path.join(root, 'inbox', '.claimed')), []);
  });
});

test('after a reload, a never-started message is handed over again and a dead run is failed, not re-run', () => {
  const root = tmp();
  const first = box(root, { pid: 111 });
  first.drop('a.json', { text: 'waiting', id: 'a' });
  first.drop('b.json', { text: 'was running', id: 'b' });
  first.inbox.poll();
  first.inbox.mark('b', 'running');
  const second = box(root, { pid: 222, isAlive: pid => pid === 222 });
  second.inbox.recover();
  assert.deepEqual(second.got.map(item => item.id), ['a']);
  assert.equal(second.inbox.status('b').state, 'failed');
  assert.equal(second.inbox.status('b').error, 'interrupted_by_reload');
  second.inbox.recover();
  assert.equal(second.got.length, 1, 'one hand-over per view until reset');
  second.inbox.reset(); second.inbox.recover();
  assert.equal(second.got.length, 2, 'a recreated view gets it again');
});

test('another live window keeps its claims and running tasks', () => {
  const root = tmp();
  const first = box(root, { pid: 111 });
  first.drop('a.json', { text: 'mine', id: 'a' });
  first.drop('b.json', { text: 'running', id: 'b' });
  first.inbox.poll(); first.inbox.mark('b', 'running');
  const second = box(root, { pid: 222, isAlive: () => true });
  second.inbox.recover();
  assert.deepEqual(second.got, []);
  assert.equal(second.inbox.status('b').state, 'running');
});

test('a closed view leaves the claim on disk for the next recovery', () => {
  const root = tmp();
  const closed = box(root, { open: false });
  closed.drop('a.json', { text: 'later', id: 'a' });
  closed.inbox.poll();
  assert.equal(closed.inbox.status('a').state, 'accepted');
  const opened = box(root);
  opened.inbox.recover();
  assert.deepEqual(opened.got.map(item => item.text), ['later']);
});

test('in-process enqueue uses the same durable queue and wait detaches on cancellation', async () => {
  const root = tmp();
  const { inbox, got } = box(root);
  const id = inbox.enqueue({ text: 'from copilot', from: 'Copilot' });
  assert.equal(got[0].id, id);
  assert.equal(inbox.status(id).state, 'accepted');
  let cancel;
  const result = inbox.wait(id, { cancellation: { onCancellationRequested: fn => { cancel = fn; } } });
  cancel();
  assert.equal((await result).state, 'detached');
});

test('duplicates, foreign files, oversized files and symlinks are dropped without delivery', () => {
  const root = tmp();
  const { inbox, got, drop } = box(root);
  drop('a.json', { text: 'once', id: 'dup' });
  inbox.poll();
  drop('b.json', { text: 'again', id: 'dup' });
  inbox.poll();
  assert.equal(got.length, 1);
  const other = box(root, { uid: fs.statSync(path.join(root, 'inbox')).uid + 1 });
  other.drop('c.json', { text: 'foreign' });
  other.drop('d.json', { text: 'y', pad: 'z'.repeat(40000) });
  fs.symlinkSync(path.join(root, 'inbox', 'c.json'), path.join(root, 'inbox', 'e.json'));
  other.inbox.poll();
  assert.deepEqual(other.got, []);
  assert.deepEqual(fs.readdirSync(path.join(root, 'inbox')).filter(n => n.endsWith('.json')), []);
});

test('outbox entries older than seven days are pruned', () => {
  const root = tmp();
  let clock = Date.now();
  const { inbox } = box(root, { now: () => clock });
  inbox.mark('old', 'completed');
  clock += 8 * 24 * 60 * 60 * 1000;
  inbox.prune();
  assert.equal(inbox.status('old'), null);
});
