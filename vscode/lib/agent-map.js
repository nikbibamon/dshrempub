'use strict';

// Only execution receipts/call records enter this model. A quote's workflow_plan
// describes possible work and must never be expanded into executed nodes.
function buildAgentMap(session = {}, now = Date.now()) {
  const number = value => {
    if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value))) return null;
    const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : null;
  };
  const short = (value, max = 300) => typeof value === 'string' ? value.slice(0, max) : '—';
  const status = value => ({ active:'running', pending:'running', queued:'running', running:'running', completed:'done', settled:'done', success:'done', succeeded:'done', ok:'done', done:'done', error:'failed', failed:'failed', timed_out:'failed', cancelled:'cancelled', canceled:'cancelled', interrupted:'cancelled' }[value] || '—');
  const stamp = value => {
    if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
    const result = typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(result) ? result : null;
  };
  let count = 0;
  const metrics = data => {
    const usage = data.usage || {}, receipt = data.receipt || {}, cost = data.cost?.budget || data.cost || data.budget || {};
    let tokens = number(usage.total_tokens ?? data.tokens);
    const input = number(usage.prompt_tokens ?? data.tokens_in), output = number(usage.completion_tokens ?? data.tokens_out);
    if (tokens === null && input !== null && output !== null) tokens = input + output;
    const usd = number(cost.spent_usd ?? data.spent_usd ?? data.cost_usd);
    const tt = number(receipt.debited_micro_tvijo);
    const start = stamp(data.startedAt ?? data.started_at ?? data.created_at ?? data.created);
    const end = stamp(data.endedAt ?? data.completed_at ?? data.finished_at);
    const elapsed = number(data.duration_ms ?? data.elapsed_ms) ?? (start !== null && (end !== null || status(data.status) === 'running') ? Math.max(0, (end ?? now) - start) : null);
    return { tokens, amount: usd ?? (tt !== null ? tt / 1000000 : null), unit: usd !== null ? 'USD' : tt !== null ? 'TT' : null, elapsed };
  };
  const fmt = m => ({ tokens: m.tokens === null ? '—' : String(m.tokens), spend: m.amount === null ? '—' : (m.unit === 'USD' ? '$' : '') + m.amount.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') + (m.unit === 'TT' ? ' TT' : ''), elapsed: m.elapsed === null ? '—' : (m.elapsed / 1000).toFixed(1) + 's' });
  const receiptKeys = ['tariff_version','reserved_micro_tvijo','debited_micro_tvijo','held_micro_tvijo','released_micro_tvijo','spent_usd','held_usd','max_usd','prompt_tokens','completion_tokens','total_tokens','completeness','provider','model','outcome','request_hash','artifact_hash','attempt','role'];
  const make = (data, id, depth = 0, parentTaskId = null) => {
    count++;
    const m = metrics(data), detail = {};
    const taskId = short(data.task_id ?? data.taskId ?? (depth > 0 ? data.parent_id ?? parentTaskId : data.id));
    for (const source of [data, data.cost, data.budget, data.receipt, data.usage]) {
      if (!source || typeof source !== 'object') continue;
      for (const key of receiptKeys) if (['string','number','boolean'].includes(typeof source[key])) detail[key] = String(source[key]).slice(0, 300);
    }
    const children = [];
    if (depth < 4) {
      const branches = Array.isArray(data.agent_tree) && data.agent_tree.length ? data.agent_tree : Array.isArray(data.calls) ? data.calls : [];
      for (const [i, branch] of [...branches, ...(data.local_steps || [])].slice(0, 80).entries()) {
        if (count >= 200 || !branch || typeof branch !== 'object') break;
        children.push(make(branch, id + '/' + (branch.id || i), depth + 1, taskId));
      }
    }
    return { id, taskId, title: short(data.title ?? data.label ?? data.role ?? data.id ?? data.model_alias ?? data.model, 100), model: short(data.model_alias ?? data.model ?? data.route?.model ?? data.route), route: short(typeof data.route === 'string' ? data.route : data.route?.model ?? data.model), status: status(data.status ?? data.outcome), ...fmt(m), detail, lastMessage: short(data.last_message ?? data.content ?? data.summary), children, metrics: m };
  };
  const children = [];
  for (const [i, task] of (session.tasks || []).slice(-80).entries()) { if (count >= 200) break; if (task && typeof task === 'object') children.push(make(task, 'task/' + (task.id ?? task.task_id ?? i))); }
  const root = make({ title:session.title || 'Conversation', status:session.status, startedAt:session.startedAt, endedAt:session.endedAt }, 'request');
  root.children = children;
  if (!session.status && children.length) root.status = children.some(child => child.status === 'running') ? 'running' : children.some(child => child.status === 'failed') ? 'failed' : children.every(child => child.status === 'done') ? 'done' : children.some(child => child.status === 'cancelled') ? 'cancelled' : '—';
  // Unknown in any child keeps the aggregate unknown; never sum missing as zero.
  const aggregate = field => children.length && children.every(child => child.metrics[field] !== null) ? children.reduce((sum, child) => sum + child.metrics[field], 0) : null;
  const units = new Set(children.map(child => child.metrics.unit));
  root.metrics.tokens = aggregate('tokens'); root.metrics.amount = units.size === 1 ? aggregate('amount') : null; root.metrics.unit = units.size === 1 ? children[0].metrics.unit : null;
  Object.assign(root, fmt(root.metrics));
  root.commands = (Array.isArray(session.commands) ? session.commands : []).slice(-40).map(command => ({
    id:short(command?.id, 80), title:'run_command', ...(command?.stopRequested && !Number.isFinite(command?.endedAt) ? {stopping:true} : {}), status:status(command?.status), descendantsUnknown:['timed_out','cancelled'].includes(command?.status),
    startedAt:stamp(command?.startedAt ?? command?.started_at), endedAt:stamp(command?.endedAt ?? command?.ended_at)
  }));
  return root;
}

// This view creates DOM only: no inline script, event attributes, raw HTML, SVG,
// remote assets or model-provided attributes. Native buttons handle Enter/Space.
function renderAgentMap(document, canvas, details, model, locale = 'en', selection = 'request') {
  const ru = locale === 'ru';
  const labels = ru ? { running:'Работает', done:'Готово', failed:'Ошибка', cancelled:'Отменено', tokens:'Токены', spend:'Расход', elapsed:'Время', route:'Маршрут', task:'Задача', receipt:'Квитанция', last:'Последнее сообщение', conversation:'Разговор', empty:'Выполненных задач пока нет.', background:'Фоновые команды', command:'Команда run_command' } : { running:'Running', done:'Done', failed:'Failed', cancelled:'Cancelled', tokens:'Tokens', spend:'Spend', elapsed:'Elapsed', route:'Route', task:'Task', receipt:'Receipt', last:'Last message', conversation:'Conversation', empty:'No executed tasks yet.', background:'Background commands', command:'run_command' };
  const make = (tag, text, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; };
  canvas.replaceChildren(); details.replaceChildren();
  const buttons = [], nodes = [];
  const show = item => {
    selection = item.id; details.replaceChildren(); details.scrollTop = 0;
    for (const [index, button] of buttons.entries()) button.setAttribute('aria-pressed', String(nodes[index].id === selection));
    details.append(make('h3', item.title === 'Conversation' ? labels.conversation : item.title));
    const dl = make('dl');
    for (const [key, value] of [[labels.task,item.taskId],[labels.route,item.route],[ru ? 'Модель' : 'Model',item.model],[labels.elapsed,item.elapsed],[labels.tokens,item.tokens],[labels.spend,item.spend]]) dl.append(make('dt', key), make('dd', value));
    details.append(dl, make('h4', labels.receipt));
    const receipt = make('pre', Object.entries(item.detail).map(([key,value]) => key + ': ' + value).join('\n') || '—');
    details.append(receipt, make('h4', labels.last), make('p', item.lastMessage));
  };
  function branch(item, parentButton = null) {
    const row = make('div', undefined, 'map-branch'), button = make('button', undefined, 'map-node'); button.type = 'button';
    const state = labels[item.status] || '—';
    button.setAttribute('aria-controls', 'map-details'); button.setAttribute('aria-pressed', String(item.id === selection));
    button.setAttribute('data-status', item.status); button.setAttribute('data-map-id', item.id);
    button.append(make('strong', item.title === 'Conversation' ? labels.conversation : item.title), make('span', item.model + ' · ' + state, 'map-meta'), make('span', labels.elapsed + ' ' + item.elapsed + ' · ' + labels.tokens + ' ' + item.tokens, 'map-meta'), make('span', labels.spend + ' ' + item.spend, 'map-meta'));
    buttons.push(button); nodes.push(item);
    button.addEventListener('click', () => show(item));
    const children = make('ul', undefined, 'map-children'), childButtons = [];
    for (const child of item.children || []) { const li = make('li'); const childRow = branch(child, button); li.append(childRow.row); children.append(li); childButtons.push(childRow.button); }
    button.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowLeft') next = parentButton;
      if (event.key === 'ArrowRight') next = childButtons[0];
      if (event.key === 'ArrowDown') next = buttons[buttons.indexOf(button) + 1];
      if (event.key === 'ArrowUp') next = buttons[buttons.indexOf(button) - 1];
      if (event.key === 'Home') next = buttons[0];
      if (event.key === 'End') next = buttons.at(-1);
      if (next) { event.preventDefault(); next.focus(); }
    });
    row.append(button); if (childButtons.length) row.append(children);
    return { row, button };
  }
  canvas.append(branch(model).row);
  if (!model.children.length) canvas.append(make('p', labels.empty, 'map-empty'));
  if (Array.isArray(model.commands) && model.commands.length) {
    canvas.append(make('h3', labels.background, 'map-background-title'));
    const list = make('ul', undefined, 'map-background');
    for (const command of model.commands.slice(-40)) {
      const item = make('li', undefined, 'map-background-row');
      item.append(make('strong', labels.command), make('span', command.stopping ? (ru ? 'Остановка запрошена' : 'Stop requested') : labels[command.status] || '—', 'map-meta'));
      if (command.descendantsUnknown) item.append(make('span', ru ? 'Потомки: статус неизвестен' : 'Descendant process status unknown', 'map-meta'));
      const start = Number.isFinite(command.startedAt) ? new Date(command.startedAt).toISOString() : '—';
      const end = Number.isFinite(command.endedAt) ? new Date(command.endedAt).toISOString() : '—';
      item.append(make('span', (ru ? 'Начало ' : 'Started ') + start + ' · ' + (ru ? 'Завершение ' : 'Ended ') + end, 'map-meta'));
      list.append(item);
    }
    canvas.append(list);
  }
  show(nodes.find(item => item.id === selection) || model);
  return () => selection;
}

module.exports = { buildAgentMap, renderAgentMap };
