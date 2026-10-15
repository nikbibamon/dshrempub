/** Pure wire projection. Caller owns verified tenant/route context and snapshot integrity.
 * No transport, authentication or persistence. Never execute lastIntent on restore.
 */
import { reduceTask, StateError } from './pwa-task-state.mjs';

const META = ['id', 'model', 'title', 'status', 'expires_at', 'budget', 'reason'];
const AMOUNTS = ['max_usd', 'spent_usd', 'held_usd'];
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function fields(value, allowed) { return plain(value) && Reflect.ownKeys(value).every((k) => allowed.includes(k)); }
function id(value) { return typeof value === 'string' && value.match(/^[A-Za-z0-9_-]{1,80}$/)?.[0] === value; }
function need(value, code) { if (!value) throw new StateError(code); }
function contextValid(context) {
  need(fields(context, ['tenant', 'kind', 'requestId', 'taskId']) && Reflect.ownKeys(context).length === 4
    && id(context.tenant) && id(context.requestId)
    && ((context.kind === 'reserve' && context.taskId === null)
      || (context.kind === 'status' && id(context.taskId))), 'invalid_observation_context');
}
function amount(value) {
  if (value === null) return null;
  need(typeof value === 'string' && value.length <= 128, 'invalid_wire_amount');
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]{1,2}))?$/.exec(value);
  need(match && match[0] === value, 'invalid_wire_amount');
  const exponent = BigInt(match[3] ?? '0');
  need(exponent >= -9n && exponent <= 9n, 'invalid_wire_amount');
  const fraction = match[2] ?? '';
  let nano = BigInt(match[1] + fraction);
  const shift = 9n + exponent - BigInt(fraction.length);
  if (shift >= 0n) nano *= 10n ** shift;
  else {
    const divisor = 10n ** -shift;
    need(nano % divisor === 0n, 'invalid_wire_amount');
    nano /= divisor;
  }
  const tail = (nano % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  const canonical = (nano / 1_000_000_000n).toString() + (tail ? `.${tail}` : '');
  need(canonical.length <= 128, 'invalid_wire_amount');
  return canonical;
}
function budget(value) {
  if (value === null) return null;
  need(fields(value, AMOUNTS), 'invalid_wire_budget');
  return Object.fromEntries(AMOUNTS.map((key) => [key, Object.hasOwn(value, key) ? amount(value[key]) : null]));
}

export function observeTask(input, context, payload) {
  // FOCUS validates the whole core snapshot and returns a detached unchanged copy.
  const state = reduceTask(input, { type: 'FOCUS' }).state;
  contextValid(context);
  const current = state.current;
  if (!current || context.tenant !== state.tenant || context.requestId !== current.requestId
    || (context.kind === 'status' && context.taskId !== current.taskId)) {
    return { state, intents: [], error: 'stale_context' };
  }
  if (state.access !== 'active') return { state, intents: [], error: 'identity_blocked' };
  const candidateId = plain(payload) && Object.hasOwn(payload, 'id') && id(payload.id) ? payload.id : null;
  const event = context.kind === 'reserve'
    ? { type: 'RESERVED', requestId: current.requestId, taskId: current.taskId ?? candidateId }
    : { type: 'STATUS', taskId: current.taskId };
  try {
    need(fields(payload, META) && candidateId !== null
      && (current.taskId === null || candidateId === current.taskId), 'invalid_wire_task');
    event.status = payload.status;
    event.budget = Object.hasOwn(payload, 'budget') ? budget(payload.budget) : null;
  } catch (error) {
    if (!(error instanceof StateError)) throw error;
    event.status = 'invalid_wire_observation'; event.budget = null;
  }
  return reduceTask(state, event);
}
