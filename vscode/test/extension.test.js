'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function memory(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { get: (key) => values.get(key), keys: () => [...values.keys()], update: async (key, value) => values.set(key, value), store: async (key, value) => values.set(key, value), delete: async (key) => values.delete(key) };
}

function host(options = {}) {
  const base = 'http://localhost:18106/api/dshrem/v1';
  const commands = new Map();
  const executed = [];
  const posts = [];
  const docs = [];
  const shown = [];
  const requests = [];
  const errors = [];
  let grantError = options.grantError;
  let warningAnswer = 'Forget request';
  let chatContent = options.chatContent || 'Test answer';
  const chatCost = options.chatCost;
  let activeEditor = null;
  let appliedEdit = null;
  let lookup = options.lookup || { found: false, task: null };
  let taskSnapshot = options.taskSnapshot || { status: 'completed', budget: { held_usd: '0' } };
  let provider;
  let receive;
  let disposal;
  let release;
  let blockGrant = false;
  let botAdapter;
  let blockedRequest;
  let releaseRequest;
  const disposable = { dispose() {} };
  const root = path.resolve(__dirname, '../..');
  const settings = new Map();
  class Uri { constructor(fsPath) { this.fsPath = fsPath; this.scheme = 'file'; } static file(value) { return new Uri(value); } static parse(value) { return new Uri(value); } static joinPath(base, ...parts) { return new Uri(path.join(base.fsPath, ...parts)); } }
  class Position { constructor(line, character) { this.line = line; this.character = character; } }
  class Range { constructor(start, end) { this.start = start; this.end = end; } }
  class WorkspaceEdit { replace(uri, range, text) { appliedEdit = { uri, range, text }; } }
  const context = {
    subscriptions: [], globalState: memory(), workspaceState: memory(),
    secrets: memory({ 'tvijo.auth': JSON.stringify({ access_token: 'test-token', api_base: base }) })
  };
  const vscode = {
    Uri, Position, Range, WorkspaceEdit, FileType: { File: 1, Directory: 2, SymbolicLink: 64 }, StatusBarAlignment: { Right: 1 }, ProgressLocation: { Notification: 1 }, ViewColumn: { Beside: 2 }, ConfigurationTarget: { Global: 1 },
    env: { clipboard: { writeText: async () => {} }, openExternal: async () => {} },
    commands: { registerCommand: (id, fn) => { commands.set(id, fn); return disposable; }, executeCommand: async (id, ...args) => { executed.push({ id, args }); return commands.get(id)?.(...args); } },
    workspace: {
      getConfiguration: () => ({ get: (key, fallback) => key === 'apiBase' ? base : (settings.has(key) ? settings.get(key) : fallback), update: async (key, value) => { settings.set(key, value); } }),
      onDidChangeConfiguration: () => disposable,
      workspaceFolders: [{ uri: Uri.file(root) }],
      getWorkspaceFolder: (uri) => uri?.fsPath?.startsWith(root + path.sep) ? { uri: Uri.file(root) } : undefined,
      fs: {
        readDirectory: async () => [['README.md', 1], ['src', 2]],
        stat: async () => ({ type: 1 }),
        readFile: async () => Buffer.from('Demo project README\n')
      },
      applyEdit: async () => true,
      openTextDocument: async (doc) => { docs.push(doc); return doc?.fsPath && activeEditor?.document?.uri?.fsPath === doc.fsPath ? activeEditor.document : doc; }
    },
    window: {
      createStatusBarItem: () => ({ show() {} }),
      registerWebviewViewProvider: (_id, value) => { provider = value; return disposable; },
      showErrorMessage: async message => { errors.push(message); }, showInformationMessage: async () => undefined,
      showWarningMessage: async (...args) => { if (options.onWarning) await options.onWarning(...args); return warningAnswer; },
      showTextDocument: async doc => { shown.push(doc); },
      showInputBox: async () => 'Account A editor question',
      get activeTextEditor() { return activeEditor; },
      withProgress: async (_options, fn) => fn({}, { onCancellationRequested() {} })
    }
  };
  const originalLoad = Module._load;
  let extension;
  try {
    Module._load = function (id, ...args) {
      if (id === 'vscode') return vscode;
      if (id === './lib/telegram-bot' && options.captureBot) return { createBot: adapter => {
        botAdapter = adapter;
        return { start: async () => { await adapter.load(); return { username: 'synthetic' }; }, poll: async () => {}, stop() {}, running: false };
      } };
      return originalLoad.call(this, id, ...args);
    };
    delete require.cache[require.resolve('../extension')];
    extension = require('../extension');
  } finally { Module._load = originalLoad; }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const body = options.body && JSON.parse(options.body);
    requests.push({ url, body, method: options.method, token: options.headers.authorization });
    if (blockedRequest && url.endsWith(blockedRequest.path) && options.method === blockedRequest.method) await new Promise(resolve => { releaseRequest = resolve; });
    if (url.endsWith('/account')) return Response.json({ tenant_id: options.headers.authorization === 'Bearer account-b' ? 'tenant-b' : 'tenant-a' });
    if (url.endsWith('/auth/logout')) return Response.json({ revoked: true });
    if (url.endsWith('/tasks') && options.method === 'POST') {
      if (blockGrant) await new Promise((resolve) => { release = resolve; });
      if (grantError?.network) throw new Error('Lost synthetic response');
      if (grantError) return Response.json(grantError.body, { status: grantError.status });
      return Response.json({ id: 'task-test' });
    }
    if (url.endsWith('/tasks') && options.method === 'GET') return Response.json({ tasks: [{ title: 'Account A private server task' }] });
    if (url.includes('/tasks/by-idempotency/')) return Response.json(lookup);
    if (url.endsWith('/tasks/task-test') || url.endsWith('/tasks/task-test/cancel')) return Response.json(taskSnapshot);
    if (url.endsWith('/workspace/usage')) return Response.json({ account: { tenant_id: 'test-tenant', budget: { spent_usd: '0', held_usd: '0', remaining_usd: '.05' } }, scope: { loaded_tasks: 0, total_account_tasks: 0 }, tasks: [] });
    if (url.endsWith('/chat')) return Response.json({ choices: [{ message: { content: chatContent } }], task: chatCost === null ? null : { spent_usd: '0.001', held_usd: '0' }, evidence: [] });
    throw new Error('unexpected test URL');
  };
  extension.activate(context);
  provider.resolveWebviewView({
    webview: { cspSource: 'test:', onDidReceiveMessage: (fn) => { receive = fn; return disposable; }, postMessage: async (message) => { posts.push(message); return true; } },
    onDidDispose: (fn) => { disposal = fn; }
  });
  const { tenantState, scopeKey } = require('../lib/tenant-state');
  return { context, posts, docs, shown, requests, commands, executed, errors, base, local: tenantState(context), scope: tenant => scopeKey(base, tenant), receive: (message) => receive(message),
    botAdapter: () => botAdapter, settings, Uri, Position, Range,
    grantError: value => { grantError = value; }, lookup: value => { lookup = value; }, warning: value => { warningAnswer = value; }, chat: value => { chatContent = value; }, editor: value => { activeEditor = value; }, applied: () => appliedEdit, taskSnapshot: value => { taskSnapshot = value; },
    blockResponse: (requestPath, method = 'GET') => { blockedRequest = { path: requestPath, method }; }, responseWaiting: () => !!releaseRequest,
    releaseResponse: () => { blockedRequest = null; releaseRequest?.(); },
    block: () => { blockGrant = true; }, unblock: () => release?.(),
    close: () => { disposal(); globalThis.fetch = originalFetch; } };
}

test('context preview opens without an account or a paid task', async () => {
  const app = host();
  try {
    await app.context.secrets.delete('tvijo.auth');
    await app.commands.get('tvijo.contextPreview')();
    assert.equal(app.shown.length, 1);
    assert.match(app.shown[0].content, /Bounded project context/);
    assert.equal(app.errors.length, 0);
    assert.equal(app.requests.filter(item => item.url.endsWith('/tasks')).length, 0);
  } finally { app.close(); }
});

test('workspace attachments reach one task and slash help never creates a task', async () => {
  const app = host();
  try {
    await app.receive({ type: 'ask', question: '/attach vscode/lib/actions.js' });
    assert.equal(app.posts.filter((item) => item.type === 'state').at(-1).attachments.length, 1);
    await app.receive({ type: 'ask', question: 'vscode/lib/actions.js' });
    assert.equal(app.posts.filter((item) => item.type === 'state').at(-1).attachments.length, 1);
    assert.equal(app.requests.filter(item => !item.url.endsWith('/account')).length, 0);
    const attached = app.posts.filter((item) => item.type === 'state').at(-1).attachments[0];
    await app.receive({ type: 'previewAttachment', id: attached.id });
    assert.equal(app.docs.at(-1).language, 'plaintext');
    assert.match(app.docs.at(-1).content, /const ACTIONS/);
    await app.receive({ type: 'ask', question: 'Explain this module' });
    assert.equal(app.requests.filter((item) => item.url.endsWith('/tasks')).length, 1);
    const chat = app.requests.find((item) => item.url.endsWith('/chat'));
    assert.match(chat.body.messages.at(-1).content, /vscode\/lib\/actions.js/);
    assert.match(chat.body.messages.at(-1).content, /const ACTIONS/);
    assert.equal(app.posts.filter((item) => item.type === 'state').at(-1).attachments.length, 0);
    await app.receive({ type: 'ask', question: '/help' });
    assert.equal(app.requests.filter(item => !item.url.endsWith('/account')).length, 3);
    assert.match(app.docs.at(-1).content, /local text extraction/);
  } finally { app.close(); }
});

test('a second ask is rejected while the first awaits its grant', async () => {
  const app = host();
  try {
    app.block();
    const first = app.receive({ type: 'ask', question: 'First question' });
    for (let i = 0; i < 30 && !app.requests.some(item => item.url.endsWith('/tasks')); i++) await new Promise((resolve) => setImmediate(resolve));
    await app.receive({ type: 'ask', question: 'Second question' });
    assert.equal(app.requests.filter(item => item.url.endsWith('/tasks')).length, 1);
    assert.ok(app.posts.some((item) => item.type === 'submission' && item.question === 'Second question' && !item.ok));
    app.unblock(); await first;
    assert.equal(app.requests.filter((item) => item.url.endsWith('/tasks')).length, 1);
  } finally { app.unblock(); app.close(); }
});

test('credential attachments and unknown slash commands create no model task', async () => {
  const app = host();
  try {
    await app.receive({ type: 'attach', name: '.env', base64: Buffer.from('SAMPLE=value').toString('base64') });
    assert.equal(app.posts.filter((item) => item.type === 'state').at(-1).attachments.length, 0);
    assert.ok(app.posts.some((item) => item.type === 'attachmentDone'));
    await app.receive({ type: 'ask', question: '/does-not-exist' });
    assert.equal(app.requests.filter(item => !item.url.endsWith('/account')).length, 0);
    assert.ok(app.posts.some((item) => item.type === 'submission' && !item.ok));
  } finally { app.close(); }
});


test('usage bridge reads private statistics without starting a model task', async () => {
  const app = host();
  try {
    await app.receive({ type: 'usage' });
    assert.equal(app.requests.filter(item => item.url.endsWith('/workspace/usage')).length, 1);
    assert.equal(app.requests.filter(item => item.url.endsWith('/tasks')).length, 0);
    assert.ok(app.posts.some(item => item.type === 'usage' && item.usage.account.tenant_id === 'test-tenant'));
  } finally { app.close(); }
});

for (const [status, code] of [[400, 'model_unavailable'], [402, 'credits_or_daily_cap_exhausted'], [403, 'origin_refused'], [409, 'previous_task_not_settled'], [429, 'preview_daily_pool_exhausted']]) {
  test(`structured ${status} ${code} does not leave a phantom grant`, async () => {
    const app = host({ grantError: { status, body: { error: { code } } } });
    try {
      await app.receive({ type: 'ask', question: 'First request' });
      assert.equal(app.local.pending(app.scope('tenant-a')), undefined);
      app.grantError(null);
      await app.receive({ type: 'ask', question: 'Corrected request' });
      assert.equal(app.requests.filter(r => r.url.endsWith('/tasks')).length, 2);
      assert.equal(app.requests.filter(r => r.url.endsWith('/chat')).length, 1);
      assert.equal(app.local.history(app.scope('tenant-a')).length, 2);
    } finally { app.close(); }
  });
}

test('local oversized context cannot create a pending journal or a network grant', async () => {
  const app = host();
  try {
    await app.receive({ type: 'ask', question: 'x'.repeat(120 * 1024) });
    assert.equal(app.local.pending(app.scope('tenant-a')), undefined);
    assert.equal(app.requests.filter(r => r.url.endsWith('/tasks')).length, 0);
    await app.receive({ type: 'ask', question: 'Short corrected question' });
    assert.equal(app.requests.filter(r => r.url.endsWith('/chat')).length, 1);
  } finally { app.close(); }
});

for (const grantError of [{ network: true }, { status: 402, body: {} }, { status: 409, body: { error: { code: 'idempotency_content_mismatch' } } }, { status: 503, body: { error: { code: 'grant_creation_refused' } } }]) {
  test(`ambiguous grant ${JSON.stringify(grantError)} stays journaled until the service finds or forgets it`, async () => {
    const app = host({ grantError });
    try {
      await app.receive({ type: 'ask', question: 'First question' });
      const pending = app.local.pending(app.scope('tenant-a'));
      assert.ok(pending?.idempotencyKey);
      await app.receive({ type: 'ask', question: 'Blocked second question' });
      assert.equal(app.requests.filter(r => r.url.endsWith('/tasks')).length, 1);
      // Declining the explicit forget keeps the journal and creates no grant.
      app.warning(undefined);
      await app.commands.get('tvijo.cancelPending')();
      assert.deepEqual(app.local.pending(app.scope('tenant-a')), pending);
      assert.ok(app.requests.filter(r => r.url.includes('/tasks/by-idempotency/')).length >= 2);
      assert.equal(app.requests.filter(r => r.url.endsWith('/tasks')).length, 1);
      assert.equal(app.posts.filter(r => r.type === 'state').at(-1).pending, true);
      // A server-visible task is adopted and cancelled without a second grant.
      app.lookup({ found: true, task: { id: 'task-test' } });
      await app.commands.get('tvijo.cancelPending')();
      assert.equal(app.local.pending(app.scope('tenant-a')), undefined);
      assert.equal(app.requests.filter(r => r.url.endsWith('/tasks')).length, 1);
      assert.equal(app.requests.filter(r => r.url.endsWith('/chat')).length, 0);
    } finally { app.close(); }
  });
}

test('a definitively absent saved request is forgotten only after explicit confirmation', async () => {
  const app = host({ grantError: { network: true } });
  try {
    await app.receive({ type: 'ask', question: 'First question' });
    const scope = app.scope('tenant-a');
    assert.ok(app.local.pending(scope)?.idempotencyKey);
    app.warning(undefined);
    await app.commands.get('tvijo.cancelPending')();
    assert.ok(app.local.pending(scope), 'declining must keep the saved request');
    app.warning('Forget request');
    await app.commands.get('tvijo.cancelPending')();
    assert.equal(app.local.pending(scope), undefined);
    assert.equal(app.requests.filter(r => r.url.endsWith('/tasks')).length, 1);
    assert.equal(app.requests.filter(r => r.url.endsWith('/chat')).length, 0);
  } finally { app.close(); }
});

test('in-panel choices persist and the language choice reaches the host', async () => {
  const app = host();
  try {
    await app.receive({ type: 'ready' });
    const scopeKey = app.scope('tenant-a');
    await app.receive({ type: 'setOption', key: 'reasoningMethod', value: 'plan-check', scopeKey });
    await app.receive({ type: 'setOption', key: 'agentMode', value: 'council', scopeKey });
    await app.receive({ type: 'setOption', key: 'model', value: 'ds41f', scopeKey });
    assert.equal(app.settings.get('reasoningMethod'), 'plan-check');
    assert.equal(app.settings.get('agentMode'), 'council');
    assert.equal(app.settings.get('model'), 'ds41f');
    const options = app.posts.filter(p => p.type === 'state').at(-1).options;
    assert.equal(options.reasoningMethod, 'plan-check');
    assert.equal(options.agentMode, 'council');
    assert.equal(options.model, 'ds41f');
    assert.ok(options.models.some(item => item.id === 'auto'));
    await app.receive({ type: 'locale', value: 'ru' });
    assert.equal(app.context.globalState.get('tvijo.uiLocale'), 'ru');
    assert.equal(app.posts.filter(p => p.type === 'state').at(-1).locale, 'ru');
    await app.receive({ type: 'setOption', key: 'reasoningMethod', value: 'make-it-fast', scopeKey });
    assert.equal(app.settings.get('reasoningMethod'), 'plan-check');
    assert.match(app.errors.at(-1), /Unknown model/);
  } finally { app.close(); }
});

test('account switch never renders or resends another account history, attachments or pending', async () => {
  const app = host();
  try {
    await app.receive({ type: 'ask', question: 'Account A private conversation' });
    await app.receive({ type: 'attach', name: 'note.txt', base64: Buffer.from('Account A private attachment').toString('base64') });
    await app.local.savePending(app.scope('tenant-a'), { idempotencyKey: 'A-unresolved', apiBase: app.base });
    await app.commands.get('tvijo.signOut')();
    await app.context.secrets.store('tvijo.auth', JSON.stringify({ access_token: 'account-b', api_base: app.base }));
    await app.receive({ type: 'ready' });
    const visible = app.posts.filter(p => p.type === 'state').at(-1);
    assert.deepEqual(visible.messages, []);
    assert.deepEqual(visible.attachments, []);
    assert.equal(visible.pending, false);
    await app.receive({ type: 'ask', question: 'Account B question', scopeKey: app.scope('tenant-b') });
    const request = app.requests.filter(r => r.url.endsWith('/chat')).at(-1);
    assert.equal(request.token, 'Bearer account-b');
    assert.equal(request.body.messages.length, 1);
    assert.doesNotMatch(JSON.stringify(request.body.messages), /Account A/);
    assert.equal(app.local.pending(app.scope('tenant-a')).idempotencyKey, 'A-unresolved');
    await app.commands.get('tvijo.signOut')();
    await app.context.secrets.store('tvijo.auth', JSON.stringify({ access_token: 'account-a-renewed', api_base: app.base }));
    await app.receive({ type: 'ready' });
    const restored = app.posts.filter(p => p.type === 'state').at(-1);
    assert.match(restored.messages[0].content, /Account A private/);
    assert.equal(restored.attachments[0].name, 'note.txt');
    assert.equal(restored.pending, true);
  } finally { app.close(); }
});

test('legacy history is quarantined and unowned pending lookup cannot mint a grant', async () => {
  const app = host();
  try {
    const history = [{ role: 'user', content: 'Unassigned legacy conversation' }];
    const pending = { idempotencyKey: 'legacy', request: { title: 'Unassigned request' }, apiBase: app.base };
    await app.context.workspaceState.update('tvijo.conversation', history);
    await app.context.globalState.update('tvijo.pending', pending);
    await app.receive({ type: 'ready' });
    const visible = app.posts.filter(p => p.type === 'state').at(-1);
    assert.deepEqual(visible.messages, []);
    assert.equal(visible.legacyHistory, true);
    assert.equal(visible.pending, true);
    await app.commands.get('tvijo.cancelPending')();
    assert.equal(app.requests.filter(r => r.url.endsWith('/tasks')).length, 0);
    assert.deepEqual(app.context.workspaceState.get('tvijo.conversation'), history);
    assert.deepEqual(app.context.globalState.get('tvijo.pending'), pending);
  } finally { app.close(); }
});

test('legacy Telegram credentials are not silently reused by a signed-in service account', async () => {
  const app = host();
  try {
    await app.context.secrets.store('tvijo.telegram.token', 'preserved-legacy-secret');
    await app.commands.get('tvijo.startBot')();
    assert.match(app.errors.at(-1), /Configure Telegram bot for this signed-in account/);
    assert.equal(await app.context.secrets.get('tvijo.telegram.token'), 'preserved-legacy-secret');
    assert.equal(app.requests.some(r => /api\.telegram\.org/.test(r.url)), false);
  } finally { app.close(); }
});

test('settled oldest journal cannot hide a later ambiguous request when a third question arrives', async () => {
  const app = host();
  try {
    const scope = app.scope('tenant-a');
    const first = { idempotencyKey: 'request-A', taskId: 'task-test', apiBase: app.base, createdAt: '2026-10-18T00:00:00Z' };
    const second = { idempotencyKey: 'request-B', apiBase: app.base, createdAt: '2026-10-18T00:00:01Z' };
    await app.local.savePending(scope, first);
    await app.local.savePending(scope, second);
    await app.receive({ type: 'ask', question: 'Request C must not start' });
    assert.equal(app.local.pending(scope, 'request-A'), undefined, 'only the confirmed terminal journal is cleared');
    assert.deepEqual(app.local.pending(scope, 'request-B'), second, 'later uncertain issuance is preserved');
    assert.equal(app.requests.filter(r => r.url.endsWith('/tasks') && r.method === 'POST').length, 0);
    assert.equal(app.requests.filter(r => r.url.endsWith('/chat')).length, 0);
    assert.match(app.errors.at(-1), /no task for the saved request/);
    assert.equal(app.posts.filter(p => p.type === 'state').at(-1).pending, true);
  } finally { app.close(); }
});

for (const [command, requestPath] of [['tvijo.tasks', '/tasks'], ['tvijo.account', '/account']]) {
  test(`${command} cannot display a delayed account A response after switching to B`, async () => {
    const app = host();
    try {
      await app.receive({ type: 'ready' });
      app.blockResponse(requestPath);
      const pending = app.commands.get(command)();
      for (let i = 0; i < 30 && !app.responseWaiting(); i++) await new Promise(resolve => setImmediate(resolve));
      assert.ok(app.responseWaiting());
      await app.context.secrets.store('tvijo.auth', JSON.stringify({ access_token: 'account-b', api_base: app.base }));
      // Release after auth changes; requireAuth's token guard must reject the stale payload.
      app.releaseResponse();
      await app.receive({ type: 'ready' });
      await pending;
      assert.equal(app.docs.length, 0);
      assert.equal(app.shown.length, 0);
    } finally { app.releaseResponse(); app.close(); }
  });
}

test('a delayed editor answer stays in A history without opening its document under B', async () => {
  const app = host();
  try {
    await app.receive({ type: 'ready' });
    app.blockResponse('/chat', 'POST');
    const pending = app.commands.get('tvijo.ask')();
    for (let i = 0; i < 30 && !app.responseWaiting(); i++) await new Promise(resolve => setImmediate(resolve));
    assert.ok(app.responseWaiting());
    await app.context.secrets.store('tvijo.auth', JSON.stringify({ access_token: 'account-b', api_base: app.base }));
    await app.receive({ type: 'ready' });
    app.releaseResponse();
    await pending;
    assert.equal(app.local.history(app.scope('tenant-a')).length, 2);
    assert.deepEqual(app.local.history(app.scope('tenant-b')), []);
    assert.equal(app.shown.length, 0);
    assert.equal(app.docs.length, 0);
    assert.deepEqual(app.posts.filter(p => p.type === 'state').at(-1).messages, []);
  } finally { app.releaseResponse(); app.close(); }
});

test('bot save(null) cannot remove a newer journal that replaced its loaded request', async () => {
  const app = host({ captureBot: true });
  try {
    const scope = app.scope('tenant-a');
    await app.local.saveBotConfig(scope, { ownerId: '123456', allowedServices: [] });
    await app.context.secrets.store(`tvijo.telegram.token.${scope}`, 'synthetic-bot-secret');
    await app.local.savePending(scope, { idempotencyKey: 'request-A', taskId: 'task-test', apiBase: app.base });
    await app.commands.get('tvijo.startBot')();
    assert.ok(app.botAdapter());
    await app.local.savePending(scope, undefined, 'request-A');
    const second = { idempotencyKey: 'request-B', apiBase: app.base };
    await app.local.savePending(scope, second);
    await app.botAdapter().save({ pending: null, lastOutcome: { status: 'completed' } });
    assert.deepEqual(app.local.pending(scope, 'request-B'), second);
    assert.equal(app.local.pending(scope, 'request-A'), undefined);
    assert.equal(app.requests.filter(r => r.url.endsWith('/tasks') && r.method === 'POST').length, 0);
  } finally { app.close(); }
});

test('bot clearing its own journal still requires confirmed terminal zero-held state', async () => {
  const app = host({ captureBot: true, taskSnapshot: { status: 'frozen', budget: { held_usd: '0' } } });
  try {
    const scope = app.scope('tenant-a');
    await app.local.saveBotConfig(scope, { ownerId: '123456', allowedServices: [] });
    await app.context.secrets.store(`tvijo.telegram.token.${scope}`, 'synthetic-bot-secret');
    await app.local.savePending(scope, { idempotencyKey: 'request-A', taskId: 'task-test', apiBase: app.base });
    await app.commands.get('tvijo.startBot')();
    await app.botAdapter().save({ pending: null });
    assert.equal(app.local.pending(scope, 'request-A').taskId, 'task-test');
    app.taskSnapshot({ status: 'completed', budget: { held_usd: '0' } });
    await app.botAdapter().save({ pending: null });
    assert.equal(app.local.pending(scope, 'request-A'), undefined);
  } finally { app.close(); }
});

test('bot settlement awaiting A cannot clear B loaded while the status response was delayed', async () => {
  const app = host({ captureBot: true });
  try {
    const scope = app.scope('tenant-a');
    await app.local.saveBotConfig(scope, { ownerId: '123456', allowedServices: [] });
    await app.context.secrets.store(`tvijo.telegram.token.${scope}`, 'synthetic-bot-secret');
    await app.local.savePending(scope, { idempotencyKey: 'request-A', taskId: 'task-test', apiBase: app.base });
    await app.commands.get('tvijo.startBot')();
    app.blockResponse('/tasks/task-test');
    const saving = app.botAdapter().save({ pending: null });
    for (let i = 0; i < 30 && !app.responseWaiting(); i++) await new Promise(resolve => setImmediate(resolve));
    assert.ok(app.responseWaiting());
    await app.local.savePending(scope, undefined, 'request-A');
    const second = { idempotencyKey: 'request-B', apiBase: app.base };
    await app.local.savePending(scope, second);
    await app.botAdapter().load();
    app.releaseResponse();
    await saving;
    assert.deepEqual(app.local.pending(scope, 'request-B'), second);
  } finally { app.releaseResponse(); app.close(); }
});

for (const taskSnapshot of [{ status: 'running', budget: { held_usd: '0' } }, { status: 'completed', budget: { held_usd: '0.01' } }, { status: 'completed' }, { status: 'completed', budget: { held_usd: '' } }, { status: 'completed', budget: { held_usd: false } }]) {
  test(`answer with unsettled authoritative snapshot ${JSON.stringify(taskSnapshot)} preserves its journal`, async () => {
    const app = host({ taskSnapshot });
    try {
      await app.receive({ type: 'ask', question: 'Answer with uncertain settlement' });
      assert.equal(app.local.history(app.scope('tenant-a')).length, 2, 'the received answer is preserved');
      assert.equal(app.local.pending(app.scope('tenant-a')).taskId, 'task-test');
      await app.receive({ type: 'ask', question: 'No second model call' });
      assert.equal(app.requests.filter(r => r.url.endsWith('/chat')).length, 1);
    } finally { app.close(); }
  });
}

test('bounded workspace context is prepended only after consent is enabled', async () => {
  const app = host();
  try {
    await app.context.globalState.update('tvijo.contextConsent', 'on');
    await app.receive({ type: 'ask', question: 'What is this project?' });
    const chat = app.requests.find(item => item.url.endsWith('/chat'));
    assert.ok(chat, 'chat request exists');
    const content = chat.body.messages.at(-1).content;
    assert.match(content, /\[WORKSPACE CONTEXT\]/);
    assert.match(content, /README\.md/);
    assert.match(content, /Demo project README/);
    assert.match(content, /\[END WORKSPACE CONTEXT\]/);
  } finally { app.close(); }
});

test('workspace context stays out when the operator declined it', async () => {
  const app = host();
  try {
    await app.context.globalState.update('tvijo.contextConsent', 'off');
    await app.receive({ type: 'ask', question: 'What is this project?' });
    const chat = app.requests.find(item => item.url.endsWith('/chat'));
    assert.ok(chat, 'chat request exists');
    assert.doesNotMatch(chat.body.messages.at(-1).content, /\[WORKSPACE CONTEXT\]/);
  } finally { app.close(); }
});

test('quick edit parses the model envelope and applies it only to the buffer', async () => {
  const app = host({ chatContent: '<<<FILE>>>\nconst value = 2;\n<<<END>>>' });
  try {
    const root = path.resolve(__dirname, '../..');
    const file = path.join(root, 'vscode/lib/actions.js');
    const document = {
      uri: app.Uri.file(file), fileName: file, languageId: 'javascript',
      isUntitled: false, isDirty: false, isClosed: false,
      getText: () => 'const value = 1;\n', positionAt: () => new app.Position(0, 0)
    };
    app.editor({ document });
    app.warning('Apply to buffer');
    await app.commands.get('tvijo.quickEdit')();
    const applied = app.applied();
    assert.ok(applied, 'workspace edit was applied');
    assert.equal(applied.uri.fsPath, file);
    assert.equal(applied.text, 'const value = 2;');
  } finally { app.close(); }
});

test('quick edit refuses an answer without the file envelope and writes nothing', async () => {
  const app = host({ chatContent: 'I would change the constant.' });
  try {
    const root = path.resolve(__dirname, '../..');
    const file = path.join(root, 'vscode/lib/actions.js');
    const document = {
      uri: app.Uri.file(file), fileName: file, languageId: 'javascript',
      isUntitled: false, isDirty: false, isClosed: false,
      getText: () => 'const value = 1;\n', positionAt: () => new app.Position(0, 0)
    };
    app.editor({ document });
    await app.commands.get('tvijo.quickEdit')();
    assert.equal(app.applied(), null);
    assert.match(app.errors.at(-1), /required file envelope/);
  } finally { app.close(); }
});

for (const code of ['free_preview_exhausted', 'operator_allowance_exhausted', 'credits_or_daily_cap_exhausted', 'insufficient_credit']) {
  test(`api.ask preserves structured billing refusal ${code}`, async () => {
    const { createClient } = require('../lib/client');
    const api = createClient({ fetchImpl: async () => Response.json({ error: { code } }, { status: 402 }) });
    await assert.rejects(api.ask({ token: 'test', messages: [{ role: 'user', content: 'x' }], idempotencyKey: 'x' }), error => error.serverCode === code && error.code === code && error.definitiveGrantRefusal === true);
  });
}

test('known pregrant lookup absence clears automatically without confirmation', async () => {
  const app = host();
  try {
    await app.receive({ type: 'ready' });
    await app.local.savePending(app.scope('tenant-a'), { idempotencyKey: 'never-dispatched', phase: 'pregrant', apiBase: app.base });
    app.warning('Do not forget');
    await app.receive({ type: 'ask', question: 'A new question' });
    assert.equal(app.local.pending(app.scope('tenant-a')), undefined);
    assert.equal(app.requests.filter(r => r.url.endsWith('/tasks') && r.method === 'POST').length, 1);
  } finally { app.close(); }
});

for (const name of ['.env', '.env.production', '.npmrc']) {
  test(`quick edit blocks secret file ${name} before a grant`, async () => {
    const app = host();
    try {
      const file = path.resolve(__dirname, '../..', name);
      app.editor({ document: { uri: app.Uri.file(file), isUntitled: false, getText: () => 'private' } });
      await app.commands.get('tvijo.quickEdit')();
      assert.equal(app.requests.filter(r => r.url.endsWith('/tasks')).length, 0);
      assert.equal(app.applied(), null);
    } finally { app.close(); }
  });
}

test('quick edit workspaceContext off sends only the requested file', async () => {
  const app = host({ chatContent: '<<<FILE>>>\nnew\n<<<END>>>' });
  try {
    app.settings.set('workspaceContext', 'off');
    const file = path.resolve(__dirname, '../lib/actions.js');
    app.editor({ document: { uri: app.Uri.file(file), fileName: file, isUntitled: false, languageId: 'javascript', isClosed: false, getText: () => 'original', positionAt: () => new app.Position(0, 0) } });
    await app.commands.get('tvijo.quickEdit')();
    const chat = app.requests.find(r => r.url.endsWith('/chat'));
    assert.ok(chat);
    assert.doesNotMatch(JSON.stringify(chat.body.messages), /Bounded project context|package\.json|README/);
  } finally { app.close(); }
});

test('local tools refuse symlink components for read, search and write', async () => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const { createTools } = require('../lib/local-tools');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvijo-0511-symlink-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'tvijo-0511-outside-'));
  await fs.writeFile(path.join(outside, 'file.txt'), 'outside secret');
  await fs.symlink(outside, path.join(root, 'link'));
  const tools = createTools({ root, confirmRun: async () => true, confirmWrite: async () => true });
  for (const action of [{ tool: 'read_file', path: 'link/file.txt' }, { tool: 'write_file', path: 'link/new.txt', content: 'bad' }, { tool: 'search', path: 'link', query: 'secret' }]) {
    await assert.rejects(tools.execute(action), /Symlink/);
  }
  assert.equal(await fs.readFile(path.join(outside, 'file.txt'), 'utf8'), 'outside secret');
});

test('search excludes secret files and treats option-like pattern as data', async () => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const { createTools } = require('../lib/local-tools');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvijo-0511-search-'));
  await fs.writeFile(path.join(root, 'safe.txt'), '--needle public');
  await fs.writeFile(path.join(root, 'credentials.json'), '--needle private');
  await fs.writeFile(path.join(root, '.npmrc'), '--needle private');
  await fs.mkdir(path.join(root, 'node_modules'));
  await fs.writeFile(path.join(root, 'node_modules', 'hidden.txt'), '--needle private');
  const tools = createTools({ root });
  const result = await tools.execute({ tool: 'search', query: '--needle' });
  assert.match(result.output, /public/);
  assert.doesNotMatch(result.output, /private/);
});

test('auto commands match exact executable and arguments; environment excludes credentials', () => {
  const { autoCommand, cleanEnv } = require('../lib/local-tools');
  assert.deepEqual(autoCommand('npm test'), ['npm', 'test']);
  for (const command of ['npm test\ncat .env', 'npm test && cat .env', 'python -c "print(1)"', 'node -e "1"', 'sh -c true', 'npx arbitrary']) assert.equal(autoCommand(command), null);
  const keys = ['AWS_ACCESS_KEY_ID', 'AWS_PROFILE', 'DATABASE_URL', 'PGPASSWORD', 'CUSTOM_SECRET'];
  const old = keys.map(key => process.env[key]);
  try {
    keys.forEach(key => { process.env[key] = 'test-private'; });
    const env = cleanEnv();
    keys.forEach(key => assert.equal(env[key], undefined));
  } finally { keys.forEach((key, index) => { if (old[index] === undefined) delete process.env[key]; else process.env[key] = old[index]; }); }
});


test('agent checks zero budget before requesting a grant', async () => {
  const app = host();
  try {
    app.settings.set('workspaceContext', 'off');
    app.settings.set('agentBudgetUsd', 0);
    await app.commands.get('tvijo.agent')();
    assert.equal(app.requests.filter(r => r.url.endsWith('/tasks')).length, 0);
  } finally { app.close(); }
});

test('agent grant is bounded by remaining budget and stops at the budget', async () => {
  const app = host({ chatContent: '{"tool":"list_dir","path":"."}' });
  try {
    app.settings.set('workspaceContext', 'off');
    app.settings.set('agentBudgetUsd', 0.001);
    await app.commands.get('tvijo.agent')();
    const grants = app.requests.filter(r => r.url.endsWith('/tasks') && r.method === 'POST');
    assert.equal(grants.length, 1);
    assert.ok(Number(grants[0].body.max_usd) <= 0.001);
    assert.match(app.errors.at(-1), /budget exhausted/i);
  } finally { app.close(); }
});

test('agent unknown cost blocks further steps', async () => {
  const app = host({ chatContent: '{"tool":"list_dir","path":"."}', chatCost: null });
  try {
    app.settings.set('workspaceContext', 'off');
    await app.commands.get('tvijo.agent')();
    assert.equal(app.requests.filter(r => r.url.endsWith('/tasks') && r.method === 'POST').length, 1);
    assert.ok(app.errors.length > 0);
    assert.equal(app.posts.filter(p => p.type === 'agent' && p.event.type === 'action').length, 0);
  } finally { app.close(); }
});


test('agent autoApply always previews a diff and applies only a WorkspaceEdit', async () => {
  const fs = require('node:fs/promises');
  const file = path.resolve(__dirname, '../lib/actions.js');
  const before = await fs.readFile(file, 'utf8');
  const app = host({ chatContent: JSON.stringify({ tool: 'write_file', path: 'vscode/lib/actions.js', content: 'reviewed buffer content' }) });
  try {
    app.settings.set('workspaceContext', 'off');
    app.settings.set('agentAutoApply', true);
    app.settings.set('agentMaxSteps', 1);
    app.editor({ document: { uri: app.Uri.file(file), version: 1, isClosed: false, getText: () => before, positionAt: () => new app.Position(0, 0) } });
    await app.commands.get('tvijo.agent')();
    assert.equal(app.applied()?.text, 'reviewed buffer content');
    assert.ok(app.executed.some(item => item.id === 'vscode.diff'));
    assert.equal(await fs.readFile(file, 'utf8'), before);
  } finally { app.close(); }
});

test('agent history trimming keeps system, original goal and first answer', async () => {
  const content = JSON.stringify({ tool: 'list_dir', path: '.' });
  const app = host({ chatContent: content });
  try {
    app.settings.set('workspaceContext', 'off');
    app.settings.set('agentMaxSteps', 10);
    await app.commands.get('tvijo.agent')();
    const chats = app.requests.filter(r => r.url.endsWith('/chat'));
    assert.equal(chats.length, 10);
    for (const chat of chats) {
      assert.equal(chat.body.messages[0].role, 'system');
      assert.equal(chat.body.messages[1].content, 'Account A editor question');
    }
    assert.equal(chats.at(-1).body.messages[2].content, content);
    assert.ok(chats.at(-1).body.messages.length <= 12);
  } finally { app.close(); }
});

test('quick edit stops after an account change during apply confirmation', async () => {
  let app;
  app = host({ chatContent: '<<<FILE>>>\nnew\n<<<END>>>', onWarning: async message => {
    if (message.startsWith('Apply the reviewed')) await app.context.secrets.store('tvijo.auth', JSON.stringify({ access_token: 'different-token', api_base: app.base }));
  } });
  try {
    app.settings.set('workspaceContext', 'off');
    const file = path.resolve(__dirname, '../lib/actions.js');
    app.editor({ document: { uri: app.Uri.file(file), version: 1, isUntitled: false, isClosed: false, getText: () => 'original', positionAt: () => new app.Position(0, 0) } });
    app.warning('Apply to buffer');
    await app.commands.get('tvijo.quickEdit')();
    assert.equal(app.applied(), null);
  } finally { app.close(); }
});

test('agent stops after account change while the model is working and keeps original event scope', async () => {
  const app = host({ chatContent: '{"tool":"run_command","command":"npm test"}' });
  try {
    app.settings.set('workspaceContext', 'off');
    app.settings.set('agentAutoRun', true);
    app.blockResponse('/chat', 'POST');
    const running = app.commands.get('tvijo.agent')();
    for (let i = 0; i < 50 && !app.responseWaiting(); i++) await new Promise(resolve => setImmediate(resolve));
    assert.ok(app.responseWaiting());
    const original = app.posts.find(p => p.type === 'agent' && p.event.goal === 'Account A editor question').scopeKey;
    await app.context.secrets.store('tvijo.auth', JSON.stringify({ access_token: 'account-b', api_base: app.base }));
    app.releaseResponse();
    await running;
    assert.equal(app.posts.filter(p => p.type === 'agent' && p.event.type === 'action').length, 0);
    const privateEvents = app.posts.filter(p => p.type === 'agent' && p.event.goal === 'Account A editor question');
    assert.ok(privateEvents.every(p => p.scopeKey === original));
    assert.ok(app.posts.some(p => p.type === 'agent' && p.event.type === 'start' && p.event.goal === ''));
  } finally { app.close(); }
});

test('definitive pregrant refusal in agent mode leaves no phantom journal', async () => {
  const app = host({ grantError: { status: 402, body: { error: { code: 'free_preview_exhausted' } } } });
  try {
    app.settings.set('workspaceContext', 'off');
    await app.commands.get('tvijo.agent')();
    assert.equal(app.local.pending(app.scope('tenant-a')), undefined);
    assert.equal(app.requests.filter(r => r.url.endsWith('/chat')).length, 0);
  } finally { app.close(); }
});

for (const [code, expected] of [
  ['free_preview_exhausted', 'Бесплатная проба завершена. Откройте условия кредита.'],
  ['operator_allowance_exhausted', 'Дневной тестовый allowance оператора исчерпан.'],
  ['credits_or_daily_cap_exhausted', 'Исчерпан кредит или дневной лимит аккаунта.'],
  ['insufficient_credit', 'Доступный кредит не покрывает резерв этой задачи.']
]) {
  test(`Russian UI preserves the specific reason ${code}`, async () => {
    const app = host({ grantError: { status: 402, body: { error: { code } } } });
    try {
      await app.receive({ type: 'locale', value: 'ru' });
      await app.receive({ type: 'ask', question: 'Test refusal' });
      assert.ok(app.errors.some(message => message.includes(expected)));
    } finally { app.close(); }
  });
}
