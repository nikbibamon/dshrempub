'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chatHtml } = require('../lib/chat-view');

function sidebar(initialState = {}, initialHostState = {}) {
  const listeners = new Map();
  const elements = new Map();
  const created = [];
  const outgoing = [];
  const document = { activeElement: null };
  let savedState = initialState;
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', disabled: false, textContent: '',
      attributes: {},
      addEventListener(type, fn) { (this.handlers ||= {})[type] = fn; if (id) listeners.set(`${id}:${type}`, fn); },
      focus() { document.activeElement = this; }, replaceChildren(...nodes) { this.children = nodes; }, append(...nodes) { this.children = [...(this.children || []), ...nodes]; }, requestSubmit() {},
      querySelectorAll(selector) { const nodes=this.children||[]; return selector.includes(':not(:disabled)') ? nodes.filter(node=>!node.disabled) : nodes; },
      querySelector(selector) { const nodes=this.children||[]; return nodes.find(node=>selector.includes('aria-checked') ? node.attributes['aria-checked']==='true' : true); },
      setAttribute(name, value) { this.attributes[name] = value; }, getAttribute(name) { return this.attributes[name]; }, click() { this.clicks=(this.clicks||0)+1; this.handlers?.click?.({target:this}); }
    });
    return elements.get(id);
  }
  document.getElementById = element; document.body = element('body'); document.documentElement = element('html');
  document.createElement = tag => { const node = { tag, textContent: '', children: [], attributes:{}, append(...nodes) { this.children.push(...nodes); }, addEventListener(type,fn) { (this.handlers ||= {})[type]=fn; }, setAttribute(name,value) { this.attributes[name]=value; }, getAttribute(name) { return this.attributes[name]; }, focus(){document.activeElement=this;}, click(){this.handlers?.click?.({target:this});} }; created.push(node); return node; };
  const window = { addEventListener(type, fn) { listeners.set(`window:${type}`, fn); } };
  const html = chatHtml({ cspSource: 'vscode-webview:' });
  element('plus-menu').querySelectorAll = selector => selector.includes('[data-action-id]')
    ? ['attach','mention-file','attach-problems','attach-terminal','clear-conversation','rewind-action','export-conversation','switch-model'].map(id=>{const node=element(id);node.dataset={actionId:{attach:'tvijo.attachFile','mention-file':'tvijo.mentionFile','attach-problems':'tvijo.attachProblems','attach-terminal':'tvijo.attachTerminal','clear-conversation':'tvijo.newConversation','rewind-action':'tvijo.rewind','export-conversation':'tvijo.export','switch-model':'tvijo.chooseWorkflow'}[id]};return node;})
    : selector.includes('[role="menuitem"]') ? ['attach','mention-file','attach-problems','attach-terminal','workspace','selection','path','clear-conversation','rewind-action','export-conversation','switch-model','all-actions'].map(element) : [];
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'webview script exists');
  vm.runInNewContext(script, { document, window, URL, acquireVsCodeApi: () => ({ postMessage: (message) => outgoing.push(message), getState: () => savedState, setState: (next) => { savedState = next; } }) });
  listeners.get('window:message')({ data: { type: 'state', scopeKey: 'tenant-a', messages: [], signedIn: true, attachments: [], ...initialHostState } });
  return { element, outgoing, created, document, state: () => savedState, emit: (key, event) => {
    if (event?.data?.type === 'state' && event.data.scopeKey === undefined) event = { data: { ...event.data, scopeKey: 'tenant-a' } };
    return listeners.get(key)(event);
  } };
}

test('sidebar keeps a rejected question and prevents a duplicate submit', () => {
  const view = sidebar();
  const question = view.element('question');
  question.value = 'Why is this slow?';
  const submit = () => view.emit('form:submit', { preventDefault() {} });
  submit();
  submit();
  assert.equal(view.outgoing.filter((item) => item.type === 'ask').length, 1);
  assert.equal(question.value, 'Why is this slow?');
  view.emit('window:message', { data: { type: 'submission', ok: false, question: 'Why is this slow?' } });
  assert.equal(question.value, 'Why is this slow?');
  assert.equal(view.element('send').disabled, false);
});

test('authentication state does not invent a free plan before account verification', () => {
  const view = sidebar({}, { signedIn: false });
  assert.equal(view.element('connection-label').textContent, 'Sign in');
  view.emit('window:message', { data: { type: 'state', signedIn: true, account: { preview: { tokens_remaining: 49739, tasks_remaining: 49 } }, messages: [] } });
  assert.equal(view.element('connection-label').textContent, 'Ready');
  assert.match(view.element('budget').textContent, /49.*tasks/);
  view.emit('lang:click', {});
  assert.equal(view.element('connection-label').textContent, 'Готово');
});

test('assistant Markdown renders while user text and receipt footer stay plain', () => {
  const view = sidebar();
  view.emit('window:message',{data:{type:'state',signedIn:true,messages:[{role:'user',content:'**plain user**'},{role:'assistant',content:'# Title\n**bold**\n```js\nlet x = 1;\n```',footer:'Task test · spent — · held —'}]}});
  assert.ok(view.created.some(node => node.tag === 'h1'));
  assert.ok(view.created.some(node => node.tag === 'strong' && node.children.length));
  assert.ok(view.created.some(node => node.textContent === '**plain user**'));
  assert.ok(view.created.some(node => node.className === 'task-footer' && node.textContent === 'Task test · spent — · held —'));
});

test('Agent map opens, updates only its scope, localizes and closes to chat', () => {
  const {buildAgentMap} = require('../lib/agent-map');
  const view = sidebar();
  view.emit('agent-map-button:click',{});
  assert.equal(view.element('agent-map').hidden,false);
  assert.equal(view.element('messages').hidden,true);
  assert.equal(view.outgoing.at(-1).type,'agentMap');
  const model = buildAgentMap({title:'PRIVATE_A',tasks:[{id:'test',status:'completed'}]});
  view.emit('window:message',{data:{type:'agentMap',scopeKey:'tenant-a',model}});
  assert.ok(view.created.some(node => node.textContent === 'PRIVATE_A'));
  const count = view.created.length;
  view.emit('window:message',{data:{type:'agentMap',scopeKey:'tenant-b',model}});
  assert.equal(view.created.length,count);
  view.emit('lang:click',{});
  assert.equal(view.element('map-title').textContent,'Карта агентов');
  view.emit('window:message',{data:{type:'state',scopeKey:'tenant-b',signedIn:true,messages:[]}});
  assert.equal(view.element('map-details').children.some(node => node.textContent === 'PRIVATE_A'),false);
  view.emit('map-close:click',{});
  assert.equal(view.element('agent-map').hidden,true);
  assert.equal(view.element('messages').hidden,false);
});

test('observed run chips anchor to host timestamps, freeze and expose observed count through Agent Map', () => {
  const view = sidebar();
  assert.equal(view.element('elapsed-chip').textContent, 'Elapsed —');
  assert.equal(view.element('agent-map-button').textContent, 'Agents —');
  const start = Date.now() - 42000;
  view.emit('window:message',{data:{type:'runSession',scopeKey:'tenant-a',session:{status:'running',startedAt:start,endedAt:null,elapsedMs:42000,agents:1}}});
  assert.equal(view.element('elapsed-chip').textContent, 'Elapsed 00:42');
  assert.equal(view.element('agent-map-button').textContent, 'Agents 1');
  assert.match(view.element('agent-map-button').title,/Observed running agent/);
  view.emit('window:message',{data:{type:'runSession',scopeKey:'tenant-a',session:{status:'completed',startedAt:start,endedAt:start+42000,elapsedMs:42000,agents:0}}});
  assert.equal(view.element('elapsed-chip').textContent, 'Elapsed 00:42');
  assert.equal(view.element('agent-map-button').textContent, 'Agents 0');
  view.emit('agent-map-button:click',{});
  assert.equal(view.element('agent-map').hidden,false);
  view.emit('window:message',{data:{type:'state',scopeKey:'tenant-b',signedIn:true,messages:[]}});
  assert.equal(view.element('elapsed-chip').textContent, 'Elapsed —');
  assert.equal(view.element('agent-map-button').textContent, 'Agents —');
});

test('compact pack header has an accessible native-picker action and hides unavailable/signed-out packs', () => {
  const view = sidebar();
  const picker = view.element('pack-picker');
  assert.equal(picker.hidden, true);
  view.emit('window:message', { data: { type: 'state', signedIn: true, pack: { label: 'auto: TEST', summary: 'SYNTHETIC_SUMMARY' } } });
  assert.equal(picker.hidden, false);
  assert.equal(picker.textContent, 'auto: TEST ▾');
  assert.equal(picker.attributes['aria-label'], 'Choose skill pack: auto: TEST');
  view.emit('pack-picker:click', {});
  assert.equal(view.outgoing.at(-1).type, 'choosePack');
  assert.equal(view.outgoing.at(-1).scopeKey, 'tenant-a');
  view.emit('window:message', { data: { type: 'state', locale: 'ru', signedIn: true, pack: { label: 'авто: ТЕСТ', summary: 'ТЕСТ' } } });
  assert.equal(picker.attributes['aria-label'], 'Выбрать пакет навыков: авто: ТЕСТ');
  view.emit('window:message', { data: { type: 'state', signedIn: true, pack: null } });
  assert.equal(picker.hidden, true);
  view.emit('window:message', { data: { type: 'state', signedIn: false, pack: { label: 'TEST' } } });
  assert.equal(picker.hidden, true);
});

test('sidebar permits attachment-only questions and shows the image text boundary', () => {
  const view = sidebar();
  view.emit('window:message', { data: { type: 'state', messages: [], attachments: [{ id: 'image-1', name: 'screen.png', kind: 'image', size: 1024, preview: 'data:image/png;base64,AA==' }] } });
  assert.equal(view.element('ocrnote').hidden, false);
  view.emit('form:submit', { preventDefault() {} });
  assert.equal(view.outgoing.at(-1).question, 'Explain the attached context.');
});

test('sidebar clears only the accepted question, preserving a new draft', () => {
  const view = sidebar();
  const question = view.element('question');
  question.value = 'First question';
  view.emit('form:submit', { preventDefault() {} });
  question.value = 'Second draft';
  view.emit('window:message', { data: { type: 'submission', ok: true, question: 'First question' } });
  assert.equal(question.value, 'Second draft');
  view.emit('form:submit', { preventDefault() {} });
  view.emit('window:message', { data: { type: 'submission', ok: true, question: 'Second draft' } });
  assert.equal(question.value, '');
});

test('context overflow notice routes to the context preview', () => {
  const view = sidebar();
  view.emit('window:message', { data: { type: 'state', messages: [], error: { text: 'too large', action: 'context' } } });
  assert.equal(view.element('notice-action').textContent, 'Preview project context');
  view.emit('notice-action:click', {});
  assert.equal(view.outgoing.at(-1).type, 'contextPreview');
});

test('guided first task prefills a read-only plan draft', () => {
  const view = sidebar();
  view.emit('window:message', { data: { type: 'draft', text: 'Explain this project and list three safe improvements.', mode: 'plan' } });
  assert.equal(view.element('question').value, 'Explain this project and list three safe improvements.');
  assert.equal(view.state().mode, 'plan');
  assert.equal(view.state().drafts['tenant-a'], 'Explain this project and list three safe improvements.');
  view.emit('window:message', { data: { type: 'draft', text: 'ignored', mode: 'plan', scopeKey: 'other-tenant' } });
  assert.equal(view.element('question').value, 'Explain this project and list three safe improvements.');
});

test('compact composer opens contextual actions and routes terminal tab to the extension', () => {
  const view = sidebar();
  view.emit('plus:click', {});
  assert.equal(view.element('plus-menu').className, 'open');
  view.emit('workspace:click', {});
  assert.equal(view.outgoing.at(-1).type, 'workspace');
  view.emit('tab-terminal:click', {});
  assert.equal(view.outgoing.at(-1).type, 'terminal');
  assert.equal(view.element('tab-terminal').attributes['aria-selected'], 'true');
});

test('locale and theme preferences persist and live preview values render from state', () => {
  const view = sidebar();
  view.emit('lang:click', {});
  assert.equal(view.state().locale, 'ru');
  assert.equal(view.element('html').lang, 'ru');
  view.emit('theme:click', {});
  assert.equal(view.state().theme, 'light');
  view.emit('window:message', { data: { type: 'state', messages: [], signedIn: false, account: { preview: { tasks_remaining: 3, tokens_remaining: 25000, remaining_usd: 0.02 } } } });
  assert.equal(view.element('budget').textContent, '3 задач · 25,000 токенов · $0.020');
  assert.equal(view.element('connection-label').textContent, 'Войти');
});

test('theme uses cool blue palettes and embeds both interface languages', () => {
  const html = chatHtml({ cspSource: 'vscode-webview:' });
  assert.match(html, /#11151c/);
  assert.match(html, /#699cff/);
  assert.match(html, /#f7f9fc/);
  assert.match(html, /Build with context\./);
  assert.match(html, /Работайте с контекстом\./);
  assert.match(html, /role="menu"/);
  assert.doesNotMatch(html, /#f97316|#ff7a00|orange/i);
});


test('private usage tab requests receipts and clears them when the account changes', () => {
  const view = sidebar();
  let clearCount = 0;
  view.element('usage-items').replaceChildren = () => { clearCount++; };
  view.emit('tab-usage:click', {});
  assert.equal(view.outgoing.at(-1).type, 'usage');
  assert.equal(view.element('tab-usage').attributes['aria-selected'], 'true');
  view.emit('window:message', { data: { type: 'usage', usage: { account: { tenant_id: 'first', budget: { spent_usd:'0.01', held_usd:'0', remaining_usd:'0.04' } }, scope: { loaded_tasks:0, total_account_tasks:0 }, tasks:[] } } });
  view.emit('window:message', { data: { type: 'state', signedIn:false, messages:[], attachments:[] } });
  assert.equal(clearCount, 2, 'one render and one account-change clear');
  view.emit('connections:click', {});
  assert.equal(view.outgoing.at(-1).type,'connections');
  view.emit('product-guide:click', {});
  assert.equal(view.outgoing.at(-1).type,'productGuide');
});

test('idle unresolved task exposes an actionable recovery control', () => {
  const view = sidebar();
  view.emit('window:message', { data: { type: 'state', scopeKey: 'tenant-a', messages: [], signedIn: true, busy: false, pending: true, attachments: [] } });
  assert.equal(view.element('cancel').hidden, true);
  assert.equal(view.element('notice').className, 'visible');
  assert.equal(view.element('notice-action').textContent, 'Resolve task');
  view.emit('notice-action:click', {});
  assert.equal(view.outgoing.at(-1).type, 'cancel');
  assert.equal(view.outgoing.at(-1).scopeKey, 'tenant-a');
  view.emit('tasks:click', {});
  assert.equal(view.outgoing.at(-1).type, 'tasks');
});

test('draft ownership follows verified service-tenant scope and legacy draft is retained without attribution', () => {
  const view = sidebar({ draft: 'UNASSIGNED OLD DRAFT' });
  assert.equal(view.element('question').value, '');
  assert.equal(view.state().legacyDraft, 'UNASSIGNED OLD DRAFT');
  view.element('question').value = 'A private draft';
  view.emit('question:input', {});
  view.emit('window:message', { data: { type: 'state', scopeKey: 'tenant-b', messages: [], signedIn: true } });
  assert.equal(view.element('question').value, '');
  view.element('question').value = 'B private draft';
  view.emit('window:message', { data: { type: 'submission', scopeKey: 'tenant-a', ok: true, question: 'B private draft' } });
  assert.equal(view.element('question').value, 'B private draft', 'late A callback cannot change B draft');
  view.emit('window:message', { data: { type: 'state', scopeKey: 'tenant-a', messages: [], signedIn: true } });
  assert.equal(view.element('question').value, 'A private draft');
  assert.equal(view.state().drafts['tenant-b'], 'B private draft');
  assert.equal(view.state().legacyDraft, 'UNASSIGNED OLD DRAFT');
});

test('sidebar shows localized model, workflow and method choices in its own menu', () => {
  const view = sidebar();
  view.emit('window:message', { data: { type: 'state', locale: 'ru', messages: [], signedIn: true, options: {
    models: [{ id: 'auto', name: 'Automatic' }, { id: 'coding', name: 'DSHREM Coding' }, { id: 'ds41f', name: 'DeepSeek V4.1 Flash' }],
    model: 'ds41f', agentMode: 'single', reasoningMethod: 'evidence-first'
  } } });
  const texts = view.created.map(node => node.textContent);
  assert.ok(texts.includes('Модель'));
  assert.ok(texts.includes('Режим работы'));
  assert.ok(texts.includes('Метод рассуждения'));
  assert.ok(texts.includes('Сначала доказательства'));
  assert.equal(view.element('workflow-label').textContent, 'DeepSeek V4.1 Flash · Сначала доказательства');
  assert.equal(view.element('workflow').title, 'Модель и метод');
});

test('sidebar shows one actionable error card instead of repeating it in the status bar', () => {
  const view = sidebar();
  view.emit('window:message', { data: { type: 'state', locale: 'en', messages: [], signedIn: true,
    error: { text: 'The service has no task for the saved request.', action: 'cancel' } } });
  assert.equal(view.element('notice-text').textContent, 'The service has no task for the saved request.');
  assert.equal(view.element('notice').className, 'visible');
  assert.equal(view.element('notice-action').textContent, 'Resolve task');
  assert.equal(view.element('state').textContent, '');
  assert.equal(view.element('connection-label').textContent, 'Ready');
});

test('language toggle reaches the extension host', () => {
  const view = sidebar();
  view.emit('lang:click', {});
  assert.equal(view.outgoing.at(-1).type, 'locale');
  assert.equal(view.outgoing.at(-1).value, 'ru');
  assert.equal(view.element('question').placeholder, 'Спросите о проекте…');
});

test('sidebar renders bounded project context and the activity stage', () => {
  const view = sidebar();
  view.emit('window:message', { data: { type: 'state', messages: [], signedIn: true,
    context: { mode: 'on', last: { root: 'demo', files: 7, bytes: 2048 } } } });
  assert.match(view.element('context-summary').textContent, /demo/);
  assert.match(view.element('context-summary').textContent, /7 files/);
  view.emit('window:message', { data: { type: 'activity', stage: 'scan', detail: 'demo · 7 files' } });
  assert.equal(view.element('activity').className, 'visible');
  assert.equal(view.element('activity-detail').textContent, 'demo · 7 files');
  view.emit('window:message', { data: { type: 'activity', stage: 'done' } });
  assert.equal(view.element('activity').className, '');
});

test('sidebar offers project-context and apply settings in its own menu', () => {
  const view = sidebar();
  view.emit('window:message', { data: { type: 'state', messages: [], signedIn: true, options: {
    models: [{ id: 'coding', name: 'DSHREM Coding' }], model: 'coding', agentMode: 'single',
    reasoningMethod: 'evidence-first', contextMode: 'ask', autoApply: false
  } } });
  const texts = view.created.map(node => node.textContent);
  assert.ok(texts.includes('Project context'));
  assert.ok(texts.includes('Always send'));
  assert.ok(texts.includes('Confirm before apply'));
});

test('explicit mode menu submits Chat, Agent presets and per-run Plan separately', () => {
  const view = sidebar();
  const scopeKey='tenant-a';
  const options={models:[{id:'coding',name:'DSHREM Coding'}],model:'coding',agentModel:'coding',agentMode:'council',agentPreset:'manual',agentAutoApply:false,agentAutoRun:false,reasoningMethod:'evidence-first'};
  view.emit('window:message',{data:{type:'state',scopeKey,signedIn:true,messages:[],options}});
  view.element('question').value = 'Inspect the project';
  view.emit('mode:click', {});
  assert.equal(view.element('mode-menu').hidden,false);
  assert.equal(view.element('mode-menu').children.find(item=>item.attributes['data-mode']==='chat').attributes['aria-checked'],'true');
  view.element('mode-menu').children.find(item=>item.attributes['data-mode']==='manual').click();
  assert.equal(view.outgoing.at(-1).type,'agentPreset');
  assert.equal(view.outgoing.at(-1).preset,'manual');
  view.emit('window:message',{data:{type:'presetResult',scopeKey,requestId:view.outgoing.at(-1).requestId,preset:'manual',ok:true}});
  assert.equal(view.element('mode').textContent,'Manual');
  view.emit('form:submit', { preventDefault() {} });
  assert.deepEqual(view.outgoing.at(-1).agent, true);
  assert.deepEqual(view.outgoing.at(-1).plan, false);
  view.emit('window:message', { data: { type: 'submission', scopeKey: 'tenant-a', ok: true, question: 'Inspect the project' } });
  view.emit('mode:click', {});
  view.element('mode-menu').children.find(item=>item.attributes['data-mode']==='plan').click();
  assert.equal(view.outgoing.at(-1).type,'agentPreset');
  assert.equal(view.outgoing.at(-1).preset,'plan');
  view.emit('window:message',{data:{type:'presetResult',scopeKey,requestId:view.outgoing.at(-1).requestId,preset:'plan',ok:true}});
  assert.equal(view.element('mode').textContent,'Plan');
  view.element('question').value = 'Plan only';
  view.emit('form:submit', { preventDefault() {} });
  assert.equal(view.outgoing.at(-1).agent, true);
  assert.equal(view.outgoing.at(-1).plan, true);
});

test('mode menu supports keyboard navigation and Shift+Tab remains ordinary focus navigation', () => {
  const view = sidebar();
  view.emit('window:message',{data:{type:'state',scopeKey:'tenant-a',signedIn:true,options:{models:[{id:'coding',name:'DSHREM Coding'}],model:'coding',agentPreset:'manual'}}});
  view.emit('mode:click', {});
  const menu=view.element('mode-menu'), before=view.document.activeElement;
  assert.equal(before.attributes['data-mode'],'chat');
  view.emit('mode-menu:keydown',{key:'End',preventDefault(){}});
  assert.equal(view.document.activeElement.attributes['data-mode'],'auto');
  view.emit('mode-menu:keydown',{key:'Home',preventDefault(){}});
  assert.equal(view.document.activeElement.attributes['data-mode'],'chat');
  view.emit('mode-menu:keydown',{key:'Escape',preventDefault(){}});
  assert.equal(menu.hidden,true);
  assert.equal(view.document.activeElement,view.element('mode'));
  view.emit('mode:click',{});
  view.emit('mode-menu:keydown',{key:'ArrowDown',preventDefault(){}});
  view.emit('mode-menu:keydown',{key:' ',preventDefault(){}});
  assert.equal(view.outgoing.at(-1).preset,'manual');
  view.emit('window:message',{data:{type:'presetResult',scopeKey:'tenant-a',requestId:view.outgoing.at(-1).requestId,preset:'manual',ok:true}});
  view.emit('mode:click',{});
  view.emit('mode-menu:keydown',{key:'ArrowDown',preventDefault(){}});
  view.emit('mode-menu:keydown',{key:'Enter',preventDefault(){}});
  assert.equal(view.outgoing.at(-1).preset,'edit');
  view.emit('window:message',{data:{type:'presetResult',scopeKey:'tenant-a',requestId:view.outgoing.at(-1).requestId,preset:'edit',ok:true}});
  const selected=view.element('mode').textContent;
  let prevented=false;
  view.emit('question:keydown',{key:'Tab',shiftKey:true,preventDefault(){prevented=true;}});
  assert.equal(prevented,false);
  assert.equal(view.element('mode').textContent,selected);
});

test('Full access is host-gated, waits for acknowledgement, and warning stays until host state clears it',()=>{
  const view=sidebar();
  const options={models:[{id:'coding',name:'Coding'}],model:'coding',agentPreset:'manual'};
  view.emit('window:message',{data:{type:'state',scopeKey:'tenant-a',signedIn:true,options}});
  view.element('mode').click();
  let full=view.element('mode-menu').children.find(item=>item.attributes['data-mode']==='full');
  assert.equal(full.disabled,true);
  view.emit('window:message',{data:{type:'state',scopeKey:'tenant-a',signedIn:true,options,fullAccess:{available:true,enabled:false,folder:'/work',scopeKey:'a'.repeat(64),active:[]}}});
  view.element('mode').click();
  full=view.element('mode-menu').children.find(item=>item.attributes['data-mode']==='full');
  assert.equal(full.disabled,false);
  full.click();
  const request=view.outgoing.at(-1);
  assert.equal(request.type,'agentPreset'); assert.equal(request.preset,'full'); assert.ok(request.requestId);
  assert.equal(view.element('mode').textContent,'Chat','mode waits for host acknowledgement');
  view.emit('window:message',{data:{type:'presetResult',scopeKey:'tenant-a',requestId:request.requestId,preset:'full',ok:true}});
  view.emit('window:message',{data:{type:'state',scopeKey:'tenant-a',options:{...options,agentPreset:'full'},fullAccess:{available:true,enabled:true,folder:'/work',scopeKey:'a'.repeat(64),active:[]}}});
  assert.equal(view.element('mode').textContent,'Full access');

  const folder='<img src=x onerror="alert(1)">';
  const fullAccess={available:true,enabled:true,folder,scopeKey:'b'.repeat(64),active:[{folder,scopeKey:'b'.repeat(64)}]};
  view.emit('window:message',{data:{type:'state',scopeKey:'tenant-a',options:{...options,agentPreset:'full'},fullAccess,busy:true}});
  const warning=view.element('full-access-warning');
  assert.equal(warning.hidden,false);
  assert.ok(warning.children[1].children.some(node=>node.textContent===folder));
  assert.equal(warning.children[1].children.some(node=>node.tag==='img'),false);
  assert.match(warning.children[0].textContent,/Full access is active/);
  assert.notEqual(warning.children[1].children[1].disabled,true,'revert stays usable while running');
  view.element('tab-context').click();
  assert.equal(warning.hidden,false);
  view.element('tab-chat').click();
  assert.equal(warning.hidden,false);
  warning.children[1].children[1].click();
  assert.deepEqual({...view.outgoing.at(-1)},{type:'fullAccessRevert',fullAccessScope:'b'.repeat(64),scopeKey:'tenant-a'});
  assert.equal(warning.hidden,false,'revert waits for host state');
  view.emit('window:message',{data:{type:'state',scopeKey:'tenant-a',options,fullAccess:{available:true,enabled:false,folder,scopeKey:'b'.repeat(64),active:[]}}});
  assert.equal(warning.hidden,true);
  view.emit('window:message',{data:{type:'state',scopeKey:'tenant-a',options}});
  assert.equal(warning.hidden,true,'missing state hides the warning');
});

test('external non-preset flags display Custom and failed preset update does not change mode',()=>{
  const view=sidebar();
  view.emit('window:message',{data:{type:'state',scopeKey:'tenant-a',signedIn:true,options:{models:[{id:'coding',name:'Coding'}],model:'coding',agentPreset:'custom',agentAutoApply:false,agentAutoRun:true}}});
  view.element('mode').click();
  assert.ok(view.element('mode-menu').children.some(item=>item.children?.[0]?.textContent==='Свои настройки' || item.children?.[0]?.textContent==='Custom'));
  view.element('mode-menu').children.find(item=>item.attributes['data-mode']==='custom').click();
  assert.equal(view.element('mode').textContent,'Custom');
  view.element('mode').click();
  view.element('mode-menu').children.find(item=>item.attributes['data-mode']==='auto').click();
  const request=view.outgoing.at(-1);
  view.emit('window:message',{data:{type:'presetResult',scopeKey:'tenant-a',requestId:request.requestId,preset:'auto',ok:false}});
  assert.equal(view.element('mode').textContent,'Custom');
  assert.equal(view.element('notice').className,'visible');
});

test('agent events render a bounded activity log', () => {
  const view = sidebar();
  view.emit('window:message', { data: { type: 'agent', scopeKey: 'tenant-a', event: { type: 'start', goal: 'Inspect', planMode: false, maxSteps: 6, budgetUsd: 2 } } });
  assert.equal(view.element('agent-log').className, 'visible');
  view.emit('window:message', { data: { type: 'agent', scopeKey: 'tenant-a', event: { type: 'action', action: { tool: 'read_file', path: 'src/app.js' }, step: 1 } } });
  view.emit('window:message', { data: { type: 'agent', scopeKey: 'tenant-a', event: { type: 'result', result: { ok: true, path: 'src/app.js' }, step: 1 } } });
  view.emit('window:message', { data: { type: 'agent', scopeKey: 'tenant-a', event: { type: 'final', text: 'Done' } } });
  view.emit('window:message', { data: { type: 'agent', scopeKey: 'tenant-a', event: { type: 'final', text: 'Step limit reached', partial: true } } });
  const texts = view.created.map(node => node.textContent).join('|');
  assert.match(texts, /Inspect/);
  assert.match(texts, /read_file/);
  assert.match(texts, /Done/);
  assert.match(texts, /Partial result/);
});

test('agent reset clears stale output and incomplete starts omit missing counters', () => {
  const view = sidebar();
  view.emit('window:message', { data: { type: 'agent', scopeKey: 'tenant-a', event: { type: 'start', goal: '', planMode: true } } });
  assert.equal(view.element('agent-log').className, 'visible');
  assert.doesNotMatch(view.element('agent-log').children.map(item => item.children.map(child => child.textContent).join(' ')).join(' '), /undefined/);
  const rendered = view.element('agent-log');
  view.emit('window:message', { data: { type: 'agent', scopeKey: 'tenant-a', event: { type: 'reset' } } });
  assert.equal(rendered.className, '');
  assert.equal(rendered.children.length, 0);
});

test('agent and plan labels use the configured agent model while chat shows model and method', () => {
  const view = sidebar();
  view.emit('window:message', { data: { type: 'state', locale: 'en', messages: [], signedIn: true, options: {
    models: [{ id: 'coding', name: 'DSHREM Coding' }, { id: 'ds41f', name: 'DeepSeek V4.1 Flash' }],
    model: 'coding', agentModel: 'ds41f', agentMode: 'single', reasoningMethod: 'plan-check'
  } } });
  assert.equal(view.element('workflow-label').textContent, 'DSHREM Coding · Plan, then check');
  view.emit('mode:click', {}); view.element('mode-menu').children.find(item=>item.attributes['data-mode']==='manual').click();
  view.emit('window:message',{data:{type:'presetResult',scopeKey:'tenant-a',requestId:view.outgoing.at(-1).requestId,preset:'manual',ok:true}});
  assert.equal(view.element('workflow-label').textContent, 'DeepSeek V4.1 Flash');
  assert.match(view.element('mode-help').textContent, /project tools/);
  view.emit('mode:click', {}); view.element('mode-menu').children.find(item=>item.attributes['data-mode']==='plan').click();
  view.emit('window:message',{data:{type:'presetResult',scopeKey:'tenant-a',requestId:view.outgoing.at(-1).requestId,preset:'plan',ok:true}});
  assert.equal(view.element('workflow-label').textContent, 'DeepSeek V4.1 Flash');
  assert.match(view.element('mode-help').textContent, /cannot write files/);
  assert.match(view.element('mode-help').textContent, /local shell command directly/);
});

test('delayed preset acknowledgement locks duplicate mode clicks and sending, then releases on failure and scope change',()=>{
  const view=sidebar();
  const options={models:[{id:'coding',name:'Coding'}],model:'coding',agentPreset:'manual',agentAutoApply:false,agentAutoRun:false};
  view.emit('window:message',{data:{type:'state',scopeKey:'tenant-a',signedIn:true,messages:[],options}});
  view.element('question').value='Keep this draft';
  view.emit('mode:click',{});
  const menu=view.element('mode-menu');
  menu.children.find(item=>item.attributes['data-mode']==='auto').click();
  const request=view.outgoing.at(-1);
  assert.equal(request.type,'agentPreset');
  assert.equal(view.element('question').value,'Keep this draft');
  assert.equal(view.element('send').disabled,true);
  assert.ok(menu.children.every(item=>item.disabled));
  view.element('mode').click();
  menu.children.find(item=>item.attributes['data-mode']==='plan').click();
  assert.equal(view.outgoing.filter(item=>item.type==='agentPreset').length,1,'duplicate clicks do not create requests');
  view.emit('form:submit',{preventDefault(){}});
  assert.equal(view.outgoing.some(item=>item.type==='ask'),false,'submission stays blocked while settings are pending');
  view.emit('window:message',{data:{type:'presetResult',scopeKey:'tenant-a',requestId:request.requestId,preset:'auto',ok:false}});
  assert.equal(view.element('send').disabled,false);
  assert.equal(view.element('question').value,'Keep this draft');
  assert.equal(view.element('notice').className,'visible');

  view.emit('mode:click',{});
  menu.children.find(item=>item.attributes['data-mode']==='auto').click();
  const stale=view.outgoing.at(-1);
  view.emit('window:message',{data:{type:'state',scopeKey:'tenant-b',signedIn:true,messages:[],options}});
  assert.equal(view.element('send').disabled,false,'scope changes clear the local pending lock');
  assert.equal(view.element('question').value,'');
  view.emit('window:message',{data:{type:'presetResult',scopeKey:'tenant-a',requestId:stale.requestId,preset:'auto',ok:true}});
  assert.equal(view.element('mode').textContent,'Chat','the stale result cannot alter the new scope');
  view.emit('window:message',{data:{type:'state',scopeKey:'tenant-a',signedIn:true,messages:[],options}});
  assert.equal(view.element('question').value,'Keep this draft');
});

test('nullable usage fields render as unknown instead of null or a false zero', () => {
  const view = sidebar();
  view.emit('lang:click', {});
  view.emit('window:message', { data: { type: 'usage', usage: {
    account: { budget: { spent_usd: false, held_usd: null, remaining_usd: undefined, daily_remaining_usd: null },
      preview: { tasks_remaining: null, tokens_remaining: undefined } },
    scope: { loaded_tasks: null, total_account_tasks: undefined }, tasks: []
  } } });
  const usage = view.element('usage-items').children.map(item => item.textContent).join('\n');
  assert.doesNotMatch(usage, /null|undefined|\$0(?:\.0+)?/);
  assert.match(usage, /— задач · — токенов/);
  assert.match(usage, /Всего расход — · резерв — · доступно —/);
});

test('narrow sidebar styles wrap footer actions without character-by-character columns', () => {
  const html = chatHtml({ cspSource: 'vscode-webview:' });
  assert.match(html, /@media\(max-width:420px\)\{\.product-links\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(html, /overflow-wrap:break-word/);
  assert.match(html, /min-width:0;max-width:100%;white-space:normal;word-break:normal/);
});

test('Rewind action in unified plus menu shows metadata only, localizes and returns to chat with restore note',()=>{
  const view=sidebar();view.emit('plus:click',{});assert.equal(view.element('plus-menu').className,'open');
  view.emit('rewind-action:click',{target:view.element('rewind-action')});assert.equal(view.outgoing.at(-1).type,'action');assert.equal(view.outgoing.at(-1).actionId,'tvijo.rewind');
  const runs=[{id:'r',title:'Test run',time:1,steps:[{step:2,time:1,model:'synthetic',files:['src/a.js']}]}];
  view.emit('window:message',{data:{type:'rewind',workspaceKey:'w',runs}});assert.equal(view.element('rewind').hidden,false);assert.equal(view.element('messages').hidden,true);
  view.emit('lang:click',{});assert.equal(view.element('rewind-title').textContent,'Восстановление');
  view.emit('window:message',{data:{type:'rewindResult',workspaceKey:'other',text:'stale'}});assert.equal(view.element('rewind').hidden,false);
  view.emit('window:message',{data:{type:'rewindResult',workspaceKey:'w',text:'Rewound to step 2: 1 files restored'}});assert.equal(view.element('rewind').hidden,true);assert.equal(view.element('messages').hidden,false);
});

test('unified plus menu keeps local upload, workspace action, keyboard access and pending disable state',()=>{
  const view=sidebar();
  const ids=['attach','mention-file','attach-problems','attach-terminal','workspace','selection','path','clear-conversation','rewind-action','export-conversation','switch-model','all-actions'];
  assert.ok(ids.every(id=>view.element(id)));
  view.emit('plus:click',{});
  assert.equal(view.document.activeElement,view.element('attach'));
  view.emit('plus-menu:keydown',{key:'ArrowDown',preventDefault(){}});
  assert.equal(view.document.activeElement,view.element('mention-file'));
  view.emit('attach:click',{target:view.element('attach')});
  assert.equal(view.element('file').clicks,1);
  assert.ok(!view.outgoing.some(item=>item.type==='action'&&item.actionId==='tvijo.attachFile'));
  view.emit('window:message',{data:{type:'submission',scopeKey:'tenant-a',ok:false,question:'keep draft'}});
  assert.equal(view.element('question').value,'');
  assert.equal(view.element('send').disabled,false);
});


test('interrupted cards use safe text and scoped restore/fetch controls with local notes',()=>{
  const view=sidebar();
  view.emit('window:message',{data:{type:'state',scopeKey:'tenant-a',signedIn:true,messages:[],interrupted:[{id:'saved',kind:'agent',prompt:'<script>private prompt</script>',events:3,taskId:'known-task'}],recoveryNotes:['A partial local journal was ignored.']}});
  assert.equal(view.element('recovery').hidden,false);
  const card=view.element('recovery-list').children[0];
  assert.equal(card.children[0].textContent,'<script>private prompt</script>');
  assert.match(view.element('recovery-notes').textContent,/partial/);
  const buttons=card.children[2].children;
  buttons[0].click();buttons[1].click();
  assert.equal(view.outgoing.at(-2).type,'restoreRun');assert.equal(view.outgoing.at(-2).scopeKey,'tenant-a');
  assert.equal(view.outgoing.at(-1).type,'fetchRun');assert.equal(view.outgoing.at(-1).id,'saved');
  view.emit('window:message',{data:{type:'state',scopeKey:'tenant-b',signedIn:true,messages:[]}});
  assert.equal(view.element('recovery').hidden,true);
  assert.equal(view.element('recovery-list').children.length,0);
});

test('durable draft hydrates once, preserves typed changes and separates workspace identities',()=>{
  const view=sidebar();
  const state={type:'state',scopeKey:'restart-account',composerScope:'workspace-a',signedIn:true,messages:[],composerDraft:{text:'durable draft',mode:'plan'}};
  view.emit('window:message',{data:state});
  assert.equal(view.element('question').value,'durable draft');
  assert.equal(view.state().mode,'plan');
  view.element('question').value='new typing';view.emit('question:input',{});
  assert.equal(view.outgoing.at(-1).type,'composerDraft');assert.equal(view.outgoing.at(-1).text,'new typing');
  view.emit('window:message',{data:state});
  assert.equal(view.element('question').value,'new typing');
  view.emit('window:message',{data:{...state,composerScope:'workspace-b',composerDraft:{text:'other workspace',mode:'chat'}}});
  assert.equal(view.element('question').value,'other workspace');
  view.emit('window:message',{data:state});
  assert.equal(view.element('question').value,'new typing');
});


test('pre-journal account draft migrates on initial hydration without crossing accounts',()=>{
  const view=sidebar({drafts:{'tenant-a':'existing saved draft'},mode:'chat'},{composerScope:'workspace-a',composerDraft:null});
  assert.equal(view.element('question').value,'existing saved draft');
  const other=sidebar({drafts:{'other-account':'private saved draft'},mode:'chat'},{composerScope:'workspace-a',composerDraft:null});
  assert.equal(other.element('question').value,'');
  const cleared=sidebar({drafts:{'tenant-a':'older draft'},mode:'chat'},{composerScope:'workspace-a',composerDraft:{text:'',mode:'chat'}});
  assert.equal(cleared.element('question').value,'');
});


test('expired cached drafts cannot outlive the seven-day disk recovery window',()=>{
  const saved={drafts:{'workspace-a':'EXPIRED_CACHED_DRAFT'},draftTimes:{'workspace-a':Date.now()-8*24*60*60*1000},composerScope:'workspace-a',mode:'chat'};
  const view=sidebar(saved,{composerScope:'workspace-a',composerDraft:null});
  assert.equal(view.element('question').value,'');
  view.element('question').value='fresh';view.emit('question:input',{});
  assert.ok(view.state().draftTimes['workspace-a']>Date.now()-1000);
  assert.equal(view.outgoing.at(-1).composerScope,'workspace-a');
});
