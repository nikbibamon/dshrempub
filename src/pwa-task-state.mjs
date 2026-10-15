/** Pure task-state prototype: intents only, no transport, auth or persistence.
 * Caller owns snapshot integrity, verified server observations and original payload.
 * Never execute lastIntent on restore or reset unresolved state to start again.
 */
export const MAX_REQUESTS = 256;
const TERMINAL = new Set(['completed', 'complete', 'succeeded', 'failed', 'cancelled', 'canceled', 'expired']);
const SERVER = new Set(['issued', 'running', 'frozen', ...TERMINAL]);
const KINDS = new Set(['reserve', 'chat', 'cancel', 'status', 'recover-reserve']);
const STATE_KEYS = ['schema', 'revision', 'tenant', 'online', 'access', 'phase', 'fault', 'history', 'current', 'lastIntent'];
const CURRENT_KEYS = ['requestId', 'fingerprint', 'maxUsd', 'taskId', 'status', 'budget', 'chatSent', 'cancelSent', 'uncertain'];
const EVENT_KEYS = {
  NETWORK: ['online'], FOCUS: [], SUBMIT: ['requestId', 'fingerprint', 'maxUsd'], SEND: [],
  RESERVED: ['requestId', 'taskId', 'status', 'budget'], STATUS: ['taskId', 'status', 'budget'],
  RESERVE_UNKNOWN: [], CHAT_UNKNOWN: [], CANCEL: [], CANCEL_ACK: [], RECONCILE: [],
  IDENTITY_EXPIRED: [], IDENTITY_RESTORED: ['tenant'], LOGOUT: [], TENANT_CHANGED: ['tenant'],
};

export class StateError extends Error {
  constructor(code) { super(code); this.name = 'StateError'; this.code = code; }
}
function need(condition, code) { if (!condition) throw new StateError(code); }
function keys(value, expected) {
  need(value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'object_required');
  const names = Reflect.ownKeys(value);
  need(names.length === expected.length && names.every((key) => expected.includes(key)), 'invalid_keys');
}
function identifier(value) { need(typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value), 'invalid_identity'); }
function money(value) {
  need(typeof value === 'string' && value.length <= 128 && /^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value), 'invalid_amount');
  const [whole, fraction = ''] = value.split('.');
  return { n: BigInt(whole + fraction), scale: fraction.length };
}
function compare(a, b) {
  const x = money(a); const y = money(b);
  const left = x.n * 10n ** BigInt(y.scale); const right = y.n * 10n ** BigInt(x.scale);
  return left < right ? -1 : left > right ? 1 : 0;
}
function request(value) {
  identifier(value.requestId);
  need(typeof value.fingerprint === 'string' && /^[0-9a-f]{64}$/.test(value.fingerprint), 'invalid_fingerprint');
  need(compare(value.maxUsd, '0') > 0 && compare(value.maxUsd, '1') <= 0, 'invalid_cap');
}
function budget(value) {
  if (value === null) return;
  keys(value, ['max_usd', 'spent_usd', 'held_usd']);
  for (const amount of Object.values(value)) if (amount !== null) money(amount);
}
function budgetProblem(current) {
  const b = current.budget;
  if (!b || b.max_usd === null) return false;
  if (compare(b.max_usd, '0') <= 0 || compare(b.max_usd, current.maxUsd) > 0) return true;
  if (b.spent_usd === null || b.held_usd === null) return false;
  const values = [b.max_usd, b.spent_usd, b.held_usd].map(money);
  const scale = Math.max(...values.map((x) => x.scale));
  const [max, spent, held] = values.map((x) => x.n * 10n ** BigInt(scale - x.scale));
  return spent + held > max;
}
function knownBudget(current) { return current.budget && Object.values(current.budget).every((x) => x !== null); }
function settled(current) {
  return current && !current.uncertain && TERMINAL.has(current.status) && knownBudget(current)
    && !budgetProblem(current) && compare(current.budget.held_usd, '0') === 0;
}
function phase(state) {
  if (state.access !== 'active' || state.fault) return 'blocked';
  const c = state.current;
  if (!c) return 'idle';
  if (budgetProblem(c)) return 'blocked';
  if (c.uncertain) return 'reconciling';
  if (!c.taskId) return 'reserving';
  if (!knownBudget(c)) return 'reconciling';
  if (settled(c)) return 'terminal';
  if (TERMINAL.has(c.status) || c.status === 'frozen' || c.cancelSent) return 'reconciling';
  if (c.status === 'issued' && !c.chatSent) {
    return compare(c.budget.spent_usd, '0') === 0 && compare(c.budget.held_usd, c.budget.max_usd) === 0
      ? 'issued' : 'reconciling';
  }
  return 'running';
}
function intentId(state, kind) { return `${state.tenant}/${state.current.requestId}/${kind}`; }
function validate(state) {
  keys(state, STATE_KEYS);
  need(state.schema === 1 && Number.isSafeInteger(state.revision) && state.revision >= 0, 'invalid_revision');
  identifier(state.tenant);
  need(typeof state.online === 'boolean' && ['active', 'expired', 'closed'].includes(state.access), 'invalid_access');
  need(state.fault === null || state.fault === 'invalid_observation', 'invalid_fault');
  need(Array.isArray(state.history) && state.history.length <= MAX_REQUESTS, 'invalid_history');
  const seen = new Set();
  for (const entry of state.history) {
    keys(entry, ['requestId', 'fingerprint', 'maxUsd']); request(entry);
    need(!seen.has(entry.requestId), 'duplicate_history'); seen.add(entry.requestId);
  }
  need(state.revision >= state.history.length, 'invalid_revision');
  if (state.current === null) {
    need(state.history.length === 0 && state.lastIntent === null && state.fault === null, 'missing_current');
  } else {
    const c = state.current; keys(c, CURRENT_KEYS); request(c);
    const last = state.history.at(-1);
    need(last && ['requestId', 'fingerprint', 'maxUsd'].every((k) => last[k] === c[k]), 'history_current_mismatch');
    need(['chatSent', 'cancelSent', 'uncertain'].every((k) => typeof c[k] === 'boolean'), 'invalid_flags');
    budget(c.budget);
    if (c.taskId === null) {
      need(c.status === null && c.budget === null && !c.chatSent && !c.cancelSent, 'invalid_unbound_task');
    } else {
      identifier(c.taskId);
      need(SERVER.has(c.status) || (c.status === 'unknown' && state.fault), 'invalid_task_status');
    }
    if (state.fault) need(c.uncertain, 'invalid_fault');
    if (state.lastIntent !== null) {
      keys(state.lastIntent, ['kind', 'id']);
      need(KINDS.has(state.lastIntent.kind) && state.lastIntent.id === intentId(state, state.lastIntent.kind), 'invalid_intent');
      if (state.lastIntent.kind === 'chat') need(c.chatSent && c.taskId, 'invalid_chat_intent');
      if (state.lastIntent.kind === 'cancel') need(c.cancelSent && c.taskId, 'invalid_cancel_intent');
    }
  }
  need(state.phase === phase(state), 'invalid_phase');
  return state;
}
function finish(state, intents = [], error = null) {
  need(state.revision < Number.MAX_SAFE_INTEGER, 'revision_capacity');
  state.revision += 1; state.phase = phase(state);
  validate(state);
  return { state, intents, error };
}
function emit(state, kind) {
  const c = state.current;
  const intent = { kind, id: intentId(state, kind), tenant: state.tenant,
    requestId: c.requestId, fingerprint: c.fingerprint, taskId: c.taskId,
    maxUsd: kind === 'chat' ? c.budget.max_usd : c.maxUsd };
  state.lastIntent = { kind, id: intent.id };
  return finish(state, [intent]);
}

export function initialState(options) {
  need(options !== null && typeof options === 'object', 'object_required');
  const hasOnline = Object.hasOwn(options, 'online');
  keys(options, hasOnline ? ['tenant', 'online'] : ['tenant']);
  identifier(options.tenant); const online = hasOnline ? options.online : false;
  need(typeof online === 'boolean', 'invalid_online');
  return validate({ schema: 1, revision: 0, tenant: options.tenant, online, access: 'active',
    phase: 'idle', fault: null, history: [], current: null, lastIntent: null });
}

export function restoreState(snapshot, options) {
  keys(options, ['tenant']); identifier(options.tenant); validate(snapshot);
  need(snapshot.tenant === options.tenant, 'tenant_mismatch');
  const state = structuredClone(snapshot); state.online = false;
  if (state.access !== 'closed') state.access = 'expired';
  if (state.current && !settled(state.current)) state.current.uncertain = true;
  return finish(state).state;
}

export function reduceTask(input, event) {
  validate(input);
  need(event !== null && typeof event === 'object' && Object.hasOwn(EVENT_KEYS, event.type), 'invalid_event');
  keys(event, ['type', ...EVENT_KEYS[event.type]]);
  const state = structuredClone(input); const c = state.current;
  const refuse = (error) => ({ state, intents: [], error });
  if (event.type === 'NETWORK') {
    need(typeof event.online === 'boolean', 'invalid_online'); state.online = event.online;
    return finish(state);
  }
  if (event.type === 'FOCUS') return refuse(null);
  if (event.type === 'LOGOUT' || event.type === 'TENANT_CHANGED' || event.type === 'IDENTITY_EXPIRED') {
    if (event.type === 'TENANT_CHANGED') identifier(event.tenant);
    if (state.access !== 'closed') state.access = event.type === 'IDENTITY_EXPIRED' ? 'expired' : 'closed';
    if (c && !settled(c)) c.uncertain = true;
    return finish(state);
  }
  if (event.type === 'IDENTITY_RESTORED') {
    identifier(event.tenant);
    if (state.access !== 'expired' || event.tenant !== state.tenant) return refuse('identity_blocked');
    state.access = 'active'; return finish(state);
  }
  if (state.access !== 'active') return refuse('identity_blocked');
  if (event.type === 'SUBMIT') {
    request(event);
    if (!state.online) return refuse('offline');
    const previous = state.history.find((x) => x.requestId === event.requestId);
    if (previous) return refuse(previous.fingerprint === event.fingerprint && previous.maxUsd === event.maxUsd ? null : 'identity_conflict');
    if (!['idle', 'terminal'].includes(state.phase)) return refuse('previous_task_unsettled');
    if (state.history.length === MAX_REQUESTS) return refuse('history_capacity');
    const entry = { requestId: event.requestId, fingerprint: event.fingerprint, maxUsd: event.maxUsd };
    state.history.push(entry);
    state.current = { ...entry, taskId: null, status: null, budget: null,
      chatSent: false, cancelSent: false, uncertain: false };
    state.fault = null;
    return emit(state, 'reserve');
  }
  if (!c) return refuse('no_current_task');
  if (event.type === 'RESERVED' || event.type === 'STATUS') {
    if (event.type === 'RESERVED' && event.requestId !== c.requestId) return refuse('request_mismatch');
    if (event.type === 'STATUS' && c.taskId === null) return refuse('task_unknown');
    if (c.taskId !== null && event.taskId !== c.taskId) return refuse('task_mismatch');
    try {
      identifier(event.taskId);
      c.taskId = event.taskId;
      c.status = SERVER.has(event.status) ? event.status : 'unknown';
      need(SERVER.has(event.status), 'invalid_task_status');
      budget(event.budget); c.budget = structuredClone(event.budget);
      c.uncertain = false; state.fault = null;
    } catch (error) {
      if (!(error instanceof StateError)) throw error;
      state.fault = 'invalid_observation'; c.uncertain = true; c.budget = null;
      return finish(state, [], 'invalid_observation');
    }
    return finish(state);
  }
  if (event.type === 'RESERVE_UNKNOWN' || event.type === 'CHAT_UNKNOWN' || event.type === 'CANCEL_ACK') {
    const applies = event.type === 'RESERVE_UNKNOWN' ? c.taskId === null
      : event.type === 'CHAT_UNKNOWN' ? c.chatSent : c.cancelSent;
    if (!applies) return refuse('unexpected_ack');
    c.uncertain = true; return finish(state);
  }
  if (!state.online) return refuse('offline');
  if (event.type === 'SEND') {
    if (state.phase !== 'issued' || c.chatSent) return refuse('send_blocked');
    c.chatSent = true; return emit(state, 'chat');
  }
  if (event.type === 'CANCEL') {
    if (!c.taskId || settled(c)) return refuse('cancel_not_needed');
    if (c.cancelSent) return refuse(null);
    c.cancelSent = true; c.uncertain = true;
    return emit(state, 'cancel');
  }
  if (event.type === 'RECONCILE') {
    if (settled(c) && !state.fault) return refuse(null);
    return emit(state, c.taskId ? 'status' : 'recover-reserve');
  }
  throw new StateError('invalid_event');
}
