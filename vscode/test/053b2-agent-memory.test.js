'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runAgent, conversationContext } = require('../lib/agent');

test('B11 second question sees first user/assistant pair in actual model request', async () => {
  let call;
  await runAgent({goal:'Что я спрашивал?',history:[{role:'user',content:'Какая версия?'},{role:'assistant',content:'Версия 0.5.3'}],
    ask:async req=>{call=req;return {content:'{"tool":"finish","answer":"О версии"}'};},tools:{}});
  assert.match(call.messages[0].content,/Какая версия/);
  assert.match(call.messages[0].content,/Версия 0.5.3/);
  assert.equal(call.messages[1].content,'Что я спрашивал?');
});

test('B11 UTF-8 history is at most 8 KiB, newest wins, goal survives tool pruning and finalization', async () => {
  const history=[{role:'user',content:'old'.repeat(5000)},{role:'assistant',content:'🙂новое'.repeat(5000)}];
  const recent=conversationContext(history);
  assert.ok(Buffer.byteLength(JSON.stringify(recent))<=8192);
  assert.equal(recent.length,1);
  assert.ok(recent[0].content.endsWith('🙂новое'));
  assert.ok(!recent[0].content.includes('�'));
  let final;
  await runAgent({goal:'ORIGINAL QUESTION',history,maxSteps:9,tools:{execute:async()=>({ok:true})},
    ask:async req=>{assert.equal(req.messages[1].content,'ORIGINAL QUESTION');
      assert.match(req.messages[0].content,/новое/);
      if(req.finalization){final=req;return {content:'Done'};}
      return {content:'{"tool":"list_dir","path":"src"}'};}});
  assert.ok(final);
});

const Module=require('node:module');
const {scopeKey}=require('../lib/tenant-state');
const {AUTH_MODE,PROJECT_AUTH_KEY}=require('../workspace');
const memory=()=>{const m=new Map();return {get:k=>m.get(k),keys:()=>[...m.keys()],update:async(k,v)=>m.set(k,v),store:async(k,v)=>m.set(k,v),delete:async k=>m.delete(k)};};
function extensionHost() {
  const context = { subscriptions: [], secrets: memory(), globalState: memory(), workspaceState: memory(), globalStorageUri: { fsPath: fs.mkdtempSync(path.join(process.env.TVIJO_TEST_ARTIFACTS || os.tmpdir(), 'journal-host-')) } };
  const commands = new Map(), posts = [], errors = [], calls = [];
  const disposable = { dispose() {} };
  const base = 'http://localhost:18106/api/dshrem/v1';
  let provider, receive, blocker, release, configurationChanged;
  let configuredBase = base;
  let input = 'tvijo-project-test-key';
  let pick = items => items.find(item => item.thread) || items[0];
  const vscode = {
    Uri: { parse: value => ({ toString: () => value }) },
    env: { clipboard: { writeText: async () => {} }, openExternal: async () => {} },
    StatusBarAlignment: { Right: 1 }, ProgressLocation: { Notification: 1 }, ViewColumn: { Beside: 2 },
    commands: { registerCommand: (id, fn) => { commands.set(id, fn); return disposable; }, executeCommand: async id => commands.get(id)?.() },
    workspace: { workspaceFolders: [{uri:{fsPath:process.cwd()}}], getConfiguration: () => ({ get: (key, fallback) => key === 'apiBase' ? configuredBase : fallback }), onDidChangeConfiguration: fn => { configurationChanged = fn; return disposable; } },
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
    if (route === '/tasks/task-a/chat') return Response.json({ choices: [{ message: { content: '{"tool":"finish","answer":"First agent answer"}' } }], task: { spent_usd: '0', held_usd: '0' } });
    if (route === '/tasks/task-a' || route === '/tasks/task-a/cancel') return Response.json({ status: 'completed', budget: { held_usd: '0' } });
    throw new Error('Unexpected URL ' + route);
  };
  provider.resolveWebviewView({ webview: { cspSource: 'test:', onDidReceiveMessage: fn => { receive = fn; return disposable; }, postMessage: async message => { posts.push(message); } }, onDidDispose() {} });
  return { context, commands, posts, errors, calls, receive: message => receive(message), base,
    scope: scopeKey(base, 'tenant-a'), state: () => posts.filter(post => post.type === 'state').at(-1),
    changeBase: value => { configuredBase = value; configurationChanged({ affectsConfiguration: key => key === 'tvijo.apiBase' }); },
    input: value => { input = value; }, pick: fn => { pick = fn; }, block: fn => { blocker = fn; }, waiting: () => !!release,
    release: () => { blocker = null; release?.(); }, close: () => { globalThis.fetch = oldFetch; } };
}


test('B11 extension second Agent request in a shared thread retains the previous Agent pair without leaking to another thread',async()=>{
 const app=extensionHost();try{
  await app.commands.get('tvijo.signInProject')();
  await app.commands.get('tvijo.chooseThread')();
  app.input('First agent question');await app.commands.get('tvijo.agent')();
  assert.equal(app.errors.length,0,app.errors.join(' '));
  app.input('Second agent question');await app.commands.get('tvijo.agent')();
  let chats=app.calls.filter(c=>c.route.endsWith('/chat'));
  assert.equal(chats.length,2,app.errors.join(' '));
  assert.match(chats[1].body.messages[0].content,/First agent question/);
  assert.match(chats[1].body.messages[0].content,/First agent answer/);
  assert.equal(chats[1].body.messages[1].content,'Second agent question');
  app.pick(items=>items.find(i=>i.thread?.id==='t-b'));await app.commands.get('tvijo.chooseThread')();
  app.input('Third agent question');await app.commands.get('tvijo.agent')();
  chats=app.calls.filter(c=>c.route.endsWith('/chat'));
  assert.equal(chats.length,3,app.errors.join(' '));
  assert.doesNotMatch(chats[2].body.messages[0].content,/First agent question|First agent answer/);
  assert.equal(app.errors.length,0,app.errors.join(' '));
 }finally{app.close();}
});
