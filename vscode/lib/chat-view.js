'use strict';

const { randomBytes } = require('node:crypto');
const { THEME_CSS, COPY } = require('./product-theme');

function chatHtml(webview) {
  const nonce = randomBytes(16).toString('base64');
  const csp = `default-src 'none'; img-src data:; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;
  return `<!doctype html>
<html lang="en"><head><title>Tvijo DSHREM</title><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style nonce="${nonce}">
${THEME_CSS}
</style></head><body>
<header><strong id="brand"><span id="brand-mark" aria-hidden="true">›_</span>DSHREM</strong><button id="lang" class="mini-select" type="button" title="Switch language">EN / RU</button><button id="theme" class="icon" type="button" title="Toggle light/dark theme" aria-label="Toggle light/dark theme">◐</button><button id="signin" type="button">Sign in</button><button id="new" class="icon" type="button" title="New session" aria-label="New session">＋</button><button id="commands" class="icon" type="button" title="Commands" aria-label="Commands">···</button><button id="settings" class="icon" type="button" title="Settings" aria-label="Settings">⚙</button></header>
<nav aria-label="Workspace"><button id="tab-chat" type="button" aria-selected="true">Chat</button><button id="tab-context" type="button" aria-selected="false">Context</button><button id="tab-usage" type="button" aria-selected="false">Usage</button><button id="tab-terminal" type="button" aria-selected="false">Terminal</button></nav>
<main id="messages" aria-live="polite"></main><section id="context-panel" aria-label="Context"><div id="context-items"></div><div id="context-summary"></div><div id="usage-items" hidden></div><div id="terminal-info" hidden></div><button id="clear-context" type="button">Clear context</button></section><div id="state" role="status">Connecting…</div>
<div id="activity" role="status" aria-live="polite"><span id="activity-spin" class="spin">✻</span><span id="activity-label" class="label"></span><span id="activity-detail" class="detail"></span><span id="activity-time" class="time"></span></div>
<div id="agent-log" role="log" aria-live="polite"></div>
<div class="product-links"><button id="product-guide" type="button">Tvijo AI guide</button><button id="connections" type="button">Connections</button><button id="tasks" type="button">Server task history</button><button id="context-preview" type="button">Preview context</button><button id="quick-edit" type="button">Quick edit</button></div>
<p id="history-note" class="mini-select">Chat stays in this workspace and is separate from Copilot. Submitted tasks also appear in server history.</p>
<div id="account-status" role="status"><span class="dot">●</span><span id="connection-label">Limited free preview</span><span id="budget"></span></div>
<form id="form"><div id="attachments" aria-label="Attached context"></div><p id="ocrnote" hidden></p><textarea id="question" aria-label="Ask Tvijo" placeholder="Ask about your project…" maxlength="20000"></textarea><input id="file" type="file" multiple hidden><div class="composer-actions"><button id="plus" class="icon" type="button" title="Add context" aria-label="Add context" aria-haspopup="menu" aria-expanded="false">＋</button><button id="mode" class="mini-select" type="button" title="Mode">Chat</button><button id="workflow" class="mini-select" type="button" title="Model and method" aria-haspopup="menu" aria-expanded="false"><span>◆</span><span id="workflow-label">Model &amp; method</span></button><span class="spacer"></span><button id="cancel" class="mini-select" type="button" title="Cancel task" hidden>Cancel</button><button id="send" type="submit" title="Send message" aria-label="Send message">➤</button></div></form>
<div id="plus-menu" role="menu" aria-label="Add context"><button id="attach" type="button" role="menuitem">Add file…</button><button id="workspace" type="button" role="menuitem">Choose workspace file…</button><button id="selection" type="button" role="menuitem">Use editor selection</button><button id="path" type="button" role="menuitem">Paste workspace path…</button></div>
<div id="options-menu" role="menu" aria-label="Model and method"></div>
<div id="notice" role="alert"><p id="notice-text"></p><button id="notice-action" type="button">Resolve task</button></div>
<script nonce="${nonce}">
  const COPY = ${JSON.stringify(COPY)};
  const vscode = acquireVsCodeApi();
  const messages = document.getElementById('messages');
  const state = document.getElementById('state');
  const send = document.getElementById('send');
  const question = document.getElementById('question');
  const newConversation = document.getElementById('new');
  const attached = document.getElementById('attachments');
  const fileInput = document.getElementById('file');
  const plusMenu = document.getElementById('plus-menu');
  const optionsMenu = document.getElementById('options-menu');
  const modeButton = document.getElementById('mode');
  const agentLog = document.getElementById('agent-log');
  let uiMode = 'chat';
  const notice = document.getElementById('notice');
  const noticeText = document.getElementById('notice-text');
  const noticeActionButton = document.getElementById('notice-action');
  const activity = document.getElementById('activity');
  const activitySpin = document.getElementById('activity-spin');
  const activityLabel = document.getElementById('activity-label');
  const activityDetail = document.getElementById('activity-detail');
  const activityTime = document.getElementById('activity-time');
  let optionState = null;
  let currentNotice = null;
  let lastContext = null;
  let activityTimer = null;
  let activityStarted = 0;
  let spinIndex = 0;
  let locale = 'en';
  let submitting = false;
  let running = false;
  let preparing = false;
  let uploading = false;
  let attachmentCount = 0;
  let lastMessages = null;
  let lastUsage = null;
  let lastUsageScope = null;
  let pending = false;
  let scopeKey = null;
  const queue = [];
  const saved = vscode.getState?.();
  const drafts = saved?.drafts && typeof saved.drafts === 'object' ? { ...saved.drafts } : {};
  const legacyDraft = typeof saved?.legacyDraft === 'string' ? saved.legacyDraft : typeof saved?.draft === 'string' ? saved.draft : '';
  locale = saved?.locale === 'ru' ? 'ru' : 'en';
  uiMode = ['chat','agent','plan'].includes(saved?.mode) ? saved.mode : 'chat';
  let theme = ['dark','light','system'].includes(saved?.theme) ? saved.theme : 'system';
  document.body.setAttribute('data-theme', theme);
  const t = key => COPY[locale][key] || COPY.en[key] || key;
  const saveState = () => { if (scopeKey) drafts[scopeKey] = question.value; vscode.setState?.({drafts,legacyDraft,locale,theme,mode:uiMode}); };
  const post = message => vscode.postMessage({ ...message, scopeKey });
  const saveDraft = () => saveState();
  const setTimer = typeof setInterval === 'function' ? setInterval : () => null;
  const clearTimer = typeof clearInterval === 'function' ? clearInterval : () => {};
  const modelLabel = item => item.id === 'auto' ? t('modelAuto') : item.id === 'coding' ? t('modelCoding') : (item.name || item.id);
  const modelHint = item => item.id === 'auto' ? t('modelAutoHint') : item.id === 'coding' ? t('modelCodingHint') : t('activatedRoute');
  function updateWorkflowLabel() {
    if (!optionState) { document.getElementById('workflow-label').textContent = t('options'); return; }
    const model = (optionState.models || []).find(item => item.id === optionState.model) || { id: optionState.model, name: optionState.model };
    const method = { 'evidence-first': 'methodEvidence', 'plan-check': 'methodPlan', 'peer-review': 'methodPeer' }[optionState.reasoningMethod];
    document.getElementById('workflow-label').textContent = modelLabel(model) + (method ? ' · ' + t(method) : '');
  }
  function closeOptions() { optionsMenu.className = ''; document.getElementById('workflow').setAttribute('aria-expanded', 'false'); }
  const ACTIVITY = ['✻','✶','✷','✸','✹','✺','✹','✸','✷','✶'];
  function stopActivity() {
    if (activityTimer) clearTimer(activityTimer);
    activityTimer = null; activity.className = '';
  }
  function startActivity(stage, detail) {
    if (stage === 'done') { stopActivity(); return; }
    const label = { prepare:'activityPrepare', scan:'activityScan', context:'activityScan', grant:'activityGrant', quote:'activityQuote', model:'activityModel', settle:'activitySettle' }[stage];
    activityStarted = Date.now(); spinIndex = 0;
    activityLabel.textContent = label ? t(label) : (stage || '');
    activityDetail.textContent = detail || '';
    activityTime.textContent = '0s';
    activity.className = 'visible';
    if (activityTimer) clearTimer(activityTimer);
    activityTimer = setTimer(() => {
      activitySpin.textContent = ACTIVITY[spinIndex++ % ACTIVITY.length];
      activityTime.textContent = Math.max(0, Math.round((Date.now() - activityStarted) / 1000)) + 's';
    }, 120);
  }
  function renderContext(value) {
    lastContext = value || null;
    const node = document.getElementById('context-summary');
    if (!value) { node.textContent = ''; return; }
    const mode = value.mode === 'on' ? t('contextOn') : value.mode === 'off' ? t('contextOff') : t('contextAsk');
    const last = value.last ? (value.last.root + ' · ' + value.last.files + ' ' + (locale === 'ru' ? 'файлов' : 'files') + ' · ' + Math.ceil(value.last.bytes / 1024) + ' KiB') : '';
    node.textContent = t('contextSummary') + ': ' + mode + (last ? ' — ' + last : '') + (value.mode === 'off' ? ' — ' + t('contextOffHint') : '');
  }
  function renderOptions(options) {
    optionState = options && Array.isArray(options.models) ? options : null;
    optionsMenu.replaceChildren();
    updateWorkflowLabel();
    if (!optionState) return;
    const group = (titleKey, rows) => {
      if (!rows.length) return;
      const heading = document.createElement('h4'); heading.textContent = t(titleKey); optionsMenu.append(heading);
      for (const row of rows) {
        const button = document.createElement('button'); button.type = 'button';
        button.setAttribute('role', 'menuitemradio'); button.setAttribute('aria-checked', String(row.value === row.current));
        const name = document.createElement('span'); name.textContent = row.label;
        const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = row.hint;
        button.append(name, hint);
        button.addEventListener('click', () => { closeOptions(); post({ type: 'setOption', key: row.key, value: row.value }); });
        optionsMenu.append(button);
      }
    };
    group('modelSection', optionState.models.map(item => ({ key: 'model', value: item.id, current: optionState.model, label: modelLabel(item), hint: modelHint(item) })));
    group('agentModelSection', optionState.models.filter(item => item.id !== 'auto').map(item => ({ key: 'agentModel', value: item.id, current: optionState.agentModel, label: modelLabel(item), hint: modelHint(item) })));
    group('workflowSection', [
      { key: 'agentMode', value: 'single', current: optionState.agentMode, label: t('workflowSingle'), hint: t('workflowSingleHint') },
      { key: 'agentMode', value: 'auto', current: optionState.agentMode, label: t('workflowAuto'), hint: t('workflowAutoHint') },
      { key: 'agentMode', value: 'council', current: optionState.agentMode, label: t('workflowCouncil'), hint: t('workflowCouncilHint') }
    ]);
    group('methodSection', [
      { key: 'reasoningMethod', value: 'evidence-first', current: optionState.reasoningMethod, label: t('methodEvidence'), hint: t('methodEvidenceHint') },
      { key: 'reasoningMethod', value: 'plan-check', current: optionState.reasoningMethod, label: t('methodPlan'), hint: t('methodPlanHint') },
      { key: 'reasoningMethod', value: 'peer-review', current: optionState.reasoningMethod, label: t('methodPeer'), hint: t('methodPeerHint') }
    ]);
    group('contextSection', [
      { key: 'workspaceContext', value: 'ask', current: optionState.contextMode, label: t('contextAsk'), hint: '' },
      { key: 'workspaceContext', value: 'on', current: optionState.contextMode, label: t('contextOn'), hint: '' },
      { key: 'workspaceContext', value: 'off', current: optionState.contextMode, label: t('contextOff'), hint: '' }
    ]);
    group('applySection', [
      { key: 'autoApply', value: false, current: optionState.autoApply, label: t('autoApplyOff'), hint: '' },
      { key: 'autoApply', value: true, current: optionState.autoApply, label: t('autoApplyOn'), hint: '' }
    ]);
  }
  function showNotice(text, action) {
    currentNotice = text ? { text, action: action || null } : null;
    noticeText.textContent = text || '';
    noticeActionButton.hidden = !action; noticeActionButton.textContent = action === 'account' ? t('signIn') : action === 'context' ? t('contextPreview') : t('resolvePending');
    notice.className = text ? 'visible' : '';
  }
  function updateMode() {
    const label = uiMode === 'plan' ? t('modePlan') : uiMode === 'agent' ? t('modeAgent') : t('modeChat');
    modeButton.textContent = label;
    modeButton.className = 'mini-select ' + (uiMode === 'chat' ? '' : uiMode);
    modeButton.title = t('mode') + ': ' + label;
    modeButton.setAttribute('aria-label', t('mode') + ': ' + label);
    question.placeholder = uiMode === 'chat' ? t('ask') : t('mentionHint');
  }
  function agentLine(tag, detail, kind) {
    const line = document.createElement('div'); line.className = 'line ' + (kind || '');
    const label = document.createElement('span'); label.className = 'tag'; label.textContent = tag;
    const text = document.createElement('span'); text.className = 'detail'; text.textContent = detail || '';
    line.append(label, text); agentLog.append(line);
    agentLog.scrollTop = agentLog.scrollHeight;
  }
  function renderAgentEvent(event) {
    if (!event || typeof event !== 'object') return;
    if (event.type === 'start') {
      agentLog.replaceChildren(); agentLog.className = 'visible';
      agentLine(t('agentTitle'), (event.planMode ? t('modePlan') : t('modeAgent')) + ' · ' + t('agentStep') + ' 0/' + event.maxSteps + ' · $' + event.budgetUsd, 'head');
      agentLine(t('agentTitle'), event.goal || '', '');
      return;
    }
    if (event.type === 'step') { agentLine(t('agentStep') + ' ' + event.step + '/' + event.maxSteps, '$' + Number(event.spent || 0).toFixed(4), ''); return; }
    if (event.type === 'action') {
      const action = event.action || {};
      const detail = action.tool === 'run_command' ? action.command : action.tool === 'search' ? action.query : (action.path || '');
      agentLine(action.tool || t('agentTitle'), detail, '');
      return;
    }
    if (event.type === 'result') {
      const result = event.result || {};
      const kind = result.ok === false ? 'bad' : 'ok';
      const detail = result.refused ? t('agentRefused') : result.error ? result.error : result.exitCode !== undefined ? 'exit ' + result.exitCode + (result.timedOut ? ' · timeout' : '') : (result.path || (result.entries ? result.entries.slice(0, 6).join(', ') : ''));
      agentLine(result.ok === false ? (result.refused ? t('agentRefused') : t('agentError')) : t('agentOk'), detail, kind);
      return;
    }
    if (event.type === 'final') { agentLine(t('agentFinal'), (event.text || '').slice(0, 300), 'ok'); }
  }
  function updateThemeButton() {
    const label = t(theme === 'dark' ? 'themeDark' : theme === 'light' ? 'themeLight' : 'themeSystem');
    document.getElementById('theme').textContent = theme === 'light' ? '☼' : '◐';
    document.getElementById('theme').title = t('theme') + ': ' + label;
    document.getElementById('theme').setAttribute('aria-label', t('theme') + ': ' + label);
  }
  function setLocale(next) {
    locale = next; document.documentElement.lang = locale;
    document.getElementById('lang').textContent = locale === 'en' ? 'EN / RU' : 'RU / EN';
    document.getElementById('tab-chat').textContent = t('chat');
    document.getElementById('tab-context').textContent = t('context');
    document.getElementById('tab-usage').textContent = locale === 'ru' ? 'Расходы' : 'Usage';
    document.getElementById('product-guide').textContent = locale === 'ru' ? 'Идея Tvijo AI' : 'Tvijo AI guide';
    document.getElementById('connections').textContent = locale === 'ru' ? 'Подключения' : 'Connections';
    document.getElementById('tasks').textContent = locale === 'ru' ? 'История задач на сервере' : 'Server task history';
    document.getElementById('context-preview').textContent = t('contextPreview');
    document.getElementById('quick-edit').textContent = t('quickEdit');
    if (lastUsage) renderUsage(lastUsage);
    document.getElementById('tab-terminal').textContent = t('terminal');
    document.getElementById('signin').textContent = t(lastSignedIn ? 'signedIn' : 'signIn');
    document.getElementById('new').title = t('new');
    document.getElementById('settings').title = t('settings');
    if (uiMode === 'chat') document.getElementById('question').placeholder = t('ask');
    document.getElementById('question').setAttribute('aria-label', t('ask'));
    document.getElementById('send').title = t('send');
    document.getElementById('send').setAttribute('aria-label', t('send'));
    document.getElementById('plus').title = t('plus');
    document.getElementById('plus').setAttribute('aria-label', t('plus'));
    document.getElementById('attach').textContent = t('addFile');
    document.getElementById('workspace').textContent = t('workspace');
    document.getElementById('selection').textContent = t('selection');
    document.getElementById('path').textContent = t('path');
    document.getElementById('clear-context').textContent = t('clear');
    document.getElementById('workflow').title = t('options'); document.getElementById('workflow').setAttribute('aria-label', t('options'));
    updateMode();
    updateWorkflowLabel();
    if (currentNotice) showNotice(currentNotice.text, currentNotice.action);
    if (optionState) renderOptions(optionState);
    if (lastContext) renderContext(lastContext);
    updateThemeButton();
    document.getElementById('ocrnote').textContent = t('imageNote');
    document.getElementById('context-panel').setAttribute('aria-label', t('context'));
    if (!running && !preparing && !submitting) state.textContent = lastStatus || t('ready');
    const previous = lastMessages ? JSON.parse(lastMessages) : [];
    lastMessages = null; render(previous); renderBudget(lastAccount);
    renderAttachments(lastAttachments);
    saveState();
  }
  let lastSignedIn = false;
  let lastStatus = '';
  let lastAttachments = [];
  let lastAccount = null;
  function setTheme(next) { theme = next; document.body.setAttribute('data-theme', theme); updateThemeButton(); saveState(); }
  function renderBudget(account) {
    const budget = document.getElementById('budget');
    const preview = { ...(account?.budget || {}), ...(account?.preview || {}) };
    const values = [];
    if (Number.isFinite(preview?.tasks_remaining)) values.push(preview.tasks_remaining + ' ' + (locale === 'ru' ? 'задач' : 'tasks'));
    if (Number.isFinite(preview?.tokens_remaining)) values.push(preview.tokens_remaining.toLocaleString() + ' ' + (locale === 'ru' ? 'токенов' : 'tokens'));
    if (preview?.remaining_usd !== undefined && Number.isFinite(Number(preview.remaining_usd))) values.push('$' + Number(preview.remaining_usd).toFixed(3));
    budget.textContent = values.join(' · ');
    document.getElementById('connection-label').textContent = lastSignedIn ? t('ready') : t('limited');
  }
  function setTab(tab) {
    for (const name of ['chat','context','terminal','usage']) document.getElementById('tab-' + name).setAttribute('aria-selected', String(name === tab));
    messages.hidden = tab !== 'chat';
    document.getElementById('context-panel').className = tab === 'context' || tab === 'terminal' || tab === 'usage' ? 'visible' : '';
    document.getElementById('context-items').hidden = tab !== 'context';
    document.getElementById('usage-items').hidden = tab !== 'usage';
    document.getElementById('clear-context').hidden = tab !== 'context';
    document.getElementById('terminal-info').hidden = tab !== 'terminal';
    document.getElementById('terminal-info').textContent = t('terminalInfo');
    if (tab === 'terminal') post({type:'terminal'});
  }
  function renderUsage(value) {
    lastUsage = value;
    lastUsageScope = scopeKey;
    const box = document.getElementById('usage-items'); box.replaceChildren();
    const add = (text) => { const row = document.createElement('p'); row.textContent = text; box.append(row); };
    const ru = locale === 'ru';
    if (value.unit === 'micro_tvijo') {
      const tt = v => Number.isSafeInteger(v) && v >= 0 ? (v / 1000000).toLocaleString('en-US', { maximumFractionDigits: 6 }) : '—';
      const b = value.balance || {};
      add('Tvijo Tokens · internal service credits');
      add('Debited ' + tt(b.debited_micro_tvijo) + ' TT · held ' + tt(b.held_micro_tvijo) + ' TT · available ' + tt(b.available_micro_tvijo) + ' TT');
      add('Daily available ' + tt(b.daily_available_micro_tvijo) + ' TT');
      for (const item of value.tasks || []) {
        const r = item.receipt || {}, u = item.usage || {};
        add((item.title || item.id) + ' · ' + (item.service_id || 'Legacy service') + ' · ' + item.status);
        add('Reserved ' + tt(r.reserved_micro_tvijo) + ' TT · debited ' + tt(r.debited_micro_tvijo) + ' TT · held ' + tt(r.held_micro_tvijo) + ' TT · released ' + tt(r.released_micro_tvijo) + ' TT');
        add('Tariff ' + (r.tariff_version || 'historical / unknown') + ' · actual model tokens: in ' + (u.prompt_tokens ?? '—') + ' / out ' + (u.completion_tokens ?? '—') + ' / total ' + (u.total_tokens ?? '—') + ' (' + (u.completeness || 'unknown') + ')');
      }
      if (Array.isArray(value.events) && value.events.length) add('Service ledger events (TT):');
      const signed = v => Number.isSafeInteger(v) ? (v < 0 ? '-' : '+') + tt(Math.abs(v)) : '—';
      for (const event of value.events || []) add(String(event.id) + ' · ' + String(event.kind) + ' · task ' + (event.task || 'account') + ' · credit ' + signed(event.credit_delta) + ' TT · held ' + signed(event.held_delta) + ' TT · debit ' + signed(event.debit_delta) + ' TT · ' + (Number.isFinite(event.created) ? new Date(event.created * 1000).toISOString() : 'time unknown'));
      add('1 USD service credit = 1000 TT. 1 TT = 1000000 micro-Tvijo units. TT is not cryptocurrency or a model token. — means unknown.');
      return;
    }
    const a = value.account;
    add(ru ? 'Tvijo: личный учет' : 'Tvijo: private usage');
    add((ru ? 'Всего расход $' : 'Lifetime spend $') + a.budget.spent_usd + (ru ? ' · резерв $' : ' · held $') + a.budget.held_usd + (ru ? ' · доступно $' : ' · available $') + a.budget.remaining_usd);
    add((ru ? 'Дневной остаток сервиса: ' : 'Service daily remaining: ') + (a.budget.daily_remaining_usd === undefined ? '—' : '$' + a.budget.daily_remaining_usd));
    if (a.preview) add((ru ? 'Проба: ' : 'Preview: ') + a.preview.tasks_remaining + (ru ? ' задач · ' : ' tasks · ') + a.preview.tokens_remaining + (ru ? ' токенов' : ' tokens'));
    if (value.knowledge) add((ru ? 'Личные источники: ' : 'Private knowledge: ') + value.knowledge.indexed_files + (ru ? ' файлов · ' : ' files · ') + value.knowledge.indexed_chunks + (ru ? ' фрагментов' : ' chunks'));
    add((ru ? 'Загружено задач: ' : 'Loaded tasks: ') + value.scope.loaded_tasks + ' / ' + value.scope.total_account_tasks);
    for (const item of value.tasks) {
      add(item.title + ' · ' + item.model + ' / ' + item.mode + ' · ' + item.status);
      add((ru ? 'Токены ' : 'Tokens ') + (item.tokens ?? '—') + (ru ? ' · списано $' : ' · charged $') + item.budget.spent_usd + (ru ? ' · лимит $' : ' · cap $') + item.budget.max_usd);
      add((ru ? 'Провайдер ' : 'Provider ') + (item.provider_cost_usd === null ? '—' : '$' + item.provider_cost_usd) + (ru ? ' · сервисная разница ' : ' · service difference ') + (item.service_difference_usd === null ? '—' : '$' + item.service_difference_usd));
      for (const call of item.calls) add(call.provider + ' / ' + call.model + ' · in ' + call.tokens_in + ' / out ' + call.tokens_out + ' · ' + call.outcome);
    }
    add(ru ? 'Квота подписки и экономия кеша не измерены. — означает неизвестно.' : 'Subscription quota and cache savings are not measured. — means unknown.');
  }
  question.addEventListener('input', saveDraft);
  function controls() {
    const blocked = running || preparing || submitting || uploading;
    send.disabled = blocked || !scopeKey; newConversation.disabled = blocked || !scopeKey;
    for (const id of ['attach','workspace','selection','path','plus','workflow','mode']) document.getElementById(id).disabled = blocked;
    document.getElementById('cancel').hidden = !running;
    document.getElementById('cancel').textContent = running ? (uiMode !== 'chat' ? t('agentStop') : t('cancel')) : t('resolvePending');
    document.getElementById('cancel').title = running ? (uiMode !== 'chat' ? t('agentStop') : t('cancel')) : t('resolvePending');
    document.getElementById('clear-context').disabled = blocked;
    for (const button of attached.querySelectorAll('button')) button.disabled = blocked;
  }
  function render(items) {
    const key = JSON.stringify(items); if (key === lastMessages) return; lastMessages = key;
    messages.replaceChildren();
    if (!items.length) {
      const welcome = document.createElement('section'); welcome.className = 'welcome';
      const mark = document.createElement('div'); mark.className = 'welcome-mark'; mark.textContent = '›_';
      const title = document.createElement('strong'); title.textContent = t('title');
      const body = document.createElement('p'); body.textContent = t('intro');
      welcome.append(mark, title, body); messages.append(welcome);
    }
    for (const [index, item] of items.entries()) {
      const block = document.createElement('article');
      block.className = 'message ' + (item.role === 'assistant' ? 'assistant' : 'user');
      const role = document.createElement('div'); role.className = 'role'; role.textContent = item.role === 'assistant' ? t('assistant') : t('user');
      const content = document.createElement('div'); content.textContent = item.content || '';
      block.append(role, content); messages.append(block);
      if (item.role === 'assistant') {
        const actions = document.createElement('div'); actions.className = 'answer-actions';
        for (const [type, label] of [['copy',t('copy')],['openAnswer',t('openAnswer')]]) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
          button.addEventListener('click', () => post({type,index})); actions.append(button);
        }
        block.append(actions);
      }
    }
    messages.scrollTop = messages.scrollHeight;
  }
  function renderAttachments(items) {
    lastAttachments = items;
    attachmentCount = items.length;
    attached.replaceChildren();
    document.getElementById('ocrnote').hidden = !items.some(item => item.kind === 'image');
    const contextItems = document.getElementById('context-items'); contextItems.replaceChildren();
    if (!items.length) { const empty = document.createElement('div'); empty.textContent = t('empty'); contextItems.append(empty); }
    for (const item of items) {
      const row = document.createElement('div'); row.className = 'attachment';
      if (typeof item.preview === 'string' && (item.preview.startsWith('data:image/png;base64,') || item.preview.startsWith('data:image/jpeg;base64,'))) {
        const preview = document.createElement('img'); preview.src = item.preview; preview.alt = item.name; row.append(preview);
      }
      const label = document.createElement('div'); label.className = 'label'; label.textContent = item.name;
      const detail = document.createElement('small'); detail.textContent = (item.kind === 'image' ? t('ocr') : t('fileContext')) + ' · ' + Math.ceil(item.size / 1024) + ' KiB'; label.append(detail);
      const inspect = document.createElement('button'); inspect.type = 'button'; inspect.textContent = t('preview'); inspect.disabled = running || submitting || preparing;
      inspect.addEventListener('click', () => post({type:'previewAttachment',id:item.id})); label.append(inspect);
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.title = 'Remove ' + item.name; remove.setAttribute('aria-label', remove.title); remove.disabled = running || submitting || preparing;
      remove.addEventListener('click', () => post({type:'removeAttachment',id:item.id}));
      row.append(label, remove); attached.append(row);
      const contextRow = document.createElement('div'); contextRow.className = 'context-row';
      const contextLabel = document.createElement('span'); contextLabel.textContent = item.name;
      const removeContext = document.createElement('button'); removeContext.type = 'button'; removeContext.textContent = '×'; removeContext.title = t('remove'); removeContext.setAttribute('aria-label', t('remove') + ' ' + item.name); removeContext.addEventListener('click', () => post({type:'removeAttachment',id:item.id}));
      contextRow.append(contextLabel, removeContext); contextItems.append(contextRow);
    }
  }
  function uploadNext() {
    if (uploading || !queue.length) return;
    uploading = true; controls();
    const file = queue.shift();
    state.textContent = t('preparing');
    const reader = new FileReader();
    reader.onerror = () => { uploading = false; state.textContent = t('readError'); controls(); uploadNext(); };
    const uploadScope = scopeKey;
    reader.onload = () => { if (scopeKey !== uploadScope) return; post({type:'attach', name:file.name || 'file', base64:String(reader.result).split(',')[1] || ''}); };
    reader.readAsDataURL(file);
  }
  function addFiles(list) {
    if (running || preparing || submitting || uploading) { state.textContent = t('wait'); return; }
    for (const file of Array.from(list)) {
      if (!file.size || file.size > 2 * 1024 * 1024) { state.textContent = t('tooLarge'); continue; }
      queue.push(file);
    }
    uploadNext();
  }
  window.addEventListener('message', event => {
    const data = event.data;
    if (data.type === 'agent') {
      if (data.scopeKey !== undefined && data.scopeKey !== scopeKey) return;
      renderAgentEvent(data.event);
      return;
    }
    if (data.type === 'state') {
      const nextScope = typeof data.scopeKey === 'string' ? data.scopeKey : null;
      if (scopeKey !== nextScope) {
        if (scopeKey) drafts[scopeKey] = question.value;
        scopeKey = nextScope;
        question.value = scopeKey ? (drafts[scopeKey] || '') : '';
        submitting = false; uploading = false; queue.length = 0;
        saveState();
      }
      if (data.locale && data.locale !== locale) setLocale(data.locale);
      if (data.workflow && !data.options) { window.tvijoWorkflow = data.workflow; document.getElementById('workflow-label').textContent = data.workflow; }
      if (data.options) renderOptions(data.options);
      renderContext(data.context);
      if (data.error) showNotice(data.error.text, data.error.action);
      else if (data.pending) showNotice(t('pendingNotice'), 'cancel');
      else showNotice('');
      render(data.messages || []);
      lastStatus = data.error ? '' : (data.status || '');
      state.textContent = lastStatus;
      if (!data.busy && !data.attaching) stopActivity();
      running = !!data.busy;
      preparing = !!data.attaching;
      pending = !!data.pending;
      controls(); renderAttachments(data.attachments || []);
      lastSignedIn = !!data.signedIn;
      lastAccount = data.account || null;
      if (lastUsage && (!data.signedIn || !data.account || scopeKey !== lastUsageScope || (lastUsage.account && data.account.tenant_id !== lastUsage.account.tenant_id))) { lastUsage = null; document.getElementById('usage-items').replaceChildren(); }
      document.getElementById('signin').textContent = t(lastSignedIn ? 'signedIn' : 'signIn');
      renderBudget(lastAccount);
      document.getElementById('history-note').textContent = data.legacyHistory || legacyDraft ? 'Older unassigned chat/draft is preserved locally and is not sent to this account. Server task history belongs to your signed-in account.' : 'Chat stays in this workspace and is separate from Copilot. Submitted tasks also appear in server history.';
    } else if (data.type === 'quote') {
      if (data.scopeKey !== scopeKey) return;
      const q = data.quote || {};
      const ceiling = Number.isSafeInteger(q.ceiling_micro_tvijo) && q.ceiling_micro_tvijo >= 0 ? (q.ceiling_micro_tvijo / 1000000).toLocaleString('en-US', { maximumFractionDigits: 6 }) : '—';
      const estimate = Number.isSafeInteger(q.estimated_max_micro_tvijo) && q.estimated_max_micro_tvijo >= 0 ? (q.estimated_max_micro_tvijo / 1000000).toLocaleString('en-US', { maximumFractionDigits: 6 }) : '—';
      state.textContent = 'Estimated up to ' + estimate + ' TT · Quote ' + q.quote_id + ' · ' + ceiling + ' TT ceiling · tariff ' + q.tariff_version;
    } else if (data.type === 'usage') {
      if (data.scopeKey !== undefined && data.scopeKey !== scopeKey) return;
      renderUsage(data.usage); setTab('usage');
    } else if (data.type === 'submission') {
      if (data.scopeKey !== undefined && data.scopeKey !== scopeKey) return;
      submitting = false;
      controls();
      if (data.ok && question.value.trim() === data.question) { question.value = ''; saveDraft(); }
      if (!data.ok) question.focus();
    } else if (data.type === 'draft') {
      if (data.scopeKey !== undefined && data.scopeKey !== scopeKey) return;
      question.value = typeof data.text === 'string' ? data.text.slice(0, 4000) : '';
      if (['chat','agent','plan'].includes(data.mode)) uiMode = data.mode;
      updateMode(); saveDraft(); question.focus();
    } else if (data.type === 'activity') {
      if (data.scopeKey !== undefined && data.scopeKey !== scopeKey) return;
      startActivity(data.stage, data.detail);
    } else if (data.type === 'attachmentDone') {
      uploading = false; controls(); uploadNext();
    } else if (data.type === 'openOptions') {
      plusMenu.className = ''; optionsMenu.className = 'open';
      document.getElementById('workflow').setAttribute('aria-expanded', 'true');
    }
  });
  document.getElementById('form').addEventListener('submit', event => {
    event.preventDefault(); const text = question.value.trim() || (attachmentCount ? t('attachmentOnly') : ''); if (!text || send.disabled) return;
    submitting = true; controls();
    post({type:'ask', question:text, agent: uiMode !== 'chat', plan: uiMode === 'plan'});
  });
  question.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); document.getElementById('form').requestSubmit(); }
    if (event.key === 'Tab' && event.shiftKey) { event.preventDefault(); uiMode = uiMode === 'plan' ? 'agent' : 'plan'; updateMode(); saveState(); }
  });
  modeButton.addEventListener('click', () => { uiMode = uiMode === 'chat' ? 'agent' : uiMode === 'agent' ? 'plan' : 'chat'; updateMode(); saveState(); });
  document.getElementById('signin').addEventListener('click', () => post({type:lastSignedIn ? 'account' : 'account'}));
  document.getElementById('new').addEventListener('click', () => post({type:'new'}));
  document.getElementById('cancel').addEventListener('click', () => post({type:'cancel'}));
  noticeActionButton.addEventListener('click', () => post({type: currentNotice?.action === 'account' ? 'account' : currentNotice?.action === 'context' ? 'contextPreview' : 'cancel'}));
  document.getElementById('context-preview').addEventListener('click', () => post({ type: 'contextPreview' }));
  document.getElementById('quick-edit').addEventListener('click', () => post({ type: 'quickEdit' }));
  document.getElementById('workflow').addEventListener('click', () => { plusMenu.className = ''; document.getElementById('plus').setAttribute('aria-expanded','false'); const open = optionsMenu.className !== 'open'; optionsMenu.className = open ? 'open' : ''; document.getElementById('workflow').setAttribute('aria-expanded', String(open)); });
  for (const type of ['commands','workspace','selection','path']) document.getElementById(type).addEventListener('click', () => { plusMenu.className = ''; optionsMenu.className = ''; document.getElementById('plus').setAttribute('aria-expanded','false'); post({type}); });
  document.getElementById('tab-usage').addEventListener('click', () => { setTab('usage'); post({type:'usage'}); });
  document.getElementById('connections').addEventListener('click', () => post({type:'connections'}));
  document.getElementById('product-guide').addEventListener('click', () => post({type:'productGuide'}));
  document.getElementById('tasks').addEventListener('click', () => post({type:'tasks'}));
  document.getElementById('settings').addEventListener('click', () => post({type:'settings'}));
  document.getElementById('tab-chat').addEventListener('click', () => setTab('chat'));
  document.getElementById('tab-context').addEventListener('click', () => setTab('context'));
  document.getElementById('tab-terminal').addEventListener('click', () => setTab('terminal'));
  document.getElementById('clear-context').addEventListener('click', () => post({type:'clearAttachments'}));
  document.getElementById('lang').addEventListener('click', () => { setLocale(locale === 'en' ? 'ru' : 'en'); post({type:'locale', value:locale}); });
  document.getElementById('theme').addEventListener('click', () => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'));
  document.body.addEventListener('keydown', event => { if (event.key === 'Escape') { if (plusMenu.className === 'open') { plusMenu.className = ''; document.getElementById('plus').setAttribute('aria-expanded','false'); document.getElementById('plus').focus(); } if (optionsMenu.className === 'open') { closeOptions(); document.getElementById('workflow').focus(); } } });
  document.getElementById('plus').addEventListener('click', () => { closeOptions(); plusMenu.className = plusMenu.className ? '' : 'open'; document.getElementById('plus').setAttribute('aria-expanded', plusMenu.className === 'open' ? 'true' : 'false'); });
  document.getElementById('attach').addEventListener('click', () => { plusMenu.className = ''; document.getElementById('plus').setAttribute('aria-expanded','false'); fileInput.click(); });
  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  question.addEventListener('paste', event => {
    const images = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith('image/'));
    if (images.length) { event.preventDefault(); addFiles(images); }
  });
  document.body.addEventListener('dragover', event => event.preventDefault());
  document.body.addEventListener('drop', event => { event.preventDefault(); if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files); });
  setLocale(locale);
  updateThemeButton();
  renderBudget(lastAccount);
  controls();
  post({type:'ready'});
</script></body></html>`;
}

module.exports = { chatHtml };
