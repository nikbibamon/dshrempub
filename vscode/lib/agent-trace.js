'use strict';
const {createHash} = require('node:crypto');

// Visible run trace: what the agent is doing, in the language of the request.
// Rows are display data built from observed events. They never feed back into
// the model, and the receipt remains the only record of verification.

const bytes = text => Buffer.byteLength(String(text), 'utf8');
const clean = (value, limit) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, limit) : '';
const oneLine = (value, limit) => clean(value, limit * 2).replace(/\s+/g, ' ').slice(0, limit);

// The language of the user's own words decides the language of the run output.
// Paths and commands are mostly Latin, so a few Cyrillic letters are decisive.
function textLocale(text) {
  const value = String(text || '');
  if ((value.match(/[а-яё]/giu) || []).length >= 3) return 'ru';
  if ((value.replace(/[`'"][^`'"]*[`'"]/g, ' ').match(/[a-z]/gi) || []).length >= 12) return 'en';
  return null;
}

const COPY = {
  en: {read:'Read', lines:'lines', list:'List', search:'Search', in:'in', run:'Run', write:'Write', edit:'Edit', symbols:'Symbols', definition:'Definition', references:'References', buffers:'Check editor buffers', tools:'Check available tools', wiki:'Knowledge search', wikiCtx:'Open knowledge article', catalog:'Catalog search', catalogGet:'Open catalog entry', review:'Ask for review:', refused:'refused', failed:'failed', timeout:'timed out', cancelled:'cancelled', matches:'matches', noMatches:'no matches', entries:'entries', saved:'saved', unchanged:'no change', created:'created', exit:'exit', outputLines:'output lines', truncated:'truncated', of:'of', trace:'Work log', steps:'steps', step:'step', receipt:'Task receipt', thinking:'Model is thinking', notice:'Note'},
  ru: {read:'Читаю', lines:'строки', list:'Смотрю папку', search:'Ищу', in:'в', run:'Выполняю', write:'Записываю', edit:'Правлю', symbols:'Символы', definition:'Определение', references:'Ссылки', buffers:'Проверяю буферы редактора', tools:'Проверяю доступные инструменты', wiki:'Ищу в базе знаний', wikiCtx:'Открываю статью базы знаний', catalog:'Ищу в каталоге', catalogGet:'Открываю запись каталога', review:'Прошу ревью:', refused:'отклонено', failed:'ошибка', timeout:'тайм-аут', cancelled:'отменено', matches:'совпадений', noMatches:'ничего не найдено', entries:'элементов', saved:'сохранено', unchanged:'без изменений', created:'создан', exit:'код', outputLines:'строк вывода', truncated:'обрезано', of:'из', trace:'Ход работы', steps:'шагов', step:'шаг', receipt:'Квитанция задачи', thinking:'Модель думает', notice:'Заметка'}
};
const copy = locale => COPY[locale === 'ru' ? 'ru' : 'en'];
const FORMS = {
  lines:{en:['line','lines'], ru:['строка','строки','строк']},
  outputLines:{en:['output line','output lines'], ru:['строка вывода','строки вывода','строк вывода']},
  matches:{en:['match','matches'], ru:['совпадение','совпадения','совпадений']},
  entries:{en:['entry','entries'], ru:['элемент','элемента','элементов']},
  steps:{en:['step','steps'], ru:['шаг','шага','шагов']}
};
// Russian numerals agree with the noun: 1 строка, 2 строки, 5 строк, 11 строк.
function count(n, kind, locale) {
  const forms = FORMS[kind][locale === 'ru' ? 'ru' : 'en'];
  if (locale !== 'ru') return n + ' ' + forms[n === 1 ? 0 : 1];
  const m10 = n % 10, m100 = n % 100;
  return n + ' ' + forms[m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 1 : 2];
}

function actionView(action = {}, locale = 'en') {
  const c = copy(locale), p = oneLine(action.path, 160);
  switch (action.tool) {
    case 'read_file': {
      const range = Number.isSafeInteger(action.start) || Number.isSafeInteger(action.end) ? ' · ' + c.lines + ' ' + (action.start || 1) + '–' + (action.end || '…') : '';
      return {icon:'📄', title:c.read, target:p + range};
    }
    case 'list_dir': return {icon:'📁', title:c.list, target:p || '.'};
    case 'search': return {icon:'🔎', title:c.search, target:'«' + oneLine(action.query, 120) + '»' + (p && p !== '.' ? ' ' + c.in + ' ' + p : '')};
    case 'run_command': return {icon:'▶', title:c.run, target:oneLine(action.command, 400), code:true};
    case 'write_file': return {icon:'✏️', title:c.write, target:p};
    case 'replace_in_file': return {icon:'✏️', title:c.edit, target:p};
    case 'code_intelligence': return {icon:'🧭', title:c[action.operation] || 'code_intelligence', target:p + (Number.isSafeInteger(action.line) ? ':' + action.line : '')};
    case 'plan_inspect': return {icon:'🧭', title:c.buffers, target:oneLine(action.operation, 40)};
    case 'agent_capabilities': return {icon:'⚙', title:c.tools, target:''};
    case 'wiki_search': return {icon:'📚', title:c.wiki, target:'«' + oneLine(action.query, 120) + '»'};
    case 'wiki_context': return {icon:'📚', title:c.wikiCtx, target:oneLine(action.key, 120)};
    case 'catalog_search': return {icon:'📚', title:c.catalog, target:'«' + oneLine(action.query, 120) + '»'};
    case 'catalog_get': return {icon:'📚', title:c.catalogGet, target:oneLine(action.slug, 120)};
    case 'agent_review': return {icon:'👥', title:c.review, target:oneLine(action.agent, 40)};
    default: return {icon:'•', title:oneLine(action.tool, 60) || '?', target:p};
  }
}

const lineCount = text => typeof text === 'string' && text ? text.replace(/\n$/, '').split('\n').length : 0;
// A bounded excerpt for the expandable output: the tail of a command is where
// errors and test summaries are, the head of a file read is what was asked for.
function excerpt(text, {tail = false, maxLines = 30, maxChars = 3000} = {}) {
  if (typeof text !== 'string' || !text.trim()) return '';
  let lines = text.replace(/\n$/, '').split('\n').map(line => line.length > 300 ? line.slice(0, 300) + '…' : line);
  if (lines.length > maxLines) lines = tail ? ['…', ...lines.slice(-maxLines)] : [...lines.slice(0, maxLines), '…'];
  const joined = lines.join('\n');
  return joined.length > maxChars ? (tail ? '…' + joined.slice(-maxChars) : joined.slice(0, maxChars) + '…') : joined;
}

function resultView(action = {}, result = {}, locale = 'en') {
  const c = copy(locale);
  if (result.ok === false) {
    const reason = oneLine(result.error || result.reason || '', 240);
    if (action.tool === 'run_command' && Number.isInteger(result.exitCode)) {
      const out = [result.stdout, result.stderr].filter(x => typeof x === 'string' && x.trim()).join('\n');
      return {ok:false, text:c.exit + ' ' + result.exitCode + (result.timedOut ? ' · ' + c.timeout : '') + (result.cancelled ? ' · ' + c.cancelled : ''), output:excerpt(out, {tail:true})};
    }
    return {ok:false, text:(result.refused ? c.refused : c.failed) + (reason ? ': ' + reason : '')};
  }
  switch (action.tool) {
    case 'run_command': {
      const out = [result.stdout, result.stderr].filter(x => typeof x === 'string' && x.trim()).join('\n');
      const n = lineCount(out);
      return {ok:true, text:c.exit + ' ' + (Number.isInteger(result.exitCode) ? result.exitCode : '?') + (n ? ' · ' + count(n, 'outputLines', locale) : ''), output:excerpt(out, {tail:true})};
    }
    case 'read_file': {
      const n = lineCount(result.content);
      return {ok:true, text:count(n, 'lines', locale) + (result.truncated ? ' · ' + c.truncated : ''), output:''};
    }
    case 'search': {
      const out = typeof result.output === 'string' ? result.output : Array.isArray(result.matches) ? result.matches.map(m => typeof m === 'string' ? m : JSON.stringify(m)).join('\n') : '';
      const n = lineCount(out);
      return {ok:true, text:n ? count(n, 'matches', locale) : c.noMatches, output:excerpt(out, {maxLines:20})};
    }
    case 'list_dir': {
      const entries = Array.isArray(result.entries) ? result.entries : [];
      return {ok:true, text:count(entries.length, 'entries', locale), output:excerpt(entries.slice(0, 40).join('\n'), {maxLines:40})};
    }
    case 'write_file': case 'replace_in_file':
      return {ok:true, text:result.unchanged ? c.unchanged : result.created ? c.created : c.saved, output:excerpt([result.lint_feedback, result.diagnostics_feedback].filter(Boolean).join('\n'), {maxLines:12})};
    default: return {ok:true, text:'', output:''};
  }
}

// One display row per tool step. Thought is the model's own short note about
// why it takes the step; it is shown as narration, not as evidence.
function eventRow(event = {}, locale = 'en') {
  const action = event.action || {};
  const row = {step:Number.isSafeInteger(event.step) ? event.step : null, thought:clean(action.thought, 600), ...actionView(action, locale)};
  if (event.type === 'result') {
    const view = resultView(action, event.result || {}, locale);
    row.status = view.ok ? 'ok' : 'bad'; row.result = view.text; row.output = view.output;
  } else row.status = 'running';
  return row;
}

// Persisted history is bounded: the newest rows win, outputs go first.
function boundTrace(rows, {maxRows = 80, maxBytes = 48000} = {}) {
  let list = (Array.isArray(rows) ? rows : []).filter(row => row && typeof row === 'object').slice(-maxRows).map(row => ({...row}));
  for (const row of list) if (row.status === 'running') row.status = 'stopped';
  const size = () => bytes(JSON.stringify(list));
  for (let i = 0; i < list.length && size() > maxBytes; i++) list[i].output = '';
  while (list.length > 1 && size() > maxBytes) list.shift();
  return list;
}

// JSON-preserving shrink for tool results sent to the model. Long strings keep
// their head and tail with an explicit marker; long arrays keep their first
// items. The result stays valid JSON, which a cut through raw text does not.
function shrinkJson(value, maxBytes) {
  const original = JSON.stringify(value);
  if (bytes(original) <= maxBytes) return original;
  const digest = createHash('sha256').update(original).digest('hex').slice(0, 16);
  const walk = (node, limit, items) => {
    if (typeof node === 'string') {
      if (node.length <= limit) return node;
      const head = Math.ceil(limit * 0.65), tail = Math.max(0, limit - head);
      return node.slice(0, head) + '\n…[' + (node.length - head - tail) + ' chars omitted to fit the request; narrow the command or read a smaller range]…\n' + (tail ? node.slice(-tail) : '');
    }
    if (Array.isArray(node)) {
      const kept = node.slice(0, items).map(item => walk(item, limit, items));
      if (node.length > items) kept.push('…[' + (node.length - items) + ' more items omitted]');
      return kept;
    }
    if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, walk(item, limit, items)]));
    return node;
  };
  for (const [limit, items] of [[12000, 200], [6000, 120], [3000, 60], [1500, 30], [700, 15], [300, 8], [120, 4]]) {
    const candidate = walk(value, limit, items);
    candidate && typeof candidate === 'object' && !Array.isArray(candidate) && (candidate.tvijo_truncated = {original_bytes:bytes(original), sha256_prefix:digest});
    const text = JSON.stringify(candidate);
    if (bytes(text) <= maxBytes) return text;
  }
  return JSON.stringify({ok:typeof value?.ok === 'boolean' ? value.ok : null, tvijo_truncated:{original_bytes:bytes(original), sha256_prefix:digest}, note:'Tool result omitted to fit the request; narrow the command or read a smaller range.'});
}

// Rendered inside the webview by source text (like renderMarkdown), so it uses
// only createElement/append/textContent/className/setAttribute.
function renderTrace(document, container, rows, labels = {}, {live = false, isOpen = null, onToggle = null} = {}) {
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue;
    if (row.thought) {
      const thought = document.createElement('div'); thought.className = 'trace-thought';
      thought.textContent = row.thought; container.append(thought);
    }
    if (row.kind === 'notice') {
      const note = document.createElement('div'); note.className = 'trace-note';
      note.textContent = String(row.text || ''); container.append(note); continue;
    }
    const line = document.createElement(row.output ? 'details' : 'div');
    line.className = 'trace-row ' + (row.status === 'bad' ? 'bad' : row.status === 'running' ? 'running' : row.status === 'stopped' ? 'stopped' : 'ok');
    const head = document.createElement(row.output ? 'summary' : 'div'); head.className = 'trace-head';
    const icon = document.createElement('span'); icon.className = 'trace-icon'; icon.textContent = row.status === 'running' && live ? '◌' : row.status === 'bad' ? '✗' : row.status === 'stopped' ? '·' : String(row.icon || '•');
    const title = document.createElement('span'); title.className = 'trace-title'; title.textContent = String(row.title || '');
    const target = document.createElement(row.code ? 'code' : 'span'); target.className = 'trace-target'; target.textContent = String(row.target || '');
    head.append(icon, title, target);
    if (row.result) { const result = document.createElement('span'); result.className = 'trace-result'; result.textContent = '· ' + String(row.result); head.append(result); }
    line.append(head);
    if (row.output) {
      const output = document.createElement('pre'); output.className = 'trace-output'; output.textContent = String(row.output); line.append(output);
      // Live repaints rebuild the block; keep what the user opened open.
      if (isOpen && isOpen(row)) line.open = true;
      if (onToggle) line.addEventListener('toggle', () => onToggle(row, line.open === true));
    }
    container.append(line);
  }
  if (live && labels.waiting) {
    const wait = document.createElement('div'); wait.className = 'trace-row running trace-waiting';
    wait.textContent = '◌ ' + labels.waiting; container.append(wait);
  }
}

const TRACE_CSS = `
.run-trace{margin:0 0 8px;font-size:12px;line-height:1.45}.run-trace>summary{cursor:pointer;color:var(--muted);font-size:11px;list-style-position:inside}
.run-trace-body{padding:4px 0 2px 2px;border-left:2px solid var(--border);margin:4px 0 0 4px;padding-left:8px}
.trace-thought{color:var(--muted);font-style:italic;margin:6px 0 2px;white-space:pre-wrap;overflow-wrap:anywhere}
.trace-row{margin:1px 0;min-width:0}.trace-row>summary{cursor:pointer;list-style:none}.trace-row>summary::-webkit-details-marker{display:none}
.trace-head{display:flex;gap:6px;align-items:baseline;min-width:0;overflow:hidden}
.trace-icon{flex:0 0 auto;width:16px;text-align:center}.trace-title{flex:0 0 auto;color:var(--text)}
.trace-target{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)}
code.trace-target{font-family:var(--vscode-editor-font-family,monospace);font-size:11px}
.trace-result{flex:0 0 auto;color:var(--muted);font-size:11px;white-space:nowrap}
.trace-row.bad .trace-icon,.trace-row.bad .trace-result{color:var(--bad,#f14c4c)}
.trace-row.running .trace-icon{color:var(--accent)}
.trace-output{margin:3px 0 6px 22px;padding:6px 8px;max-height:220px;overflow:auto;font-size:11px;background:var(--raised);border:1px solid var(--border);border-radius:5px;white-space:pre-wrap;overflow-wrap:anywhere}
.trace-note{color:var(--muted);font-size:11px;margin:3px 0 3px 22px}
.trace-waiting{color:var(--muted)}
.message.live-run .role{color:var(--muted)}
.task-receipt{margin-top:8px;font-size:11px;color:var(--muted)}.task-receipt>summary{cursor:pointer}.task-receipt pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:10px;margin:4px 0 0;padding:6px;border:1px solid var(--border);border-radius:5px;max-height:260px;overflow:auto}
`;

module.exports = {count, textLocale, actionView, resultView, eventRow, boundTrace, shrinkJson, renderTrace, excerpt, TRACE_CSS, COPY};
