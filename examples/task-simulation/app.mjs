// Entirely synthetic, single-tab demonstration. No transport or durable save.
import { initialState, restoreState } from '../../src/pwa-task-state.mjs';
import { createTaskSimulation } from '../../src/pwa-task-simulation.mjs';

const el = Object.fromEntries(['phase', 'hint', 'conversation', 'message', 'primary', 'check',
  'cancel', 'restore', 'limit', 'spent', 'held', 'scenario', 'offline', 'activity']
  .map((id) => [id, document.getElementById(id)]));
const tenant = 'demo_tenant';
const server = new Map();
let ordinal = 0;
let busy = false;
let faultInjected = false;
let scenario = 'normal';
let lastAcknowledged = initialState({ tenant, online: true });
let simulation = makeSimulation(lastAcknowledged);

function log(text) {
  const item = document.createElement('li');
  item.textContent = text;
  el.activity.append(item);
  while (el.activity.children.length > 30) el.activity.firstElementChild.remove();
}
function message(label, text) {
  if (el.conversation.querySelector('.placeholder')) el.conversation.replaceChildren();
  const paragraph = document.createElement('p');
  const prefix = document.createElement('strong');
  prefix.textContent = `${label}: `;
  paragraph.append(prefix, document.createTextNode(text));
  el.conversation.append(paragraph);
}
function makeSimulation(state) {
  return createTaskSimulation({ state,
    save: async (candidate) => {
      if (scenario === 'save-failure' && !faultInjected && candidate.current?.taskId
        && candidate.current.status === 'issued') {
        faultInjected = true;
        log('The fake save failed after the reservation returned.');
        throw new Error('fake_save_failure');
      }
      lastAcknowledged = structuredClone(candidate);
    },
    perform: async (intent) => {
      let row = server.get(intent.requestId);
      if (intent.kind === 'reserve') {
        if (!row) {
          row = { id: `demo_task_${ordinal}`, status: 'issued',
            budget: { max_usd: '1', spent_usd: '0', held_usd: '1' } };
          server.set(intent.requestId, row);
          log('One fictional task was reserved.');
        }
      } else if (intent.kind === 'recover-reserve') {
        log('Looked up the original fictional reservation. No new task was created.');
      } else if (intent.kind === 'chat') {
        message('You', el.message.value);
        row.status = 'completed'; row.budget.spent_usd = '0.1'; row.budget.held_usd = '0';
        log('One simulated message was sent. Confirmation still needs a status check.');
        if (scenario === 'unknown') {
          log('The fake reply was lost after the fictional task completed.');
          throw new Error('fake_reply_unknown');
        }
        message('Scripted reply', 'Keep the original task. Check its status before starting another.');
        return { reply: 'scripted' };
      } else if (intent.kind === 'cancel') {
        if (row.status !== 'completed') { row.status = 'cancelled'; row.budget.held_usd = '0'; }
        log('Cancellation was acknowledged. Check status to confirm the outcome.');
        return { acknowledged: true };
      } else if (intent.kind === 'status') {
        log('Read the full fictional task status and budget.');
      }
      if (!row) throw new Error('fake_task_missing');
      return structuredClone(row);
    },
  });
}
function money(value) {
  if (value === null || value === undefined) return 'Unknown';
  const [whole, fraction = ''] = value.split('.');
  return `$${whole}.${fraction.padEnd(2, '0')}`;
}
function render() {
  const { state, blocked } = simulation.snapshot();
  const c = state.current;
  const terminal = state.phase === 'terminal';
  const editable = !blocked && !busy && ['idle', 'terminal'].includes(state.phase);
  const active = !blocked && !busy && state.access === 'active' && state.online;
  const copy = blocked ? ['Save outcome unknown', 'Restore the last in-memory saved copy, then recover the original task.']
    : state.phase === 'idle' ? ['Ready for a task', 'Start a task, then send one simulated message.']
    : terminal ? [c.status === 'cancelled' ? 'Cancellation confirmed' : 'Task completed', 'The full status confirmed this outcome. You can start the next task.']
    : state.phase === 'issued' ? ['Task reserved', 'Send once, or cancel this fictional task.']
    : ['Task needs confirmation', 'Check status explicitly. Starting another task stays blocked.'];
  el.phase.textContent = copy[0];
  el.hint.textContent = !state.online && !blocked ? 'Simulated offline. Reconnecting does not send or retry anything.' : copy[1];
  el.primary.textContent = editable ? (terminal ? 'Start next task' : 'Start task')
    : state.phase === 'issued' ? 'Send once' : 'Waiting for confirmation';
  el.primary.disabled = !active || !(editable || state.phase === 'issued') || (!c && !el.message.value.trim())
    || (editable && (state.history.length >= 256 || !el.message.value.trim()));
  el.check.textContent = c && !c.taskId ? 'Recover task' : 'Check status';
  el.check.disabled = !active || !c || terminal;
  el.cancel.disabled = !active || !c?.taskId || terminal || c.cancelSent;
  el.restore.hidden = !blocked; el.restore.disabled = busy;
  el.message.disabled = !editable;
  el.scenario.disabled = !editable;
  el.offline.disabled = !!blocked || busy;
  for (const [id, key] of [['limit', 'max_usd'], ['spent', 'spent_usd'], ['held', 'held_usd']]) {
    el[id].textContent = blocked ? 'Unknown' : c ? money(c.budget?.[key]) : '—';
  }
}
async function run(work) {
  if (busy) return;
  busy = true; render();
  try { await work(); }
  catch { log('The simulation is paused. Use the available recovery action.'); }
  finally { busy = false; render(); }
}
el.primary.addEventListener('click', () => {
  if (el.primary.disabled) return;
  const { state } = simulation.snapshot();
  void run(async () => {
    if (['idle', 'terminal'].includes(state.phase)) {
      scenario = el.scenario.value; faultInjected = false;
      // Clear only this demonstration's previous message display after settlement.
      const placeholder = document.createElement('p'); placeholder.className = 'placeholder';
      placeholder.textContent = 'Your reply appears here after you send.';
      el.conversation.replaceChildren(placeholder);
      ordinal += 1;
      await simulation.dispatch({ type: 'SUBMIT', requestId: `demo_request_${ordinal}`,
        fingerprint: 'a'.repeat(64), maxUsd: '1' });
    } else if (state.phase === 'issued') await simulation.dispatch({ type: 'SEND' });
  });
});
el.check.addEventListener('click', () => {
  if (!el.check.disabled) void run(() => simulation.dispatch({ type: 'RECONCILE' }));
});
el.cancel.addEventListener('click', () => {
  if (!el.cancel.disabled) void run(() => simulation.dispatch({ type: 'CANCEL' }));
});
el.offline.addEventListener('change', () => {
  const online = !el.offline.checked;
  void run(async () => { await simulation.dispatch({ type: 'NETWORK', online });
    log(online ? 'Simulated connection restored. Nothing was replayed.' : 'Simulated connection paused.'); });
});
el.restore.addEventListener('click', () => {
  if (!simulation.snapshot().blocked || busy) return;
  void run(async () => {
    simulation = makeSimulation(restoreState(lastAcknowledged, { tenant }));
    // Explicit synthetic identity confirmation, not evidence of real authentication.
    await simulation.dispatch({ type: 'IDENTITY_RESTORED', tenant });
    await simulation.dispatch({ type: 'NETWORK', online: !el.offline.checked });
    log('Restored the last in-memory copy. Recover the original task explicitly.');
  });
});
el.message.addEventListener('input', render);
render();
