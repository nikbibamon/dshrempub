'use strict';

const { randomBytes } = require('node:crypto');
const { THEME_CSS, COPY } = require('./product-theme');
const { renderMarkdown, safeExternalUrl } = require('./markdown');
const { renderAgentMap, buildAgentMap } = require('./agent-map');
const { CHAT_CSS } = require('./chat-presentation');
const { renderRewind, REWIND_CSS } = require('./rewind-view');

function chatHtml(webview) {
  const nonce = randomBytes(16).toString('base64');
  const csp = `default-src 'none'; img-src data:; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;
  return `<!doctype html>
<html lang="en"><head><title>Tvijo DSHREM</title><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style nonce="${nonce}">
${THEME_CSS}
${CHAT_CSS}
${REWIND_CSS}
header{flex-wrap:wrap}.run-chip{font-size:11px;padding:3px 6px;border:1px solid var(--vscode-contrastBorder,var(--border));border-radius:999px;background:var(--surface);color:var(--text)}#elapsed-chip{white-space:nowrap}#agent-map-button{white-space:nowrap}#pack-picker{max-width:min(150px,100%);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:var(--vscode-button-secondaryBackground,var(--surface));color:var(--vscode-button-secondaryForeground,var(--text));border:1px solid var(--vscode-contrastBorder,var(--border));font-size:11px;padding:3px 6px}#pack-picker:focus-visible{outline:1px solid var(--vscode-focusBorder,var(--accent));outline-offset:2px}
</style></head><body>
<header><strong id="brand"><span id="brand-mark" aria-hidden="true">›_</span>DSHREM</strong><span id="elapsed-chip" class="run-chip" aria-label="Elapsed time">Elapsed —</span><button id="agent-map-button" class="run-chip" type="button" title="Observed running agents; opens Agent Map" aria-expanded="false" aria-controls="agent-map">Agents —</button><button id="pack-picker" type="button" hidden aria-haspopup="dialog"></button><button id="lang" class="mini-select" type="button" title="Switch language">EN / RU</button><button id="theme" class="icon" type="button" title="Toggle light/dark theme" aria-label="Toggle light/dark theme">◐</button><button id="signin" type="button">Sign in</button><button id="new" class="icon" type="button" title="New session" aria-label="New session">＋</button><button id="commands" class="icon" type="button" title="Commands" aria-label="Commands">···</button><button id="settings" class="icon" type="button" title="Settings" aria-label="Settings">⚙</button></header>
<nav aria-label="Workspace"><button id="tab-chat" type="button" aria-selected="true">Chat</button><button id="tab-context" type="button" aria-selected="false">Context</button><button id="tab-usage" type="button" aria-selected="false">Usage</button><button id="tab-terminal" type="button" aria-selected="false">Terminal</button></nav>
<section id="rewind" aria-labelledby="rewind-title" hidden><div id="rewind-heading"><h2 id="rewind-title">Rewind</h2><button id="rewind-close" type="button">Back to chat</button></div><p id="rewind-hint"></p><p id="rewind-status" role="status"></p><div id="rewind-list"></div></section><main id="messages" aria-live="polite"></main><section id="agent-map" aria-labelledby="map-title" hidden><div id="agent-map-heading"><h2 id="map-title">Agent map</h2><button id="map-close" type="button">Back to chat</button></div><p id="map-hint"></p><div id="map-canvas" tabindex="0" role="region" aria-label="Agent map"></div><section id="map-details" aria-live="polite"></section></section><section id="context-panel" aria-label="Context"><p id="context-help"></p><div id="context-items"></div><div id="context-summary"></div><div id="usage-items" hidden></div><div id="terminal-info" hidden></div><button id="clear-context" type="button">Clear context</button></section><div id="state" role="status">Connecting…</div>
<div id="activity" role="status" aria-live="polite"><span id="activity-spin" class="spin">✻</span><span id="activity-label" class="label"></span><span id="activity-detail" class="detail"></span><span id="activity-time" class="time"></span></div>
<div id="agent-log" role="log" aria-live="polite"></div>
<div class="product-links"><button id="product-guide" type="button">Tvijo AI guide</button><button id="connections" type="button">Connections</button><button id="tasks" type="button">Server task history</button><button id="context-preview" type="button">Preview context</button><button id="quick-edit" type="button">Quick edit</button></div>
<p id="shared-thread-note" hidden><a id="shared-thread-link" href="#"></a></p>
<p id="history-note" class="mini-select">Chat stays in this workspace and is separate from Copilot. Submitted tasks also appear in server history.</p>
<div id="account-status" role="status"><span class="dot">●</span><span id="connection-label">Limited free preview</span><span id="budget"></span></div>
<form id="form"><div id="attachments" aria-label="Attached context"></div><p id="ocrnote" hidden></p><textarea id="question" aria-label="Ask Tvijo" placeholder="Ask about your project…" maxlength="20000"></textarea><p id="mode-help" role="note"></p><input id="file" type="file" multiple hidden><div class="composer-actions"><button id="plus" class="icon" type="button" title="Add context" aria-label="Add context" aria-haspopup="menu" aria-expanded="false">＋</button><button id="mode" class="mini-select" type="button" title="Mode" aria-haspopup="menu" aria-controls="mode-menu" aria-expanded="false">Chat</button><button id="workflow" class="mini-select" type="button" title="Model and method" aria-haspopup="menu" aria-expanded="false"><span>◆</span><span id="workflow-label">Model &amp; method</span></button><span class="spacer"></span><button id="cancel" class="mini-select" type="button" title="Cancel task" hidden>Cancel</button><button id="send" type="submit" title="Send message" aria-label="Send message">➤</button></div></form>
<div id="plus-menu" role="menu" aria-label="Actions"><button id="attach" data-action-id="tvijo.attachFile" type="button" role="menuitem">Attach file…</button><button id="mention-file" data-action-id="tvijo.mentionFile" type="button" role="menuitem">Mention file…</button><button id="attach-problems" data-action-id="tvijo.attachProblems" type="button" role="menuitem">@problems</button><button id="attach-terminal" data-action-id="tvijo.attachTerminal" type="button" role="menuitem">@terminal</button><button id="workspace" type="button" role="menuitem">Choose workspace file…</button><button id="selection" type="button" role="menuitem">Use editor selection</button><button id="path" type="button" role="menuitem">Paste workspace path…</button><button id="clear-conversation" data-action-id="tvijo.newConversation" type="button" role="menuitem">Clear conversation</button><button id="rewind-action" data-action-id="tvijo.rewind" type="button" role="menuitem">Rewind…</button><button id="export-conversation" data-action-id="tvijo.export" type="button" role="menuitem">Export conversation as Markdown</button><button id="switch-model" data-action-id="tvijo.chooseWorkflow" type="button" role="menuitem">Switch model</button><button id="all-actions" type="button" role="menuitem">All commands…</button></div>
<div id="mode-menu" role="menu" aria-label="Mode" hidden></div><div id="options-menu" role="menu" aria-label="Model and method"></div>
<div id="notice" role="alert"><p id="notice-text"></p><button id="notice-action" type="button">Resolve task</button></div>
<script nonce="${nonce}">
  const COPY = ${JSON.stringify(COPY)};
  const safeExternalUrl = ${safeExternalUrl.toString()};
  const renderMarkdown = ${renderMarkdown.toString()};
  const renderAgentMap = ${renderAgentMap.toString()};
  const renderRewind = ${renderRewind.toString()};
  const buildAgentMap = ${buildAgentMap.toString()};
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
  const modeMenu = document.getElementById('mode-menu');
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
  let runSessionTimer = null;
  let runSession = null;
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
  let pendingModeRequestId = null;
  let modeRequestSequence = 0;
  let rewindRuns = [], rewindChosen = null, rewindWorkspaceKey = null;
  const rewindPanel = document.getElementById('rewind');
  modeMenu.hidden = true;
  function drawRewind() {
    renderRewind(document,document.getElementById('rewind-list'),rewindRuns,locale,id => {rewindChosen=id;drawRewind();},(runId,step) => {post({type:'rewindRestore',workspaceKey:rewindWorkspaceKey,runId,step});},rewindChosen);
  }
  let mapOpen = false;
  let mapModel = buildAgentMap();
  let mapSelection = () => 'request';
  let mapTimer = null;
  function drawMap() {
    const active = document.activeElement;
    const focusedId = active?.getAttribute?.('data-map-id');
    const canvas = document.getElementById('map-canvas'), details = document.getElementById('map-details');
    const left = canvas.scrollLeft, top = canvas.scrollTop, detailTop = details.scrollTop;
    const hadTree = canvas.querySelector?.('.map-children');
    mapSelection = renderAgentMap(document, canvas, details, mapModel, locale, mapSelection());
    canvas.scrollLeft = left || 0; canvas.scrollTop = top || 0; details.scrollTop = detailTop || 0;
    if (!hadTree) canvas.scrollTop = 0;
    if (focusedId) for (const button of canvas.querySelectorAll('button')) if (button.getAttribute('data-map-id') === focusedId) { button.focus({preventScroll:true}); break; }
  }
  function mapVisibility(open) {
    mapOpen = open;
    document.getElementById('agent-map').hidden = !open;
    document.getElementById('agent-map-button').setAttribute('aria-expanded', String(open));
    if (mapTimer) clearTimer(mapTimer);
    mapTimer = null;
    if (open) {
      rewindPanel.hidden = true;
      messages.hidden = true; document.getElementById('context-panel').className = '';
      drawMap();
      if (scopeKey) {
        post({type:'agentMap', refresh:true});
        mapTimer = setTimer(() => { if (!document.hidden && scopeKey) post({type:'agentMap'}); }, 2000);
      }
      document.getElementById('map-close').focus();
    }
  }
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
    const selected = uiMode === 'chat' ? optionState.model : optionState.agentModel;
    const model = (optionState.models || []).find(item => item.id === selected) || { id: selected, name: selected };
    const method = { 'evidence-first': 'methodEvidence', 'plan-check': 'methodPlan', 'peer-review': 'methodPeer' }[optionState.reasoningMethod];
    document.getElementById('workflow-label').textContent = modelLabel(model) + (uiMode === 'chat' && method ? ' · ' + t(method) : '');
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
  function renderRunSession(value) {
    runSession = value && typeof value === 'object' ? value : {status:'unknown', startedAt:null, endedAt:null, elapsedMs:null, agents:null};
    if (runSessionTimer) clearTimer(runSessionTimer);
    runSessionTimer = null;
    const elapsed = document.getElementById('elapsed-chip');
    const button = document.getElementById('agent-map-button');
    const startedAt = Number.isFinite(runSession.startedAt) ? runSession.startedAt : null;
    const endedAt = Number.isFinite(runSession.endedAt) ? runSession.endedAt : null;
    const draw = () => {
      const end = runSession.status === 'running' ? Date.now() : endedAt;
      const duration = startedAt === null || end === null || end < startedAt ? null : end - startedAt;
      const seconds = duration === null ? '—' : String(Math.floor(duration / 1000 / 60)).padStart(2, '0') + ':' + String(Math.floor(duration / 1000) % 60).padStart(2, '0');
      elapsed.textContent = (locale === 'ru' ? 'Время ' : 'Elapsed ') + seconds;
      const count = Number.isInteger(runSession.agents) && runSession.agents >= 0 ? String(runSession.agents) : '—';
      button.textContent = (locale === 'ru' ? 'Агенты ' : 'Agents ') + count;
      button.title = locale === 'ru' ? 'Число наблюдаемых работающих агентов; открыть карту агентов' : 'Observed running agent count; opens Agent Map';
      button.setAttribute('aria-label', button.title + ': ' + count);
      elapsed.setAttribute('aria-label', (locale === 'ru' ? 'Время выполнения ' : 'Elapsed run time ') + seconds);
    };
    draw();
    if (runSession.status === 'running' && startedAt !== null) runSessionTimer = setTimer(draw, 1000);
  }
  function renderContext(value) {
    lastContext = value || null;
    const node = document.getElementById('context-summary');
    if (!value) { node.textContent = ''; return; }
    const mode = value.mode === 'on' ? t('contextOn') : value.mode === 'off' ? t('contextOff') : t('contextAsk');
    const last = value.last ? (value.last.root + ' · ' + value.last.files + ' ' + (locale === 'ru' ? 'файлов' : 'files') + ' · ' + Math.ceil(value.last.bytes / 1024) + ' KiB') : '';
    node.textContent = t('contextSummary') + ': ' + mode + (last ? ' — ' + last : '') + (value.mode === 'off' ? ' — ' + t('contextOffHint') : '') + (value.last?.rules ? ' · ' + (locale === 'ru' ? 'Правила: ' : 'Rules: ') + ({included:locale==='ru'?'добавлены':'included',preview:locale==='ru'?'предпросмотр':'preview',missing:locale==='ru'?'нет файла':'missing',unmatched:locale==='ru'?'область не совпала':'unmatched',rejected:locale==='ru'?'отклонены':'rejected','omitted-limit':locale==='ru'?'не помещаются':'omitted: size limit',disabled:locale==='ru'?'отключены':'off'}[value.last.rules.status] || '—') : '');
  }
  function renderOptions(options) {
    optionState = options && Array.isArray(options.models) ? options : null;
    optionsMenu.replaceChildren();
    updateMode();
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
    const preset = uiMode === 'plan' ? 'plan' : optionState?.agentPreset || 'manual';
    const labelKey = uiMode === 'chat' ? 'modeChat' : uiMode === 'plan' ? 'modePlan' : ({manual:'modeManual',edit:'modeEdit',auto:'modeAuto',custom:'modeCustom'}[preset] || 'modeCustom');
    const label = t(labelKey);
    modeButton.textContent = label;
    modeButton.className = 'mini-select ' + (uiMode === 'chat' ? '' : uiMode);
    modeButton.title = t('mode') + ': ' + label;
    modeButton.setAttribute('aria-label', t('mode') + ': ' + label);
    modeButton.setAttribute('aria-expanded', String(!modeMenu.hidden));
    renderModeMenu();
    question.placeholder = uiMode === 'chat' ? t('ask') : t('mentionHint');
    document.getElementById('mode-help').textContent = t(uiMode === 'chat' ? 'modeChatHelp' : uiMode === 'agent' ? 'modeAgentHelp' : 'modePlanHelp') + ' ' + t('shellHelp');
    updateWorkflowLabel();
  }
  function renderModeMenu() {
    modeMenu.replaceChildren();
    const rows = [
      {mode:'chat', label:t('modeChat'), hint:t('modeChatHelp'), checked:uiMode === 'chat'},
      {mode:'manual', label:t('modeManual'), hint:t('modeManualHint'), checked:uiMode === 'agent' && optionState?.agentPreset === 'manual'},
      {mode:'edit', label:t('modeEdit'), hint:t('modeEditHint'), checked:uiMode === 'agent' && optionState?.agentPreset === 'edit'},
      {mode:'plan', label:t('modePlan'), hint:t('modePlanHint'), checked:uiMode === 'plan'},
      {mode:'auto', label:t('modeAuto'), hint:t('modeAutoHint'), checked:uiMode === 'agent' && optionState?.agentPreset === 'auto'}
    ];
    if (optionState?.agentPreset === 'custom') rows.push({mode:'custom', label:t('modeCustom'), hint:'', checked:uiMode === 'agent'});
    for (const row of rows) {
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('data-mode', row.mode);
      button.setAttribute('role','menuitemradio'); button.setAttribute('aria-checked',String(row.checked));
      const name = document.createElement('span'); name.textContent = row.label;
      const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = row.hint;
      button.append(name,hint); button.disabled = !!row.disabled || running || submitting || preparing || !!pendingModeRequestId;
      button.addEventListener('click', () => chooseMode(row.mode)); modeMenu.append(button);
    }
    modeButton.disabled = running || submitting || preparing || !!pendingModeRequestId;
  }
  function openModeMenu() {
    if (modeButton.disabled) return;
    modeMenu.hidden = false; modeMenu.className = 'open'; modeButton.setAttribute('aria-expanded','true');
    const selected = modeMenu.querySelector('[aria-checked="true"]') || modeMenu.querySelector('button'); selected?.focus();
  }
  function closeModeMenu(restoreFocus = false) {
    modeMenu.hidden = true; modeMenu.className = ''; modeButton.setAttribute('aria-expanded','false');
    if (restoreFocus) modeButton.focus();
  }
  function chooseMode(mode) {
    if (pendingModeRequestId) return;
    if (mode === 'chat') { closeModeMenu(true); uiMode = 'chat'; updateMode(); saveState(); return; }
    if (running || submitting || preparing) return;
    if (mode === 'custom') { closeModeMenu(true); uiMode = 'agent'; updateMode(); saveState(); return; }
    const preset = mode === 'plan' ? 'plan' : mode;
    pendingModeRequestId = String(scopeKey || '') + ':' + (++modeRequestSequence);
    closeModeMenu(true); controls();
    post({type:'agentPreset',preset,requestId:pendingModeRequestId});
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
    if (event.type === 'reset') { agentLog.replaceChildren(); agentLog.className = ''; return; }
    if (event.type === 'start') {
      agentLog.replaceChildren(); agentLog.className = 'visible';
      const details = [event.planMode ? t('modePlan') : t('modeAgent')];
      if (Number.isFinite(event.maxSteps)) details.push(t('agentStep') + ' 0/' + event.maxSteps);
      if (Number.isFinite(event.budgetUsd)) details.push('$' + event.budgetUsd);
      agentLine(t('agentTitle'), details.join(' · '), 'head');
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
    if (event.type === 'final') { agentLine(t(event.partial ? 'agentPartial' : 'agentFinal'), (event.text || '').slice(0, 300), event.partial ? 'bad' : 'ok'); }
  }
  function updateThemeButton() {
    const label = t(theme === 'dark' ? 'themeDark' : theme === 'light' ? 'themeLight' : 'themeSystem');
    document.getElementById('theme').textContent = theme === 'light' ? '☼' : '◐';
    document.getElementById('theme').title = t('theme') + ': ' + label;
    document.getElementById('theme').setAttribute('aria-label', t('theme') + ': ' + label);
  }
  function setLocale(next) {
    locale = next; document.documentElement.lang = locale;
    modeMenu.setAttribute('aria-label', t('mode'));
    document.getElementById('rewind-title').textContent = locale === 'ru' ? 'Восстановление' : 'Rewind';
    document.getElementById('rewind-action').textContent = locale === 'ru' ? 'Восстановление…' : 'Rewind…';
    document.getElementById('rewind-close').textContent = locale === 'ru' ? 'Вернуться к чату' : 'Back to chat';
    document.getElementById('rewind-hint').textContent = locale === 'ru' ? 'Только на этом устройстве · 7 дней · до 50 МиБ. Изменённые файлы и удаление требуют подтверждения.' : 'On this machine only · 7 days · up to 50 MiB. Changed files and deletions need confirmation.';
    if (!rewindPanel.hidden) drawRewind();
    renderRunSession(runSession);
    document.getElementById('map-title').textContent = locale === 'ru' ? 'Карта агентов' : 'Agent map';
    document.getElementById('map-canvas').setAttribute('aria-label', locale === 'ru' ? 'Карта агентов' : 'Agent map');
    document.getElementById('map-close').textContent = locale === 'ru' ? 'Вернуться к чату' : 'Back to chat';
    document.getElementById('map-hint').textContent = locale === 'ru' ? 'Фактические шаги и фоновые команды · — нет данных · Прокрутка ↔ ↕ · Стрелки — переход, Enter — подробности' : 'Observed execution steps and background commands · — unknown · Scroll ↔ ↕ · Arrow keys navigate, Enter shows details';
    if (mapOpen) drawMap();
    document.getElementById('lang').textContent = locale === 'en' ? 'EN / RU' : 'RU / EN';
    const actionLabels = locale === 'ru' ? {
      'attach':'Прикрепить файл…','mention-file':'Упомянуть файл…','attach-problems':'@problems · Проблемы','attach-terminal':'@terminal · Вывод терминала',
      'workspace':'Выбрать файл проекта…','selection':'Добавить выделение','path':'Вставить путь проекта…','clear-conversation':'Очистить диалог',
      'rewind-action':'Восстановить…','export-conversation':'Экспортировать диалог в Markdown','switch-model':'Сменить модель','all-actions':'Все команды…'
    } : {
      'attach':'Attach file…','mention-file':'Mention file…','attach-problems':'@problems · Problems','attach-terminal':'@terminal · Terminal output',
      'workspace':'Choose workspace file…','selection':'Use editor selection','path':'Paste workspace path…','clear-conversation':'Clear conversation',
      'rewind-action':'Rewind…','export-conversation':'Export conversation as Markdown','switch-model':'Switch model','all-actions':'All commands…'
    };
    for (const [id, label] of Object.entries(actionLabels)) document.getElementById(id).textContent = label;
    document.getElementById('plus').setAttribute('aria-label', locale === 'ru' ? 'Действия' : 'Actions');
    document.getElementById('plus-menu').setAttribute('aria-label', locale === 'ru' ? 'Действия' : 'Actions');
    document.getElementById('commands').setAttribute('aria-label', locale === 'ru' ? 'Действия' : 'Actions');
    document.getElementById('tab-chat').textContent = t('chat');
    document.getElementById('tab-context').textContent = t('context');
    document.getElementById('tab-usage').textContent = locale === 'ru' ? 'Расходы' : 'Usage';
    document.getElementById('product-guide').textContent = locale === 'ru' ? 'Идея Tvijo AI' : 'Tvijo AI guide';
    document.getElementById('connections').textContent = locale === 'ru' ? 'Подключения' : 'Connections';
    document.getElementById('tasks').textContent = locale === 'ru' ? 'История задач на сервере' : 'Server task history';
    document.getElementById('context-preview').textContent = t('contextPreview');
    document.getElementById('context-help').textContent = t('contextHelp');
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
    if (typeof preview?.tasks_remaining === 'number' && Number.isFinite(preview.tasks_remaining)) values.push(preview.tasks_remaining + ' ' + (locale === 'ru' ? 'задач' : 'tasks'));
    if (typeof preview?.tokens_remaining === 'number' && Number.isFinite(preview.tokens_remaining)) values.push(preview.tokens_remaining.toLocaleString() + ' ' + (locale === 'ru' ? 'токенов' : 'tokens'));
    if (typeof preview?.remaining_usd === 'number' && Number.isFinite(preview.remaining_usd)) values.push('$' + preview.remaining_usd.toFixed(3));
    budget.textContent = values.join(' · ');
    document.getElementById('connection-label').textContent = lastSignedIn ? t('ready') : t('limited');
  }
  function setTab(tab) {
    mapVisibility(false);
    rewindPanel.hidden = true;
    for (const name of ['chat','context','terminal','usage']) document.getElementById('tab-' + name).setAttribute('aria-selected', String(name === tab));
    messages.hidden = tab !== 'chat';
    document.getElementById('context-panel').className = tab === 'context' || tab === 'terminal' || tab === 'usage' ? 'visible' : '';
    document.getElementById('context-items').hidden = tab !== 'context';
    document.getElementById('usage-items').hidden = tab !== 'usage';
    document.getElementById('clear-context').hidden = tab !== 'context';
    document.getElementById('context-help').hidden = tab !== 'context';
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
    const valueOrUnknown = v => v === null || v === undefined || typeof v === 'boolean' || v === '' ? '—' : String(v);
    const money = v => {
      if (v === null || v === undefined || typeof v === 'boolean' || (typeof v === 'string' && !v.trim())) return '—';
      const n = Number(v);
      return Number.isFinite(n) ? '$' + n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') : '—';
    };
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
    const a = value.account || {};
    const budget = a.budget || {};
    const scope = value.scope || {};
    add(ru ? 'Tvijo: личный учет' : 'Tvijo: private usage');
    add((ru ? 'Всего расход ' : 'Lifetime spend ') + money(budget.spent_usd) + (ru ? ' · резерв ' : ' · held ') + money(budget.held_usd) + (ru ? ' · доступно ' : ' · available ') + money(budget.remaining_usd));
    add((ru ? 'Дневной остаток сервиса: ' : 'Service daily remaining: ') + money(budget.daily_remaining_usd));
    if (a.preview) add((ru ? 'Проба: ' : 'Preview: ') + valueOrUnknown(a.preview.tasks_remaining) + (ru ? ' задач · ' : ' tasks · ') + valueOrUnknown(a.preview.tokens_remaining) + (ru ? ' токенов' : ' tokens'));
    if (value.knowledge) add((ru ? 'Личные источники: ' : 'Private knowledge: ') + valueOrUnknown(value.knowledge.indexed_files) + (ru ? ' файлов · ' : ' files · ') + valueOrUnknown(value.knowledge.indexed_chunks) + (ru ? ' фрагментов' : ' chunks'));
    add((ru ? 'Загружено задач: ' : 'Loaded tasks: ') + valueOrUnknown(scope.loaded_tasks) + ' / ' + valueOrUnknown(scope.total_account_tasks));
    for (const item of value.tasks || []) {
      add(item.title + ' · ' + item.model + ' / ' + item.mode + ' · ' + item.status);
      const taskBudget = item.budget || {};
      add((ru ? 'Токены ' : 'Tokens ') + valueOrUnknown(item.tokens) + (ru ? ' · списано ' : ' · charged ') + money(taskBudget.spent_usd) + (ru ? ' · лимит ' : ' · cap ') + money(taskBudget.max_usd));
      add((ru ? 'Провайдер ' : 'Provider ') + money(item.provider_cost_usd) + (ru ? ' · сервисная разница ' : ' · service difference ') + money(item.service_difference_usd));
      for (const call of item.calls || []) add(valueOrUnknown(call.provider) + ' / ' + valueOrUnknown(call.model) + ' · in ' + valueOrUnknown(call.tokens_in) + ' / out ' + valueOrUnknown(call.tokens_out) + ' · ' + valueOrUnknown(call.outcome));
    }
    add(ru ? 'Квота подписки и экономия кеша не измерены. — означает неизвестно.' : 'Subscription quota and cache savings are not measured. — means unknown.');
  }
  question.addEventListener('input', saveDraft);
  function controls() {
    const blocked = running || preparing || submitting || uploading;
    send.disabled = blocked || !!pendingModeRequestId || !scopeKey; newConversation.disabled = blocked || !scopeKey;
    for (const id of ['attach','workspace','selection','path','plus','workflow','mode']) document.getElementById(id).disabled = blocked;
    document.getElementById('cancel').hidden = !running;
    document.getElementById('cancel').textContent = running ? (uiMode !== 'chat' ? t('agentStop') : t('cancel')) : t('resolvePending');
    document.getElementById('cancel').title = running ? (uiMode !== 'chat' ? t('agentStop') : t('cancel')) : t('resolvePending');
    document.getElementById('clear-context').disabled = blocked;
    for (const button of attached.querySelectorAll('button')) button.disabled = blocked;
    renderModeMenu();
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
      const content = document.createElement('div');
      if (item.role === 'assistant') renderMarkdown(document, content, item.content, { post, copyLabel:t('copy'), plainLabel:locale === 'ru' ? 'текст' : 'text', truncatedLabel:locale === 'ru' ? 'Ответ сокращён; полный текст доступен в редакторе.' : 'Answer truncated; full text is available in the editor.' });
      else content.textContent = item.content || '';
      block.append(role, content); messages.append(block);
      if (item.role === 'assistant') {
        if (typeof item.footer === 'string') { const footer = document.createElement('div'); footer.className = 'task-footer'; footer.textContent = item.footer.slice(0, 4000); block.append(footer); }
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
    if (data.type === 'rewind') {
      setTab('chat'); messages.hidden = true; rewindPanel.hidden = false;
      rewindRuns = data.runs || []; rewindChosen = null; rewindWorkspaceKey = data.workspaceKey;
      document.getElementById('rewind-status').textContent = '';
      drawRewind(); document.getElementById('rewind-close').focus(); post({type:'rewindShown',workspaceKey:rewindWorkspaceKey}); return;
    }
    if (data.type === 'rewindResult') {
      if (data.workspaceKey !== rewindWorkspaceKey) return;
      document.getElementById('rewind-status').textContent = data.text;
      setTab('chat'); return;
    }
    if (data.type === 'agentMap') {
      if (data.scopeKey !== scopeKey) return;
      mapModel = data.model || buildAgentMap(); if (mapOpen) drawMap(); return;
    }
    if (data.type === 'runSession') {
      if (data.scopeKey !== scopeKey) return;
      renderRunSession(data.session); return;
    }
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
        renderRunSession(null);
        pendingModeRequestId = null;
        rewindPanel.hidden = true; rewindRuns = []; rewindWorkspaceKey = null;
        mapModel = buildAgentMap(); mapSelection = () => 'request';
        if (mapOpen) { setTab('chat'); drawMap(); }
        question.value = scopeKey ? (drafts[scopeKey] || '') : '';
        submitting = false; uploading = false; queue.length = 0;
        saveState();
      }
      if (data.locale && data.locale !== locale) setLocale(data.locale);
      renderRunSession(data.runSession);
      if (data.workflow && !data.options) { window.tvijoWorkflow = data.workflow; document.getElementById('workflow-label').textContent = data.workflow; }
      const packPicker = document.getElementById('pack-picker');
      packPicker.hidden = !data.signedIn || !data.pack;
      packPicker.textContent = data.pack ? data.pack.label + ' ▾' : '';
      packPicker.title = data.pack ? data.pack.summary : '';
      packPicker.setAttribute('aria-label', (locale === 'ru' ? 'Выбрать пакет навыков: ' : 'Choose skill pack: ') + (data.pack?.label || ''));
      if (data.options) renderOptions(data.options);
      if (data.agentMap) { mapModel = data.agentMap; if (mapOpen) drawMap(); }
      renderContext(data.context);
      if (data.error) showNotice(data.error.text, data.error.action);
      else if (data.pending) showNotice(t('pendingNotice'), 'cancel');
      else showNotice('');
      render(data.messages || []);
      const sharedNote = document.getElementById('shared-thread-note');
      sharedNote.hidden = !data.sharedThreadUrl;
      const sharedLink = document.getElementById('shared-thread-link');
      sharedLink.href = data.sharedThreadUrl || '#';
      sharedLink.textContent = locale === 'ru' ? 'Этот диалог есть на dsh.tvijo.com' : 'This conversation is on dsh.tvijo.com';
      sharedLink.onclick = event => { event.preventDefault(); post({type:'openSharedThread'}); };
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
      updateMode();
      document.getElementById('history-note').textContent = data.legacyHistory || legacyDraft ? 'Older unassigned chat/draft is preserved locally and is not sent to this account. Server task history belongs to your signed-in account.' : 'Chat stays in this workspace and is separate from Copilot. Submitted tasks also appear in server history.';
    } else if (data.type === 'presetResult') {
      if (data.scopeKey !== scopeKey || !pendingModeRequestId || data.requestId !== pendingModeRequestId) return;
      if (data.ok) { uiMode = data.preset === 'plan' ? 'plan' : 'agent'; saveState(); }
      else showNotice(t('modeUpdateFailed'));
      pendingModeRequestId = null; closeModeMenu(true); controls(); updateMode();
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
    event.preventDefault(); const text = question.value.trim() || (attachmentCount ? t('attachmentOnly') : ''); if (!text || send.disabled || pendingModeRequestId) return;
    submitting = true; controls();
    post({type:'ask', question:text, agent: uiMode !== 'chat', plan: uiMode === 'plan'});
  });
  question.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); document.getElementById('form').requestSubmit(); }
  });
  modeButton.addEventListener('click', () => modeMenu.hidden ? openModeMenu() : closeModeMenu());
  modeMenu.addEventListener('keydown', event => {
    const items = Array.from(modeMenu.querySelectorAll('button:not(:disabled)'));
    const index = items.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); closeModeMenu(true); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); document.activeElement?.click(); }
  });
  document.body.addEventListener('click', event => { if (!modeMenu.hidden && !modeMenu.contains(event.target) && event.target !== modeButton) closeModeMenu(); });
  document.getElementById('agent-map-button').addEventListener('click', () => { if (mapOpen) setTab('chat'); else mapVisibility(true); });
  document.getElementById('map-close').addEventListener('click', () => { setTab('chat'); document.getElementById('agent-map-button').focus(); });
  document.getElementById('agent-map').addEventListener('keydown', event => { if (event.key === 'Escape') { setTab('chat'); document.getElementById('agent-map-button').focus(); } });
  document.getElementById('pack-picker').addEventListener('click', () => post({type:'choosePack'}));
  document.getElementById('signin').addEventListener('click', () => post({type:lastSignedIn ? 'account' : 'account'}));
  document.getElementById('new').addEventListener('click', () => post({type:'new'}));
  document.getElementById('cancel').addEventListener('click', () => post({type:'cancel'}));
  noticeActionButton.addEventListener('click', () => post({type: currentNotice?.action === 'account' ? 'account' : currentNotice?.action === 'context' ? 'contextPreview' : 'cancel'}));
  document.getElementById('context-preview').addEventListener('click', () => post({ type: 'contextPreview' }));
  document.getElementById('quick-edit').addEventListener('click', () => post({ type: 'quickEdit' }));
  document.getElementById('workflow').addEventListener('click', () => { plusMenu.className = ''; document.getElementById('plus').setAttribute('aria-expanded','false'); const open = optionsMenu.className !== 'open'; optionsMenu.className = open ? 'open' : ''; document.getElementById('workflow').setAttribute('aria-expanded', String(open)); });
  document.getElementById('commands').setAttribute('aria-haspopup','menu');
  document.getElementById('commands').addEventListener('click', () => { plusMenu.className = plusMenu.className ? '' : 'open'; const open = plusMenu.className === 'open'; document.getElementById('plus').setAttribute('aria-expanded', String(open)); document.getElementById('commands').setAttribute('aria-expanded', String(open)); if (open) document.getElementById('attach').focus(); });
  const closePlus = () => { plusMenu.className = ''; document.getElementById('plus').setAttribute('aria-expanded','false'); document.getElementById('commands').setAttribute('aria-expanded','false'); };
  for (const button of plusMenu.querySelectorAll('[data-action-id]')) button.addEventListener('click', () => {closePlus();if(button.dataset.actionId==='tvijo.attachFile')fileInput.click();else post({type:'action',actionId:button.dataset.actionId});});
  document.getElementById('all-actions').addEventListener('click', () => {closePlus();post({type:'commands'});});
  document.getElementById('rewind-close').addEventListener('click', () => {setTab('chat');document.getElementById('commands').focus();});
  document.getElementById('rewind').addEventListener('keydown', event => {if(event.key === 'Escape') {setTab('chat');document.getElementById('commands').focus();}});
  plusMenu.addEventListener('keydown', event => {
    const items = Array.from(plusMenu.querySelectorAll('[role="menuitem"]'));
    const index = items.indexOf(document.activeElement);
    if (event.key === 'Escape') {plusMenu.className='';document.getElementById('plus').setAttribute('aria-expanded','false');document.getElementById('plus').focus();}
    else if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();}
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();document.activeElement?.click();}
  });
  for (const type of ['workspace','selection','path']) document.getElementById(type).addEventListener('click', () => { closePlus(); optionsMenu.className = ''; post({type}); });
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
  document.body.addEventListener('keydown', event => { if (event.key === 'Escape') { if (plusMenu.className === 'open') { closePlus(); document.getElementById('plus').focus(); } if (optionsMenu.className === 'open') { closeOptions(); document.getElementById('workflow').focus(); } } });
  document.getElementById('plus').addEventListener('click', () => { closeOptions(); plusMenu.className = plusMenu.className ? '' : 'open'; document.getElementById('plus').setAttribute('aria-expanded', plusMenu.className === 'open' ? 'true' : 'false'); if (plusMenu.className === 'open') document.getElementById('attach').focus(); });
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
