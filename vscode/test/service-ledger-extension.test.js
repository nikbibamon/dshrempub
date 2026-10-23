'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scopeKey, tenantState } = require('../lib/tenant-state');
const { PROJECT_AUTH_KEY, AUTH_MODE } = require('../workspace');
const memory = () => { const v = new Map(); return { get:k=>v.get(k), keys:()=>[...v.keys()], update:async(k,x)=>v.set(k,x), store:async(k,x)=>v.set(k,x), delete:async k=>v.delete(k) }; };
function extensionHost(overrides = {}) {
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
    const custom = await overrides.request?.(route, options, body);
    if (custom) return custom;
    if (route === '/services/usage?project_id=p-a') return Response.json({ unit: 'micro_tvijo', balance: null, tasks: [] });
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
  return { context, commands, posts, errors, calls, receive: message => receive(message), base,
    scope: scopeKey(base, 'tenant-a'), state: () => posts.filter(post => post.type === 'state').at(-1),
    changeBase: value => { configuredBase = value; configurationChanged({ affectsConfiguration: key => key === 'tvijo.apiBase' }); },
    input: value => { input = value; }, pick: fn => { pick = fn; }, block: fn => { blocker = fn; }, waiting: () => !!release,
    release: () => { blocker = null; release?.(); }, close: () => { globalThis.fetch = oldFetch; } };
}


async function settleBlocked(app) { for (let n=0; n<100 && !app.waiting(); n++) await new Promise(r=>setTimeout(r,5)); assert.ok(app.waiting()); }
async function login(app) { await app.commands.get('tvijo.signInProject')(); await app.commands.get('tvijo.chooseThread')(); }
test('shared service chat receives one leading pack message while keeping server-quoted routing', async () => {
  const synthetic = { schema: 'tvijo.skill_packs/v1', packs: [{ id: 'engineer', title: { en: 'TEST', ru: 'ТЕСТ' }, summary: { en: 'TEST_SUMMARY', ru: 'ТЕСТ' }, model: 'synthetic-model', markers: [], instructions: 'SYNTHETIC_SHARED_PACK', checklist: { en: [], ru: [] } }] };
  const app = extensionHost({ request: async route => route === '/packs' ? Response.json(synthetic) : null });
  try {
    await login(app);
    await app.receive({ type: 'ask', scopeKey: app.state().scopeKey, question: 'SYNTHETIC_SHARED_QUESTION' });
    const request = app.calls.find(item => item.route === '/tasks/task-a/chat');
    assert.equal(request.body.messages[0].role, 'system');
    assert.equal(request.body.messages[0].content, 'SYNTHETIC_SHARED_PACK');
    assert.equal(request.body.messages.filter(item => item.role === 'system').length, 1);
    assert.equal(app.calls.find(item => item.route === '/tasks').body.model, undefined);
    assert.equal(app.calls.find(item => item.route === '/services/quote').body.service_id, 'standard');
    assert.equal(JSON.stringify(app.posts).includes('SYNTHETIC_SHARED_PACK'), false);
    assert.equal(app.errors.length, 0);
  } finally { app.close(); }
});
test('in-flight quote cannot reserve after external credential change or API-base A B A', async () => {
  for (const final of ['external-credential','base-aba']) {
    const app = extensionHost();
    try {
      await login(app); const originalScope=app.state().scopeKey;
      app.block(route => route === '/services/quote');
      const pending = app.receive({ type:'ask', scopeKey:originalScope, question:'Private prompt' });
      await settleBlocked(app);
      if (final === 'external-credential') await app.context.secrets.store(PROJECT_AUTH_KEY, JSON.stringify({ access_token:'externally-replaced', api_base:app.base,kind:'project' }));
      else { app.changeBase('http://localhost:18107/api/dshrem/v1'); app.changeBase(app.base); }
      app.release(); await pending;
      assert.equal(app.calls.filter(c=>c.route === '/tasks').length,0);
      assert.ok(app.posts.some(post=>post.type==='state'&&post.error?.text.includes('changed')));
      assert.equal(app.errors.length,0,'chat renders the error without a native duplicate');
      assert.ok(!tenantState(app.context).pending(app.scope));
    } finally { app.release(); app.close(); }
  }
});
test('ambiguous reservation persists original quote journal and blocks another question without requote', async () => {
  const app = extensionHost({ request: async route => { if (route === '/tasks') throw new Error('lost reservation'); } });
  try {
    await login(app);
    await app.receive({ type:'ask', scopeKey:app.state().scopeKey, question:'Private prompt' });
    const first=tenantState(app.context).pending(app.scope);
    assert.equal(first.request.quote_id,'quote-a'); assert.equal(first.request.tariff_version,'pilot-v1');
    assert.equal(first.request.service_id,'standard'); assert.equal(first.taskId,undefined);
    assert.ok(app.posts.some(p=>p.type === 'quote' && p.quote.ceiling_micro_tvijo === 10000000 && p.scopeKey === app.state().scopeKey));
    await app.receive({ type:'ask', scopeKey:app.state().scopeKey, question:'Again' });
    assert.equal(app.calls.filter(c=>c.route === '/services/quote').length,1);
    assert.equal(app.calls.filter(c=>c.route === '/tasks').length,1);
    assert.equal(tenantState(app.context).pending(app.scope).idempotencyKey, first.idempotencyKey);
    assert.equal(JSON.stringify([...app.context.workspaceState.keys()].map(k=>app.context.workspaceState.get(k))).includes('tvijo-project-test-key'),false);
    assert.equal(JSON.stringify(app.posts).includes('tvijo-project-test-key'),false);
  } finally { app.close(); }
});
test('shared project usage requests sanitized service receipts and tags exact view epoch', async () => {
  const app = extensionHost();
  try {
    await login(app); const scope=app.state().scopeKey;
    await app.commands.get('tvijo.usage')();
    assert.ok(app.calls.some(c=>c.route === '/services/usage?project_id=p-a'));
    assert.equal(app.calls.some(c=>c.route === '/workspace/usage'),false);
    const posted = app.posts.find(p=>p.type === 'usage');
    assert.equal(posted.scopeKey,scope); assert.equal(posted.usage.unit,'micro_tvijo');
  } finally { app.close(); }
});

test('delayed reservation response journals its task but never infers after API-base epoch change', async () => {
  const app=extensionHost();
  try {
    await login(app); app.block(route=>route==='/tasks');
    const pending=app.receive({type:'ask',scopeKey:app.state().scopeKey,question:'Question'});
    await settleBlocked(app);
    app.changeBase('http://localhost:18107/api/dshrem/v1');app.changeBase(app.base);
    app.release();await pending;
    assert.equal(app.calls.some(c=>c.route.endsWith('/chat')),false);
    const journal=tenantState(app.context).pending(app.scope);
    assert.equal(journal.taskId,'task-a');assert.equal(journal.request.quote_id,'quote-a');
    assert.ok(app.posts.some(post=>post.type==='state'&&post.error?.text.includes('changed')));
      assert.equal(app.errors.length,0,'chat renders the error without a native duplicate');
  } finally {app.release();app.close();}
});
