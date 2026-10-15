import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, restoreState, reduceTask, StateError } from '../src/pwa-task-state.mjs';
import { observeTask } from '../src/pwa-task-observation.mjs';
import { createTaskSimulation } from '../src/pwa-task-simulation.mjs';

const tenant = 'sim_tenant';
const submit = { type: 'SUBMIT', requestId: 'r1', fingerprint: 'a'.repeat(64), maxUsd: '1' };
const reserve = { tenant, kind: 'reserve', requestId: 'r1', taskId: null };
const status = { tenant, kind: 'status', requestId: 'r1', taskId: 'task_a' };
const payload = (value = 'issued', held = '1', spent = '0', max = '1') => ({ id: 'task_a', status: value,
  budget: { max_usd: max, spent_usd: spent, held_usd: held } });
const step = (s, event) => reduceTask(s, event).state;
const online = () => initialState({ tenant, online: true });
const issued = () => observeTask(step(online(), submit), reserve, payload()).state;
const copy = (v) => structuredClone(v);
function gate() { let release; const promise = new Promise((r) => { release = r; }); return { promise, release }; }
function harness({ state = online(), save, perform } = {}) {
  const saved = []; const effects = []; const trace = [];
  const simulation = createTaskSimulation({ state,
    save: async (snapshot) => {
      trace.push('save'); const bytes = copy(snapshot);
      if (save) await save(snapshot);
      saved.push(bytes);
    },
    perform: async (intent) => {
      trace.push(`effect:${intent.kind}`); effects.push(copy(intent));
      if (perform) return perform(intent);
      if (['reserve', 'recover-reserve', 'status'].includes(intent.kind)) return payload();
      return { acknowledged: true };
    },
  });
  return { simulation, saved, effects, trace };
}

test('SIM01 fake save must acknowledge before a fresh effect, then observation is saved', { timeout: 2000 }, async () => {
  const ack = gate(); let writes = 0;
  const h = harness({ save: async () => { if (++writes === 1) await ack.promise; } });
  const running = h.simulation.dispatch(submit);
  await Promise.resolve();
  assert.deepEqual(h.trace, ['save']); assert.equal(h.saved.length, 0); assert.equal(h.effects.length, 0);
  assert.equal(h.simulation.snapshot().state.current.requestId, 'r1');
  ack.release(); const out = await running;
  assert.deepEqual(h.trace, ['save', 'effect:reserve', 'save']);
  assert.equal(out.state.phase, 'issued'); assert.equal(out.effects[0].outcome, 'returned');
  assert.equal(Object.hasOwn(out, 'intents'), false);
});
test('SIM02 concurrent duplicate submit/send operations use latest serialized state', async () => {
  const h = harness();
  const results = await Promise.all([h.simulation.dispatch(submit), h.simulation.dispatch(submit),
    h.simulation.dispatch({ type: 'SEND' }), h.simulation.dispatch({ type: 'SEND' })]);
  assert.deepEqual(h.effects.map((x) => x.kind), ['reserve', 'chat']);
  assert.equal(h.saved.length, 4); assert.equal(results[3].error, 'send_blocked');
  assert.equal(h.simulation.snapshot().state.current.chatSent, true);
  assert.equal(h.simulation.snapshot().state.phase, 'reconciling');
});
test('SIM03 pre-effect save failure freezes queued and future work without effects', async () => {
  const h = harness({ save: async () => { throw new Error('synthetic_private_error'); } });
  const outcomes = await Promise.allSettled([h.simulation.dispatch(submit), h.simulation.dispatch({ type: 'SEND' })]);
  for (const out of outcomes) {
    assert.equal(out.status, 'rejected'); assert.equal(out.reason.code, 'simulation_persistence_unknown');
    assert.equal(out.reason.message.includes('synthetic_private'), false);
  }
  assert.equal(h.effects.length, 0); assert.equal(h.saved.length, 0);
  assert.equal(h.simulation.snapshot().blocked, 'simulation_persistence_unknown');
  await assert.rejects(h.simulation.dispatch({ type: 'RECONCILE' }), /simulation_persistence_unknown/);
});
test('SIM04 failed post-effect save never replays; trusted saved snapshot restores to explicit same-key recovery', async () => {
  let writes = 0;
  const h = harness({ save: async () => { if (++writes === 2) throw new Error('synthetic_post_save'); } });
  await assert.rejects(h.simulation.dispatch(submit), /simulation_persistence_unknown/);
  assert.equal(h.effects.length, 1); assert.equal(h.saved.length, 1);
  await assert.rejects(h.simulation.dispatch(submit), /simulation_persistence_unknown/);
  assert.equal(h.effects.length, 1);
  const restored = restoreState(h.saved[0], { tenant });
  const next = harness({ state: restored });
  assert.equal(next.effects.length, 0); assert.equal((await next.simulation.dispatch({ type: 'SEND' })).error, 'identity_blocked');
  await next.simulation.dispatch({ type: 'IDENTITY_RESTORED', tenant });
  await next.simulation.dispatch({ type: 'NETWORK', online: true });
  const out = await next.simulation.dispatch({ type: 'RECONCILE' });
  assert.deepEqual(next.effects.map((x) => x.kind), ['recover-reserve']);
  assert.equal(next.effects[0].requestId, 'r1'); assert.equal(out.state.phase, 'issued');
  // Even an unconstructable post-effect state must freeze instead of replaying.
  const capacity = harness({ state: { ...issued(), revision: Number.MAX_SAFE_INTEGER - 1 } });
  await assert.rejects(capacity.simulation.dispatch({ type: 'SEND' }), /simulation_persistence_unknown/);
  assert.equal(capacity.effects.length, 1);
  await assert.rejects(capacity.simulation.dispatch({ type: 'SEND' }), /simulation_persistence_unknown/);
  assert.equal(capacity.effects.length, 1);
});
test('SIM05 unknown reserve preserves key, blocks new work, and only explicit lookup recovers', async () => {
  const h = harness({ perform: async (intent) => {
    if (intent.kind === 'reserve') throw new Error('synthetic_response_body');
    return payload();
  } });
  const out = await h.simulation.dispatch(submit);
  assert.equal(out.error, 'effect_unknown'); assert.equal(out.state.current.requestId, 'r1');
  assert.equal(out.state.current.uncertain, true);
  assert.equal(JSON.stringify(out).includes('synthetic_response_body'), false);
  assert.equal((await h.simulation.dispatch({ ...submit, requestId: 'r2' })).error, 'previous_task_unsettled');
  assert.equal(h.effects.length, 1);
  assert.equal((await h.simulation.dispatch({ type: 'RECONCILE' })).state.phase, 'issued');
  assert.deepEqual(h.effects.map((x) => x.kind), ['reserve', 'recover-reserve']);
  assert.equal(h.effects[1].requestId, h.effects[0].requestId);
});
test('SIM06 chat callback success never settles and raw output is omitted', async () => {
  const h = harness({ state: issued(), perform: async () => ({ choices: [{ text: 'synthetic_private_text' }],
    task: { spent_usd: '0', held_usd: '0' }, status: 'completed' }) });
  const out = await h.simulation.dispatch({ type: 'SEND' });
  assert.equal(out.error, 'observation_required'); assert.equal(out.state.phase, 'reconciling');
  assert.equal(out.state.current.budget.held_usd, '1');
  assert.equal(JSON.stringify({ out, saved: h.saved }).includes('synthetic_private_text'), false);
  assert.equal((await h.simulation.dispatch({ ...submit, requestId: 'r2' })).error, 'previous_task_unsettled');
  assert.equal((await h.simulation.observe(status, payload('completed', '0', '0.1'))).state.phase, 'terminal');
  assert.deepEqual(h.effects.map((x) => x.kind), ['chat']);
});
test('SIM07 cancel callback acknowledgement does not release held money', async () => {
  const h = harness({ state: issued() });
  const out = await h.simulation.dispatch({ type: 'CANCEL' });
  assert.equal(out.error, 'observation_required'); assert.equal(out.state.phase, 'reconciling');
  assert.equal(out.state.current.cancelSent, true); assert.equal(out.state.current.budget.held_usd, '1');
  await h.simulation.dispatch({ type: 'CANCEL' }); assert.equal(h.effects.length, 1);
  assert.equal((await h.simulation.observe(status, payload('cancelled', '0'))).state.phase, 'terminal');
});
test('SIM08 failed status callback locks and only a later explicit lookup clears the fault', async () => {
  let calls = 0;
  const h = harness({ state: issued(), perform: async () => {
    if (++calls === 1) throw new Error('synthetic_lookup_error');
    return payload();
  } });
  const bad = await h.simulation.dispatch({ type: 'RECONCILE' });
  assert.equal(bad.error, 'effect_unknown'); assert.equal(bad.state.phase, 'blocked');
  assert.equal((await h.simulation.dispatch({ type: 'SEND' })).error, 'send_blocked');
  assert.equal(h.effects.length, 1);
  assert.equal((await h.simulation.dispatch({ type: 'RECONCILE' })).state.phase, 'issued');
  assert.deepEqual(h.effects.map((x) => x.kind), ['status', 'status']);
});
test('SIM09 manual wire observation canonicalizes, preserves correlation and keeps missing money unknown', async () => {
  const h = harness({ state: issued() });
  const tiny = await h.simulation.observe(status, payload('issued', '1E-9', '0', '1E-9'));
  assert.equal(tiny.state.current.budget.max_usd, '0.000000001');
  const bad = await h.simulation.observe(status, { ...payload(), id: 'wrong' });
  assert.equal(bad.state.phase, 'blocked'); assert.equal(bad.state.current.taskId, 'task_a');
  const writes = h.saved.length;
  assert.equal((await h.simulation.observe({ ...status, requestId: 'old' }, null)).error, 'stale_context');
  assert.equal(h.saved.length, writes);
  const unknown = await h.simulation.observe(status, { id: 'task_a', status: 'completed' });
  assert.equal(unknown.state.phase, 'reconciling'); assert.equal(h.effects.length, 0);
});
test('SIM10 admitted inputs, callback arguments and exposed snapshots are detached', { timeout: 2000 }, async () => {
  const ack = gate(); let writes = 0;
  const h = harness({ save: async (snapshot) => {
    snapshot.current.requestId = 'tampered'; if (++writes === 1) await ack.promise;
  }, perform: async (intent) => { intent.requestId = 'tampered'; return payload(); } });
  const event = copy(submit); const first = h.simulation.dispatch(event); event.requestId = 'changed';
  const context = copy(reserve); const raw = payload();
  const second = h.simulation.observe(context, raw); context.requestId = 'changed'; raw.id = 'wrong';
  ack.release(); await first; await second;
  assert.equal(h.simulation.snapshot().state.current.requestId, 'r1');
  assert.equal(h.simulation.snapshot().state.current.taskId, 'task_a');
  assert.equal(h.saved[0].current.requestId, 'r1'); assert.equal(h.effects[0].requestId, 'r1');
  const snapshot = h.simulation.snapshot(); snapshot.state.current.requestId = 'changed';
  assert.equal(h.simulation.snapshot().state.current.requestId, 'r1');
});
test('SIM11 offline/focus/restored metadata never auto-replay, and invalid controls do not poison queue', async () => {
  const h = harness({ state: initialState({ tenant }) });
  assert.equal((await h.simulation.dispatch(submit)).error, 'offline');
  await h.simulation.dispatch({ type: 'FOCUS' }); await h.simulation.dispatch({ type: 'NETWORK', online: true });
  assert.equal(h.effects.length, 0);
  await assert.rejects(h.simulation.dispatch({ type: 'SURPRISE' }), StateError);
  await h.simulation.dispatch({ type: 'FOCUS' }); assert.equal(h.simulation.snapshot().blocked, null);
  const restored = restoreState(step(issued(), { type: 'SEND' }), { tenant });
  const next = harness({ state: restored });
  await next.simulation.dispatch({ type: 'NETWORK', online: true }); await next.simulation.dispatch({ type: 'FOCUS' });
  assert.equal((await next.simulation.dispatch({ type: 'SEND' })).error, 'identity_blocked');
  assert.equal(next.effects.length, 0); assert.equal(next.simulation.snapshot().state.current.chatSent, true);
  assert.throws(() => createTaskSimulation({ state: online(), save: null, perform() {} }), StateError);
});
test('SIM12 FIFO logout does not preempt an in-flight fake callback but blocks later sends', { timeout: 2000 }, async () => {
  const entered = gate(); const finish = gate();
  const h = harness({ perform: async () => { entered.release(); await finish.promise; return payload(); } });
  const first = h.simulation.dispatch(submit); await entered.promise;
  const logout = h.simulation.dispatch({ type: 'LOGOUT' });
  const send = h.simulation.dispatch({ type: 'SEND' }); finish.release();
  await first; await logout; assert.equal((await send).error, 'identity_blocked');
  assert.deepEqual(h.effects.map((x) => x.kind), ['reserve']);
  assert.equal((await h.simulation.observe(status, {})).error, 'identity_blocked');
  assert.equal(h.simulation.snapshot().state.access, 'closed');
});
