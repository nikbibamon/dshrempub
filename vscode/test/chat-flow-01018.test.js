'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chatHtml } = require('../lib/chat-view');
const {sidebar} = require('./helpers/sidebar');

const asks = view => view.outgoing.filter(item => item.type === 'ask');
const submit = view => view.emit('form:submit', { preventDefault() {} });
const userBubbles = view => (view.element('messages').children || []).filter(node => String(node.className || '').includes('user'));

test('0.10.18 a message typed while the agent runs is queued and sent when the answer ends', () => {
  const view = sidebar({}, {busy:true});
  view.element('question').value = 'what next?';
  submit(view);
  assert.equal(asks(view).length, 0);
  assert.equal(view.element('question').value, '');
  assert.equal(view.element('followups').hidden, false);
  assert.match(view.element('followups').children[0].children[0].textContent, /Queued: what next\?/);
  view.emit('window:message', { data: { type: 'state', busy:false, messages: [] } });
  assert.equal(asks(view).length, 1);
  assert.equal(asks(view)[0].question, 'what next?');
  assert.equal(asks(view)[0].agent, true);
  assert.equal(view.element('followups').hidden, true);
});

test('0.10.18 a refused request pauses the queue instead of firing the next message', () => {
  const view = sidebar();
  view.element('question').value = 'first';
  submit(view);
  view.element('question').value = 'second';
  submit(view);
  assert.equal(asks(view).length, 1);
  view.emit('window:message', { data: { type: 'submission', scopeKey:'tenant-a', ok:false, question:'first' } });
  view.emit('window:message', { data: { type: 'state', busy:false, messages: [] } });
  assert.equal(asks(view).length, 1);
  assert.equal(view.element('question').value, 'first');
  assert.match(view.element('followups').children[0].textContent, /Queue paused/);
  const sendNow = view.element('followups').children[1].children.find(node => node.textContent === 'Send now');
  view.element('question').value = '';
  sendNow.click();
  assert.equal(asks(view).length, 2);
  assert.equal(asks(view)[1].question, 'second');
});

test('0.10.18 the question being answered stays visible and is not duplicated once recorded', () => {
  const view = sidebar();
  view.element('question').value = 'project state?';
  submit(view);
  view.emit('window:message', { data: { type: 'state', busy:true, liveQuestion:'project state?', messages: [] } });
  assert.deepEqual(userBubbles(view).map(node => node.children[1].textContent), ['project state?']);
  // A reloaded view learns the live question from the host alone.
  const reloaded = sidebar({}, {busy:true, liveQuestion:'project state?'});
  assert.equal(userBubbles(reloaded).length, 1);
  view.emit('window:message', { data: { type: 'state', busy:false, liveQuestion:'project state?', messages: [{role:'user',content:'project state?'},{role:'assistant',content:'fine'}] } });
  assert.equal(userBubbles(view).length, 1);
});

test('0.10.18 a stale error notice can be dismissed', () => {
  const view = sidebar({}, {error:{text:'Configure Telegram bot for this signed-in account first.'}});
  assert.equal(view.element('notice').className, 'visible');
  view.element('notice-close').click();
  assert.equal(view.element('notice').className, '');
  assert.equal(view.outgoing.at(-1).type, 'dismissNotice');
});

test('0.10.18 the model stage shows rotating thinking words; other stages keep plain labels', () => {
  const view = sidebar();
  view.emit('window:message', { data: { type: 'activity', stage:'scan', detail:'' } });
  assert.equal(view.element('activity-label').textContent, 'Reading the project…');
  view.emit('window:message', { data: { type: 'activity', stage:'model', detail:'Agent step 2' } });
  const label = view.element('activity-label').textContent;
  assert.notEqual(label, 'Model is working…');
  assert.match(label, /^[A-Za-z]+…$/);
  view.emit('lang:click', {});
  view.emit('window:message', { data: { type: 'activity', stage:'model', detail:'' } });
  assert.match(view.element('activity-label').textContent, /^[А-Яа-яё ]+…$/);
});

test('0.10.18 mode and shell help live in settings, not under the composer', () => {
  const html = chatHtml({ cspSource: 'vscode-webview:' });
  const form = html.slice(html.indexOf('<form id="form">'), html.indexOf('</form>'));
  const drawer = html.slice(html.indexOf('<aside id="settings-drawer"'), html.indexOf('</aside>'));
  assert.ok(!form.includes('mode-help'));
  assert.ok(drawer.includes('<p id="mode-help"'));
});

test('0.10.18 host keeps the chat view alive when hidden and clears a dismissed notice', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension.js'), 'utf8');
  assert.match(source, /registerWebviewViewProvider\('tvijo\.chat'[\s\S]*?\{ webviewOptions: \{ retainContextWhenHidden: true \} \}\)\);/);
  assert.match(source, /message\?\.type === 'dismissNotice'\) \{\s*lastError = null; await postChatState\(\);/);
});

test('0.10.19 a bridge message from Claude Code is queued and sent like a typed one', () => {
  const view = sidebar({}, {busy:true, bridgeEnabled:true});
  assert.equal(view.element('bridge-note').hidden, false);
  view.emit('window:message', { data: { type: 'inbox', text: ' check the canon gate ', mode: 'plan', from: 'Claude Code' } });
  assert.equal(asks(view).length, 0);
  assert.match(view.element('followups').children[0].children[0].textContent, /Queued · Claude Code: check the canon gate/);
  view.emit('window:message', { data: { type: 'state', busy:false, bridgeEnabled:true, messages: [] } });
  assert.deepEqual(asks(view).map(item => [item.question, item.agent, item.plan]), [['check the canon gate', true, true]]);
});

test('0.10.19 an unconfigured Telegram bot is a settings note, not a chat error', () => {
  const view = sidebar({}, {botSetupNeeded:true});
  assert.equal(view.element('notice').className, '');
  assert.equal(view.element('bot-setup-note').hidden, false);
  view.element('bot-setup').click();
  assert.equal(view.outgoing.at(-1).type, 'botSetup');
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension.js'), 'utf8');
  assert.match(source, /if \(error\?\.code === 'bot_account_setup'\) \{ botSetupNeeded = true; if \(botAutostart\) \{ void postChatState\(\); return; \} \}/);
  assert.match(source, /botAutostart = true; handlers\.get\('tvijo\.startBot'\)\(\)/);
});

test('0.10.19 a bridge message starts thinking words at once and is labelled with its sender', () => {
  const view = sidebar();
  view.emit('window:message', { data: { type: 'inbox', text: 'status?', from: 'Claude Code' } });
  assert.match(view.element('activity-label').textContent, /^[A-Za-z]+…$/);
  assert.equal(asks(view).at(-1).from, 'Claude Code');
  const bubble = userBubbles(view).at(-1);
  assert.equal(bubble.children[0].textContent, 'Claude Code');
  assert.equal(bubble.children[1].textContent, 'status?');
});

test('0.10.20 Devstral agent steps ask for the gateway output ceiling, other models keep 2048', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'extension.js'), 'utf8');
  assert.match(source, /maxTokens: agentModel === 'devstral' \? 4096 : 2048, model: agentModel/);
});
