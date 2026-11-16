// Adapted from the base extension.test.js host fixture at fb853db. No real network.
'use strict';

const nodeTest = require('node:test');
// This aggregate needs more than a minute, but each registered case still has
// its own one-minute ceiling. Keep existing options and any stricter deadline.
function test(name, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  return nodeTest(name, { ...options, timeout: Math.min(options?.timeout ?? 60000, 60000) }, callback);
}
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs/promises');

function memory(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { get: (key) => values.get(key), keys: () => [...values.keys()], update: async (key, value) => values.set(key, value), store: async (key, value) => values.set(key, value), delete: async (key) => values.delete(key) };
}

function host(options = {}) {
  const optionsHost = options;
  const base = 'http://localhost:18106/api/dshrem/v1';
  const commands = new Map();
  const executed = [];
  const posts = [];
  const docs = [];
  const shown = [];
  const warnings = [];
  const infos = [];
  const requests = [];
  const errors = [];
  const feedback = [];
  const renderedErrors = new WeakSet();
  function recordPost(message) { posts.push(message); if (message.type === 'state' && message.error && !renderedErrors.has(message.error)) { renderedErrors.add(message.error); feedback.push(message.error.text); } }
  const panels = [];
  const external = [];
  const copied = [];
  let grantError = options.grantError;
  let warningAnswer = 'Forget request';
  let chatContent = options.chatContent || 'Test answer';
  let chatIndex = 0;
  const chatCost = options.chatCost;
  let activeEditor = null;
  let appliedEdit = null;
  let lookup = options.lookup || { found: false, task: null };
  let taskSnapshot = options.taskSnapshot || { status: 'completed', budget: { held_usd: '0' } };
  let provider;
  let receive;
  let disposal;
  let workspaceChangeListener = null;
  const diagnosticsChangeListeners = [];
  const configurationChangeListeners = [];
  let release;
  let blockGrant = false;
  let botAdapter;
  let blockedRequest;
  let releaseRequest;
  const disposable = { dispose() {} };
  function fireDiagnostics(uris) { for (const listener of diagnosticsChangeListeners) listener({ uris }); }
  const root = options.root || path.resolve(__dirname, '../..');
  const storage = options.storage || require('node:fs').mkdtempSync(path.join(process.env.TVIJO_TEST_ARTIFACTS || require('node:os').tmpdir(),'rewind-host-'));
  const settings = new Map(options.defaultAuto ? [] : [['agentAutoApply',false],['agentAutoRun',false]]);
  const status = { show() {} };
  class Uri { constructor(fsPath) { this.fsPath = fsPath; this.scheme = 'file'; } static file(value) { return new Uri(value); } static parse(value) { return new Uri(value); } static joinPath(base, ...parts) { return new Uri(path.join(base.fsPath, ...parts)); } }
  class Position { constructor(line, character) { this.line = line; this.character = character; } }
  class Range { constructor(start, end) { this.start = start; this.end = end; } }
  class WorkspaceEdit {
    constructor() { this.operations = []; }
    replace(uri, range, text) { appliedEdit = { uri, range, text }; this.operations.push({kind:'replace',uri,range,text}); }
    createFile(uri) { this.operations.push({kind:'create',uri}); }
    insert(uri, position, text) { this.operations.push({kind:'insert',uri,text}); }
    deleteFile(uri) { this.operations.push({kind:'delete',uri}); }
  }
  const context = {
    subscriptions: [], globalStorageUri: Uri.file(storage), globalState: options.globalState || memory(), workspaceState: options.workspaceState || memory(),
    secrets: options.secrets || memory({ 'tvijo.auth': JSON.stringify({ access_token: 'test-token', api_base: base }) })
  };
  const vscode = {
    Uri, Position, Range, WorkspaceEdit, FileType: { File: 1, Directory: 2, SymbolicLink: 64 }, StatusBarAlignment: { Right: 1 }, ProgressLocation: { Notification: 1 }, ViewColumn: { Beside: 2 }, ConfigurationTarget: { Global: 1 },
    env: { get isTelemetryEnabled() { return options.telemetryEnabled !== false; }, clipboard: { writeText: async value => { copied.push(value); } }, openExternal: async uri => { external.push(uri.fsPath); } },
    commands: { registerCommand: (id, fn) => { commands.set(id, fn); return disposable; }, executeCommand: async (id, ...args) => { executed.push({ id, args }); return commands.get(id)?.(...args); } },
    workspace: {
      isTrusted:options.workspaceTrusted !== false,
      getConfiguration: () => ({ get: (key, fallback) => key === 'apiBase' ? base : (settings.has(key) ? settings.get(key) : fallback), inspect: key => ({ globalValue: settings.get(key) }), update: async (key, value) => { if (options.configurationUpdate) return options.configurationUpdate(key, value, settings); settings.set(key, value); } }),
      onDidChangeConfiguration: fn => { configurationChangeListeners.push(fn); return disposable; },
      onDidChangeWorkspaceFolders: fn => { workspaceChangeListener = fn; return disposable; },
      workspaceFolders: [{ uri: Uri.file(root) }],
      getWorkspaceFolder: (uri) => uri?.fsPath?.startsWith(root + path.sep) ? { uri: Uri.file(root) } : undefined,
      fs: {
        readDirectory: async () => [['README.md', 1], ['src', 2]],
        stat: async () => ({ type: 1 }),
        readFile: async () => Buffer.from('Demo project README\n')
      },
      applyEdit: async edit => { if (options.applyEdit) return options.applyEdit(edit, { fireDiagnostics }); return true; },
      get textDocuments() { return activeEditor ? [activeEditor.document] : []; },
      openTextDocument: async (doc) => { docs.push(doc); if (options.documentFor) return options.documentFor(doc); return doc?.fsPath && activeEditor?.document?.uri?.fsPath === doc.fsPath ? activeEditor.document : doc; }
    },
    languages: { onDidChangeDiagnostics: fn => { diagnosticsChangeListeners.push(fn); return disposable; }, getDiagnostics: uri => options.diagnosticsFor ? options.diagnosticsFor(uri) : (options.diagnostics || []) },
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2 },
    window: {
      createWebviewPanel: (viewType,title,column,options) => {
        let listener;
        const panel = { viewType,title,column,options,revealed: 0, reveal() { this.revealed++; }, dispose() { this.disposed=true; }, onDidDispose() {},
          webview: { cspSource: 'test:', html: '', postMessage: async message => { posts.push(message); }, onDidReceiveMessage: fn => { listener = fn; return disposable; } },
          receive: message => listener(message) };
        panels.push(panel); return panel;
      },
      createStatusBarItem: () => status,
      registerWebviewViewProvider: (_id, value) => { provider = value; return disposable; },
      showErrorMessage: async message => { errors.push(message); feedback.push(message); }, showInformationMessage: async (...args) => { infos.push(args); return options.onInfo ? options.onInfo(...args) : undefined; },
      showWarningMessage: async (...args) => { warnings.push(args); if (options.onWarning) await options.onWarning(...args); return warningAnswer; },
      showTextDocument: async doc => { shown.push(doc); },
      showInputBox: async config => options.inputBox ? options.inputBox(config) : 'Account A editor question',
      showQuickPick: async (choices, config) => options.pick?.(choices, config),
      showOpenDialog: async config => options.openFiles?.(config),
      get activeTextEditor() { return activeEditor; },
      get activeTerminal() { return options.activeTerminal; },
      withProgress: async (_options, fn) => fn({}, { onCancellationRequested() {} })
    }
  };
  const originalLoad = Module._load;
  let extension;
  try {
    Module._load = function (id, ...args) {
      if (id === 'vscode') return vscode;
      if (id === './lib/full-access' && options.isPrivileged) {const actual=originalLoad.call(this,id,...args);return {...actual,createFullAccess:params=>actual.createFullAccess({...params,isPrivileged:options.isPrivileged})};}
      if (id === './lib/local-tools' && options.isPrivileged) {const actual=originalLoad.call(this,id,...args);return {...actual,createTools:params=>actual.createTools({...params,isPrivileged:options.isPrivileged})};}
      if (id === './lib/agent-review') return {createAgentReview:options.agentReview || (()=>({status:async()=>({ok:true,agents:{},fixture:true}),review:async()=>{throw Error('Review test must supply a bounded mock; native CLIs are never launched by this fixture.');}}))};
      if (id === './lib/syntax-host' && options.syntaxHost) return {createSyntaxHost:() => options.syntaxHost};
      if (id === './lib/checkpoints' && options.checkpointFailure) {
        const actual = originalLoad.call(this,id,...args);
        return {createCheckpoints:(...params) => ({...actual.createCheckpoints(...params),capture:() => {throw Error('Synthetic checkpoint failure');}})};
      }
      if (id === './lib/attachments' && options.prepareAttachment) return { ...originalLoad.call(this, id, ...args), prepareAttachment: options.prepareAttachment };
      if (id === './lib/telegram-bot' && options.captureBot) return { createBot: adapter => {
        botAdapter = adapter;
        return { start: async () => { await adapter.load(); return { username: 'synthetic' }; }, poll: async () => {}, stop() {}, running: false };
      } };
      return originalLoad.call(this, id, ...args);
    };
    delete require.cache[require.resolve('../../extension')];
    extension = require('../../extension');
  } finally { Module._load = originalLoad; }
  const projectFixtures = options.projects;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const body = options.body && JSON.parse(options.body);
    await optionsHost.onRequest?.({url,body,method:options.method});
    requests.push({ url, body, method: options.method, token: options.headers.authorization });
    if (blockedRequest && url.endsWith(blockedRequest.path) && options.method === blockedRequest.method) await new Promise(resolve => { releaseRequest = resolve; });
    if (url.endsWith('/account') && optionsHost.accountReply) { const response=await optionsHost.accountReply(options.headers.authorization); if(response)return response; }
    if (url.endsWith('/account')) return Response.json({ tenant_id: options.headers.authorization === 'Bearer account-b' ? 'tenant-b' : 'tenant-a', ...optionsHost.account });
    if (url.endsWith('/data-preferences')) return optionsHost.preferences === 'error' ? Response.json({error:'unavailable'},{status:503}) : Response.json(optionsHost.preferences ?? {preferences:[{purpose:'analytics',state:'denied'}]});
    if (url.endsWith('/packs')) return optionsHost.packs ? Response.json(optionsHost.packs) : Response.json({}, { status: 404 });
    if (url.endsWith('/projects') && projectFixtures) return Response.json({ projects: projectFixtures });
    if (url.endsWith('/byok') && projectFixtures) return Response.json({ connections: [] });
    if (url.endsWith('/auth/logout')) return Response.json({ revoked: true });
    if (url.endsWith('/tasks') && options.method === 'POST') {
      if (blockGrant) await new Promise((resolve) => { release = resolve; });
      if (grantError?.network) throw new Error('Lost synthetic response');
      if (grantError) return Response.json(grantError.body, { status: grantError.status });
      return Response.json({ id: 'task-test',model:optionsHost.grantModel });
    }
    if (url.endsWith('/tasks') && options.method === 'GET') return Response.json({ tasks: optionsHost.tasks || [{ title: 'Account A private server task' }] });
    if (url.includes('/tasks/by-idempotency/')) return Response.json(lookup);
    if (url.endsWith('/tasks/task-test') || url.endsWith('/tasks/task-test/cancel')) return Response.json(taskSnapshot);
    if (url.endsWith('/workspace/usage')) return Response.json({ account: { tenant_id: 'test-tenant', budget: { spent_usd: '0', held_usd: '0', remaining_usd: '.05' } }, scope: { loaded_tasks: 0, total_account_tasks: 0 }, tasks: [] });
    if (url.endsWith('/chat')) { const content = optionsHost.chatSequence?.[chatIndex++] || chatContent; return Response.json({ choices: [{ message: { content } }], ...optionsHost.chatExecution, task: chatCost === null ? null : { spent_usd: String(chatCost ?? '0.001'), held_usd: '0' }, evidence: [] }); }
    throw new Error('unexpected test URL');
  };
  extension.activate(context);
  provider.resolveWebviewView({
    webview: { cspSource: 'test:', onDidReceiveMessage: (fn) => { receive = fn; return disposable; }, postMessage: async (message) => { recordPost(message); return true; } },
    onDidDispose: (fn) => { disposal = fn; }
  });
  const { tenantState, scopeKey } = require('../../lib/tenant-state');
  const accountLocal=tenantState(context);
  const folderScope=scope=>require('node:crypto').createHash('sha256').update(JSON.stringify([scope,require('../../lib/active-workspace').identity(require('../../lib/active-workspace').createActiveWorkspace({vscode,state:context.workspaceState}).current())])).digest('hex');
  const scopedLocal={...accountLocal,history:scope=>accountLocal.history(folderScope(scope)),saveHistory:(scope,value)=>accountLocal.saveHistory(folderScope(scope),value)};
  return { vscode, context, posts, docs, shown, warnings, infos, requests, commands, executed, errors, feedback, panels, external, copied, base, local: scopedLocal, rawLocal:accountLocal, folderScope, scope: tenant => scopeKey(base, tenant), receive: (message) => receive({...message,...(message.scopeKey === scopeKey(base,'tenant-a') || message.scopeKey === scopeKey(base,'tenant-b') ? {scopeKey:folderScope(message.scopeKey)} : {})}), workspaceChanged: () => { if (!workspaceChangeListener) return false; workspaceChangeListener({}); return true; }, configurationChanged: (changedKey='tvijo.apiBase') => { for (const listener of configurationChangeListeners) listener({ affectsConfiguration: key => key === changedKey || changedKey.startsWith(key+'.') }); return configurationChangeListeners.length; },
    root, storage, botAdapter: () => botAdapter, settings, status, Uri, Position, Range,
    grantError: value => { grantError = value; }, lookup: value => { lookup = value; }, warning: value => { warningAnswer = value; }, chat: value => { chatContent = value; }, editor: value => { activeEditor = value; }, applied: () => appliedEdit, taskSnapshot: value => { taskSnapshot = value; },
    fireDiagnostics,
    blockResponse: (requestPath, method = 'GET') => { blockedRequest = { path: requestPath, method }; }, responseWaiting: () => !!releaseRequest,
    releaseResponse: () => { blockedRequest = null; releaseRequest?.(); },
    block: () => { blockGrant = true; }, unblock: () => release?.(),
    disposeView: () => disposal(),
    close: () => { disposal(); globalThis.fetch = originalFetch; } };
}


module.exports={host,memory};
