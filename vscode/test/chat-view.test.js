'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chatHtml } = require('../lib/chat-view');

function sidebar(initialState = {}) {
  const listeners = new Map();
  const elements = new Map();
  const created = [];
  const outgoing = [];
  let savedState = initialState;
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', disabled: false, textContent: '',
      attributes: {},
      addEventListener(type, fn) { listeners.set(`${id}:${type}`, fn); },
      focus() {}, replaceChildren() {}, append() {}, requestSubmit() {}, querySelectorAll() { return []; }, setAttribute(name, value) { this.attributes[name] = value; }, click() {}
    });
    return elements.get(id);
  }
  const document = { getElementById: element, body: element('body'), documentElement: element('html'), createElement: (tag) => { const node = { tag, append() {}, addEventListener() {}, setAttribute() {} }; created.push(node); return node; } };
  const window = { addEventListener(type, fn) { listeners.set(`window:${type}`, fn); } };
  const html = chatHtml({ cspSource: 'vscode-webview:' });
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'webview script exists');
  vm.runInNewContext(script, { document, window, acquireVsCodeApi: () => ({ postMessage: (message) => outgoing.push(message), getState: () => savedState, setState: (next) => { savedState = next; } }) });
  listeners.get('window:message')({ data: { type: 'state', scopeKey: 'tenant-a', messages: [], signedIn: true, attachments: [] } });
  return { element, outgoing, created, state: () => savedState, emit: (key, event) => {
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
  assert.equal(view.element('connection-label').textContent, 'Ограниченный бесплатный доступ');
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

test('mode control switches chat, agent and plan submissions', () => {
  const view = sidebar();
  view.element('question').value = 'Inspect the project';
  view.emit('mode:click', {});
  assert.equal(view.element('mode').textContent, 'Agent');
  view.emit('form:submit', { preventDefault() {} });
  assert.deepEqual(view.outgoing.at(-1).agent, true);
  assert.deepEqual(view.outgoing.at(-1).plan, false);
  view.emit('window:message', { data: { type: 'submission', scopeKey: 'tenant-a', ok: true, question: 'Inspect the project' } });
  view.emit('mode:click', {});
  assert.equal(view.element('mode').textContent, 'Plan (read-only)');
  view.element('question').value = 'Plan only';
  view.emit('form:submit', { preventDefault() {} });
  assert.equal(view.outgoing.at(-1).agent, true);
  assert.equal(view.outgoing.at(-1).plan, true);
});

test('shift+tab toggles plan mode for the agent', () => {
  const view = sidebar();
  view.emit('mode:click', {});
  view.emit('question:keydown', { key: 'Tab', shiftKey: true, preventDefault() {} });
  assert.equal(view.element('mode').textContent, 'Plan (read-only)');
  view.emit('question:keydown', { key: 'Tab', shiftKey: true, preventDefault() {} });
  assert.equal(view.element('mode').textContent, 'Agent');
});

test('agent events render a bounded activity log', () => {
  const view = sidebar();
  view.emit('window:message', { data: { type: 'agent', scopeKey: 'tenant-a', event: { type: 'start', goal: 'Inspect', planMode: false, maxSteps: 6, budgetUsd: 2 } } });
  assert.equal(view.element('agent-log').className, 'visible');
  view.emit('window:message', { data: { type: 'agent', scopeKey: 'tenant-a', event: { type: 'action', action: { tool: 'read_file', path: 'src/app.js' }, step: 1 } } });
  view.emit('window:message', { data: { type: 'agent', scopeKey: 'tenant-a', event: { type: 'result', result: { ok: true, path: 'src/app.js' }, step: 1 } } });
  view.emit('window:message', { data: { type: 'agent', scopeKey: 'tenant-a', event: { type: 'final', text: 'Done' } } });
  const texts = view.created.map(node => node.textContent).join('|');
  assert.match(texts, /Inspect/);
  assert.match(texts, /read_file/);
  assert.match(texts, /Done/);
});
