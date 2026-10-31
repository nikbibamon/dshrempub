'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBridgeDelivery } = require('../lib/bridge-diagnostics');

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(options = {}) {
  let state = { state: 'accepted' };
  const result = [];
  const calls = [];
  const queue = {
    status: () => state,
    mark: (id, next) => { calls.push(['mark', next]); if (options.failStart) throw Error('disk'); state = { state: next }; },
    finish: (id, next, value) => { if (options.failFinish) throw Error('disk'); state = { state: next }; result.push(value); },
    unhand: () => {}
  };
  const pending = Buffer.from('{"taskId":"retained-task","costKnown":false,"held":1000000}');
  const original = Buffer.from(pending);
  const delivery = createBridgeDelivery({
    inbox: () => queue, view: () => options.view || null, enabled: () => options.enabled !== false,
    runtimeVersion: () => options.version || '0.10.26',
    health: signal => { calls.push(['health']); return options.health ? options.health(signal) : Promise.resolve({ status: 'ok', service: 'dshrem', secret: 'must-not-leak', tasks: ['private'] }); },
    focus: () => { calls.push(['focus']); }, timeoutMs: options.timeoutMs || 30
  });
  return { delivery, result, calls, pending, original, options, state: () => state };
}

test('headless status works without credentials and exposes only allowlisted diagnostic fields', async () => {
  const f = fixture();
  assert.equal(f.delivery.deliver({ id: 's', text: '/status' }), true);
  await settle();
  assert.deepEqual(JSON.parse(f.result[0].answer), { runtimeVersion: '0.10.26', bridgeEnabled: true, viewResolved: false, health: { status: 'ok' } });
  assert.deepEqual(f.calls, [['mark', 'running'], ['health']]);
  assert.deepEqual(f.pending, f.original);
  assert.equal(f.result[0].outcome, 'diagnostic');
  f.delivery.dispose();
});

test('unavailable health never leaks raw errors or unexpected runtime strings', async () => {
  const f = fixture({ version: 'token=secret', health: () => { throw Error('Bearer SECRET /private/task'); } });
  f.delivery.deliver({ id: 's', text: '/status' }); await settle();
  assert.deepEqual(JSON.parse(f.result[0].answer), { runtimeVersion: 'unknown', bridgeEnabled: true, viewResolved: false, health: { status: 'unavailable', reason: 'unavailable' } });
  f.delivery.dispose();
});

test('malformed, degraded and unexpected-service responses cannot become healthy diagnostics', async () => {
  for (const response of [null, {}, 'ok', { status: 'degraded', service: 'dshrem' }, { status: 'ok', service: 'other', secret: 'private-payload' }, { status: 'ok' }]) {
    const f = fixture({ health: () => Promise.resolve(response) });
    f.delivery.deliver({ id: 's', text: '/status' }); await settle();
    assert.deepEqual(JSON.parse(f.result[0].answer).health, { status: 'unavailable', reason: 'invalid_response' });
    assert.deepEqual(f.calls, [['mark', 'running'], ['health']]);
    assert.deepEqual(f.pending, f.original);
    assert.ok(!f.result[0].answer.includes('private-payload'));
    f.delivery.dispose();
  }
});

test('health deadline aborts a stalled request and returns a bounded diagnostic', async () => {
  let signal;
  const f = fixture({ timeoutMs: 10, health: value => { signal = value; return new Promise(() => {}); } });
  f.delivery.deliver({ id: 's', text: '/status' });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(signal.aborted, true);
  assert.deepEqual(JSON.parse(f.result[0].answer).health, { status: 'unavailable', reason: 'timeout' });
  f.delivery.dispose();
});

test('unwritable running status prevents even the health request', async () => {
  const f = fixture({ failStart: true });
  assert.equal(f.delivery.deliver({ id: 's', text: '/status' }), false);
  await settle();
  assert.deepEqual(f.calls, [['mark', 'running']]);
  assert.equal(f.state().state, 'accepted');
  f.delivery.dispose();
});

test('unwritable completion retries its saved result without another request', async () => {
  const f = fixture({ failFinish: true });
  f.delivery.deliver({ id: 's', text: '/status' }); await settle();
  assert.equal(f.state().state, 'running');
  f.delivery.deliver({ id: 's', text: '/status' });
  f.delivery.flush();
  f.options.failFinish = false; f.delivery.flush();
  assert.equal(f.result.length, 1);
  assert.equal(f.calls.filter(row => row[0] === 'health').length, 1);
  assert.deepEqual(f.pending, f.original);
  f.delivery.dispose();
});

test('disabled bridge starts no diagnostic and opens no view', async () => {
  const f = fixture({ enabled: false });
  for (const text of ['/status', 'ordinary task']) assert.equal(f.delivery.deliver({ id: 's', text }), false);
  await settle(); assert.deepEqual(f.calls, []); f.delivery.dispose();
});

test('dispose aborts in-flight diagnostic without inventing a completed receipt', async () => {
  let signal;
  const f = fixture({ health: value => { signal = value; return new Promise(() => {}); } });
  f.delivery.deliver({ id: 's', text: '/status' }); await settle(); f.delivery.dispose();
  assert.equal(signal.aborted, true);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.deepEqual(f.result, []);
  assert.equal(f.state().state, 'running');
});
