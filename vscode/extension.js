'use strict';
const vscode = require('vscode');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const core = require('./lib/client');

const AUTH_KEY = 'tvijo.auth';
const PENDING_KEY = 'tvijo.pending';
const CONVERSATION_KEY = 'tvijo.conversation';

function activate(context) {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  status.command = 'tvijo.account';
  context.subscriptions.push(status);

  const client = () => core.createClient({ base: vscode.workspace.getConfiguration('tvijo').get('apiBase') });

  async function readAuth() {
    const raw = await context.secrets.get(AUTH_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  // A token is only valid for the service URL it was issued by; switching apiBase forces a new sign-in.
  async function requireAuth() {
    const auth = await readAuth();
    if (!auth?.access_token) throw new core.ServiceError('unauthorized', 'Sign in first: run "Tvijo: Sign in".');
    if (auth.api_base !== client().base) throw new core.ServiceError('unauthorized', 'The saved sign-in belongs to a different service URL. Sign in again.');
    if (auth.expires_at && Date.now() >= Date.parse(auth.expires_at)) throw new core.ServiceError('unauthorized', 'The sign-in has expired. Sign in again.');
    return auth;
  }

  async function refreshStatus() {
    const auth = await readAuth();
    const live = auth && auth.api_base === client().base && !(auth.expires_at && Date.now() >= Date.parse(auth.expires_at));
    status.text = live ? '$(sparkle) Tvijo' : '$(account) Tvijo: sign in';
    status.tooltip = live ? 'Tvijo DSHREM: signed in. Click for account and credit.' : 'Tvijo DSHREM: not signed in';
    status.command = live ? 'tvijo.account' : 'tvijo.signIn';
    status.show();
  }

  function report(error) {
    const message = error instanceof core.ServiceError ? error.message : 'Unexpected error in the Tvijo extension.';
    const actions = error?.code === 'unauthorized' ? ['Sign in'] : [];
    vscode.window.showErrorMessage(`Tvijo: ${message}`, ...actions).then((pick) => { if (pick === 'Sign in') vscode.commands.executeCommand('tvijo.signIn'); });
  }

  function command(id, fn) {
    context.subscriptions.push(vscode.commands.registerCommand(id, async (...args) => {
      try { await fn(...args); } catch (error) { report(error); } finally { await refreshStatus(); }
    }));
  }

  command('tvijo.signIn', async () => {
    const api = client();
    const device = await api.startDeviceLogin();
    const target = vscode.Uri.parse(device.verification_uri);
    await vscode.env.clipboard.writeText(device.user_code);
    const pick = await vscode.window.showInformationMessage(
      `Tvijo sign-in code: ${device.user_code} (copied). Approve it in the browser while signed in to your account.`,
      'Open browser');
    if (pick === 'Open browser') await vscode.env.openExternal(target);
    const auth = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Waiting for approval of code ${device.user_code}…`, cancellable: true },
      (_progress, token) => {
        const abort = new AbortController();
        token.onCancellationRequested(() => abort.abort());
        return api.pollDeviceLogin(device, { signal: abort.signal });
      });
    await context.secrets.store(AUTH_KEY, JSON.stringify(auth));
    vscode.window.showInformationMessage('Tvijo: signed in. The token is kept in VS Code secret storage.');
  });

  command('tvijo.signOut', async () => {
    const auth = await readAuth();
    if (auth?.access_token && auth.api_base === client().base) {
      try { await client().logout(auth.access_token); } catch { /* Local sign-out still proceeds. */ }
    }
    await context.secrets.delete(AUTH_KEY);
    vscode.window.showInformationMessage('Tvijo: signed out on this machine.');
  });

  command('tvijo.account', async () => {
    const auth = await requireAuth();
    const account = await client().account(auth.access_token);
    const doc = await vscode.workspace.openTextDocument({ language: 'json', content: JSON.stringify(account, null, 2) });
    await vscode.window.showTextDocument(doc, { preview: true });
  });

  command('tvijo.newConversation', async () => {
    await context.workspaceState.update(CONVERSATION_KEY, []);
    vscode.window.showInformationMessage('Tvijo: new conversation started.');
  });

  command('tvijo.cancelPending', async () => {
    const pending = context.globalState.get(PENDING_KEY);
    if (!pending?.taskId) { await context.globalState.update(PENDING_KEY, undefined); vscode.window.showInformationMessage('Tvijo: nothing pending.'); return; }
    const auth = await requireAuth();
    await client().cancel(auth.access_token, pending.taskId);
    const state = await client().taskState(auth.access_token, pending.taskId);
    if (!core.pendingBlocks(state)) await context.globalState.update(PENDING_KEY, undefined);
    vscode.window.showInformationMessage(`Tvijo: task ${pending.taskId} is ${state.status || 'unknown'}, held ${state.held ?? 'unknown'} USD.`);
  });

  // Never start a second paid task while an earlier one may still hold money.
  async function clearPending(auth) {
    const pending = context.globalState.get(PENDING_KEY);
    if (!pending) return;
    // A grant that never returned an id was not used; untouched grants expire and release credit server-side.
    if (!pending.taskId) { await context.globalState.update(PENDING_KEY, undefined); return; }
    const state = await client().taskState(auth.access_token, pending.taskId);
    if (core.pendingBlocks(state)) {
      throw new core.ServiceError('pending_task', `Task ${pending.taskId} is ${state.status || 'unresolved'} with held ${state.held ?? 'unknown'} USD. Run "Tvijo: Cancel pending task" or wait; no new paid task was created.`);
    }
    await context.globalState.update(PENDING_KEY, undefined);
  }

  command('tvijo.ask', async () => {
    const auth = await requireAuth();
    const editor = vscode.window.activeTextEditor;
    let selection = null;
    if (editor && !editor.selection.isEmpty) {
      const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      selection = {
        path: folder ? path.relative(folder.uri.fsPath, editor.document.uri.fsPath).split(path.sep).join('/') : path.basename(editor.document.uri.fsPath),
        startLine: editor.selection.start.line + 1,
        endLine: editor.selection.end.line + 1,
        language: editor.document.languageId,
        text: editor.document.getText(editor.selection)
      };
    }
    const question = await vscode.window.showInputBox({
      title: 'Ask Tvijo DSHREM',
      prompt: selection ? `About ${selection.path}:${selection.startLine}-${selection.endLine}. One paid task, capped at 1 USD.` : 'One paid task, capped at 1 USD.',
      ignoreFocusOut: true
    });
    if (!question?.trim()) return;
    await clearPending(auth);
    const history = context.workspaceState.get(CONVERSATION_KEY) || [];
    const messages = [...history, { role: 'user', content: core.questionWithSelection(question.trim(), selection) }];
    const idempotencyKey = randomUUID();
    await context.globalState.update(PENDING_KEY, { idempotencyKey, createdAt: new Date().toISOString() });
    const answer = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Tvijo is answering…', cancellable: true },
      (_progress, token) => {
        const abort = new AbortController();
        let taskId = null;
        token.onCancellationRequested(() => {
          abort.abort();
          if (taskId) client().cancel(auth.access_token, taskId).catch(() => { /* Best effort; no retry. */ });
        });
        return client().ask({
          token: auth.access_token, messages, idempotencyKey, signal: abort.signal,
          title: `VS Code: ${question.trim().slice(0, 80)}`,
          onGrant: async (grant) => { taskId = grant.id; await context.globalState.update(PENDING_KEY, { idempotencyKey, taskId: grant.id, createdAt: new Date().toISOString() }); }
        });
      });
    await context.globalState.update(PENDING_KEY, undefined);
    await context.workspaceState.update(CONVERSATION_KEY, [...messages, { role: 'assistant', content: answer.content }].slice(-40));
    const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: core.formatAnswer({ question: question.trim(), answer }) });
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });
  });

  command('tvijo.addFileToKnowledge', async (uri) => {
    const auth = await requireAuth();
    const target = uri instanceof vscode.Uri ? uri : vscode.window.activeTextEditor?.document.uri;
    if (!target || target.scheme !== 'file') throw new core.ServiceError('no_file', 'Open or select a saved file inside the workspace.');
    const folder = vscode.workspace.getWorkspaceFolder(target);
    if (!folder) throw new core.ServiceError('outside_workspace', 'Only files inside an open workspace folder can be added.');
    const stat = await vscode.workspace.fs.stat(target);
    if (stat.type & vscode.FileType.SymbolicLink) throw new core.ServiceError('symlink', 'Symlinks are not accepted.');
    const label = path.relative(folder.uri.fsPath, target.fsPath).split(path.sep).join('/');
    const bytes = await vscode.workspace.fs.readFile(target);
    const refusal = core.checkKnowledgeFile(label, bytes);
    if (refusal) throw new core.ServiceError('refused', refusal);
    const confirm = await vscode.window.showWarningMessage(`Upload ${label} to your private Tvijo knowledge base?`, { modal: true }, 'Upload');
    if (confirm !== 'Upload') return;
    await client().kbAdd(auth.access_token, label, Buffer.from(bytes).toString('utf8'));
    vscode.window.showInformationMessage(`Tvijo: ${label} added to your knowledge base.`);
  });

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('tvijo.apiBase')) refreshStatus(); }));
  refreshStatus();
}

function deactivate() {}

module.exports = { activate, deactivate };
