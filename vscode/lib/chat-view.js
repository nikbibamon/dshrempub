'use strict';

const { randomBytes } = require('node:crypto');
const { PALETTE_CSS } = require('./theme-palette');
const { THEME_CSS, COPY } = require('./product-theme');
const { renderMarkdown, safeExternalUrl } = require('./markdown');
const { renderAgentMap, buildAgentMap } = require('./agent-map');
const { CHAT_CSS } = require('./chat-presentation');
const { renderRewind, REWIND_CSS } = require('./rewind-view');
const { FULL_ACCESS_LIMITS } = require('./full-access');

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
${PALETTE_CSS}
#recovery{flex-shrink:0;max-height:260px;overflow:auto;padding:8px 12px;border-top:1px solid var(--border)}#recovery summary{font-size:12px;cursor:pointer;padding:4px 0}.recovery-card{padding:8px;margin:6px 0;border:1px solid var(--border);border-radius:6px}.recovery-card p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 6px}.recovery-actions{display:flex;flex-wrap:wrap;gap:6px}.recovery-actions button{font-size:11px}#recovery-notes{font-size:11px;overflow-wrap:anywhere}
nav{flex-shrink:0}.run-chip{font-size:11px;padding:3px 6px;border:1px solid var(--vscode-contrastBorder,var(--border));border-radius:999px;background:var(--surface);color:var(--text)}#elapsed-chip{white-space:nowrap}#agent-map-button{white-space:nowrap}#pack-picker{max-width:min(150px,100%);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:var(--vscode-button-secondaryBackground,var(--surface));color:var(--vscode-button-secondaryForeground,var(--text));border:1px solid var(--vscode-contrastBorder,var(--border));font-size:11px;padding:3px 6px}#pack-picker:focus-visible{outline:1px solid var(--vscode-focusBorder,var(--accent));outline-offset:2px}
</style></head><body>
<section id="folder-browser" aria-labelledby="folder-title" hidden><div class="drawer-heading"><strong id="folder-title"></strong><button id="folder-close" type="button">×</button></div><div class="drawer-tools"><button id="folder-active" type="button"></button><button id="folder-recent" type="button"></button></div><p id="folder-hint"></p><div id="folder-rows"></div></section>
<aside id="settings-drawer" aria-label="Chat settings" hidden><div class="drawer-heading"><strong id="drawer-title">Chat settings</strong><button id="drawer-close" class="icon" type="button" aria-label="Close settings">×</button></div><p id="mode-help" role="note"></p>
<nav aria-label="Workspace"><button id="tab-chat" type="button" aria-selected="true">Chat</button><button id="tab-context" type="button" aria-selected="false">Context</button><button id="tab-usage" type="button" aria-selected="false">Usage</button><button id="tab-terminal" type="button" aria-selected="false">Terminal</button></nav>
<div class="drawer-tools"><button id="signin" type="button">Sign in</button><button id="lang" class="mini-select" type="button" title="Switch language">EN / RU</button><button id="theme" class="icon" type="button" title="Toggle light/dark theme" aria-label="Toggle light/dark theme">◐</button><button id="engineering" type="button" aria-pressed="false">Engineering view</button><button id="extension-settings" type="button">Extension settings…</button><button id="commands" class="icon" type="button" title="Commands" aria-label="Commands">···</button></div>
<div class="drawer-tools"><span id="elapsed-chip" class="run-chip" aria-label="Elapsed time">Elapsed —</span><button id="agent-map-button" class="run-chip" type="button" title="Observed running agents; opens Agent Map" aria-expanded="false" aria-controls="agent-map">Agents —</button><button id="pack-picker" type="button" hidden aria-haspopup="dialog"></button></div>
<details id="recovery" hidden><summary id="recovery-title">Interrupted runs</summary><p id="recovery-notes" role="status"></p><div id="recovery-list"></div></details>
<div class="product-links"><button id="product-guide" type="button">Tvijo AI guide</button><button id="connections" type="button">Connections</button><button id="tasks" type="button">Server task history</button><button id="context-select" type="button">Select project context…</button><button id="context-preview" type="button">Preview context</button><button id="quick-edit" type="button">Quick edit</button></div>
<p id="shared-thread-note" hidden><a id="shared-thread-link" href="#"></a></p><p id="history-note" class="mini-select"></p>
<div class="drawer-tools"><span id="account-identity"></span><span id="account-verification"></span><button id="runtime-version" type="button"></button></div><div class="drawer-tools"><button id="auto-commit" type="button"></button><button id="signout" type="button"></button></div><p id="bridge-note" hidden></p><p id="bot-setup-note" hidden><span id="bot-setup-text"></span> <button id="bot-setup" type="button"></button> <button id="bot-settings" type="button"></button></p><p id="rules-scan-note" hidden></p><section id="loaded-rules"></section><div id="account-status" role="status"><span class="dot">●</span><span id="connection-label">Connecting…</span><span id="budget"></span></div></aside>
<section id="rewind" aria-labelledby="rewind-title" hidden><div id="rewind-heading"><h2 id="rewind-title">Rewind</h2><button id="rewind-close" type="button">Back to chat</button></div><p id="rewind-hint"></p><p id="rewind-status" role="status"></p><div id="rewind-list"></div></section><main id="messages" aria-live="polite"></main><section id="agent-map" aria-labelledby="map-title" hidden><div id="agent-map-heading"><h2 id="map-title">Agent map</h2><button id="map-close" type="button">Back to chat</button></div><p id="map-hint"></p><div id="map-canvas" tabindex="0" role="region" aria-label="Agent map"></div><section id="map-details" aria-live="polite"></section></section><section id="context-panel" aria-label="Context"><p id="context-help"></p><div id="context-items"></div><div id="context-summary"></div><div id="usage-items" hidden></div><div id="terminal-info" hidden></div><button id="clear-context" type="button">Clear context</button></section><div id="state" role="status">Connecting…</div>
<div id="activity" role="status" aria-live="polite"><span id="activity-spin" class="spin">✻</span><span id="activity-label" class="label"></span><span id="activity-detail" class="detail"></span><span id="activity-time" class="time"></span></div>
<div id="agent-log" role="log" aria-live="polite"></div>
<form id="form"><button id="composer-signin" type="button">Sign in</button><div id="attachments" aria-label="Attached context"></div><p id="ocrnote" hidden></p><div id="followups" hidden></div><textarea id="question" aria-label="Ask Tvijo" placeholder="Ask about your project…" maxlength="20000"></textarea><input id="file" type="file" multiple hidden><div class="composer-actions"><button id="workspace-choice" type="button">Choose project…</button><button id="plus" class="icon" type="button" title="Add context" aria-label="Add context" aria-haspopup="menu" aria-expanded="false">＋</button><button id="mode" class="mini-select" type="button" title="Mode" aria-haspopup="menu" aria-controls="mode-menu" aria-expanded="false">Chat</button><button id="workflow" class="mini-select" type="button" title="Model and method" aria-haspopup="menu" aria-expanded="false"><span>◆</span><span id="workflow-label">Model &amp; method</span></button><span class="spacer"></span><button id="cancel" class="mini-select" type="button" title="Cancel task" hidden>Cancel</button><button id="settings" class="icon" type="button" title="Settings" aria-label="Settings" aria-expanded="false" aria-controls="settings-drawer">⚙</button><button id="send" type="submit" title="Send message" aria-label="Send message">➤</button></div></form>
<div id="plus-menu" role="menu" aria-label="Actions"><button id="attach" data-action-id="tvijo.attachFile" type="button" role="menuitem">Attach file…</button><button id="mention-file" data-action-id="tvijo.mentionFile" type="button" role="menuitem">Mention file…</button><button id="attach-problems" data-action-id="tvijo.attachProblems" type="button" role="menuitem">@problems</button><button id="attach-terminal" data-action-id="tvijo.attachTerminal" type="button" role="menuitem">@terminal</button><button id="workspace" type="button" role="menuitem">Choose workspace file…</button><button id="selection" type="button" role="menuitem">Use editor selection</button><button id="path" type="button" role="menuitem">Paste workspace path…</button><button id="clear-conversation" data-action-id="tvijo.newConversation" type="button" role="menuitem">Clear conversation</button><button id="rewind-action" data-action-id="tvijo.rewind" type="button" role="menuitem">Rewind…</button><button id="export-conversation" data-action-id="tvijo.export" type="button" role="menuitem">Export conversation as Markdown</button><button id="switch-model" data-action-id="tvijo.chooseWorkflow" type="button" role="menuitem">Switch model</button><button id="all-actions" type="button" role="menuitem">All commands…</button></div>
<div id="mode-menu" role="menu" aria-label="Mode" hidden></div><div id="options-menu" role="menu" aria-label="Model and method"></div>
<div id="notice" role="alert"><p id="notice-text"></p><button id="notice-action" type="button">Resolve task</button><button id="notice-close" class="icon" type="button" aria-label="Dismiss">×</button></div>
<script nonce="${nonce}">
  const COPY = ${JSON.stringify(COPY)};
  Object.assign(COPY.en,{modeFull:'Full access',modeFullHint:${JSON.stringify(FULL_ACCESS_LIMITS.en)},agentSavedHelp:'Agent edits are saved before disk checks. Dirty user buffers are protected.',fullAccessWarning:'Full access is active',fullAccessRevert:'Revert'});
  Object.assign(COPY.ru,{modeFull:'Полный доступ',modeFullHint:${JSON.stringify(FULL_ACCESS_LIMITS.ru)},agentSavedHelp:'Правки агента сохраняются до проверок на диске. Пользовательские несохранённые буферы защищены.',fullAccessWarning:'Полный доступ включён',fullAccessRevert:'Отменить'});
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
  const attached = document.getElementById('attachments');
  const fileInput = document.getElementById('file');
  const plusMenu = document.getElementById('plus-menu');
  let plusAnchor = document.getElementById('plus');
  function positionPlus() {
    if (plusMenu.className !== 'open') return;
    const rect = plusAnchor.getBoundingClientRect(), gap = 8;
    const above = rect.top - gap, below = innerHeight - rect.bottom - gap;
    const up = above >= below;
    plusMenu.style.position = 'fixed';
    plusMenu.style.maxHeight = Math.max(30, (up ? above : below) - gap) + 'px';
    plusMenu.style.bottom = up ? Math.max(gap, innerHeight - rect.top + gap) + 'px' : 'auto';
    plusMenu.style.top = up ? 'auto' : (rect.bottom + gap) + 'px';
    plusMenu.style.left = Math.max(gap, Math.min(rect.left, innerWidth - plusMenu.offsetWidth - gap)) + 'px';
  }
  function togglePlus(anchor) {
    const open = plusMenu.className !== 'open'; closeOptions(); closeModeMenu();
    plusAnchor = anchor; plusMenu.className = open ? 'open' : '';
    for (const id of ['plus','commands']) document.getElementById(id).setAttribute('aria-expanded',String(open));
    if (open) { positionPlus(); document.getElementById('attach').focus(); }
  }
  window.addEventListener('resize', positionPlus);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(positionPlus).observe(document.getElementById('form'));
  document.body.addEventListener('pointerdown', event => {
    if (!plusMenu.contains(event.target) && !event.target.closest('#plus,#commands')) closePlus();
  });
  document.body.addEventListener('focusin', event => {
    if (!plusMenu.contains(event.target) && !event.target.closest('#plus,#commands')) closePlus();
  });
  const optionsMenu = document.getElementById('options-menu');
  const modeMenu = document.getElementById('mode-menu');
  const modeButton = document.getElementById('mode');
  const agentLog = document.getElementById('agent-log');
  let uiMode = 'agent';
  document.getElementById('settings-drawer').hidden = true;
  const notice = document.getElementById('notice');
  const noticeText = document.getElementById('notice-text');
  const noticeActionButton = document.getElementById('notice-action');
  const activity = document.getElementById('activity');
  const activitySpin = document.getElementById('activity-spin');
  const activityLabel = document.getElementById('activity-label');
  const activityDetail = document.getElementById('activity-detail');
  const activityTime = document.getElementById('activity-time');
  let optionState = null;
  let orchestrationState = {enabled:false};
  let fullAccess = null;
  let currentNotice = null;
  let lastQuote = null;
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
  let lastMessageWorkspace = null;
  let workspaceAvailable = true;
  let lastUsage = null;
  let lastUsageScope = null;
  let pending = false;
  let scopeKey = null;
  let composerScope = null;
  let pendingModeRequestId = null;
  let modeRequestSequence = 0;
  let rewindRuns = [], rewindChosen = null, rewindWorkspaceKey = null;
  let interruptedRuns = [], recoveryNotes = [];
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
    if(open) setDrawer(false);
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
  // Messages typed while an answer is running; sent one by one when it ends.
  const followUps = [];
  let followPaused = false;
  let liveQuestion = null, lastSubmitted = null, liveFrom = '', submittedBridgeId = null;
  const saved = vscode.getState?.();
  const draftModeExplicit = saved?.draftModeExplicit && typeof saved.draftModeExplicit === 'object' ? {...saved.draftModeExplicit} : {};
  let modeExplicit = false;
  const draftModes = saved?.draftModes && typeof saved.draftModes === 'object' ? {...saved.draftModes} : {};
  const drafts = saved?.drafts && typeof saved.drafts === 'object' ? { ...saved.drafts } : {};
  const draftTimes = saved?.draftTimes && typeof saved.draftTimes === 'object' ? { ...saved.draftTimes } : {};
  const draftTtl = 7 * 24 * 60 * 60 * 1000;
  const legacyDraft = typeof saved?.legacyDraft === 'string' ? saved.legacyDraft : typeof saved?.draft === 'string' ? saved.draft : '';
  locale = saved?.locale === 'ru' ? 'ru' : 'en';
  uiMode = 'agent';
  let engineering = saved?.engineering === true;
  document.body.setAttribute('data-view', engineering ? 'engineering' : 'simple');
  let legacyHistory = false;
  let theme = ['dark','light','system'].includes(saved?.theme) ? saved.theme : 'system';
  document.body.setAttribute('data-theme', theme);
  const t = key => COPY[locale][key] || COPY.en[key] || key;
  const saveState = () => { if (scopeKey) { drafts[composerScope || scopeKey] = question.value; draftModes[composerScope || scopeKey] = uiMode; draftModeExplicit[composerScope || scopeKey] = modeExplicit; } vscode.setState?.({drafts,draftModes,draftModeExplicit,draftTimes,legacyDraft,locale,theme,engineering,mode:uiMode,composerScope}); };
  const post = message => vscode.postMessage({ ...message, scopeKey });
  const saveDraft = () => { if (scopeKey) draftTimes[composerScope || scopeKey] = Date.now(); saveState(); if (scopeKey) post({type:'composerDraft',composerScope,text:question.value,mode:uiMode,modeExplicit}); };
  const setTimer = typeof setInterval === 'function' ? setInterval : () => null;
  const clearTimer = typeof clearInterval === 'function' ? clearInterval : () => {};
  const modelLabel = item => item.id === 'auto' ? t('modelAuto') : item.id === 'coding' ? t('modelCoding') : (item.name || item.id);
  const modelHint = item => item.id === 'auto' ? t('modelAutoHint') : item.id === 'coding' ? t('modelCodingHint') : t('activatedRoute');
  let folderSequence = 0, folderSelection = null;
  const folderRequests = new Map();
  function closeFolderBrowser() {
    document.getElementById('folder-browser').hidden = true;
    folderRequests.clear(); folderSelection = null;
    document.getElementById('workspace-choice').focus();
  }
  function requestFolders(uri, target, depth) {
    const requestId = 'folders:' + (++folderSequence);
    target.textContent = locale === 'ru' ? 'Загрузка…' : 'Loading…';
    folderRequests.set(requestId, data => {
      target.textContent = ''; target.replaceChildren();
      if (data.error) { target.textContent = data.error; return; }
      for (const folder of data.folders || []) {
        const item = document.createElement('div'); item.className = 'folder-item';
        const row = document.createElement('div'); row.className = 'folder-row';
        const disclosure = document.createElement('button'); disclosure.type = 'button'; disclosure.textContent = '▸';
        disclosure.setAttribute('aria-label',(locale === 'ru' ? 'Развернуть ' : 'Expand ') + folder.name); disclosure.setAttribute('aria-expanded','false');
        const select = document.createElement('button'); select.type = 'button'; select.className = 'folder-select'; select.textContent = folder.name; select.title = folder.path;
        const children = document.createElement('div'); children.className = 'folder-children'; children.hidden = true;
        let loaded = false;
        disclosure.disabled = depth >= 20;
        disclosure.addEventListener('click', () => {
          children.hidden = !children.hidden; disclosure.textContent = children.hidden ? '▸' : '▾'; disclosure.setAttribute('aria-expanded',String(!children.hidden));
          if (!children.hidden && !loaded) { loaded = true; requestFolders(folder.uri,children,depth+1); }
        });
        select.addEventListener('click', () => {
          if (running || submitting || preparing || pendingModeRequestId) return;
          folderSelection = 'select:' + (++folderSequence);
          post({type:'selectFolder',uri:folder.uri,requestId:folderSelection});
        });
        row.append(disclosure,select); item.append(row,children); target.append(item);
      }
      if (!data.folders?.length || data.truncated) {
        const note = document.createElement('p'); note.textContent = data.truncated ? (locale === 'ru' ? 'Показана часть папок. Другую папку можно выбрать через Explorer → Work in Tvijo.' : 'Showing a bounded list. Choose another folder through Explorer → Work in Tvijo.') : (locale === 'ru' ? 'Нет доступных подпапок.' : 'No browsable subfolders.'); target.append(note);
      }
    });
    post({type:'folderList',uri,requestId});
  }
  function openFolderBrowser() {
    if (running || submitting || preparing || pendingModeRequestId) return;
    folderRequests.clear();
    document.getElementById('folder-browser').hidden = false;
    document.getElementById('folder-title').textContent = locale === 'ru' ? 'Выбрать проект' : 'Choose project';
    document.getElementById('folder-close').setAttribute('aria-label',locale === 'ru' ? 'Закрыть выбор папки' : 'Close folder browser');
    document.getElementById('folder-hint').textContent = locale === 'ru' ? 'Нажмите название, чтобы работать в этой папке и её содержимом. Стрелка открывает подпапки.' : 'Click a name to work in that folder and its descendants. The arrow opens subfolders.';
    requestFolders(null,document.getElementById('folder-rows'),0);
    document.getElementById('folder-close').focus();
  }
  function drawRecovery() {
    const panel = document.getElementById('recovery'), list = document.getElementById('recovery-list');
    panel.hidden = !interruptedRuns.length && !recoveryNotes.length;
    document.getElementById('recovery-title').textContent = (locale === 'ru' ? 'Прерванные запуски: ' : 'Interrupted runs: ') + interruptedRuns.length;
    document.getElementById('recovery-notes').textContent = recoveryNotes.join(' ');
    list.replaceChildren();
    for (const run of interruptedRuns) {
      const card = document.createElement('div'); card.className = 'recovery-card';
      const prompt = document.createElement('p'); prompt.textContent = run.prompt;
      const names = locale === 'ru' ? {agent:'Агент',chat:'Чат',plan:'План',edit:'Быстрая правка'} : {agent:'Agent',chat:'Chat',plan:'Plan',edit:'Quick Edit'};
      const detail = document.createElement('p'); detail.textContent = (names[run.kind] || run.kind) + ' · ' + run.events + (locale === 'ru' ? ' событий' : ' events');
      const actions = document.createElement('div'); actions.className = 'recovery-actions';
      const button = (label,type,disabled=false) => {
        const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.disabled = disabled || running || submitting;
        node.addEventListener('click',() => post({type,id:run.id})); actions.append(node);
      };
      button(run.restored ? (locale === 'ru' ? 'Журнал восстановлен' : 'Transcript restored') : (locale === 'ru' ? 'Восстановить журнал' : 'Restore transcript'),'restoreRun',!!run.restored);
      if (run.taskId) button(locale === 'ru' ? 'Получить результат' : 'Fetch result','fetchRun');
      button(locale === 'ru' ? 'Скрыть' : 'Dismiss','dismissRun');
      card.append(prompt,detail,actions); list.append(card);
    }
  }
  function updateWorkflowLabel() {
    if (orchestrationState.enabled && uiMode !== 'chat') { document.getElementById('workflow-label').textContent = 'DSH · ds41f + ' + orchestrationState.policy; return; }
    if (!optionState) { document.getElementById('workflow-label').textContent = t('options'); return; }
    const selected = uiMode === 'chat' ? optionState.model : optionState.agentModel;
    const model = (optionState.models || []).find(item => item.id === selected) || { id: selected, name: selected };
    const method = { 'evidence-first': 'methodEvidence', 'plan-check': 'methodPlan', 'peer-review': 'methodPeer' }[optionState.reasoningMethod];
    document.getElementById('workflow-label').textContent = modelLabel(model) + (engineering && uiMode === 'chat' && method ? ' · ' + t(method) : '');
  }
  function closeOptions() { optionsMenu.className = ''; document.getElementById('workflow').setAttribute('aria-expanded', 'false'); }
  const ACTIVITY = ['✻','✶','✷','✸','✹','✺','✹','✸','✷','✶'];
  // Playful words only while the model thinks; real stages keep their plain labels.
  const THINK = {
    en: ['Wibbling','Churning','Unfurling','Reticulating','Finagling','Herding','Effecting','Musing','Cogitating','Percolating','Spelunking','Ruminating','Meandering','Deciphering','Concocting','Unravelling','Hatching','Germinating','Smooshing','Puttering','Envisioning','Ideating','Manifesting','Philosophising','Vibing','Transmuting','Honking','Inferring','Tinkering','Combobulating','Crunching','Crafting','Channelling','Mustering','Noodling','Discombobulating','Creating','Mulling','Determining','Coalescing','Cerebrating','Booping','Schlepping','Simmering','Cooking','Spinning','Actioning','Stewing','Perusing','Wrangling','Wondering','Flibbertigibbeting','Puzzling','Elucidating','Sailing','Thinking','Navigating','Floating'],
    ru: ['Думаю','Размышляю','Кумекаю','Прикидываю','Варю','Мозгую','Распутываю','Колдую','Смекаю','Вынашиваю','Перевариваю','Тасую','Плету','Настраиваюсь','Сочиняю','Ковыряюсь','Расшифровываю','Мастерю','Взвешиваю','Медитирую','Чешу репу','Собираю пазл','Шуршу','Брожу по коду','Нащупываю','Заглядываю','Соображаю','Химичу','Докапываюсь','Плыву']
  };
  let thinkSeed = 0, thinking = false;
  function stopActivity() {
    if (activityTimer) clearTimer(activityTimer);
    activityTimer = null; activity.className = '';
  }
  function startActivity(stage, detail) {
    if (stage === 'done') { stopActivity(); return; }
    const label = { prepare:'activityPrepare', scan:'activityScan', context:'activityScan', grant:'activityGrant', quote:'activityQuote', model:'activityModel', settle:'activitySettle' }[stage];
    activityStarted = Date.now(); spinIndex = 0;
    thinking = stage === 'model' || stage === 'inbox'; thinkSeed = Math.floor(Math.random() * 1000);
    const thinkWord = () => { const words = THINK[locale] || THINK.en; return words[(thinkSeed + Math.floor((Date.now() - activityStarted) / 3000)) % words.length] + '…'; };
    activityLabel.textContent = thinking ? thinkWord() : label ? t(label) : (stage || '');
    activityDetail.textContent = detail || '';
    activityTime.textContent = '0s';
    activity.className = 'visible';
    if (activityTimer) clearTimer(activityTimer);
    activityTimer = setTimer(() => {
      activitySpin.textContent = ACTIVITY[spinIndex++ % ACTIVITY.length];
      if (thinking) activityLabel.textContent = thinkWord();
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
    node.textContent = t('contextSummary') + ': ' + mode + (last ? ' — ' + last : '') + (value.mode === 'off' ? ' — ' + t('contextOffHint') : '') + (value.last?.rules ? ' · ' + (locale === 'ru' ? 'Правила: ' : 'Rules: ') + ({unapproved:locale==='ru'?'не одобрены':'not approved','workspace-untrusted':locale==='ru'?'папке не доверяют':'workspace not trusted',unsupported:locale==='ru'?'недоступны':'unsupported',included:locale==='ru'?'добавлены':'included',preview:locale==='ru'?'предпросмотр':'preview',missing:locale==='ru'?'нет файла':'missing',unmatched:locale==='ru'?'область не совпала':'unmatched',rejected:locale==='ru'?'отклонены':'rejected','omitted-limit':locale==='ru'?'не помещаются':'omitted: size limit',disabled:locale==='ru'?'отключены':'off'}[value.last.rules.status] || '—') : '');
  }
  function renderOptions(options) {
    optionState = options && Array.isArray(options.models) ? options : null;
    optionsMenu.replaceChildren();
    updateMode();
    if (orchestrationState.enabled && uiMode !== 'chat') {
      const fixed=document.createElement('p');fixed.textContent='DSH · ds41f + '+orchestrationState.policy;optionsMenu.append(fixed);
      const settings=document.createElement('button');settings.type='button';settings.textContent=locale==='ru'?'Настройки и статус DSH':'DSH settings and status';settings.addEventListener('click',()=>{closeOptions();post({type:'settings'});});optionsMenu.append(settings);
      return;
    }
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
    if (!orchestrationState.enabled) group('agentModelSection', optionState.models.filter(item => item.id !== 'auto').map(item => ({ key: 'agentModel', value: item.id, current: optionState.agentModel, label: modelLabel(item), hint: modelHint(item) })));
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
    if (optionState.agentPreset !== 'full') group('applySection', [
      { key: 'autoApply', value: false, current: optionState.autoApply, label: t('autoApplyOff'), hint: '' },
      { key: 'autoApply', value: true, current: optionState.autoApply, label: t('autoApplyOn'), hint: '' }
    ]);
  }
  function showNotice(text, action) {
    currentNotice = text ? { text, action: action || null } : null;
    noticeText.textContent = text || '';
    noticeActionButton.hidden = !action; noticeActionButton.textContent = action === 'chooseFolder' ? (locale==='ru'?'Выбрать папку':'Choose folder') : action === 'addWorkspaceFolder' ? (locale==='ru'?'Добавить как папку рабочей области':'Add as workspace folder') : action === 'rulesSettings' ? (locale==='ru'?'Проверить правила в ⚙':'Review rules in ⚙') : action === 'account' ? t('signIn') : action === 'context' ? t('contextPreview') : t('resolvePending');
    notice.className = text ? 'visible' : '';
    document.getElementById('notice-close').setAttribute('aria-label', t('dismiss'));
  }
  function drawQuote(q) {
    const amount = v => Number.isSafeInteger(v) && v >= 0 ? (v / 1000000).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US', {maximumFractionDigits:6}) : '—';
    state.textContent = t('upTo') + ' ' + amount(q.estimated_max_micro_tvijo) + ' TT' + (engineering ? ' · ' + t('quoteLabel') + ' ' + (q.quote_id || '—') + ' · ' + t('ceilingLabel') + ' ' + amount(q.ceiling_micro_tvijo) + ' TT · ' + t('tariffLabel') + ' ' + (q.tariff_version || '—') : '');
  }
  function updateMode() {
    const preset = uiMode === 'plan' ? 'plan' : optionState?.agentPreset || 'auto';
    const labelKey = uiMode === 'chat' ? 'modeChat' : uiMode === 'plan' ? 'modePlan' : ({manual:'modeManual',edit:'modeEdit',auto:'modeAuto',full:'modeFull',custom:'modeCustom'}[preset] || 'modeCustom');
    const label = t(labelKey);
    modeButton.textContent = label;
    modeButton.className = 'mini-select ' + (uiMode === 'chat' ? '' : uiMode);
    modeButton.title = t('mode') + ': ' + label;
    modeButton.setAttribute('aria-label', t('mode') + ': ' + label);
    modeButton.setAttribute('aria-expanded', String(!modeMenu.hidden));
    renderModeMenu();
    question.placeholder = uiMode === 'chat' ? t('ask') : t('mentionHint');
    document.getElementById('mode-help').textContent = t(uiMode === 'chat' ? 'modeChatHelp' : uiMode === 'agent' ? 'modeAgentHelp' : 'modePlanHelp') + (uiMode === 'agent' && ['full','auto'].includes(preset) ? ' ' + t('agentSavedHelp') : '') + ' ' + t('shellHelp');
    updateWorkflowLabel();
  }
  function renderModeMenu() {
    modeMenu.replaceChildren();
    const rows = [
      {mode:'chat', label:t('modeChat'), hint:t('modeChatHelp'), checked:uiMode === 'chat'},
      {mode:'manual', label:t('modeManual'), hint:t('modeManualHint'), checked:uiMode === 'agent' && optionState?.agentPreset === 'manual'},
      {mode:'edit', label:t('modeEdit'), hint:t('modeEditHint'), checked:uiMode === 'agent' && optionState?.agentPreset === 'edit'},
      {mode:'plan', label:t('modePlan'), hint:t('modePlanHint'), checked:uiMode === 'plan'},
      {mode:'auto', label:t('modeAuto'), hint:t('modeAutoHint'), checked:uiMode === 'agent' && optionState?.agentPreset === 'auto'},
      {mode:'full', label:t('modeFull'), hint:t('modeFullHint'), checked:uiMode === 'agent' && optionState?.agentPreset === 'full', disabled:fullAccess?.available !== true}
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
    if(fullAccess?.enabled){const cancel=document.createElement('button');cancel.type='button';cancel.textContent=t('fullAccessRevert');cancel.setAttribute('data-mode','revoke');cancel.addEventListener('click',()=>{closeModeMenu();post({type:'fullAccessRevert',fullAccessScope:fullAccess.scopeKey});});modeMenu.append(cancel);}
    modeButton.disabled = !!pendingModeRequestId || (!fullAccess?.enabled && (running || submitting || preparing));
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
    if (mode === 'chat') { closeModeMenu(true); uiMode = 'chat'; modeExplicit = true; updateMode(); saveDraft(); return; }
    if (running || submitting || preparing) return;
    if (!workspaceAvailable) { closeModeMenu(); openFolderBrowser(); return; }
    if (mode === 'custom') { closeModeMenu(true); uiMode = 'agent'; modeExplicit = true; updateMode(); saveDraft(); return; }
    const preset = mode === 'plan' ? 'plan' : mode;
    if (mode === 'full' && fullAccess?.available !== true) return;
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
    document.getElementById('folder-active').textContent=locale==='ru'?'Папка активного файла':'Active file folder';
    document.getElementById('folder-recent').textContent=locale==='ru'?'Недавние папки':'Recent folders';
    document.getElementById('signout').textContent=locale==='ru'?'Выйти':'Sign out';
    document.getElementById('drawer-title').textContent = t('chatSettings');
    document.getElementById('bot-setup-text').textContent = t('botSetupNote'); document.getElementById('bot-setup').textContent = t('botSetup'); document.getElementById('bot-settings').textContent = t('botSettings');
    for (const [id,key] of [['drawer-close','closeSettings'],['settings','settings']]) {
      document.getElementById(id).title = t(key); document.getElementById(id).setAttribute('aria-label',t(key));
    }
    document.getElementById('settings-drawer').setAttribute('aria-label',t('chatSettings'));
    document.getElementById('engineering').textContent = t(engineering ? 'simpleView' : 'engineeringView');
    document.getElementById('engineering').setAttribute('aria-pressed',String(engineering));
    document.getElementById('extension-settings').textContent = t('extensionSettings');
    document.getElementById('context-select').textContent = t('contextSelect');
    document.getElementById('history-note').textContent = t(legacyHistory || legacyDraft ? 'legacyPrivacy' : 'historyPrivacy');
    drawRecovery();
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
    document.getElementById('composer-signin').textContent = t('signIn');
    document.getElementById('composer-signin').hidden = lastSignedIn;
    renderIdentity();
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
    if(lastQuote) drawQuote(lastQuote);
    saveState();
  }
  let lastSignedIn = false;
  let lastStatus = '';
  let lastAttachments = [];
  let lastAccount = null;
  let lastAuthState = 'loading', lastAuthError = '', activeWorkspaceLabel = '';
  function renderIdentity() {
    const profile = lastAccount?.identity;
    const name = profile?.email_verified && profile.email ? profile.email : profile?.display_name;
    const labels = locale === 'ru' ? {loading:'Проверка аккаунта…',connecting:'Ожидание входа в браузере…',signed_out:'Не выполнен вход',error:'Ошибка подключения',signed_in:'Аккаунт подтверждён'} : {loading:'Checking account…',connecting:'Waiting for browser sign-in…',signed_out:'Signed out',error:'Connection error',signed_in:'Account verified'};
    document.getElementById('account-identity').textContent = name || '';
    document.getElementById('account-verification').textContent = lastAuthError || (lastSignedIn && !profile?.email_verified ? (locale === 'ru' ? 'Email не подтверждён' : 'Email unverified') : labels[lastAuthState]) || labels.signed_out;
    document.getElementById('workspace-choice').textContent = activeWorkspaceLabel || (locale === 'ru' ? 'Выбрать проект…' : 'Choose project…');
  }
  function setTheme(next) { theme = next; document.body.setAttribute('data-theme', theme); updateThemeButton(); saveState(); }
  function renderBudget(account) {
    const budget = document.getElementById('budget');
    const preview = { ...(account?.budget || {}), ...(account?.preview || {}) };
    const values = [];
    if (typeof preview?.tasks_remaining === 'number' && Number.isFinite(preview.tasks_remaining)) values.push(preview.tasks_remaining + ' ' + (locale === 'ru' ? 'задач' : 'tasks'));
    if (typeof preview?.tokens_remaining === 'number' && Number.isFinite(preview.tokens_remaining)) values.push(preview.tokens_remaining.toLocaleString() + ' ' + (locale === 'ru' ? 'токенов' : 'tokens'));
    if (preview?.remaining_usd != null && Number.isFinite(Number(preview.remaining_usd))) values.push('$' + Number(preview.remaining_usd).toFixed(3) + (preview.renewing === false ? (locale === 'ru' ? ' из $' : ' of $') + preview.total_usd : ''));
    budget.textContent = values.join(' · ');
    document.getElementById('connection-label').textContent = lastSignedIn ? t('ready') : t('signIn');
  }
  function setTab(tab) {
    setDrawer(false);
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
  function drawFollowUps() {
    const box = document.getElementById('followups'); box.replaceChildren(); box.hidden = !followUps.length;
    if (followPaused && followUps.length) { const note = document.createElement('div'); note.className = 'followup'; note.textContent = t('queuePaused'); box.append(note); }
    for (const [index, item] of followUps.entries()) {
      const row = document.createElement('div'); row.className = 'followup';
      const text = document.createElement('span'); text.textContent = t('queued') + (item.from ? ' · ' + item.from : '') + ': ' + item.text; text.title = item.text;
      row.append(text);
      if (followPaused && index === 0) { const now = document.createElement('button'); now.type = 'button'; now.textContent = t('queueSendNow'); now.addEventListener('click', () => { followPaused = false; drawFollowUps(); drainFollowUps(); }); row.append(now); }
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.title = t('queueRemove'); remove.setAttribute('aria-label', t('queueRemove'));
      remove.addEventListener('click', () => { const [gone] = followUps.splice(index, 1); if (gone?.bridgeId) post({type:'bridgeCancel', id:gone.bridgeId}); if (!followUps.length) followPaused = false; drawFollowUps(); });
      row.append(remove); box.append(row);
    }
  }
  function submitText(text, mode, from = '', bridgeId = null) {
    submitting = true; liveQuestion = text; lastSubmitted = text; liveFrom = from; submittedBridgeId = bridgeId; controls();
    // Clear the composer at once; a refused request puts the text back.
    if (question.value.trim() === text) { question.value = ''; saveDraft(); }
    post({type:'ask', question:text, agent: mode !== 'chat', plan: mode === 'plan', ...(from ? {from} : {}), ...(bridgeId ? {bridgeId} : {})});
    render(lastItems);
  }
  function drainFollowUps() {
    if (!followUps.length || followPaused || running || submitting || preparing || uploading || pending || pendingModeRequestId || !scopeKey) return;
    const next = followUps.shift(); drawFollowUps();
    if (next.mode !== 'chat' && !workspaceAvailable) { followUps.unshift(next); followPaused = true; drawFollowUps(); return; }
    submitText(next.text, next.mode, next.from || '', next.bridgeId || null);
  }
  function controls() {
    const blocked = running || preparing || submitting || uploading;
    send.disabled = preparing || uploading || !!pendingModeRequestId || !scopeKey;
    const queues = running || submitting;
    send.hidden = false;
    send.title = t(queues ? 'queueSend' : 'send'); send.setAttribute('aria-label', t(queues ? 'queueSend' : 'send'));
    document.getElementById('auto-commit').disabled = blocked;
    for (const id of ['attach','workspace','selection','path','plus','workflow','mode']) document.getElementById(id).disabled = blocked;
    document.getElementById('cancel').hidden = !running;
    document.getElementById('cancel').textContent = running ? (uiMode !== 'chat' ? t('agentStop') : t('cancel')) : t('resolvePending');
    document.getElementById('cancel').title = running ? (uiMode !== 'chat' ? t('agentStop') : t('cancel')) : t('resolvePending');
    document.getElementById('clear-context').disabled = blocked;
    for (const button of attached.querySelectorAll('button')) button.disabled = blocked;
    renderModeMenu();
  }
  let lastItems = [];
  function render(items) {
    lastItems = items;
    // Once the host records the question in history, the live copy is redundant.
    const lastUser = [...items].reverse().find(item => item.role === 'user');
    if (liveQuestion && String(lastUser?.display || lastUser?.content || '').trim() !== liveQuestion) items = [...items, {role:'user', content:liveQuestion, live:true, from:liveFrom}];
    const key = JSON.stringify(items); if (key === lastMessages && lastMessageWorkspace === activeWorkspaceLabel) return; lastMessages = key; lastMessageWorkspace = activeWorkspaceLabel;
    messages.replaceChildren();
    if (!items.length) {
      const welcome = document.createElement('section'); welcome.className = 'welcome';
      const mark = document.createElement('div'); mark.className = 'welcome-mark'; mark.textContent = '›_';
      const title = document.createElement('strong'); title.textContent = t('title');
      const body = document.createElement('p'); body.textContent = t('intro');
      title.textContent = activeWorkspaceLabel ? (locale === 'ru' ? 'Что сделать в проекте?' : 'What should we work on?') : (locale === 'ru' ? 'Выберите проект' : 'Choose a project');
      body.textContent = activeWorkspaceLabel ? (locale === 'ru' ? 'Выберите режим ниже и опишите задачу.' : 'Choose a mode below and describe the task.') : (locale === 'ru' ? 'Выберите папку здесь или нажмите Work in Tvijo в Explorer.' : 'Choose a folder here or right-click it in Explorer → Work in Tvijo.');
      const choose = document.createElement('button'); choose.type = 'button'; choose.textContent = locale === 'ru' ? 'Выбрать проект' : 'Choose project'; choose.addEventListener('click',openFolderBrowser);
      welcome.append(mark, title, body, choose); messages.append(welcome);
    }
    for (const [index, item] of items.entries()) {
      const block = document.createElement('article');
      block.className = 'message ' + (item.role === 'assistant' ? 'assistant' : 'user') + (item.live ? ' live' : '');
      const role = document.createElement('div'); role.className = 'role'; role.textContent = item.role === 'assistant' ? t('assistant') : item.from ? item.from : t('user');
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
        if(item.autoCommit?.hash){const undo=document.createElement('button');undo.type='button';undo.textContent=locale==='ru'?'Отменить коммит':'Undo commit';undo.disabled=running || submitting;undo.addEventListener('click',()=>post({type:'undoCommit',index}));actions.append(undo);}
        if(item.agentRequest){const agent=document.createElement('button');agent.type='button';agent.textContent=locale==='ru'?'Сделать агентом':'Make it an agent';agent.disabled=running || submitting;agent.addEventListener('click',()=>post({type:'makeAgent',index}));actions.append(agent);}
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
    if (data.type === 'state' && ['blue','violet','teal','amber','mono','spectrum'].includes(data.colorTheme)) document.body.setAttribute('data-palette',data.colorTheme);
    if(data.type === 'chooseFolder'){openFolderBrowser();return;}
    if(data.type === 'openSettings'){setDrawer(true);return;}
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
    if (data.type === 'folderList') {
      const callback = folderRequests.get(data.requestId);
      if (callback) { folderRequests.delete(data.requestId); callback(data); }
      return;
    }
    if (data.type === 'folderSelected') {
      if (data.requestId === folderSelection) {
        if (data.error) document.getElementById('folder-hint').textContent = data.error;
        else { closeFolderBrowser(); question.focus(); }
      }
      return;
    }
    if (data.type === 'state') {
      orchestrationState = data.orchestration || {enabled:false};
      lastQuote = null;
      const nextScope = typeof data.scopeKey === 'string' ? data.scopeKey : null;
      const nextComposerScope = typeof data.composerScope === 'string' ? data.composerScope : nextScope;
      if (scopeKey !== nextScope || composerScope !== nextComposerScope) {
        const legacyTime = draftTimes[nextScope];
        const legacyScopedDraft = scopeKey === null && saved?.composerScope === undefined && nextScope && typeof drafts[nextScope] === 'string' && (!Number.isFinite(legacyTime) || Date.now() - legacyTime < draftTtl) ? drafts[nextScope] : undefined;
        const leavingScope = scopeKey !== null;
        if (scopeKey) drafts[composerScope || scopeKey] = question.value;
        scopeKey = nextScope;
        composerScope = nextComposerScope;
        renderRunSession(null);
        pendingModeRequestId = null;
        rewindPanel.hidden = true; rewindRuns = []; rewindWorkspaceKey = null;
        mapModel = buildAgentMap(); mapSelection = () => 'request';
        if (mapOpen) { setTab('chat'); drawMap(); }
        const draftKey = composerScope || scopeKey;
        const cachedTime = draftTimes[draftKey];
        const cachedDraft = scopeKey && Object.prototype.hasOwnProperty.call(drafts,draftKey) && (!Number.isFinite(cachedTime) ? saved?.draftTimes === undefined : Date.now() - cachedTime < draftTtl);
        question.value = scopeKey ? (cachedDraft ? drafts[composerScope || scopeKey] : data.composerDraft?.text ?? legacyScopedDraft ?? '') : '';
        const restoredMode = cachedDraft ? draftModes[draftKey] || data.composerDraft?.mode : data.composerDraft?.mode;
        modeExplicit = cachedDraft && draftModeExplicit[draftKey] === true;
        const hostMode = ['chat','agent','plan'].includes(data.composerMode) ? data.composerMode : null;
        uiMode = hostMode || (modeExplicit && ['chat','agent','plan'].includes(restoredMode) ? restoredMode : ['agent','plan'].includes(restoredMode) ? restoredMode : 'agent');
        if (hostMode) modeExplicit = true;
        if (scopeKey) draftTimes[draftKey] = cachedDraft && Number.isFinite(cachedTime) ? cachedTime : data.composerDraft?.updatedAt || Date.now();
        // The first scope after load is not a scope change: messages that arrived before the
        // state stay queued. Only leaving a real scope cancels what was waiting for it.
        if (leavingScope) for (const item of followUps) if (item.bridgeId) post({type:'bridgeCancel', id:item.bridgeId, reason:'scope'});
        submitting = false; uploading = false; queue.length = 0; if (leavingScope) followUps.length = 0; followPaused = false; liveQuestion = null; drawFollowUps();
        saveState();
      }
      if (data.locale && data.locale !== locale) setLocale(data.locale);
      document.getElementById('workspace-choice').title = data.workspacePath || '';
      document.getElementById('runtime-version').textContent = 'Tvijo ' + (data.runtimeVersion || '—') + ' ↻';
      document.getElementById('runtime-version').title = locale === 'ru' ? 'После обновления: перезагрузить окно' : 'After updating: reload window';
      document.getElementById('auto-commit').textContent=(locale==='ru'?'Автокоммит: ':'Auto-commit: ')+(data.autoCommit==='off'?(locale==='ru'?'выкл':'off'):(locale==='ru'?'вкл':'on'));
      document.getElementById('bot-setup-note').hidden = !data.botSetupNeeded;
      const bridgeNote = document.getElementById('bridge-note'); bridgeNote.hidden = !data.bridgeEnabled; bridgeNote.textContent = t('bridgeOn');
      const scanNote=document.getElementById('rules-scan-note');scanNote.hidden=!data.rulesScanTruncated;scanNote.textContent=locale==='ru'?'Сканирование правил усечено — команды требуют подтверждения.':'Rules scan truncated — commands require confirmation.';
      const rulesPanel=document.getElementById('loaded-rules');rulesPanel.replaceChildren();
      for(const rule of data.loadedRules || []){const row=document.createElement('div');row.className='rule-row';const toggle=document.createElement('button');toggle.type='button';toggle.textContent=(rule.quarantined?'⚠ ':rule.disabled?'☐ ':'☑ ')+rule.file+' · '+rule.bytes+' B'+(rule.truncated?(locale==='ru'?' · обрезано':' · truncated'):'')+(rule.status==='rejected'?' · '+rule.reason:'')+(rule.quarantined?(locale==='ru'?' · карантин — включить снова':' · quarantined — re-enable'):'');toggle.disabled=running;toggle.addEventListener('click',()=>post({type:rule.quarantined?'reenableRule':'toggleRule',id:rule.quarantined?(rule.quarantineId || rule.id):rule.id}));row.append(toggle);rulesPanel.append(row);}
      renderRunSession(data.runSession);
      if (data.workflow && !data.options && !(orchestrationState.enabled && uiMode !== 'chat')) { window.tvijoWorkflow = data.workflow; document.getElementById('workflow-label').textContent = data.workflow; }
      const packPicker = document.getElementById('pack-picker');
      packPicker.hidden = !data.signedIn || !data.pack;
      packPicker.textContent = data.pack ? data.pack.label + ' ▾' : '';
      packPicker.title = data.pack ? data.pack.summary : '';
      packPicker.setAttribute('aria-label', (locale === 'ru' ? 'Выбрать пакет навыков: ' : 'Choose skill pack: ') + (data.pack?.label || ''));
      if (data.options) renderOptions(data.options);
      fullAccess = data.fullAccess && typeof data.fullAccess === 'object' ? data.fullAccess : null;
        if (data.agentMap) { mapModel = data.agentMap; if (mapOpen) drawMap(); }
      renderContext(data.context);
      if (data.error) showNotice(data.error.text, data.error.action);
      else if (data.pending) showNotice(t('pendingNotice'), 'cancel');
      else showNotice('');
      workspaceAvailable = data.workspaceSelected !== false;
      activeWorkspaceLabel = data.workspaceSelected === false ? '' : data.projectLabel || '';
      liveQuestion = typeof data.liveQuestion === 'string' && data.liveQuestion ? data.liveQuestion : submitting ? liveQuestion : null;
      if (typeof data.liveFrom === 'string') liveFrom = data.liveFrom; else if (!liveQuestion) liveFrom = '';
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
      interruptedRuns = Array.isArray(data.interrupted) ? data.interrupted : [];
      recoveryNotes = Array.isArray(data.recoveryNotes) ? data.recoveryNotes : [];
      drawRecovery();
      preparing = !!data.attaching;
      pending = !!data.pending;
      controls(); renderAttachments(data.attachments || []);
      lastSignedIn = !!data.signedIn;
      document.getElementById('composer-signin').hidden = lastSignedIn;
      lastAccount = data.account || null;
      lastAuthState = data.authState || (lastSignedIn ? 'signed_in' : 'signed_out'); lastAuthError = data.authError || '';
      activeWorkspaceLabel = data.workspaceSelected === false ? '' : data.projectLabel || '';
      renderIdentity();
      if (lastUsage && (!data.signedIn || !data.account || scopeKey !== lastUsageScope || (lastUsage.account && data.account.tenant_id !== lastUsage.account.tenant_id))) { lastUsage = null; document.getElementById('usage-items').replaceChildren(); }
      document.getElementById('signin').textContent = t(lastSignedIn ? 'signedIn' : 'signIn');
      renderBudget(lastAccount);
      updateMode();
      legacyHistory = !!data.legacyHistory;
      document.getElementById('history-note').textContent = t(legacyHistory || legacyDraft ? 'legacyPrivacy' : 'historyPrivacy');
      drainFollowUps();
    } else if (data.type === 'presetResult') {
      if (data.scopeKey !== scopeKey || !pendingModeRequestId || data.requestId !== pendingModeRequestId) return;
      if (data.ok) { uiMode = data.preset === 'plan' ? 'plan' : 'agent'; modeExplicit = true; saveDraft(); }
      else showNotice(t('modeUpdateFailed'));
      pendingModeRequestId = null; closeModeMenu(true); controls(); updateMode();
    } else if (data.type === 'quote') {
      if (data.scopeKey !== scopeKey) return;
      lastQuote = data.quote || {}; drawQuote(lastQuote);
    } else if (data.type === 'usage') {
      if (data.scopeKey !== undefined && data.scopeKey !== scopeKey) return;
      renderUsage(data.usage); setTab('usage');
    } else if (data.type === 'submission') {
      if (data.scopeKey !== undefined && data.scopeKey !== scopeKey) return;
      const ownSubmission = typeof data.question === 'string' && data.question === lastSubmitted;
      submitting = false; liveQuestion = null; if (ownSubmission) lastSubmitted = null;
      controls();
      if (data.ok && question.value.trim() === data.question) { question.value = ''; saveDraft(); }
      if (!data.ok) {
        if (!question.value.trim() && ownSubmission) { question.value = data.question; saveDraft(); }
        if (followUps.length) { followPaused = true; drawFollowUps(); }
        question.focus();
      } else drainFollowUps();
    } else if (data.type === 'draft') {
      if (data.scopeKey !== undefined && data.scopeKey !== scopeKey) return;
      question.value = typeof data.text === 'string' ? data.text.slice(0, 20000) : '';
      if (['chat','agent','plan'].includes(data.mode)) { uiMode = data.mode; modeExplicit = true; }
      updateMode(); saveDraft(); question.focus();
    } else if (data.type === 'activity') {
      if (data.scopeKey !== undefined && data.scopeKey !== scopeKey) return;
      startActivity(data.stage, data.detail);
    } else if (data.type === 'inbox') {
      if (typeof data.text !== 'string' || !data.text.trim()) return;
      const bridgeId = typeof data.id === 'string' ? data.id : null;
      if (bridgeId) post({type:'inboxAck', id:bridgeId});
      // The host re-hands accepted messages after a view reload; one copy per id.
      if (bridgeId && (bridgeId === submittedBridgeId || followUps.some(item => item.bridgeId === bridgeId))) return;
      followUps.push({text:data.text.trim().slice(0, 20000), mode:['chat','agent','plan'].includes(data.mode) ? data.mode : 'agent', from:typeof data.from === 'string' ? data.from.slice(0, 40) : '', bridgeId});
      drawFollowUps();
      if (!running) startActivity('inbox', t('bridgeArrived') + ' ' + (followUps.at(-1).from || ''));
      drainFollowUps();
    } else if (data.type === 'attachmentDone') {
      uploading = false; controls(); uploadNext();
    } else if (data.type === 'openOptions') {
      plusMenu.className = ''; optionsMenu.className = 'open';
      document.getElementById('workflow').setAttribute('aria-expanded', 'true');
    }
  });
  document.getElementById('form').addEventListener('submit', event => {
    event.preventDefault(); const text = question.value.trim() || (attachmentCount ? t('attachmentOnly') : ''); if (!text || send.disabled || pendingModeRequestId) return;
    if (running || submitting) { followUps.push({text, mode:uiMode}); question.value = ''; saveDraft(); drawFollowUps(); return; }
    if (uiMode !== 'chat' && !workspaceAvailable) { openFolderBrowser(); return; }
    followPaused = false;
    submitText(text, uiMode);
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
  document.getElementById('workspace-choice').addEventListener('click', openFolderBrowser);
  document.getElementById('folder-active').addEventListener('click',()=>post({type:'activeFileFolder'}));
  document.getElementById('folder-recent').addEventListener('click',()=>post({type:'recentFolder'}));
  document.getElementById('signout').addEventListener('click',()=>post({type:'signout'}));
  document.getElementById('auto-commit').addEventListener('click',()=>post({type:'toggleAutoCommit'}));
  document.getElementById('folder-close').addEventListener('click', closeFolderBrowser);
  document.getElementById('folder-browser').addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeFolderBrowser(); } });
  document.getElementById('runtime-version').addEventListener('click', () => post({type:'reloadWindow'}));
  document.getElementById('composer-signin').addEventListener('click', () => post({type:'account'}));
  document.getElementById('signin').addEventListener('click', () => post({type:lastSignedIn ? 'account' : 'account'}));
  document.getElementById('cancel').addEventListener('click', () => post({type:'cancel'}));
  noticeActionButton.addEventListener('click', () => {if(currentNotice?.action==='rulesSettings'){setDrawer(true);return;}post({type: ['chooseFolder','addWorkspaceFolder'].includes(currentNotice?.action) ? currentNotice.action : currentNotice?.action === 'account' ? 'account' : currentNotice?.action === 'context' ? 'contextPreview' : 'cancel'});});
  document.getElementById('bot-setup').addEventListener('click', () => post({type:'botSetup'}));
  document.getElementById('bot-settings').addEventListener('click', () => post({type:'botSettings'}));
  document.getElementById('notice-close').addEventListener('click', () => { showNotice(''); post({type:'dismissNotice'}); });
  document.getElementById('context-preview').addEventListener('click', () => post({ type: 'contextPreview' }));
  document.getElementById('quick-edit').addEventListener('click', () => post({ type: 'quickEdit' }));
  document.getElementById('workflow').addEventListener('click', () => { renderOptions(optionState); plusMenu.className = ''; document.getElementById('plus').setAttribute('aria-expanded','false'); const open = optionsMenu.className !== 'open'; optionsMenu.className = open ? 'open' : ''; document.getElementById('workflow').setAttribute('aria-expanded', String(open)); });
  document.getElementById('commands').setAttribute('aria-haspopup','menu');
  document.getElementById('commands').addEventListener('click', () => togglePlus(document.getElementById('commands')));
  const closePlus = () => { plusMenu.className = ''; document.getElementById('plus').setAttribute('aria-expanded','false'); document.getElementById('commands').setAttribute('aria-expanded','false'); };
  for (const button of plusMenu.querySelectorAll('[data-action-id]')) button.addEventListener('click', () => {closePlus();if(button.dataset.actionId==='tvijo.attachFile')fileInput.click();else post({type:'action',actionId:button.dataset.actionId});});
  document.getElementById('all-actions').addEventListener('click', () => {closePlus();post({type:'commands'});});
  document.getElementById('rewind-close').addEventListener('click', () => {setTab('chat');document.getElementById('commands').focus();});
  document.getElementById('rewind').addEventListener('keydown', event => {if(event.key === 'Escape') {setTab('chat');document.getElementById('commands').focus();}});
  plusMenu.addEventListener('keydown', event => {
    const items = Array.from(plusMenu.querySelectorAll('[role="menuitem"]'));
    const index = items.indexOf(document.activeElement);
    if (event.key === 'Escape') {event.stopPropagation();closePlus();plusAnchor.focus();}
    else if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();}
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();document.activeElement?.click();}
  });
  for (const type of ['workspace','selection','path']) document.getElementById(type).addEventListener('click', () => { closePlus(); optionsMenu.className = ''; post({type}); });
  document.getElementById('tab-usage').addEventListener('click', () => { setTab('usage'); post({type:'usage'}); });
  document.getElementById('connections').addEventListener('click', () => post({type:'connections'}));
  document.getElementById('product-guide').addEventListener('click', () => post({type:'productGuide'}));
  document.getElementById('tasks').addEventListener('click', () => post({type:'tasks'}));
  function setDrawer(open) {
    document.getElementById('settings-drawer').hidden = !open;
    document.getElementById('settings').setAttribute('aria-expanded',String(open));
    if (open) document.getElementById('drawer-close').focus();
  }
  document.getElementById('settings').addEventListener('click', () => setDrawer(document.getElementById('settings-drawer').hidden));
  document.getElementById('drawer-close').addEventListener('click', () => {setDrawer(false);document.getElementById('settings').focus();});
  document.getElementById('settings-drawer').addEventListener('keydown', event => {if(event.key==='Escape'){setDrawer(false);document.getElementById('settings').focus();}});
  document.getElementById('extension-settings').addEventListener('click', () => post({type:'settings'}));
  document.getElementById('context-select').addEventListener('click', () => {setDrawer(false);post({type:'contextSelect'});});
  document.getElementById('engineering').addEventListener('click', () => {engineering=!engineering;document.body.setAttribute('data-view',engineering?'engineering':'simple');setLocale(locale);});
  document.getElementById('tab-chat').addEventListener('click', () => setTab('chat'));
  document.getElementById('tab-context').addEventListener('click', () => setTab('context'));
  document.getElementById('tab-terminal').addEventListener('click', () => setTab('terminal'));
  document.getElementById('clear-context').addEventListener('click', () => post({type:'clearAttachments'}));
  document.getElementById('lang').addEventListener('click', () => { setLocale(locale === 'en' ? 'ru' : 'en'); post({type:'locale', value:locale}); });
  document.getElementById('theme').addEventListener('click', () => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'));
  document.body.addEventListener('keydown', event => { if (event.key === 'Escape') { if (plusMenu.className === 'open') { closePlus(); document.getElementById('plus').focus(); } if (optionsMenu.className === 'open') { closeOptions(); document.getElementById('workflow').focus(); } } });
  document.getElementById('plus').addEventListener('click', () => togglePlus(document.getElementById('plus')));
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
