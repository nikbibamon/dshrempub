import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, restoreState, reduceTask, StateError, MAX_REQUESTS } from '../src/pwa-task-state.mjs';

const tenant = 'tenant_a';
const fingerprint = 'a'.repeat(64);
const submit = (requestId = 'r1', maxUsd = '0.5') => ({ type: 'SUBMIT', requestId, fingerprint, maxUsd });
const budget = (max = '0.5', spent = '0', held = max) => ({ max_usd: max, spent_usd: spent, held_usd: held });
const online = () => initialState({ tenant, online: true });
const step = (state, event) => reduceTask(state, event).state;
const status = (value, amounts = budget(), taskId = 'task_1') => ({ type: 'STATUS', taskId, status: value, budget: amounts });
function issued() {
  const state = step(online(), submit());
  return step(state, { ...status('issued'), type: 'RESERVED', requestId: 'r1' });
}
function completed(state = issued()) { return step(state, status('completed', budget('0.5', '0.1', '0'))); }

// Tests describe explicit event traces; no transport, browser or account is used.
test('PW-01 double submit emits one reserve and preserves input isolation', () => {
  const source = online(); const before = structuredClone(source); const event = submit();
  const first = reduceTask(source, event);
  assert.equal(first.intents.length, 1); assert.equal(first.intents[0].kind, 'reserve');
  const replay = reduceTask(first.state, event);
  assert.deepEqual(replay.intents, []); assert.deepEqual(replay.state, first.state);
  assert.deepEqual(source, before); assert.deepEqual(event, submit());
  first.state.history[0].fingerprint = 'b'.repeat(64);
  assert.deepEqual(source, before);
});

test('PW-02 reused identity with different payload or cap conflicts', () => {
  const state = step(online(), submit());
  for (const event of [{ ...submit(), fingerprint: 'b'.repeat(64) }, submit('r1', '0.4')]) {
    const result = reduceTask(state, event);
    assert.equal(result.error, 'identity_conflict'); assert.deepEqual(result.intents, []);
    assert.deepEqual(result.state, state);
  }
});

test('PW-03 offline submit and reconnect never queue a request', () => {
  let state = initialState({ tenant });
  const refused = reduceTask(state, submit());
  assert.equal(refused.error, 'offline'); assert.equal(refused.state.history.length, 0);
  for (const event of [{ type: 'NETWORK', online: true }, { type: 'FOCUS' }]) {
    const out = reduceTask(state, event); assert.deepEqual(out.intents, []); state = out.state;
  }
  assert.equal(reduceTask(state, submit()).intents[0].kind, 'reserve');
});

test('PW-04 uncertain reserve preserves identity and can only describe same-key recovery', () => {
  let state = step(step(online(), submit()), { type: 'RESERVE_UNKNOWN' });
  assert.equal(state.current.requestId, 'r1'); assert.equal(state.current.taskId, null);
  assert.equal(reduceTask(state, submit('r2')).intents.length, 0);
  const out = reduceTask(state, { type: 'RECONCILE' });
  assert.equal(out.intents[0].kind, 'recover-reserve'); assert.equal(out.intents[0].requestId, 'r1');
  assert.equal(out.intents[0].fingerprint, fingerprint);
  state = step(out.state, { ...status('issued'), type: 'RESERVED', requestId: 'r1' });
  assert.equal(state.current.taskId, 'task_1'); assert.equal(state.phase, 'issued');
});

test('PW-05 smaller server cap is preserved and double send emits one chat', () => {
  let state = step(online(), submit());
  state = step(state, { ...status('issued', budget('0.3')), type: 'RESERVED', requestId: 'r1' });
  const sent = reduceTask(state, { type: 'SEND' });
  assert.equal(sent.intents[0].kind, 'chat'); assert.equal(sent.intents[0].maxUsd, '0.3');
  assert.equal(sent.state.current.chatSent, true);
  assert.deepEqual(reduceTask(sent.state, { type: 'SEND' }).intents, []);
});

test('PW-06 ambiguous chat only reconciles; a later issued observation cannot resend', () => {
  let state = step(step(issued(), { type: 'SEND' }), { type: 'CHAT_UNKNOWN' });
  assert.equal(state.phase, 'reconciling'); assert.equal(state.current.taskId, 'task_1');
  const out = reduceTask(state, { type: 'RECONCILE' });
  assert.equal(out.intents[0].kind, 'status');
  state = step(out.state, status('issued'));
  assert.deepEqual(reduceTask(state, { type: 'SEND' }).intents, []);
  assert.deepEqual(reduceTask(state, submit('r2')).intents, []);
});

test('PW-07 issued, running, frozen, unknown and positive holds all block new requests', () => {
  for (const [value, amounts] of [['issued', budget()], ['running', budget()], ['frozen', budget()],
    ['completed', budget('0.5', '0.1', null)], ['cancelled', budget('0.5', '0.1', '0.1')],
    ['issued', budget('0.5', '0', '0')], ['completed', null]]) {
    const state = step(issued(), status(value, amounts));
    assert.notEqual(state.phase, 'terminal');
    assert.deepEqual(reduceTask(state, submit('r2')).intents, []);
  }
});

test('PW-08 cancel ack does not settle; only matching terminal zero-hold observation does', () => {
  let state = issued(); const cancel = reduceTask(state, { type: 'CANCEL' });
  assert.equal(cancel.intents[0].kind, 'cancel');
  assert.deepEqual(reduceTask(cancel.state, { type: 'CANCEL' }).intents, []);
  state = step(cancel.state, { type: 'CANCEL_ACK' });
  assert.equal(state.current.taskId, 'task_1'); assert.equal(state.current.budget.held_usd, '0.5');
  assert.deepEqual(reduceTask(state, submit('r2')).intents, []);
  const stillIssued = step(state, status('issued'));
  assert.deepEqual(reduceTask(stillIssued, { type: 'SEND' }).intents, []);
  state = step(state, status('cancelled', budget('0.5', '0.1', '0')));
  assert.equal(state.phase, 'terminal'); assert.equal(reduceTask(state, submit('r2')).intents.length, 1);
});

test('PW-09 settled status waits for explicit submit and old replay remains inert afterwards', () => {
  const out = reduceTask(issued(), status('completed', budget('0.5', '0.1', '0')));
  assert.equal(out.state.phase, 'terminal'); assert.deepEqual(out.intents, []);
  const next = reduceTask(out.state, submit('r2'));
  assert.equal(next.intents[0].kind, 'reserve');
  const old = reduceTask(next.state, submit());
  assert.deepEqual(old.intents, []); assert.equal(old.state.current.requestId, 'r2');
});

test('PW-10 restore preserves flags and needs identity/status confirmation; corrupt snapshots fail', () => {
  const sent = step(issued(), { type: 'SEND' });
  let state = restoreState(JSON.parse(JSON.stringify(sent)), { tenant });
  assert.equal(state.current.chatSent, true); assert.equal(state.current.taskId, 'task_1');
  assert.equal(state.online, false); assert.equal(state.access, 'expired'); assert.equal(state.phase, 'blocked');
  assert.deepEqual(state.history, sent.history); assert.equal('intents' in state, false);
  state = step(state, { type: 'IDENTITY_RESTORED', tenant });
  const connected = reduceTask(state, { type: 'NETWORK', online: true });
  assert.deepEqual(connected.intents, []);
  assert.deepEqual(reduceTask(connected.state, { type: 'SEND' }).intents, []);
  for (const bad of [{ ...sent, phase: 'terminal' }, { ...sent, token: 'synthetic' },
    { ...sent, current: null }, { ...sent, history: [] }]) {
    assert.throws(() => restoreState(bad, { tenant }), StateError);
  }
  assert.throws(() => restoreState(sent, { tenant: 'other' }), /tenant_mismatch/);
});

test('PW-11 logout, expired identity and tenant change cannot send or transfer a task', () => {
  for (const event of [{ type: 'LOGOUT' }, { type: 'TENANT_CHANGED', tenant: 'tenant_b' }]) {
    const out = reduceTask(issued(), event);
    assert.deepEqual(out.intents, []); assert.equal(out.state.access, 'closed');
    assert.equal(out.state.tenant, tenant); assert.equal(out.state.current.taskId, 'task_1');
    assert.deepEqual(reduceTask(out.state, submit('r2')).intents, []);
    assert.deepEqual(reduceTask(out.state, { type: 'IDENTITY_RESTORED', tenant }).intents, []);
    assert.equal(restoreState(out.state, { tenant }).access, 'closed');
  }
  const expired = step(issued(), { type: 'IDENTITY_EXPIRED' });
  assert.deepEqual(reduceTask(expired, { type: 'SEND' }).intents, []);
  assert.equal(step(expired, { type: 'IDENTITY_RESTORED', tenant: 'other' }).access, 'expired');
  assert.equal(step(expired, { type: 'IDENTITY_RESTORED', tenant }).access, 'active');
});

test('PW-12 strict amounts and invalid server observations fail closed without losing identities', () => {
  assert.throws(() => initialState({ tenant, online: null }), StateError);
  for (const value of [null, true, 0, 0.5, NaN, Infinity, '', 'NaN', '-1', '1e-1', '0', '1.00000000001']) {
    assert.throws(() => reduceTask(online(), submit('r1', value)), StateError);
  }
  for (const amounts of [budget('0.500000000000000000000000000001'),
    budget('0.5', '0.4', '0.2'), budget('0.5', 'NaN', '0'), budget('0.5', false, '0')]) {
    const out = reduceTask(completed(), status('completed', amounts));
    assert.equal(out.state.phase, 'blocked'); assert.equal(out.state.current.taskId, 'task_1');
    assert.deepEqual(out.intents, []); assert.deepEqual(reduceTask(out.state, submit('r2')).intents, []);
  }
  const bad = step(completed(), status('unknown_state'));
  assert.equal(bad.phase, 'blocked');
  assert.equal(step(bad, status('completed', budget('0.5', '0.1', '0'))).phase, 'terminal');
});

test('History capacity never evicts identities and permits old replay at the limit', () => {
  let state = online();
  for (let i = 0; i < MAX_REQUESTS; i++) {
    state = step(state, submit(`r${i}`));
    state = step(state, { ...status('completed', budget('0.5', '0', '0'), `task_${i}`), type: 'RESERVED', requestId: `r${i}` });
  }
  const refused = reduceTask(state, submit('new_request'));
  assert.equal(refused.error, 'history_capacity'); assert.equal(refused.state.history.length, MAX_REQUESTS);
  assert.deepEqual(reduceTask(state, submit('r0')).intents, []);
  assert.deepEqual(restoreState(state, { tenant }).history, state.history);
});

test('Late and mismatched observations do not rebind the current task; unknown fields are rejected', () => {
  const state = issued();
  assert.equal(reduceTask(state, status('completed', budget('0.5', '0', '0'), 'task_other')).error, 'task_mismatch');
  assert.equal(reduceTask(state, { ...status('issued'), type: 'RESERVED', requestId: 'other' }).error, 'request_mismatch');
  assert.throws(() => reduceTask(state, { type: 'SEND', token: 'synthetic' }), StateError);
  assert.throws(() => reduceTask(state, { type: 'SURPRISE' }), StateError);
  const tampered = structuredClone(state); tampered.current.budget.secret = 'synthetic';
  assert.throws(() => restoreState(tampered, { tenant }), StateError);
});


test('Strict control-event types and SUBMIT schema apply even under closed access', () => {
  assert.throws(() => reduceTask(initialState({ tenant }), { type: ['NETWORK'], online: true }), StateError);
  const closed = step(issued(), { type: 'LOGOUT' });
  assert.throws(() => reduceTask(closed, { ...submit(), maxUsd: true }), StateError);
  assert.throws(() => reduceTask(closed, { ...submit(), requestId: [] }), StateError);
});

test('A task-id already bound to an old request cannot produce a second chat intent', () => {
  const first = step(issued(), { type: 'SEND' });
  const old = completed(first);
  const next = step(old, submit('r2'));
  const bad = reduceTask(next, { ...status('issued'), type: 'RESERVED', requestId: 'r2' });
  assert.equal(bad.state.phase, 'blocked');
  assert.equal(bad.state.current.requestId, 'r2');
  assert.equal(bad.state.current.taskId, null);
  assert.deepEqual(reduceTask(bad.state, { type: 'SEND' }).intents, []);
  const corrupt = structuredClone(old); corrupt.history.push({ ...corrupt.history[0], requestId: 'r2' });
  assert.throws(() => restoreState(corrupt, { tenant }), StateError);
});


test('Malformed top-level matching observations lock issued and terminal chains', () => {
  for (const state of [issued(), completed()]) {
    for (const event of [
      { type: 'STATUS', taskId: 'task_1', status: 'completed' },
      { ...status('completed'), unexpected: 'synthetic' },
      { type: 'RESERVED', requestId: 'r1', taskId: 'task_1', status: 'completed' },
    ]) {
      const before = structuredClone(state);
      const out = reduceTask(state, event);
      assert.equal(out.error, 'invalid_observation');
      assert.equal(out.state.phase, 'blocked');
      assert.equal(out.state.current.taskId, 'task_1');
      assert.deepEqual(out.intents, []);
      assert.deepEqual(reduceTask(out.state, { type: 'SEND' }).intents, []);
      assert.deepEqual(reduceTask(out.state, submit('r2')).intents, []);
      assert.deepEqual(state, before);
      assert.equal(completed(out.state).phase, 'terminal');
    }
  }
});


test('Closed or expired access ignores observations before inspecting their payload schema', () => {
  for (const accessEvent of [{ type: 'LOGOUT' }, { type: 'IDENTITY_EXPIRED' }]) {
    const state = step(issued(), accessEvent);
    for (const event of [
      { type: 'STATUS', taskId: 'task_1', status: 'completed' },
      { type: 'RESERVED', requestId: 'r1', taskId: 'task_1', status: 'completed' },
      { ...status('completed'), unexpected: 'synthetic' },
      { type: 'RESERVED' },
    ]) {
      const out = reduceTask(state, event);
      assert.deepEqual(out.state, state);
      assert.equal(out.error, 'identity_blocked');
      assert.deepEqual(out.intents, []);
      assert.equal(Object.hasOwn(out.state, 'unexpected'), false);
    }
    assert.throws(() => reduceTask(state, { type: 'SEND', unexpected: 'synthetic' }), StateError);
    assert.throws(() => reduceTask(state, { ...submit(), maxUsd: true }), StateError);
  }
});
