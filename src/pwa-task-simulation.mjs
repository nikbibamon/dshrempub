/** Single-instance FIFO simulation with injected callbacks, not a durable transport.
 * Only fake callbacks are tested. Callbacks must settle and must not await this queue.
 * Later logout/offline events do not preempt an in-flight callback.
 */
import { reduceTask, StateError } from './pwa-task-state.mjs';
import { observeTask } from './pwa-task-observation.mjs';

function copy(value) {
  try { return structuredClone(value); }
  catch { throw new StateError('invalid_simulation_input'); }
}

export function createTaskSimulation(options) {
  const names = options && typeof options === 'object' ? Reflect.ownKeys(options) : [];
  if (names.length !== 3 || !names.every((k) => ['state', 'save', 'perform'].includes(k))
    || typeof options.save !== 'function' || typeof options.perform !== 'function') {
    throw new StateError('invalid_simulation_options');
  }
  const { save, perform } = options;
  let state = reduceTask(options.state, { type: 'FOCUS' }).state;
  let blocked = null;
  let tail = Promise.resolve();
  function freeze() {
    blocked = 'simulation_persistence_unknown';
    throw new StateError(blocked);
  }
  async function commit(next) {
    // Diagnostic candidate stays conservative even when the fake save is ambiguous.
    state = copy(next);
    try { await save(copy(state)); }
    catch { freeze(); }
  }
  function result(error, effects = []) { return { state: copy(state), error, effects: copy(effects) }; }
  function context(intent) {
    return { tenant: intent.tenant, requestId: intent.requestId,
      kind: intent.kind === 'status' ? 'status' : 'reserve',
      taskId: intent.kind === 'status' ? intent.taskId : null };
  }
  function after(intent, body, unknown) {
    if (intent.kind === 'chat') return reduceTask(state, { type: 'CHAT_UNKNOWN' });
    if (intent.kind === 'cancel') return reduceTask(state, { type: 'CANCEL_ACK' });
    if (unknown && intent.kind !== 'status') return reduceTask(state, { type: 'RESERVE_UNKNOWN' });
    return observeTask(state, context(intent), unknown ? null : body);
  }
  async function apply(next) {
    if (next.state.revision === state.revision && next.intents.length === 0) return result(next.error);
    await commit(next.state);
    const effects = [];
    let error = next.error;
    for (const intent of next.intents) {
      let body; let unknown = false;
      try { body = await perform(copy(intent)); }
      catch { unknown = true; }
      try {
        const observation = after(intent, body, unknown);
        await commit(observation.state);
        const needsObservation = intent.kind === 'chat' || intent.kind === 'cancel';
        error = unknown ? 'effect_unknown' : needsObservation ? 'observation_required' : observation.error;
        effects.push({ kind: intent.kind, id: intent.id,
          outcome: unknown ? 'unknown' : needsObservation ? 'observation_required' : 'returned' });
      } catch {
        // A callback may already have run: an unrecordable outcome never permits replay.
        freeze();
      }
    }
    return result(error, effects);
  }
  function enqueue(work) {
    const pending = tail.then(() => {
      if (blocked) throw new StateError(blocked);
      return work();
    });
    tail = pending.catch(() => undefined);
    return pending;
  }
  return Object.freeze({
    async dispatch(event) {
      const admitted = copy(event);
      return enqueue(() => apply(reduceTask(state, admitted)));
    },
    async observe(localContext, payload) {
      const admittedContext = copy(localContext); const admittedPayload = copy(payload);
      return enqueue(() => apply(observeTask(state, admittedContext, admittedPayload)));
    },
    snapshot() { return { state: copy(state), blocked }; },
  });
}
