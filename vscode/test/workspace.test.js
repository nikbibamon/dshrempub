'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { workspaceState, workspaceClient, viewScope, PROJECT_AUTH_KEY, AUTH_MODE, sharedTaskCap } = require('../workspace');
const { scopeKey, tenantState } = require('../lib/tenant-state');

const memory = () => {
  const values = new Map();
  return { get: key => values.get(key), keys: () => [...values.keys()], update: async (key, value) => values.set(key, value), store: async (key, value) => values.set(key, value), delete: async key => values.delete(key) };
};

test('server thread snapshots and drafts have separate tenant, project and thread scopes', async () => {
  const state = workspaceState({ workspaceState: memory() });
  await state.select('tenant-a', { id: 'project-a' }, { id: 'thread-a' });
  const original = state.selection('tenant-a');
  const scope = state.scope('tenant-a');
  state.remember('tenant-a', original, [{ role: 'user', content: 'private A' }]);
  await state.select('tenant-a', { id: 'project-b' }, { id: 'thread-a' });
  assert.notEqual(state.scope('tenant-a'), scope);
  assert.deepEqual(state.history('tenant-a'), []);
  assert.equal(state.matches('tenant-a', original), false);
  assert.notEqual(viewScope('tenant-b', 'project-a', 'thread-a'), scope);
  await state.select('tenant-a', { id: 'project-a' }, { id: 'thread-a' });
  assert.equal(state.history('tenant-a')[0].content, 'private A');
});

test('shared protocol binds the task to project/thread and never retries a lost chat', async () => {
  const calls = [];
  const client = workspaceClient({ request: async (url, options) => {
    calls.push({ url, ...options });
    if (url === '/tasks') return { id: 'task-a' };
    throw new Error('lost response');
  } }, 'private-test-key');
  let granted = false;
  await assert.rejects(client.ask({ projectId: 'p', threadId: 't', title: 'Test', maxUsd: '0.05', messages: [{ role: 'user', content: 'Question' }], idempotencyKey: 'request-a', onGrant: async () => { granted = true; } }));
  assert.equal(granted, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.project_id, 'p');
  assert.equal(calls[0].body.thread_id, 't');
  assert.equal(calls[0].body.max_usd, '0.05');
  assert.equal(calls[1].url, '/tasks/task-a/chat');
});

test('shared task cap respects smaller browser-issued keys and unknown metadata fails before any grant', async () => {
  assert.equal(sharedTaskCap({ kind: 'project', key_limits: { max_task_usd: '0.01' } }), '0.01');
  assert.equal(sharedTaskCap({ kind: 'project', key_limits: { max_task_usd: '0.05' } }), '0.05');
  assert.equal(sharedTaskCap({ kind: 'project', key_limits: { max_task_usd: '1' } }), '0.05');
  assert.equal(sharedTaskCap({}), '0.05');
  for (const cap of [null, undefined, '', 'unknown', '0', '-1', 'Infinity']) assert.throws(() => sharedTaskCap({ kind: 'project', key_limits: { max_task_usd: cap } }), /could not be verified/);
  let calls = 0;
  await assert.rejects(workspaceClient({ request: async () => { calls++; } }, 'key').ask({ title: 'Test', messages: [{ role: 'user', content: 'Q' }] }), /verified shared task limit/);
  assert.equal(calls, 0);
});

test('only proven pregrant project-key refusals clear a new request; idempotency conflicts remain ambiguous', async () => {
  const core = require('../lib/client');
  for (const code of ['project_key_task_cap_exceeded', 'project_key_daily_cap_exceeded', 'project_key_scope_refused', 'project_key_route_refused', 'idempotency_content_mismatch']) {
    const api = core.createClient({ base: 'http://localhost:18106', fetchImpl: async () => Response.json({ error: { code } }, { status: code.includes('mismatch') ? 409 : 403 }) });
    await assert.rejects(workspaceClient(api, 'key').ask({ title: 'Test', messages: [{ role: 'user', content: 'Q' }], maxUsd: '0.01' }), error => {
      assert.equal(error.definitiveGrantRefusal === true, code !== 'idempotency_content_mismatch');
      return true;
    });
  }
});

function extensionHost() {
  const context = { subscriptions: [], secrets: memory(), globalState: memory(), workspaceState: memory() };
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

test('project sign-in uses its own SecretStorage slot and opens browser history without provider or account calls', async () => {
  const app = extensionHost();
  try {
    await app.context.secrets.store('tvijo.auth', 'preserved-device-token');
    await app.commands.get('tvijo.signInProject')();
    await app.commands.get('tvijo.chooseThread')();
    assert.equal(app.context.globalState.get(AUTH_MODE), 'project');
    assert.equal(app.context.secrets.get('tvijo.auth'), 'preserved-device-token');
    assert.equal(JSON.parse(app.context.secrets.get(PROJECT_AUTH_KEY)).kind, 'project');
    assert.equal(app.state().messages[0].content, 'Browser history');
    assert.equal(app.calls.some(call => call.route === '/account'), false);
    const scope = app.state().scopeKey;
    await app.receive({ type: 'ask', scopeKey: scope, question: 'Continue from browser' });
    const grant = app.calls.find(call => call.route === '/tasks');
    assert.equal(grant.body.quote_id, 'quote-a');
    assert.equal(grant.body.service_id, 'standard');
    const quote = app.calls.find(call => call.route === '/services/quote');
    assert.equal(quote.body.max_micro_tvijo, 10000000);
    assert.equal(quote.body.project_id, 'p-a');
    assert.equal(quote.body.thread_id, 't-a');
    const chat = app.calls.find(call => call.route.endsWith('/chat'));
    assert.deepEqual(chat.body.messages, [{ role: 'user', content: 'Continue from browser' }]);
    assert.equal(app.errors.length, 0);
    await app.commands.get('tvijo.signOut')();
    assert.equal(app.context.secrets.get(PROJECT_AUTH_KEY), undefined);
    assert.equal(app.context.secrets.get('tvijo.auth'), 'preserved-device-token');
  } finally { app.close(); }
});

test('thread switch invalidates stale webview actions and delayed history from the old thread', async () => {
  const app = extensionHost();
  try {
    await app.commands.get('tvijo.signInProject')();
    await app.commands.get('tvijo.chooseThread')();
    const oldScope = app.state().scopeKey;
    app.block(route => route === '/projects/p-a/threads/t-a');
    const refreshing = app.commands.get('tvijo.refreshThread')();
    for (let n = 0; n < 30 && !app.waiting(); n++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.waiting(), true);
    app.pick(items => items.find(item => item.thread?.id === 't-b'));
    await app.commands.get('tvijo.chooseThread')();
    app.release(); await refreshing;
    assert.notEqual(app.state().scopeKey, oldScope);
    assert.equal(app.state().messages[0].content, 'Thread B only');
    await app.receive({ type: 'ask', scopeKey: oldScope, question: 'Stale question' });
    assert.equal(app.calls.some(call => call.route === '/tasks'), false);
  } finally { app.release(); app.close(); }
});

test('returning A to B to A cannot revive delayed work or an earlier webview action', async () => {
  const app = extensionHost();
  try {
    await app.commands.get('tvijo.signInProject')();
    await app.commands.get('tvijo.chooseThread')();
    const oldScope = app.state().scopeKey;
    let first = true;
    app.block(route => { if (route === '/projects/p-a/threads/t-a' && first) { first = false; return true; } return false; });
    const refreshing = app.commands.get('tvijo.refreshThread')();
    for (let n = 0; n < 30 && !app.waiting(); n++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.waiting(), true);
    app.pick(items => items.find(item => item.thread?.id === 't-b'));
    await app.commands.get('tvijo.chooseThread')();
    app.pick(items => items.find(item => item.thread?.id === 't-a'));
    await app.commands.get('tvijo.chooseThread')();
    app.release(); await refreshing;
    assert.notEqual(app.state().scopeKey, oldScope);
    assert.ok(app.errors.some(message => message.includes('changed')));
    await app.receive({ type: 'ask', scopeKey: oldScope, question: 'Old action from first A' });
    assert.equal(app.calls.some(call => call.route === '/tasks'), false);
    assert.equal(app.state().messages[0].content, 'Browser history');
  } finally { app.release(); app.close(); }
});

test('a key cannot reconcile another project journal or issue a second grant', async () => {
  const app = extensionHost();
  try {
    await app.commands.get('tvijo.signInProject')();
    await app.commands.get('tvijo.chooseThread')();
    const local = tenantState(app.context);
    await local.savePending(app.scope, { idempotencyKey: 'unsettled', projectId: 'other-project', taskId: 'other-task', createdAt: '2026-10-19' });
    await app.receive({ type: 'ask', scopeKey: app.state().scopeKey, question: 'Question blocked by pending' });
    await app.commands.get('tvijo.cancelPending')();
    assert.equal(app.calls.some(call => call.route.startsWith('/tasks')), false);
    assert.equal(local.pending(app.scope).idempotencyKey, 'unsettled');
    assert.ok(app.errors.some(message => message.includes('another project')));
  } finally { app.close(); }
});

async function waitingFor(app) {
  for (let n = 0; n < 120 && !app.waiting(); n++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(app.waiting(), true);
}

test('delayed project login A cannot replace newer login B or a later sign-out', async () => {
  for (const finalAction of ['new-login', 'sign-out']) {
    const app = extensionHost();
    try {
      await app.commands.get('tvijo.signInProject')();
      app.input('key-a');
      app.block((route, options) => route === '/projects' && options.headers.authorization === 'Bearer key-a');
      const delayed = app.commands.get('tvijo.signInProject')(); await waitingFor(app);
      if (finalAction === 'new-login') { app.input('key-b'); await app.commands.get('tvijo.signInProject')(); }
      else await app.commands.get('tvijo.signOut')();
      app.release(); await delayed;
      const saved = app.context.secrets.get(PROJECT_AUTH_KEY);
      assert.equal(saved ? JSON.parse(saved).access_token : null, finalAction === 'new-login' ? 'key-b' : null);
      assert.equal(app.state().signedIn, finalAction === 'new-login');
      assert.equal(app.calls.some(call => call.route === '/tasks'), false);
    } finally { app.release(); app.close(); }
  }
});

test('delayed device authorization cannot overwrite a newer project-key login', async () => {
  const app = extensionHost();
  try {
    app.block(route => route === '/auth/token');
    const delayed = app.commands.get('tvijo.signIn')(); await waitingFor(app);
    app.input('newer-project-key'); await app.commands.get('tvijo.signInProject')();
    app.release(); await delayed;
    assert.equal(app.context.globalState.get(AUTH_MODE), 'project');
    assert.equal(JSON.parse(app.context.secrets.get(PROJECT_AUTH_KEY)).access_token, 'newer-project-key');
    assert.equal(app.context.secrets.get('tvijo.auth'), undefined);
    assert.equal(app.state().signedIn, true);
  } finally { app.release(); app.close(); }
});

test('an already-started SecretStorage write is serialized before the newer credential commit', async () => {
  const app = extensionHost();
  let releaseStore;
  const originalStore = app.context.secrets.store;
  app.context.secrets.store = async (key, value) => {
    if (key === PROJECT_AUTH_KEY && JSON.parse(value).access_token === 'key-a') await new Promise(resolve => { releaseStore = resolve; });
    await originalStore(key, value);
  };
  try {
    app.input('key-a'); const first = app.commands.get('tvijo.signInProject')();
    for (let n = 0; n < 30 && !releaseStore; n++) await new Promise(resolve => setImmediate(resolve));
    assert.ok(releaseStore);
    app.input('key-b'); const second = app.commands.get('tvijo.signInProject')();
    await new Promise(resolve => setImmediate(resolve));
    releaseStore(); await Promise.all([first, second]);
    assert.equal(JSON.parse(app.context.secrets.get(PROJECT_AUTH_KEY)).access_token, 'key-b');
    assert.equal(app.context.globalState.get(AUTH_MODE), 'project');
    assert.equal(app.state().signedIn, true);
  } finally { releaseStore?.(); app.close(); }
});

test('delayed key validation cannot replace a newer device login', async () => {
  const app = extensionHost();
  try {
    app.input('key-a'); app.block((route, options) => route === '/projects' && options.headers.authorization === 'Bearer key-a');
    const delayed = app.commands.get('tvijo.signInProject')(); await waitingFor(app);
    await app.commands.get('tvijo.signIn')();
    app.release(); await delayed;
    assert.equal(app.context.globalState.get(AUTH_MODE), 'device');
    assert.equal(JSON.parse(app.context.secrets.get('tvijo.auth')).access_token, 'new-device-token');
    assert.equal(app.context.secrets.get(PROJECT_AUTH_KEY), undefined);
  } finally { app.release(); app.close(); }
});

test('apiBase A to B to A invalidates a pending login even after returning to the same URL', async () => {
  const app = extensionHost();
  try {
    app.block(route => route === '/projects');
    const delayed = app.commands.get('tvijo.signInProject')(); await waitingFor(app);
    app.changeBase('http://localhost:18107/api/dshrem/v1'); app.changeBase(app.base);
    app.release(); await delayed;
    assert.equal(app.context.secrets.get(PROJECT_AUTH_KEY), undefined);
    assert.equal(app.context.globalState.get(AUTH_MODE), undefined);
    assert.equal(app.state().signedIn, false);
  } finally { app.release(); app.close(); }
});

test('sign-out during an in-flight first credential write leaves no orphan secret', async () => {
  const app = extensionHost();
  let releaseStore;
  const originalStore = app.context.secrets.store;
  app.context.secrets.store = async (key, value) => {
    if (key === PROJECT_AUTH_KEY) await new Promise(resolve => { releaseStore = resolve; });
    await originalStore(key, value);
  };
  try {
    const first = app.commands.get('tvijo.signInProject')();
    for (let n = 0; n < 30 && !releaseStore; n++) await new Promise(resolve => setImmediate(resolve));
    assert.ok(releaseStore);
    const logout = app.commands.get('tvijo.signOut')();
    await new Promise(resolve => setImmediate(resolve)); releaseStore(); await Promise.all([first, logout]);
    assert.equal(app.context.secrets.get(PROJECT_AUTH_KEY), undefined);
    assert.equal(app.context.secrets.get('tvijo.auth'), undefined);
    assert.equal(app.state().signedIn, false);
  } finally { releaseStore?.(); app.close(); }
});

test('repeated project sign-out remains idempotent and never deletes a preserved device credential', async () => {
  const app = extensionHost();
  try {
    const device = JSON.stringify({ access_token: 'preserved-device-token', api_base: app.base });
    await app.context.secrets.store('tvijo.auth', device);
    await app.commands.get('tvijo.signInProject')();
    for (let n = 0; n < 3; n++) {
      await app.commands.get('tvijo.signOut')();
      assert.equal(app.context.secrets.get(PROJECT_AUTH_KEY), undefined);
      assert.equal(app.context.secrets.get('tvijo.auth'), device);
      assert.equal(app.context.globalState.get(AUTH_MODE), 'project');
      assert.equal(app.state().signedIn, false);
    }
    assert.equal(app.calls.some(call => call.route === '/auth/logout'), false);
  } finally { app.close(); }
});

test('a delayed device logout cannot replace a newer project authentication mode', async () => {
  const app = extensionHost();
  try {
    await app.commands.get('tvijo.signIn')();
    app.block(route => route === '/auth/logout');
    const logout = app.commands.get('tvijo.signOut')(); await waitingFor(app);
    app.input('newer-project-key'); await app.commands.get('tvijo.signInProject')();
    app.release(); await logout;
    assert.equal(app.context.globalState.get(AUTH_MODE), 'project');
    assert.equal(JSON.parse(app.context.secrets.get(PROJECT_AUTH_KEY)).access_token, 'newer-project-key');
    assert.equal(app.context.secrets.get('tvijo.auth'), undefined);
    assert.equal(app.state().signedIn, true);
  } finally { app.release(); app.close(); }
});

test('a project sign-out awaiting its secret deletion cannot overwrite a newer device-mode commit', async () => {
  const app = extensionHost();
  let releaseDelete;
  const originalDelete = app.context.secrets.delete;
  try {
    await app.commands.get('tvijo.signInProject')();
    const projectSecret = app.context.secrets.get(PROJECT_AUTH_KEY);
    app.context.secrets.delete = async key => {
      if (key === PROJECT_AUTH_KEY) await new Promise(resolve => { releaseDelete = resolve; });
      await originalDelete(key);
    };
    const logout = app.commands.get('tvijo.signOut')();
    for (let n = 0; n < 30 && !releaseDelete; n++) await new Promise(resolve => setImmediate(resolve));
    assert.ok(releaseDelete);
    const deviceLogin = app.commands.get('tvijo.signIn')();
    for (let n = 0; n < 120 && !app.calls.some(call => call.route === '/auth/token'); n++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(app.calls.some(call => call.route === '/auth/token'));
    releaseDelete(); await Promise.all([logout, deviceLogin]);
    assert.equal(app.context.globalState.get(AUTH_MODE), 'device');
    assert.equal(JSON.parse(app.context.secrets.get('tvijo.auth')).access_token, 'new-device-token');
    assert.equal(app.context.secrets.get(PROJECT_AUTH_KEY), projectSecret);
    assert.equal(app.state().signedIn, true);
  } finally { releaseDelete?.(); app.close(); }
});
