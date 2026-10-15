import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reduceTask, StateError } from '../src/pwa-task-state.mjs';
import { observeTask } from '../src/pwa-task-observation.mjs';

const tenant = 'tenant_a';
const submit = { type: 'SUBMIT', requestId: 'r1', fingerprint: 'a'.repeat(64), maxUsd: '1' };
const reserve = { tenant, kind: 'reserve', requestId: 'r1', taskId: null };
const status = { tenant, kind: 'status', requestId: 'r1', taskId: 'task_a' };
const budget = (max = '1', spent = '0', held = max) => ({ max_usd: max, spent_usd: spent, held_usd: held });
const payload = (value = 'issued', amounts = budget()) => ({ id: 'task_a', model: 'coding',
  title: 'Synthetic fixture', status: value, expires_at: 0, budget: amounts, reason: null });
const step = (s, e) => reduceTask(s, e).state;
const pending = () => step(initialState({ tenant, online: true }), submit);
const issued = () => observeTask(pending(), reserve, payload()).state;
const completed = () => observeTask(issued(), status, payload('completed', budget('1', '0.2', '0'))).state;
function locked(out) {
  assert.equal(out.state.phase, 'blocked'); assert.equal(out.error, 'invalid_observation');
  assert.deepEqual(out.intents, []);
  assert.deepEqual(reduceTask(out.state, { type: 'SEND' }).intents, []);
  assert.deepEqual(reduceTask(out.state, { ...submit, requestId: 'r2' }).intents, []);
}

test('WA01 full task grant maps exact budget and preserves identity', () => {
  const out = observeTask(pending(), reserve, payload('issued', budget('0.5')));
  assert.equal(out.state.phase, 'issued'); assert.deepEqual(out.state.current.budget, budget('0.5'));
  assert.equal(out.state.current.requestId, 'r1'); assert.equal(out.state.current.taskId, 'task_a');
  assert.deepEqual(out.intents, []);
});
test('WA02 full matching terminal status enables only explicit next submit', () => {
  const out = observeTask(issued(), status, payload('completed', budget('1', '0.2', '0')));
  assert.equal(out.state.phase, 'terminal'); assert.deepEqual(out.intents, []);
  assert.equal(reduceTask(out.state, { ...submit, requestId: 'r2' }).intents[0].kind, 'reserve');
});
test('WA03 twelve source-derived public_task shapes reach canonical expected phases', () => {
  // Frozen source fixture matrix; cap/spent/held values are wire strings, never floats.
  const cases = [
    ['issued', budget(), 'issued'],
    ['issued', budget('1E-9'), 'issued'],
    ['issued', budget('1E-8'), 'issued'],
    ['issued', budget('1E-7'), 'issued'],
    ['issued', budget('0.000001'), 'issued'],
    ['completed', budget('1', '1E-9', '0'), 'terminal'],
    ['completed', budget('1', '1E-7', '0'), 'terminal'],
    ['completed', budget('1', '0.000001', '0'), 'terminal'],
    ['frozen', budget('1', '1E-9', '0.999999999'), 'reconciling'],
    ['running', budget('1', '0.2', '0.8'), 'running'],
    ['cancelled', budget('1', '0', '0'), 'terminal'],
    ['frozen', budget('0.5', '0.6', '0'), 'blocked'],
  ];
  for (const [value, amounts, expected] of cases) {
    const out = observeTask(pending(), reserve, payload(value, amounts));
    assert.equal(out.state.phase, expected); assert.deepEqual(out.intents, []);
  }
});
test('WA04 scientific strings normalize exactly including nano spent and zero', () => {
  for (const [wire, plain] of [['1E-9', '0.000000001'], ['1e-7', '0.0000001'],
    ['1.00e-8', '0.00000001'], ['1E+0', '1'], ['0E-9', '0'], ['0.0000000000', '0']]) {
    const out = observeTask(pending(), reserve, payload('completed', budget('1', wire, '0')));
    assert.equal(out.state.current.budget.spent_usd, plain); assert.equal(out.state.phase, 'terminal');
  }
});
test('WA05 scientific frozen or positive-held terminal does not settle', () => {
  for (const value of ['frozen', 'completed']) {
    const out = observeTask(issued(), status, payload(value, budget('1', '1E-9', '1E-9')));
    assert.notEqual(out.state.phase, 'terminal');
    assert.deepEqual(reduceTask(out.state, { ...submit, requestId: 'r2' }).intents, []);
  }
});
test('WA06 zero differs from null and expiry never implies settlement', () => {
  const unknown = observeTask(issued(), status, payload('completed', budget('1', '0', null)));
  assert.equal(unknown.state.phase, 'reconciling');
  assert.equal(observeTask(issued(), status, payload('completed', budget('1', '0', '0'))).state.phase, 'terminal');
  assert.equal(observeTask(issued(), status, payload()).state.phase, 'issued');
});
test('WA07 missing or partial budgets stay unknown without requested-cap substitution', () => {
  for (const amounts of [null, {}, { held_usd: '0' }, { max_usd: '1', spent_usd: '0' }]) {
    const out = observeTask(issued(), status, payload('completed', amounts));
    assert.equal(out.state.phase, 'reconciling');
    assert.deepEqual(reduceTask(out.state, { ...submit, requestId: 'r2' }).intents, []);
  }
  const missing = payload('completed'); delete missing.budget;
  assert.equal(observeTask(issued(), status, missing).state.current.budget, null);
});
test('WA08 numeric boolean array and object amounts lock matching observations', () => {
  for (const invalid of [false, true, 0, 0.1, [], {}, NaN, Infinity]) {
    locked(observeTask(issued(), status, payload('completed', budget('1', invalid, '0'))));
  }
});
test('WA09 bounded exact nano grammar rejects malformed and subnano values without rounding', () => {
  for (const invalid of ['', ' 1', '1\n', '+1', '-1', 'NaN', 'Infinity', '1e99', '1e-10',
    '0.0000000001', '1.0000000001', '01', '1e', '9'.repeat(129), `${'9'.repeat(128)}e9`]) {
    locked(observeTask(issued(), status, payload('completed', budget('1', invalid, '0'))));
  }
});
test('WA10 exact normalization retains cap and overspend refusal', () => {
  for (const amounts of [budget('2e0', '0', '0'), budget('1', '6e-1', '5e-1'), budget('0', '0', '0')]) {
    const out = observeTask(issued(), status, payload('completed', amounts));
    assert.equal(out.state.phase, 'blocked'); assert.deepEqual(out.intents, []);
    assert.deepEqual(reduceTask(out.state, { ...submit, requestId: 'r2' }).intents, []);
  }
});
test('WA11 malformed matching server shape locks issued and terminal chains then recovers', () => {
  for (const state of [issued(), completed()]) {
    for (const raw of [null, [], false, {}, { id: 'task_a' }, payload('unrecognised'),
      payload('completed', []), payload('completed', { unexpected: 'synthetic' })]) {
      const out = observeTask(state, status, raw); locked(out);
      assert.equal(out.state.current.taskId, 'task_a');
      assert.equal(observeTask(out.state, status, payload('completed', budget('1', '0', '0'))).state.phase, 'terminal');
    }
  }
});
test('WA12 stale request or task context does not touch current chain', () => {
  const state = issued();
  for (const context of [{ ...status, requestId: 'old' }, { ...status, taskId: 'old' }, { ...reserve, requestId: 'old' }]) {
    const out = observeTask(state, context, null);
    assert.equal(out.error, 'stale_context'); assert.deepEqual(out.state, state); assert.deepEqual(out.intents, []);
  }
});
test('WA13 contradictory response id locks matching route and cannot rebind or send', () => {
  for (const context of [status, reserve]) {
    const out = observeTask(issued(), context, { ...payload(), id: 'wrong_task' }); locked(out);
    assert.equal(out.state.current.taskId, 'task_a');
  }
  const unbound = observeTask(pending(), reserve, { ...payload(), id: null }); locked(unbound);
  assert.equal(unbound.state.current.taskId, null);
});
test('WA14 closed and expired access ignores payload before its schema validation', () => {
  for (const type of ['LOGOUT', 'IDENTITY_EXPIRED']) {
    const state = step(issued(), { type });
    for (const context of [reserve, status]) for (const raw of [null, [], {}, { token: 'synthetic' }]) {
      const out = observeTask(state, context, raw);
      assert.equal(out.error, 'identity_blocked'); assert.deepEqual(out.state, state); assert.deepEqual(out.intents, []);
    }
  }
});
test('WA15 wrong tenant is stale and malformed local context throws fixed StateError', () => {
  assert.equal(observeTask(issued(), { ...status, tenant: 'other' }, null).error, 'stale_context');
  for (const context of [null, [], {}, { ...status, token: 'synthetic' }, { ...status, kind: ['status'] },
    { ...reserve, taskId: 'task_a' }, { ...status, taskId: null }, { ...status, requestId: true }]) {
    assert.throws(() => observeTask(issued(), context, payload()),
      (e) => e instanceof StateError && e.code === 'invalid_observation_context' && !e.message.includes('synthetic'));
  }
});
test('WA16 unknown credential fields fail closed without copying their content', () => {
  for (const raw of [{ ...payload(), token: 'synthetic_secret' },
    payload('completed', { ...budget(), token: 'synthetic_secret' })]) {
    const out = observeTask(issued(), status, raw); locked(out);
    assert.equal(JSON.stringify(out).includes('synthetic_secret'), false);
  }
});
test('WA17 inputs remain untouched and metadata is not retained in detached result', () => {
  const state = pending(); const raw = { ...payload(), title: 'metadata_sentinel', reason: 'metadata_sentinel' };
  const before = structuredClone({ state, raw, reserve });
  const out = observeTask(state, reserve, raw);
  assert.deepEqual({ state, raw, reserve }, before);
  assert.equal(JSON.stringify(out).includes('metadata_sentinel'), false);
  out.state.history[0].fingerprint = 'b'.repeat(64);
  assert.deepEqual({ state, raw, reserve }, before);
  const stale = observeTask(state, { ...reserve, requestId: 'old' }, null);
  stale.state.current.requestId = 'changed'; assert.deepEqual(state, before.state);
});
test('WA18 repeated observations produce no reserve chat or cancel effects', () => {
  let state = issued();
  for (let i = 0; i < 4; i++) {
    const out = observeTask(state, status, payload()); assert.deepEqual(out.intents, []); state = out.state;
  }
  assert.equal(reduceTask(state, { type: 'SEND' }).intents.length, 1);
});
test('WA19 cancel acknowledgement and chat partial cost never imply full settlement', () => {
  const state = step(step(issued(), { type: 'CANCEL' }), { type: 'CANCEL_ACK' });
  assert.equal(state.phase, 'reconciling');
  locked(observeTask(state, status, { id: 'task_a', task: { spent_usd: '0', held_usd: '0' } }));
  locked(observeTask(state, status, { revoked: true }));
  assert.equal(observeTask(state, status, payload()).state.phase, 'reconciling');
});
test('WA20 reserve recovery preserves request identity and never runs chat or makes a key', () => {
  const unknown = step(pending(), { type: 'RESERVE_UNKNOWN' });
  const bad = observeTask(unknown, reserve, {}); locked(bad);
  const recovery = reduceTask(bad.state, { type: 'RECONCILE' });
  assert.equal(recovery.intents[0].kind, 'recover-reserve');
  assert.equal(recovery.intents[0].requestId, 'r1');
  const known = observeTask(recovery.state, reserve, payload());
  assert.deepEqual(known.intents, []); assert.equal(known.state.phase, 'issued');
  const sent = step(known.state, { type: 'SEND' });
  const duplicate = observeTask(sent, reserve, payload());
  assert.deepEqual(duplicate.intents, []); assert.deepEqual(reduceTask(duplicate.state, { type: 'SEND' }).intents, []);
});

test('WA21 delayed same-task nonterminal observations preserve the terminal fact and require confirmation', () => {
  for (const terminal of ['completed', 'cancelled', 'failed', 'expired']) {
    for (const held of ['0', '0.1']) for (const later of ['issued', 'running', 'frozen']) {
      const state = observeTask(issued(), status, payload(terminal, budget('1', '0.1', held))).state;
      for (const context of [reserve, status]) {
        const out = observeTask(state, context, payload(later));
        locked(out);
        assert.equal(out.state.current.status, terminal);
        assert.equal(out.state.current.taskId, 'task_a');
        assert.equal(out.state.current.budget, null);
        const confirmed = observeTask(out.state, status, payload(terminal, budget('1', '0.1', '0')));
        assert.equal(confirmed.state.phase, 'terminal');
        assert.deepEqual(confirmed.intents, []);
      }
    }
  }
});
