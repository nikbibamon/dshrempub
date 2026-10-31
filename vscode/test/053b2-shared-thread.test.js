'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),vm=require('node:vm');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {workspaceState, sharedThreadUrl, AUTH_MODE, PROJECT_AUTH_KEY}=require('../workspace');
const {scopeKey}=require('../lib/tenant-state');
const {chatHtml}=require('../lib/chat-view');
const memory=()=>{const m=new Map();return {get:k=>m.get(k),keys:()=>[...m.keys()],update:async(k,v)=>m.set(k,v),store:async(k,v)=>m.set(k,v),delete:async k=>m.delete(k)};};
function extensionHost() {
  const context = { subscriptions: [], secrets: memory(), globalState: memory(), workspaceState: memory(), globalStorageUri: { fsPath: fs.mkdtempSync(path.join(process.env.TVIJO_TEST_ARTIFACTS || os.tmpdir(), 'journal-host-')) } };
  const commands = new Map(), posts = [], errors = [], calls = [], urls = [];
  const disposable = { dispose() {} };
  const base = 'http://localhost:18106/api/dshrem/v1';
  let provider, receive, blocker, release, configurationChanged;
  let configuredBase = base;
  let input = 'tvijo-project-test-key';
  let pick = items => items.find(item => item.thread) || items[0];
  const vscode = {
    Uri: { parse: value => ({ toString: () => value }) },
    env: { clipboard: { writeText: async () => {} }, openExternal: async uri => { urls.push(uri.toString()); } },
    StatusBarAlignment: { Right: 1 }, ProgressLocation: { Notification: 1 }, ViewColumn: { Beside: 2 },
    commands: { registerCommand: (id, fn) => { commands.set(id, fn); return disposable; }, executeCommand: async id => commands.get(id)?.() },
    workspace: { getConfiguration: () => ({ get: (key, fallback) => key === 'apiBase' ? configuredBase : fallback }), onDidChangeConfiguration: fn => { configurationChanged = fn; return disposable; } },
    window: {
      createStatusBarItem: () => ({ show() {} }), registerWebviewViewProvider: (_id, value) => { provider = value; return disposable; },
      showInputBox: async () => input, showQuickPick: async items => pick(items),
      showErrorMessage: async message => { errors.push(message); }, showInformationMessage: async () => {},
      withProgress: async (_options, fn) => fn({}, { onCancellationRequested() {} })
    }
  };
  const originalLoad = Module._load;
  try {
    Module._load = function(id, ...args) { return id === 'vscode' ? vscode : originalLoad.call(this, id, ...args); };
    delete require.cache[require.resolve('../extension')];
    require('../extension').activate(context);
  } finally { Module._load = originalLoad; }
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const route = url.slice(base.length), body = options.body && JSON.parse(options.body);
    calls.push({ route, body, method: options.method, token: options.headers.authorization });
    if (blocker?.(route, options)) await new Promise(resolve => { release = resolve; });
    if (route === '/auth/device') return Response.json({ device_code: 'synthetic-device', user_code: 'TESTCODE', verification_uri: 'https://dsh.tvijo.com/dshrem/device', interval: 1, expires_in: 60 });
    if (route === '/auth/token') return Response.json({ access_token: 'new-device-token', expires_in: 3600 });
    if (route === '/account') return Response.json({ tenant_id: 'tenant-a' });
    if (route === '/auth/logout') return Response.json({ revoked: true });
    if (route === '/projects') return Response.json({ tenant_id: 'tenant-a', project_id: 'p-a', key_limits: { max_task_usd: '0.01', daily_max_usd: '1' }, projects: [{ id: 'p-a', name: 'Project A', role: 'editor' }] });
    if (route === '/projects/p-a/threads' && options.method === 'GET') return Response.json({ threads: [{ id: 't-a', title: 'Browser thread' }, { id: 't-b', title: 'Other thread' }] });
    if (route === '/projects/p-a/threads' && options.method === 'POST') return Response.json({ id: 't-new', title: body.title });
    if (route.startsWith('/projects/p-a/threads/')) return Response.json({ id: route.split('/').at(-1), project_id: 'p-a', messages: [{ role: 'user', content: route.endsWith('t-b') ? 'Thread B only' : 'Browser history' }], tasks: [] });
    if (route === '/services/quote') return Response.json({ quote_id: 'quote-a', service_id: body.service_id, project_id: body.project_id, thread_id: body.thread_id, tariff_version: 'pilot-v1', expires_at: Math.floor(Date.now() / 1000) + 300, ceiling_micro_tvijo: body.max_micro_tvijo });
    if (route === '/tasks' && options.method === 'POST') return Response.json({ id: 'task-a', project_id: 'p-a', thread_id: 't-a' });
    if (route === '/tasks/task-a/chat') return Response.json({ choices: [{ message: { content: 'Assistant reply' } }], task: { spent_usd: '0', held_usd: '0' } });
    if (route === '/tasks/task-a' || route === '/tasks/task-a/cancel') return Response.json({ status: 'completed', budget: { held_usd: '0' } });
    throw new Error('Unexpected URL ' + route);
  };
  provider.resolveWebviewView({ webview: { cspSource: 'test:', onDidReceiveMessage: fn => { receive = fn; return disposable; }, postMessage: async message => { posts.push(message); } }, onDidDispose() {} });
  return { context, commands, posts, errors, calls, urls, receive: message => receive(message), base,
    scope: scopeKey(base, 'tenant-a'), state: () => posts.filter(post => post.type === 'state').at(-1),
    changeBase: value => { configuredBase = value; configurationChanged({ affectsConfiguration: key => key === 'tvijo.apiBase' }); },
    input: value => { input = value; }, pick: fn => { pick = fn; }, block: fn => { blocker = fn; }, waiting: () => !!release,
    release: () => { blocker = null; release?.(); }, close: () => { globalThis.fetch = oldFetch; } };
}

function sidebar(initialState = {}) {
  const listeners = new Map();
  const elements = new Map();
  const created = [];
  const outgoing = [];
  let savedState = initialState;
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', disabled: false, textContent: '',
      style: {}, attributes: {},
      addEventListener(type, fn) { listeners.set(`${id}:${type}`, fn); },
      focus() {}, replaceChildren(...nodes) { this.children = nodes; }, append(...nodes) { this.children = [...(this.children || []), ...nodes]; }, requestSubmit() {}, querySelectorAll() { return []; }, setAttribute(name, value) { this.attributes[name] = value; }, click() {}
    });
    return elements.get(id);
  }
  const document = { getElementById: element, body: element('body'), documentElement: element('html'), createElement: (tag) => { const node = { tag, textContent: '', children: [], append(...nodes) { this.children.push(...nodes); }, addEventListener() {}, setAttribute() {} }; created.push(node); return node; } };
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


test('B12 project-key login opens common thread by default and restores the last used thread',async()=>{
 const app=extensionHost();try{
  await app.commands.get('tvijo.signInProject')();
  assert.equal(app.state().messages[0].content,'Browser history');
  assert.equal(app.state().sharedThreadUrl,'https://dsh.tvijo.com/?project=p-a&thread=t-a');
  assert.ok(!app.calls.some(c=>c.route==='/tasks'));
  app.pick(items=>items.find(i=>i.thread?.id==='t-b'));
  await app.commands.get('tvijo.chooseThread')();
  await app.commands.get('tvijo.signOut')();
  await app.commands.get('tvijo.signInProject')();
  assert.equal(app.state().messages[0].content,'Thread B only');
  assert.equal(app.state().sharedThreadUrl,'https://dsh.tvijo.com/?project=p-a&thread=t-b');
  await app.receive({type:'openSharedThread',scopeKey:app.state().scopeKey});
  assert.equal(app.urls.at(-1),app.state().sharedThreadUrl);
  assert.equal(app.errors.length,0);
  const before=app.urls.length;
  await app.receive({type:'openSharedThread',scopeKey:'stale-scope'});
  assert.equal(app.urls.length,before);
 }finally{app.close();}
});
test('B12 default thread is scoped by tenant/project and inaccessible old thread falls back to current list',async()=>{
 const state=workspaceState({workspaceState:memory()});
 await state.select('tenant-a',{id:'p-a'},{id:'last'});
 await state.select('tenant-a',{id:'p-b'});
 const list=[{id:'newest'},{id:'last'}];
 assert.equal(state.preferredThread('tenant-a','p-a',list).id,'last');
 assert.equal(state.preferredThread('tenant-b','p-a',list).id,'newest');
 assert.equal(state.preferredThread('tenant-a','p-c',list).id,'newest');
 assert.equal(state.preferredThread('tenant-a','p-a',[{id:'newest'}]).id,'newest');
 assert.equal(sharedThreadUrl(null),null);
});
test('B12 shared-dialog link renders EN/RU, opens via scoped host action, hides on sign-out',()=>{
 const view=sidebar();
 for(const locale of ['en','ru']){
  view.emit('window:message',{data:{type:'state',signedIn:true,messages:[],locale,sharedThreadUrl:'https://dsh.tvijo.com/?project=p&thread=t'}});
  assert.equal(view.element('shared-thread-note').hidden,false);
  assert.equal(view.element('shared-thread-link').href,'https://dsh.tvijo.com/?project=p&thread=t');
  assert.equal(view.element('shared-thread-link').textContent,locale==='ru'?'Этот диалог есть на dsh.tvijo.com':'This conversation is on dsh.tvijo.com');
  view.element('shared-thread-link').onclick({preventDefault(){}});
  assert.equal(view.outgoing.at(-1).type,'openSharedThread');
  assert.equal(view.outgoing.at(-1).scopeKey,'tenant-a');
 }
 view.emit('window:message',{data:{type:'state',signedIn:false,messages:[]}});
 assert.equal(view.element('shared-thread-note').hidden,true);
});

test('0.10.22 a shared server thread cannot be restored or forked from the chat, and says why',async()=>{
 const app=extensionHost();try{
  await app.commands.get('tvijo.signInProject')();
  assert.equal(app.state().conversationEditable,false);
  const before=JSON.stringify(app.state().messages);
  await app.receive({type:'conversationRestore',index:0,scopeKey:app.state().scopeKey});
  assert.match(app.state().error.text,/shared server thread cannot be rewound/);
  await app.receive({type:'conversationFork',index:0,scopeKey:app.state().scopeKey});
  assert.match(app.state().error.text,/shared server thread cannot be rewound/);
  await app.commands.get('tvijo.conversations')();
  assert.match(app.state().error.text,/Saved conversations belong to a local workspace/);
  assert.equal(JSON.stringify(app.state().messages),before);
  assert.ok(!app.calls.some(c=>c.method==='POST'&&c.route.startsWith('/projects/p-a/threads')),'no server thread is created or changed');
 }finally{app.close();}
});
