'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createInbox } = require('../lib/inbox');
const { createBridgeDelivery } = require('../lib/bridge-diagnostics');
const { createClient } = require('../lib/client');
const { sidebar } = require('./helpers/sidebar');
const settle = () => new Promise(resolve => setImmediate(resolve));

function host(options = {}) {
  const root = options.root || fs.mkdtempSync(path.join(process.env.TVIJO_TEST_ARTIFACTS || os.tmpdir(), 'bridge-recovery-'));
  let view = options.view || null;
  let focused = 0;
  let reads = 0;
  let queue;
  const delivery = createBridgeDelivery({
    inbox: () => queue, view: () => view, enabled: () => true, runtimeVersion: () => '0.10.26',
    health: signal => { reads++; return options.health ? options.health(signal) : Promise.resolve({ status: 'ok', service: 'dshrem' }); },
    focus: async () => { focused++; if (options.focus) await options.focus(); }, timeoutMs: 100
  });
  queue = createInbox({ dir: path.join(root, 'inbox'), outbox: path.join(root, 'outbox'), deliver: delivery.deliver, pid: options.pid || 11, isAlive: () => false });
  queue.ensure();
  return { root, queue, delivery, focusCount: () => focused, reads: () => reads, setView: value => { view = value; },
    send(id, text) { fs.writeFileSync(path.join(root, 'inbox', id + '.json'), JSON.stringify({ id, text, mode: 'agent', from: 'Codex' })); queue.poll(); }
  };
}

test('real durable inbox status survives replay and preserves unrelated pending bytes', async () => {
  const h = host();
  const pending = path.join(h.root, 'retained-pending.json');
  fs.writeFileSync(pending, '{"taskId":"uncertain","held":1000000}');
  const original = fs.readFileSync(pending);
  h.send('status1', '/status'); await settle();
  const receipt = fs.readFileSync(path.join(h.root, 'outbox', 'status1.json'));
  h.send('status1', '/status'); h.queue.recover(); await settle();
  assert.equal(h.reads(), 1); assert.equal(h.focusCount(), 0);
  assert.equal(h.queue.status('status1').state, 'completed');
  assert.deepEqual(fs.readFileSync(path.join(h.root, 'outbox', 'status1.json')), receipt);
  assert.deepEqual(fs.readFileSync(pending), original);
  h.delivery.dispose();
});

test('status HTTP transport performs one unauthenticated GET and no task requests', async t => {
  const requests = [];
  const server = http.createServer((req, res) => { requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization }); res.setHeader('content-type', 'application/json'); res.end('{"status":"ok","service":"dshrem","secret":"never-output"}'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const client = createClient({ base: `http://127.0.0.1:${server.address().port}/api/dshrem/v1` });
  const h = host({ health: signal => client.request('/health', { signal, timeoutMs: 100 }) });
  h.send('network', '/status');
  for (let i = 0; i < 50 && h.queue.status('network').state !== 'completed'; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(requests, [{ method: 'GET', url: '/api/dshrem/v1/health', authorization: undefined }]);
  assert.equal(JSON.parse(h.queue.status('network').answer).health.status, 'ok');
  assert.ok(!h.queue.status('network').answer.includes('never-output'));
  h.delivery.dispose();
});

test('HTTP200 degraded or wrong-service health remains unavailable with no auth or model calls', async t => {
  const requests = [];
  const responses = [{ status: 'degraded', service: 'dshrem' }, { status: 'ok', service: 'other' }, {}];
  const server = http.createServer((req, res) => { requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization }); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(responses[requests.length - 1])); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const client = createClient({ base: `http://127.0.0.1:${server.address().port}/api/dshrem/v1` });
  const h = host({ health: signal => client.request('/health', { signal, timeoutMs: 100 }) });
  for (let i = 0; i < responses.length; i++) {
    const id = 'bad-health' + i;
    h.send(id, '/status');
    for (let tick = 0; tick < 50 && h.queue.status(id).state !== 'completed'; tick++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(JSON.parse(h.queue.status(id).answer).health, { status: 'unavailable', reason: 'invalid_response' });
  }
  assert.deepEqual(requests, responses.map(() => ({ method: 'GET', url: '/api/dshrem/v1/health', authorization: undefined })));
  h.delivery.dispose();
});

test('ordinary message requests focus once across polls and reload, then reaches view once', async () => {
  const first = host({ focus: () => Promise.reject(Error('view unavailable')) });
  first.send('normal', 'ordinary task'); await settle();
  for (let i = 0; i < 5; i++) first.queue.recover();
  assert.equal(first.focusCount(), 1);
  assert.equal(first.queue.status('normal').state, 'accepted');
  first.delivery.dispose();
  const next = host({ root: first.root, pid: 22 });
  next.queue.recover(); await settle(); assert.equal(next.focusCount(), 0);
  const messages = [];
  next.setView({ show() {}, webview: { postMessage: message => { messages.push(message); return Promise.resolve(true); } } });
  next.queue.recover(); next.queue.recover(); await settle();
  assert.equal(messages.length, 1); assert.equal(messages[0].id, 'normal');
  assert.equal(next.queue.status('normal').state, 'accepted');
  assert.equal(next.reads(), 0); next.delivery.dispose();
});

test('disposed webview post is re-delivered after a real view returns', async () => {
  const h = host({ view: { webview: { postMessage: () => Promise.resolve(false) } } });
  h.send('normal', 'ordinary task'); await settle();
  const received = [];
  h.setView({ webview: { postMessage: message => { received.push(message); return Promise.resolve(true); } } });
  h.queue.recover(); await settle(); assert.equal(received.length, 1); h.delivery.dispose();
});

test('interrupted running diagnostic becomes failed after reload and is never repeated', async () => {
  const first = host({ health: () => new Promise(() => {}) });
  first.send('interrupted', '/status'); await settle(); first.delivery.dispose();
  const next = host({ root: first.root, pid: 22 });
  next.queue.recover(); await settle();
  assert.equal(next.queue.status('interrupted').state, 'failed');
  assert.equal(next.queue.status('interrupted').error, 'interrupted_by_reload');
  assert.equal(next.reads(), 0); next.delivery.dispose();
});

test('completed health with unwritable outbox becomes an explained failure after reload without another read', async () => {
  const first = host();
  const pending = path.join(first.root, 'retained-pending.json');
  fs.writeFileSync(pending, '{"taskId":"uncertain","held":1000000}');
  const original = fs.readFileSync(pending);
  first.queue.finish = () => { throw Error('simulated outbox write failure'); };
  first.send('unwritten', '/status'); await settle();
  assert.equal(first.reads(), 1);
  assert.equal(first.queue.status('unwritten').state, 'running');
  first.delivery.dispose();
  const next = host({ root: first.root, pid: 22 });
  next.queue.recover(); next.delivery.flush(); await settle();
  assert.equal(next.queue.status('unwritten').state, 'failed');
  assert.equal(next.queue.status('unwritten').error, 'interrupted_by_reload');
  assert.equal(next.reads(), 0);
  assert.deepEqual(fs.readFileSync(pending), original);
  next.delivery.dispose();
});

test('ordinary messages retain actual sidebar pending gate while status completes headlessly', async () => {
  const ui = sidebar({}, { pending: { taskId: 'uncertain', costKnown: false }, busy: false });
  const h = host({ view: { webview: { postMessage: message => { ui.emit('window:message', { data: message }); return Promise.resolve(true); } } } });
  h.send('normal', 'ordinary task'); h.send('status', '/status'); await settle();
  assert.deepEqual(ui.outgoing.filter(item => item.type === 'ask'), []);
  assert.equal(h.queue.status('normal').state, 'accepted');
  assert.equal(h.queue.status('status').state, 'completed');
  h.delivery.dispose();
});

test('only exact parsed status command is diagnostic; arguments and lookalikes remain normal', async () => {
  const messages = [];
  const h = host({ view: { webview: { postMessage: message => { messages.push(message); return Promise.resolve(true); } } } });
  for (const [i, text] of ['/status extra', '/STATUS', '/status\n!command', 'please /status'].entries()) h.send('normal' + i, text);
  h.send('trimmed', '  /status\n'); await settle();
  assert.equal(messages.length, 4); assert.equal(h.reads(), 1);
  assert.equal(h.queue.status('trimmed').state, 'completed'); h.delivery.dispose();
});
