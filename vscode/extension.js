'use strict';
const vscode = require('vscode');
const { randomUUID, createHash } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const core = require('./lib/client');
const { chatHtml } = require('./lib/chat-view');
const { settingsHtml, GUIDE_ACTIONS } = require('./lib/settings-guide');
const files = require('./lib/attachments');
const { ACTIONS, slashAction, fileReference } = require('./lib/actions');
const { createBot } = require('./lib/telegram-bot');
const { scopeKey, tenantState } = require('./lib/tenant-state');

const { PROJECT_AUTH_KEY, AUTH_MODE, workspaceState, workspaceClient, sharedTaskCap, sharedTaskMicroCap } = require('./workspace');
const coding = require('./lib/coding');
const customerConnection = require('./lib/byok');
const workspaceContext = require('./lib/workspace-context');
const quickEdit = require('./lib/quick-edit');
const { runAgent } = require('./lib/agent');
const { createTools, safePath, autoCommand } = require('./lib/local-tools');
const { createMetrics } = require('./lib/metrics');
const AUTH_KEY = 'tvijo.auth';
const CONTEXT_CONSENT = 'tvijo.contextConsent';

function activate(context) {
  let chatView = null;
  let pendingDraft = null;
  let busy = false;
  let attaching = false;
  let attachments = [];
  let activeAbort = null;
  let codingReview = null;
  const byokSelection = customerConnection.createSelection();
  let workspaceEpoch = 0;
  let lastContextSummary = null;
  let lastActivity = '';
  let lastError = null;
  let lastAgentOutcome = null;
  let settingsPanel = null;
  let agentAbort = null;
  let agentRunning = false;
  const customCommands = new Map();
  if (vscode.workspace.onDidChangeWorkspaceFolders) context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => { workspaceEpoch++; codingReview = null; }));
  const handlers = new Map();
  let customerBot = null;
  let accountSnapshot = null;
  let identity = null;
  let authAttempt = 0;
  let authCommits = Promise.resolve();
  const local = tenantState(context);
  const shared = workspaceState(context);
  const metrics = createMetrics({ context, version: context.extension?.packageJSON?.version || 'unknown' });
  // The webview owns the language toggle; the host needs the same choice for
  // command-palette prompts and notifications, which cannot read webview state.
  const UI_LOCALE = 'tvijo.uiLocale';
  const uiLocale = () => context.globalState.get(UI_LOCALE) === 'ru' ? 'ru' : 'en';
  const L = (en, ru) => uiLocale() === 'ru' ? ru : en;
  const selectShared = async (...args) => { attachments = []; return shared.select(...args); };
  const historyFor = scope => shared.selection(scope) ? shared.history(scope) : local.history(scope);
  const currentViewScope = scope => shared.guard(scope);
  const sharedCommands = [['tvijo.signInProject', 'Sign in with project key'], ['tvijo.chooseProject', 'Choose shared project'], ['tvijo.chooseThread', 'Open shared server thread'], ['tvijo.refreshThread', 'Refresh shared server thread']];
  const tenantAttachments = new Map();
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  status.command = 'tvijo.account';
  context.subscriptions.push(status);

  const client = () => core.createClient({ base: vscode.workspace.getConfiguration('tvijo').get('apiBase') });

  // Route names are proper nouns from the service catalogue; only generic
  // labels are translated. The static list keeps the menu usable offline and
  // avoids a background request before the user asks anything. The server is
  // still authoritative: it refuses a route that is not activated.
  const STATIC_MODELS = [
    { id: 'coding', name: 'DSHREM Coding' },
    { id: 'ds41f', name: 'DeepSeek V4.1 Flash' },
    { id: 'glm53f', name: 'GLM 5.3 Flash' },
    { id: 'devstral', name: 'Devstral' },
    { id: 'haiku55', name: 'Claude Haiku 5.5' },
    { id: 'gpt61sol', name: 'Codex GPT-6.1 Sol' }
  ];
  let catalogue = { at: 0, base: '', data: [] };
  async function refreshCatalogue(auth) {
    const base = auth.api_base;
    if (Date.now() - catalogue.at < 10 * 60 * 1000 && catalogue.base === base && catalogue.data.length) return;
    try {
      const value = await core.createClient({ base }).request('/models', { token: auth.access_token });
      const data = Array.isArray(value?.data) ? value.data.filter(item => item && item.enabled && typeof item.id === 'string') : [];
      if (data.length) catalogue = { at: Date.now(), base, data };
    } catch { /* Keep the static or previous verified list. */ }
  }
  function chatOptions(auth) {
    const configuration = vscode.workspace.getConfiguration('tvijo');
    const current = configuration.get('model', 'coding');
    const verified = catalogue.base === auth.api_base && catalogue.data.length ? catalogue.data : STATIC_MODELS;
    const allowed = new Set(['auto', 'coding', ...verified.map(item => item.id)]);
    return {
      models: [{ id: 'auto', name: 'Automatic' }, ...verified.map(item => ({ id: item.id, name: item.name || item.id }))],
      model: allowed.has(current) ? current : 'coding',
      agentMode: configuration.get('agentMode', 'single'),
      agentModel: configuration.get('agentModel', 'ds41f'),
      reasoningMethod: configuration.get('reasoningMethod', 'evidence-first'),
      contextMode: configuration.get('workspaceContext', 'ask'),
      autoApply: !!configuration.get('autoApply', false)
    };
  }

  function assertAuthAttempt(attempt, base) {
    if (attempt !== authAttempt || base !== client().base) throw new core.ServiceError('account_changed', 'A newer sign-in, sign-out or service change replaced this sign-in attempt.');
  }
  function commitAuthentication(attempt, base, change) {
    // Serialize SecretStorage/memento writes: a superseded write already in
    // progress must finish before the newer login or sign-out commits.
    const result = authCommits.catch(() => {}).then(async () => {
      const check = () => assertAuthAttempt(attempt, base);
      check(); await change(check); check();
    });
    authCommits = result;
    return result;
  }
  async function writeAuthSecret(check, key, value) {
    const previous = await context.secrets.get(key); check();
    if (value === undefined) await context.secrets.delete(key); else await context.secrets.store(key, value);
    try { check(); }
    catch (error) {
      // Undo only these exact bytes while the serialized commit owns this slot.
      if (await context.secrets.get(key) === value) {
        if (previous === undefined) await context.secrets.delete(key); else await context.secrets.store(key, previous);
      }
      throw error;
    }
  }
  async function writeAuthMode(check, value) {
    const previous = context.globalState.get(AUTH_MODE); check();
    await context.globalState.update(AUTH_MODE, value);
    try { check(); }
    catch (error) { if (context.globalState.get(AUTH_MODE) === value) await context.globalState.update(AUTH_MODE, previous); throw error; }
  }

  async function readAuth() {
    const raw = await context.secrets.get(context.globalState.get(AUTH_MODE) === 'project' ? PROJECT_AUTH_KEY : AUTH_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  // A token is only valid for the service URL it was issued by; switching apiBase forces a new sign-in.
  async function requireAuth() {
    const attempt = authAttempt;
    const auth = await readAuth();
    if (!auth?.access_token) throw new core.ServiceError('unauthorized', 'Sign in first: run "Tvijo: Sign in".');
    if (auth.api_base !== client().base) throw new core.ServiceError('unauthorized', 'The saved sign-in belongs to a different service URL. Sign in again.');
    if (auth.expires_at && Date.now() >= Date.parse(auth.expires_at)) throw new core.ServiceError('unauthorized', 'The sign-in has expired. Sign in again.');
    assertAuthAttempt(attempt, auth.api_base);
    if (identity?.token === auth.access_token && identity.base === auth.api_base) return { ...auth, scope: identity.scope, tenant_id: identity.tenant, key_limits: auth.kind === 'project' ? accountSnapshot?.key_limits : null, authEpoch: attempt, viewScope: currentViewScope(identity.scope) };
    switchIdentity(null);
    const account = auth.kind === 'project' ? await workspaceClient(client(), auth.access_token).projects() : await client().account(auth.access_token);
    const current = await readAuth();
    if (attempt !== authAttempt || current?.access_token !== auth.access_token || current.api_base !== auth.api_base || client().base !== auth.api_base) throw new core.ServiceError('account_changed', 'The account changed. Try again in the current account.');
    if (typeof account?.tenant_id !== 'string' || !account.tenant_id) throw new core.ServiceError('account_unknown', 'The service account could not be verified. Local history remains private.');
    switchIdentity({ token: auth.access_token, base: auth.api_base, tenant: account.tenant_id, scope: scopeKey(auth.api_base, account.tenant_id) });
    accountSnapshot = account;
    if (auth.kind === 'project') {
      const project = account.projects?.find(item => item.id === account.project_id);
      if (!project) throw new core.ServiceError('account_unknown', 'The project key has no accessible project.');
      if (shared.selection(identity.scope)?.projectId !== project.id) await selectShared(identity.scope, project);
    }
    return { ...auth, scope: identity.scope, tenant_id: identity.tenant, key_limits: auth.kind === 'project' ? accountSnapshot?.key_limits : null, authEpoch: attempt, viewScope: currentViewScope(identity.scope) };
  }

  function switchIdentity(next) {
    if (identity?.scope !== next?.scope || identity?.token !== next?.token) {
      if (identity) tenantAttachments.set(currentViewScope(identity.scope), attachments);
      attachments = next ? (tenantAttachments.get(currentViewScope(next.scope)) || []) : [];
      customerBot?.stop(); customerBot = null;
      byokSelection.clear();
      lastError = null; lastContextSummary = null; lastActivity = '';
    }
    identity = next;
    if (!next) accountSnapshot = null;
  }

  async function isCurrentAuth(auth) {
    const current = await readAuth();
    return current?.access_token === auth.access_token && current.api_base === auth.api_base && client().base === auth.api_base && identity?.scope === auth.scope && identity.token === auth.access_token && (auth.authEpoch === undefined || auth.authEpoch === authAttempt) && (!auth.viewScope || currentViewScope(auth.scope) === auth.viewScope);
  }

  async function refreshStatus() {
    const attempt = authAttempt;
    let auth;
    try { auth = await requireAuth(); } catch { if (attempt !== authAttempt) return; switchIdentity(null); }
    if (attempt !== authAttempt) return;
    const live = !!auth;
    status.text = live ? '$(sparkle) Tvijo' : '$(account) Tvijo: sign in';
    status.tooltip = live ? 'Tvijo DSHREM: signed in. Click for account and credit.' : 'Tvijo DSHREM: not signed in';
    status.command = live ? 'tvijo.account' : 'tvijo.signIn';
    status.show();
    if (live && auth.kind !== 'project') {
      try {
        const account = await client().account(auth.access_token);
        const current = await readAuth();
        if (current?.access_token === auth.access_token && current.api_base === client().base && account.tenant_id === auth.tenant_id) accountSnapshot = account;
      } catch { /* Verified identity remains bound to this token; retain the last known snapshot. */ }
    }
    if (live && !busy && !attaching && shared.selection(auth.scope)?.threadId) {
      try { await loadSharedThread(auth, shared.selection(auth.scope)); }
      catch { /* Keep the last verified thread snapshot; Refresh shared server thread exposes errors. */ }
    }
    if (chatView) await postChatState();
  }

  async function postChatState(message = '', error = null) {
    if (!chatView) return;
    const auth = await readAuth();
    const signedIn = !!(auth?.access_token && auth.api_base === client().base && !(auth.expires_at && Date.now() >= Date.parse(auth.expires_at)) && identity?.token === auth.access_token && identity.base === auth.api_base);
    const scope = signedIn ? identity.scope : null;
    const history = scope ? historyFor(scope) : [];
    const nextAgentScope = scope ? currentViewScope(scope) : null;
    if (postChatState.agentScope !== nextAgentScope) {
      await chatView.webview.postMessage({ type: 'agent', scopeKey: postChatState.agentScope, event: { type: 'reset' } });
      postChatState.agentScope = nextAgentScope;
    }
    const pending = scope ? local.pending(scope) : null;
    const legacy = scope ? local.legacyPending(scope) : null;
    const recovery = !!(pending || (legacy && (!legacy.apiBase || legacy.apiBase === client().base)));
    const messages = history.map((item) => ({ role: item.role, content: item.display || item.content }));
    let options = null;
    if (signedIn) { try { options = chatOptions(auth); } catch { options = null; } }
    await chatView.webview.postMessage({ type: 'state', scopeKey: scope ? currentViewScope(scope) : null, messages, signedIn, busy, attaching, pending: recovery, legacyHistory: !!local.legacyHistory().length, account: signedIn ? accountSnapshot : null, locale: uiLocale(), options, error: error && error.text ? error : lastError, context: { mode: vscode.workspace.getConfiguration('tvijo').get('workspaceContext', 'ask'), last: lastContextSummary }, activity: lastActivity,
      workflow: scope && shared.selection(scope) ? (byokSelection.get({...auth,scope,authEpoch:authAttempt},shared.selection(scope).projectId) ? 'BYOK · ' : 'Managed · ') + 'Tvijo ' + vscode.workspace.getConfiguration('tvijo').get('service', 'standard') : vscode.workspace.getConfiguration('tvijo').get('model', 'coding') + ' · ' + vscode.workspace.getConfiguration('tvijo').get('agentMode', 'single'),
      attachments: signedIn ? attachments.map(files.attachmentSummary) : [], botRunning: !!customerBot?.running,
      status: message || (lastAgentOutcome?.scope === nextAgentScope && !busy && !attaching ? lastAgentOutcome.text : '') || (attaching ? L('Preparing attachment…', 'Подготовка вложения…') : busy ? L('Answering…', 'Отвечаю…') : pending ? L('Pending check', 'Требуется проверка') : recovery ? L('Legacy request check', 'Проверка старой заявки') : signedIn ? (shared.selection(scope) ? shared.selection(scope).projectName + ' · ' + (shared.selection(scope).threadTitle || L('Choose or create a shared thread', 'Выберите или создайте общую ветку')) : L('Ready', 'Готово')) : L('Sign in to verify your account', 'Войдите, чтобы проверить аккаунт')) });
  }

  async function postActivity(stage, detail = '') {
    lastActivity = stage;
    if (!chatView) return;
    const scope = identity ? currentViewScope(identity.scope) : null;
    await chatView.webview.postMessage({ type: 'activity', scopeKey: scope, stage, detail });
  }

  async function postAgentEvent(auth, event) {
    if (!chatView) return;
    await chatView.webview.postMessage({ type: 'agent', scopeKey: auth?.viewScope || null, event });
  }

  async function showProposedWrite(relative, previous, content) {
    const before = await vscode.workspace.openTextDocument({ content: previous ?? '', language: 'plaintext' });
    const after = await vscode.workspace.openTextDocument({ content, language: 'plaintext' });
    await vscode.commands.executeCommand('vscode.diff', before.uri, after.uri, 'Tvijo agent: ' + relative);
  }

  async function confirmAgentRun({ command, cwd }) {
    if (typeof vscode.window.showWarningMessage !== 'function') return false;
    const run = L('Run command', 'Выполнить команду');
    const answer = await vscode.window.showWarningMessage(
      L('Tvijo agent wants to run a command', 'Tvijo агент хочет выполнить команду') + ':\n' + command + '\n\n' + cwd,
      { modal: true, detail: L('The command runs with your local permissions; output is captured and truncated.', 'Команда выполняется с вашими локальными правами; вывод захватывается и обрезается.') },
      run);
    return answer === run;
  }

  async function confirmAgentWrite({ path: relative, previous, content }) {
    await showProposedWrite(relative, previous, content);
    if (typeof vscode.window.showWarningMessage !== 'function') return false;
    const write = L('Write file', 'Записать файл');
    const answer = await vscode.window.showWarningMessage(
      L('Tvijo agent wants to write', 'Tvijo агент хочет записать') + ' ' + relative,
      { modal: true, detail: L('Review the diff. The editor buffer is not saved automatically.', 'Просмотрите diff. Буфер редактора не сохраняется автоматически.') },
      write);
    return answer === write;
  }

  function safeAutoCommand(command) {
    return !!autoCommand(command);
  }

  async function runAgentFlow(goal, { planMode = false } = {}) {
    ensureIdle();
    if (!goal?.trim()) return;
    const auth = await requireAuth();
    const editor = vscode.window.activeTextEditor;
    const folder = (editor && vscode.workspace.getWorkspaceFolder(editor.document.uri)) || (vscode.workspace.workspaceFolders || [])[0];
    if (!folder) throw new core.ServiceError('no_workspace', L('Open a project folder before starting the agent.', 'Откройте папку проекта, прежде чем запускать агента.'));
    const guard = codingGuard(auth, path.resolve(folder.uri.fsPath), workspaceEpoch);
    const api = core.createClient({ base: auth.api_base });
    const config = vscode.workspace.getConfiguration('tvijo');
    const maxSteps = config.get('agentMaxSteps', 12);
    const budgetUsd = config.get('agentBudgetUsd', 2);
    const autoRun = !!config.get('agentAutoRun', false);
    const autoApply = !!config.get('agentAutoApply', false);
    const startedAt = Date.now();
    const abort = new AbortController();
    agentAbort = abort; agentRunning = true; busy = true; lastError = null; lastAgentOutcome = null;
    await postChatState();
    try {
      const contextMode = config.get('workspaceContext', 'ask');
      let tree = '';
      if (contextMode !== 'off') {
        let enabled = contextMode === 'on';
        if (contextMode === 'ask') {
          const saved = context.globalState.get(CONTEXT_CONSENT);
          if (saved === 'on' || saved === 'off') enabled = saved === 'on';
          else if (typeof vscode.window.showWarningMessage === 'function') {
            const send = L('Send context', 'Отправить контекст');
            const skip = L('No context', 'Без контекста');
            const pick = await vscode.window.showWarningMessage(
              L('The agent starts from a bounded project tree, README and manifests. Send them with the agent steps? Secrets and binaries are excluded locally, and you can preview the exact block first.', 'Агент начинает с ограниченного дерева проекта, README и манифестов. Отправлять их вместе с шагами агента? Секреты и бинарные файлы исключаются локально, точный блок можно сначала посмотреть.'),
              { modal: true }, send, skip);
            enabled = pick === send;
            await context.globalState.update(CONTEXT_CONSENT, enabled ? 'on' : 'off');
          }
        }
        if (enabled) {
          const collected = await workspaceContext.collect(vscode, { document: editor?.document || null, maxBytes: 16000 });
          tree = collected.text;
          lastContextSummary = collected.summary;
        }
      } else lastContextSummary = null;
      await postAgentEvent(auth, { type: 'start', goal: goal.trim(), planMode, maxSteps, budgetUsd });
      await guard();
      let agentSpent = 0;
      let firstAgentAnswer = null;
      const exchanges = [];
      const writeVersions = new Map();
      const tools = createTools({
        root: folder.uri.fsPath, guard,
        confirmRun: async info => {
          if (planMode) return false;
          await guard();
          const approved = autoRun && safeAutoCommand(info.command) ? true : await confirmAgentRun(info);
          await guard(); return approved;
        },
        confirmWrite: async info => {
          if (planMode) return false;
          await guard();
          if (info.previous !== null) {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(info.absolute));
            if (doc.getText() !== info.previous) throw new core.ServiceError('file_changed', 'Editor content changed.');
            writeVersions.set(info.absolute, doc.version);
          }
          const approved = autoApply ? (await showProposedWrite(info.path, info.previous, info.content), true) : await confirmAgentWrite(info);
          await guard(); return approved;
        },
        applyWrite: async ({ absolute, previous, content }) => {
          await guard();
          const uri = vscode.Uri.file(absolute);
          if (previous === null) {
            const edit = new vscode.WorkspaceEdit();
            edit.createFile(uri, { overwrite: false, ignoreIfExists: false });
            edit.insert(uri, new vscode.Position(0, 0), content);
            await guard();
            if (!await vscode.workspace.applyEdit(edit)) throw new core.ServiceError('file_changed', 'The new file could not be created.');
            return;
          }
          const document = await vscode.workspace.openTextDocument(uri);
          if (document.getText() !== previous) throw new core.ServiceError('file_changed', 'Editor content changed.');
          const version = writeVersions.get(absolute);
          await guard();
          if (document.version !== version || document.getText() !== previous) throw new core.ServiceError('file_changed', 'Editor content changed.');
          await quickEdit.apply(vscode, document, content);
        }
      });
      const result = await runAgent({
        goal, tree, planMode, maxSteps, budgetUsd, signal: abort.signal, tools,
        ask: async ({ messages, step, signal, finalization = false }) => {
          await guard();
          const remaining = Number(budgetUsd) - agentSpent;
          if (!Number.isFinite(remaining) || remaining <= 0) throw Object.assign(new Error('Agent budget exhausted'), { code: 'agent_budget', spent: agentSpent, budget: budgetUsd });
          const bounded = finalization ? [...messages] : [messages[0], { role: 'user', content: goal.trim() }];
          if (!finalization && firstAgentAnswer) bounded.push(firstAgentAnswer);
          if (!finalization && step > 1) exchanges.push(...messages.slice(-2));
          while (exchanges.length > 8) exchanges.splice(0, 2);
          if (!finalization) bounded.push(...exchanges);
          const idempotencyKey = randomUUID();
          await local.savePending(auth.scope, { idempotencyKey, apiBase: auth.api_base, tenantId: auth.tenant_id, createdAt: new Date().toISOString() });
          const answer = await api.ask({
            token: auth.access_token, messages: bounded, maxUsd: Math.min(1, Math.floor(remaining * 1e9) / 1e9), idempotencyKey,
            title: 'VS Code agent step ' + step + ': ' + goal.trim().slice(0, 50),
            maxTokens: 2048, model: config.get('agentModel', 'ds41f'), mode: 'single', method: config.get('reasoningMethod', 'evidence-first'), signal,
            onGrant: async grant => { await local.savePending(auth.scope, { idempotencyKey, taskId: grant.id, apiBase: auth.api_base, tenantId: auth.tenant_id }); await guard(); await postActivity('model', L('Agent step ' + step + ' · model is working…', 'Шаг агента ' + step + ' · модель работает…')); }
          }).catch(async error => {
            const pending = local.pending(auth.scope, idempotencyKey);
            if (error.definitiveGrantRefusal && !pending?.taskId) await local.savePending(auth.scope, undefined, idempotencyKey);
            throw error;
          });
          try { if (!core.pendingBlocks(await api.taskState(auth.access_token, answer.taskId))) await local.savePending(auth.scope, undefined, idempotencyKey); } catch { /* Keep the journal until settlement is known. */ }
          await guard();
          const cost = Number(answer?.cost?.spent_usd ?? answer?.cost?.budget?.spent_usd ?? answer?.cost?.spent);
          if (!Number.isFinite(cost) || cost < 0) throw Object.assign(new Error('Unknown agent cost'), { code: 'usage_unknown' });
          agentSpent += cost;
          if (agentSpent >= Number(budgetUsd)) throw Object.assign(new Error('Agent budget exhausted'), { code: 'agent_budget', spent: agentSpent, budget: budgetUsd });
          if (!firstAgentAnswer) firstAgentAnswer = { role: 'assistant', content: answer.content };
          return answer;
        },
        onEvent: event => postAgentEvent(auth, event)
      });
      const history = historyFor(auth.scope);
      await local.saveHistory(auth.scope, [...history, { role: 'user', content: goal.trim(), display: goal.trim() }, { role: 'assistant', content: result.text, display: result.text }].slice(-40));
      await metrics.record({ event: 'agent', outcome: result.reason === 'step_limit' ? 'partial' : 'completed', mode: planMode ? 'plan' : 'agent', model: config.get('agentModel', 'ds41f'), steps: result.steps, cost_usd: result.spent, duration_ms: Date.now() - startedAt });
      lastAgentOutcome = { scope: currentViewScope(auth.scope), text: result.partial
        ? L('Step limit reached (' + result.steps + '). Partial result: review the log and narrow the next task.', 'Лимит шагов достигнут (' + result.steps + '). Частичный результат: проверьте журнал и уточните следующую задачу.')
        : L('Agent finished in ' + result.steps + ' steps.', 'Агент завершил за ' + result.steps + ' шагов.') };
      await postChatState(lastAgentOutcome.text);
    } catch (error) {
      if (abort.signal.aborted) {
        lastError = null;
        await postChatState(L('Agent stopped.', 'Агент остановлен.'));
        return;
      }
      await metrics.record({ event: 'agent', outcome: 'error', mode: planMode ? 'plan' : 'agent', model: vscode.workspace.getConfiguration('tvijo').get('agentModel', 'ds41f'), error_code: error?.code || 'unknown', duration_ms: Date.now() - startedAt });
      lastError = { text: localizedMessage(error), action: typeof error?.code === 'string' && error.code.startsWith('context_budget') ? 'context' : null };
      throw error;
    } finally {
      agentAbort = null; agentRunning = false; busy = false;
      await postActivity('done', '');
      await postChatState();
    }
  }

  async function runUserShell(command) {
    ensureIdle();
    const folder = (vscode.window.activeTextEditor && vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)) || (vscode.workspace.workspaceFolders || [])[0];
    if (!folder) throw new core.ServiceError('no_workspace', L('Open a project folder first.', 'Сначала откройте папку проекта.'));
    if (typeof vscode.window.showWarningMessage !== 'function') return;
    const run = L('Run command', 'Выполнить команду');
    const answer = await vscode.window.showWarningMessage(
      L('Run this command in ', 'Выполнить эту команду в ') + folder.uri.fsPath + '?\n' + command,
      { modal: true, detail: L('This is your own shell command; no model task is created.', 'Это ваша собственная shell-команда; платная задача модели не создаётся.') }, run);
    if (answer !== run) return;
    const tools = createTools({ root: folder.uri.fsPath, confirmRun: async () => true, confirmWrite: async () => false });
    const startedAt = Date.now();
    busy = true;
    try {
      await postActivity('model', L('Running your command…', 'Выполняю вашу команду…'));
      const result = await tools.execute({ tool: 'run_command', command });
      await metrics.record({ event: 'shell', outcome: result.ok ? 'completed' : 'error', exit_code: result.exitCode, duration_ms: Date.now() - startedAt });
      const text = '# Shell command\n\n$ ' + command + '\n\n' + (result.stdout || '') + (result.stderr ? '\n[stderr]\n' + result.stderr : '') + '\n[exit ' + result.exitCode + (result.timedOut ? ', timeout' : '') + ']';
      const auth = await requireAuth();
      await showPrivateDocument('markdown', text, auth);
      await postChatState(L('Command finished with exit ' + result.exitCode + '.', 'Команда завершилась с кодом ' + result.exitCode + '.'));
    } catch (error) {
      await metrics.record({ event: 'shell', outcome: 'error', error_code: error?.code || 'unknown', duration_ms: Date.now() - startedAt });
      throw error;
    } finally { busy = false; await postActivity('done', ''); await postChatState(); }
  }

  function localizedMessage(error) {
    const code = error?.serverCode || (typeof error?.code === 'string' ? error.code : '');
    if (!(error instanceof core.ServiceError)) {
      if (code === 'agent_stopped') return L('Agent stopped. No further step was started.', 'Агент остановлен. Следующий шаг не запускался.');
      if (code === 'agent_budget') {
        const spent = Number(error.spent || 0).toFixed(6);
        const budget = error.budget === undefined ? '?' : error.budget;
        return L('Agent budget exhausted ($' + spent + ' of $' + budget + '). Raise tvijo.agentBudgetUsd or finish the goal in fewer steps.', 'Бюджет агента исчерпан ($' + spent + ' из $' + budget + '). Увеличьте tvijo.agentBudgetUsd или сократите задачу.');
      }
      return L('Action failed. Check the selected workspace file and try again.', 'Не удалось выполнить действие. Проверьте выбранный файл проекта и повторите.');
    }
    if (code.startsWith('context_budget')) {
      return L('The project context is too large for this model. Preview the context and turn it off, or start a new conversation.', 'Контекст проекта слишком велик для этой модели. Просмотрите контекст и отключите его либо начните новый диалог.');
    }
    if (uiLocale() === 'ru') {
      const map = {
        unauthorized: 'Сеанс входа недействителен. Выполните «Tvijo: Войти» и повторите.',
        free_preview_exhausted: 'Бесплатная проба завершена. Откройте условия кредита.',
        operator_allowance_exhausted: 'Дневной тестовый allowance оператора исчерпан. Лимит обновится в 00:00 UTC.',
        credits_or_daily_cap_exhausted: 'Исчерпан кредит или дневной лимит аккаунта. Проверьте расходы и лимиты.',
        insufficient_credit: 'Доступный кредит не покрывает резерв этой задачи.',
        project_required: 'Сначала выберите общий проект: Команды → Choose shared project. Затем откройте подключения.',
        account_changed: 'Аккаунт, проект или ветка изменились. Повторите действие в текущем аккаунте.',
        unreachable: 'Сервис недоступен. Проверьте соединение и повторите запрос; платная задача не создана.',
        timeout: 'Сервис не ответил вовремя. Повторите запрос; неизвестный расход не считается нулевым.'
      };
      if (map[code]) return map[code];
    }
    return error.message;
  }

  function report(error) {
    const message = localizedMessage(error);
    const signIn = L('Sign in', 'Войти');
    const usage = L('View usage', 'Открыть расходы');
    const credit = L('Credit', 'Кредит');
    const resolve = L('Resolve task', 'Проверить задачу');
    const preview = L('Preview context', 'Просмотреть контекст');
    const overflow = typeof error?.code === 'string' && error.code.startsWith('context_budget');
    const actions = (error?.serverCode || error?.code) === 'free_preview_exhausted' ? [credit] : error?.code === 'unauthorized' ? [signIn] : error?.code === 'insufficient_credit' ? [usage] : error?.code === 'pending_task' ? [resolve] : overflow ? [preview] : [];
    vscode.window.showErrorMessage(`Tvijo: ${message}`, ...actions).then((pick) => { if (pick === credit) vscode.env.openExternal(vscode.Uri.parse('https://dsh.tvijo.com/billing')); if (pick === signIn) vscode.commands.executeCommand('tvijo.signIn'); if (pick === usage) vscode.commands.executeCommand('tvijo.account'); if (pick === resolve) vscode.commands.executeCommand('tvijo.cancelPending'); if (pick === preview) vscode.commands.executeCommand('tvijo.contextPreview'); });
  }

  function command(id, fn) {
    handlers.set(id, fn);
    context.subscriptions.push(vscode.commands.registerCommand(id, async (...args) => {
      try { await fn(...args); } catch (error) { report(error); } finally { await refreshStatus(); }
    }));
  }

  function ensureIdle() {
    if (busy || attaching) throw new core.ServiceError('busy', 'Wait for the current question or attachment to finish.');
  }

  async function loadSharedThread(auth, selected) {
    const scope = currentViewScope(auth.scope);
    const thread = await workspaceClient(client(), auth.access_token).thread(selected.projectId, selected.threadId);
    if (!await isCurrentAuth(auth) || currentViewScope(auth.scope) !== scope) throw new core.ServiceError('account_changed', 'The account or thread changed. Open the intended thread again.');
    shared.remember(auth.scope, selected, thread.messages || []);
    return thread;
  }

  async function createSharedThread(auth) {
    const selected = shared.selection(auth.scope);
    if (!selected) throw new core.ServiceError('project_required', 'Choose a shared project first.');
    const scope = currentViewScope(auth.scope);
    const title = await vscode.window.showInputBox({ title: 'New shared thread', prompt: 'Stored on the Tvijo server and available in your browser.', value: 'New conversation' });
    if (!title?.trim()) throw new core.ServiceError('interrupted', 'Thread creation cancelled.');
    if (!await isCurrentAuth(auth) || currentViewScope(auth.scope) !== scope) throw new core.ServiceError('account_changed', 'The account or project changed.');
    const thread = await workspaceClient(client(), auth.access_token).createThread(selected.projectId, title.trim().slice(0, 120));
    if (!await isCurrentAuth(auth) || currentViewScope(auth.scope) !== scope) throw new core.ServiceError('account_changed', 'The thread was created in its original project. Reopen that project to see it.');
    await selectShared(auth.scope, { id: selected.projectId, name: selected.projectName }, thread);
    delete auth.viewScope;
    attachments = [];
    await loadSharedThread(auth, shared.selection(auth.scope));
    await postChatState();
  }

  command('tvijo.signInProject', async () => {
    ensureIdle();
    const attempt = ++authAttempt;
    const api = client();
    const token = await vscode.window.showInputBox({ title: 'Tvijo project API key', password: true, ignoreFocusOut: true, prompt: 'Use a Tvijo project service key. Provider BYOK keys belong to a separate connection flow.' });
    if (!token?.trim()) return;
    assertAuthAttempt(attempt, api.base);
    const data = await workspaceClient(api, token.trim()).projects();
    const project = data.projects?.find(item => item.id === data.project_id);
    if (typeof data.tenant_id !== 'string' || !data.tenant_id || !project) throw new core.ServiceError('account_unknown', 'The key did not identify an accessible project.');
    assertAuthAttempt(attempt, api.base);
    ensureIdle();
    sharedTaskCap({ kind: 'project', key_limits: data.key_limits });
    await commitAuthentication(attempt, api.base, async check => {
      await writeAuthSecret(check, PROJECT_AUTH_KEY, JSON.stringify({ access_token: token.trim(), api_base: api.base, kind: 'project', key_limits: data.key_limits }));
      await writeAuthMode(check, 'project');
      switchIdentity(null);
      const scope = scopeKey(api.base, data.tenant_id);
      switchIdentity({ token: token.trim(), base: api.base, tenant: data.tenant_id, scope });
      accountSnapshot = data;
      await selectShared(scope, project); check();
    });
    assertAuthAttempt(attempt, api.base);
    await postChatState();
  });
  command('tvijo.chooseProject', async () => {
    ensureIdle();
    const auth = await requireAuth();
    const data = await workspaceClient(client(), auth.access_token).projects();
    if (!await isCurrentAuth(auth)) return;
    const choices = (data.projects || []).map(project => ({ label: project.name, description: project.role || '', project }));
    if (auth.kind !== 'project') choices.push({ label: 'Local workspace conversation', description: 'Preserved history on this editor workspace', project: null });
    const pick = await vscode.window.showQuickPick(choices, { title: 'Tvijo shared project' });
    if (!pick || !await isCurrentAuth(auth)) return;
    ensureIdle();
    await selectShared(auth.scope, pick.project);
    attachments = [];
    await postChatState();
  });
  command('tvijo.chooseThread', async () => {
    ensureIdle();
    const auth = await requireAuth();
    auth.viewScope = currentViewScope(auth.scope);
    const selected = shared.selection(auth.scope);
    if (!selected) throw new core.ServiceError('project_required', 'Run Tvijo: Choose shared project first.');
    const data = await workspaceClient(client(), auth.access_token).threads(selected.projectId);
    if (!await isCurrentAuth(auth)) return;
    const pick = await vscode.window.showQuickPick([{ label: 'Create new shared thread', create: true }, ...(data.threads || []).map(thread => ({ label: thread.title, description: thread.id, thread }))], { title: selected.projectName + ' · server threads' });
    if (!pick || !await isCurrentAuth(auth)) return;
    ensureIdle();
    delete auth.viewScope;
    if (pick.create) return createSharedThread(auth);
    await selectShared(auth.scope, { id: selected.projectId, name: selected.projectName }, pick.thread);
    attachments = [];
    await loadSharedThread(auth, shared.selection(auth.scope));
    await postChatState();
  });
  command('tvijo.refreshThread', async () => {
    ensureIdle();
    const auth = await requireAuth();
    const selected = shared.selection(auth.scope);
    if (!selected?.threadId) throw new core.ServiceError('thread_required', 'Open a shared server thread first.');
    await loadSharedThread(auth, selected);
    await postChatState();
  });

  async function prepareAndAdd(name, bytes, scope) {
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (attachments.some((item) => item.sha256 === digest)) return;
    if (attachments.length >= 4) throw new core.ServiceError('attachment_count', 'Attach up to 4 files per question.');
    const item = await files.prepareAttachment(name, bytes, { languages: vscode.workspace.getConfiguration('tvijo').get('ocrLanguages', 'eng+rus') });
    if (!identity || currentViewScope(identity.scope) !== scope) throw new core.ServiceError('account_changed', 'The account changed while reading context. Attach it again in the intended account.');
    const next = [...attachments, item];
    files.checkAttachmentSet(next);
    attachments = next;
  }

  async function attachBytes(name, bytes) {
    ensureIdle();
    const auth = await requireAuth();
    const attachmentScope = currentViewScope(auth.scope);
    attaching = true;
    try {
      await postChatState();
      await prepareAndAdd(name, bytes, attachmentScope);
    } finally { attaching = false; await postChatState(); }
  }

  async function attachUri(uri) {
    ensureIdle();
    const auth = await requireAuth();
    const attachmentScope = currentViewScope(auth.scope);
    attaching = true;
    try {
    await postChatState();
    if (!uri || uri.scheme !== 'file') throw new core.ServiceError('attachment_path', 'Choose a saved file in an open workspace.');
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) throw new core.ServiceError('outside_workspace', 'File paths must be inside an open workspace folder. Use Attach for a file on your computer.');
    const [root, resolved, stat] = await Promise.all([fs.realpath(folder.uri.fsPath), fs.realpath(uri.fsPath), fs.lstat(uri.fsPath)]);
    const relative = path.relative(root, resolved);
    if (stat.isSymbolicLink() || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative) || !stat.isFile()) throw new core.ServiceError('attachment_path', 'Attach a regular workspace file, without symlinks or paths outside the workspace.');
    if (stat.size > files.MAX_FILE_BYTES) throw new core.ServiceError('attachment_size', 'Each attachment is limited to 2 MiB.');
    const label = path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep).join('/');
    if (label.split('/').some((part) => ['.git', '.ssh', '.aws'].includes(part))) throw new core.ServiceError('attachment_refused', 'Private configuration folders cannot be attached.');
    const nameRefusal = core.checkKnowledgeFile(label, Buffer.alloc(0));
    if (nameRefusal) throw new core.ServiceError('attachment_refused', nameRefusal);
    const handle = await fs.open(resolved, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const bytes = Buffer.alloc(files.MAX_FILE_BYTES + 1);
      let length = 0;
      while (length < bytes.length) {
        const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
        if (!bytesRead) break;
        length += bytesRead;
      }
      await prepareAndAdd(label, bytes.subarray(0, length), attachmentScope);
    } finally { await handle.close(); }
    } finally { attaching = false; await postChatState(); }
  }

  async function openChat() {
    await vscode.commands.executeCommand('workbench.view.extension.tvijo');
    await vscode.commands.executeCommand('tvijo.chat.focus');
  }

  command('tvijo.openChat', openChat);
  command('tvijo.startFirstTask', async () => {
    if (!vscode.workspace.workspaceFolders?.length) {
      const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectMany: false, openLabel: L('Open project folder', 'Открыть папку проекта') });
      if (!picked?.[0]) { vscode.window.showInformationMessage(L('Open a project folder to start a task.', 'Откройте папку проекта, чтобы начать задачу.')); return; }
      await vscode.commands.executeCommand('vscode.openFolder', picked[0], { forceNewWindow: false });
      return;
    }
    const auth = await requireAuth();
    if (!auth) { await vscode.commands.executeCommand('tvijo.signIn'); return; }
    const draft = { text: L('Explain this project and list three safe first improvements. Do not change files yet.', 'Объясни проект и перечисли три безопасных первых улучшения. Пока не меняй файлы.'), mode: 'plan' };
    if (chatView) await chatView.webview.postMessage({ type: 'draft', ...draft });
    else pendingDraft = draft;
    await openChat();
  });
  command('tvijo.attachFile', async (uri) => {
    ensureIdle();
    if (!(uri instanceof vscode.Uri)) {
      const picked = await vscode.window.showOpenDialog({ canSelectMany: true, canSelectFolders: false, openLabel: 'Attach to Tvijo' });
      if (!picked) return;
      for (const target of picked) await attachUri(target);
    } else await attachUri(uri);
    await openChat();
  });
  command('tvijo.attachPath', async () => {
    ensureIdle();
    const input = await vscode.window.showInputBox({ title: 'Attach a workspace file', prompt: 'Absolute path, or a path relative to the active workspace. PNG/JPG use local text extraction.' });
    if (input?.trim()) await attachPath(input);
    await openChat();
  });
  async function attachPath(input) {
    const value = input.trim().replace(/^(["'])(.*)\1$/, '$2');
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    const root = (activeUri && vscode.workspace.getWorkspaceFolder(activeUri) || vscode.workspace.workspaceFolders?.[0])?.uri.fsPath;
    if (!path.isAbsolute(value) && !root) throw new core.ServiceError('no_workspace', 'Open a workspace before attaching a relative path.');
    await attachUri(vscode.Uri.file(path.isAbsolute(value) ? value : path.resolve(root, value)));
  }
  command('tvijo.attachSelection', async () => {
    ensureIdle();
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) throw new core.ServiceError('no_selection', 'Select code in the editor first.');
    const name = `${path.basename(editor.document.uri.fsPath)} lines ${editor.selection.start.line + 1}-${editor.selection.end.line + 1}`;
    await attachBytes(name, Buffer.from(editor.document.getText(editor.selection)));
    await openChat();
  });
  command('tvijo.contextPreview', async () => {
    ensureIdle();
    // The preview is read locally from the workspace; it needs no account.
    const editor = vscode.window.activeTextEditor;
    const collected = await workspaceContext.collect(vscode, { document: editor?.document || null, maxBytes: vscode.workspace.getConfiguration('tvijo').get('workspaceContextMaxBytes', 48000) });
    lastContextSummary = collected.summary;
    const content = '# Bounded project context that would be sent\n\n' + (collected.text || L('No workspace folder is open.', 'Папка проекта не открыта.'));
    const auth = await readAuth();
    if (auth) await showPrivateDocument('plaintext', content, auth);
    else await showDocument('plaintext', content);
    await postChatState();
  });
  command('tvijo.quickEdit', async () => {
    ensureIdle();
    const auth = await requireAuth();
    const api = core.createClient({ base: auth.api_base });
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.isUntitled) throw new core.ServiceError('no_file', L('Open a saved file before asking for an edit.', 'Откройте сохранённый файл, прежде чем просить правку.'));
    const document = editor.document;
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) throw new core.ServiceError('outside_workspace', L('Quick edit works only inside an open workspace folder.', 'Быстрая правка работает только внутри открытой папки проекта.'));
    const editGuard = codingGuard(auth, path.resolve(folder.uri.fsPath), workspaceEpoch);
    safePath(folder.uri.fsPath, path.relative(folder.uri.fsPath, document.uri.fsPath));
    const original = document.getText();
    const originalVersion = document.version;
    if (Buffer.byteLength(original, 'utf8') > quickEdit.MAX_FILE_BYTES) throw new core.ServiceError('file_too_large', L('This file is too large for a one-file edit.', 'Файл слишком велик для правки одним запросом.'));
    const instruction = await vscode.window.showInputBox({
      title: L('Quick edit: ' + path.basename(document.uri.fsPath), 'Быстрая правка: ' + path.basename(document.uri.fsPath)),
      prompt: L('What should change in this file? The model returns the complete revised file; you review a diff before applying.', 'Что изменить в этом файле? Модель вернёт полный новый файл; перед применением вы увидите diff.'),
      ignoreFocusOut: true
    });
    if (!instruction?.trim()) return;
    const relative = path.relative(folder.uri.fsPath, document.uri.fsPath).split(path.sep).join('/');
    const config = vscode.workspace.getConfiguration('tvijo');
    const idempotencyKey = randomUUID();
    const startedAt = Date.now();
    busy = true;
    try {
      await postActivity('model', L('Model is editing ' + relative + '…', 'Модель правит ' + relative + '…'));
      let projectBlock = '';
      let contextEnabled = config.get('workspaceContext', 'ask') === 'on';
      if (config.get('workspaceContext', 'ask') === 'ask') {
        const saved = context.globalState.get(CONTEXT_CONSENT);
        if (saved === 'on' || saved === 'off') contextEnabled = saved === 'on';
        else { const send = L('Send context', 'Отправить контекст'); contextEnabled = await vscode.window.showWarningMessage(L('Send project context with this edit?', 'Отправить контекст проекта с правкой?'), { modal: true }, send, L('No context', 'Без контекста')) === send; }
      }
      await editGuard();
      if (contextEnabled) { const collected = await workspaceContext.collect(vscode, { document: null, maxBytes: 16000 }); if (collected.text) projectBlock = collected.text + '\n\n'; }
      const messages = [{ role: 'user', content: projectBlock + quickEdit.instruction(relative, document.languageId) + '\n\n--- FILE ---\n' + original + '\n--- END FILE ---\n\nInstruction: ' + instruction.trim() }];
      await local.savePending(auth.scope, { idempotencyKey, apiBase: auth.api_base, tenantId: auth.tenant_id, createdAt: new Date().toISOString() });
      const answer = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: L('Tvijo is editing the file…', 'Tvijo правит файл…'), cancellable: true },
        (_progress, token) => {
          const abort = new AbortController();
          activeAbort = abort;
          token.onCancellationRequested(() => abort.abort());
          return api.ask({ token: auth.access_token, messages, idempotencyKey, title: 'VS Code edit: ' + relative, maxTokens: 4096, model: config.get('model', 'coding'), mode: config.get('agentMode', 'single'), method: config.get('reasoningMethod', 'evidence-first'), signal: abort.signal,
            onGrant: async () => { await postActivity('model', L('Model is working…', 'Модель работает…')); } });
        });
      if (answer?.taskId) {
        try { if (!core.pendingBlocks(await api.taskState(auth.access_token, answer.taskId))) await local.savePending(auth.scope, undefined, idempotencyKey); } catch { /* Keep the journal until settlement is known. */ }
      }
      if (!await isCurrentAuth(auth)) throw new core.ServiceError('account_changed', L('The account changed. The edit was not applied.', 'Аккаунт изменился. Правка не применена.'));
      if (document.isClosed || document.getText() !== original) throw new core.ServiceError('file_changed', L('The file changed while the model was working. Review it and run quick edit again.', 'Файл изменился, пока работала модель. Просмотрите его и запустите правку снова.'));
      await metrics.record({ event: 'edit', outcome: 'proposed', model: config.get('model', 'coding'), path: relative, cost_usd: Number(answer.cost?.spent_usd || 0), duration_ms: Date.now() - startedAt });
      const parsed = quickEdit.parse(answer.content);
      if (parsed === null) {
        await showPrivateDocument('markdown', '# Raw model answer\n\n' + answer.content, auth);
        throw new core.ServiceError('edit_format', L('The model did not return the required file envelope. Nothing was changed.', 'Модель не вернула файл в требуемом формате. Ничего не изменено.'));
      }
      const eol = original.includes('\r\n') ? '\r\n' : '\n';
      const proposed = parsed.replace(/\r\n/g, '\n').replace(/\n/g, eol);
      if (quickEdit.same(original, proposed)) { vscode.window.showInformationMessage(L('Tvijo: the model proposed no changes.', 'Tvijo: модель не предложила изменений.')); return; }
      await quickEdit.preview(vscode, document, proposed, 'Tvijo edit: ' + relative);
      const applyLabel = L('Apply to buffer', 'Применить в буфер');
      if (!config.get('autoApply', false)) {
        const pick = await vscode.window.showWarningMessage(L('Apply the reviewed edit to the editor buffer? The file is not saved automatically.', 'Применить просмотренную правку в буфер редактора? Файл не сохраняется автоматически.'), { modal: true }, applyLabel);
        if (pick !== applyLabel) return;
      }
      if (document.isClosed || document.getText() !== original) throw new core.ServiceError('file_changed', L('The file changed before apply. Nothing was written.', 'Файл изменился до применения. Ничего не записано.'));
      if (!await isCurrentAuth(auth)) throw new core.ServiceError('account_changed', 'Account or workspace changed.');
      if (document.version !== originalVersion) throw new core.ServiceError('file_changed', 'File version changed.');
      safePath(folder.uri.fsPath, relative);
      await editGuard();
      await quickEdit.apply(vscode, document, proposed);
      await metrics.record({ event: 'edit', outcome: 'applied', model: config.get('model', 'coding'), path: relative, duration_ms: Date.now() - startedAt });
      vscode.window.showInformationMessage(L('Tvijo edit applied to the buffer. Review and save explicitly.', 'Правка Tvijo применена в буфер. Просмотрите и сохраните явно.'));
    } catch (error) {
      const pending = local.pending(auth.scope, idempotencyKey);
      if (error.definitiveGrantRefusal && !pending?.taskId) await local.savePending(auth.scope, undefined, idempotencyKey);
      await metrics.record({ event: 'edit', outcome: 'error', model: vscode.workspace.getConfiguration('tvijo').get('model', 'coding'), error_code: error?.code || 'unknown', duration_ms: Date.now() - startedAt });
      throw error;
    } finally {
      activeAbort = null;
      busy = false;
      await postActivity('done', '');
      await postChatState();
    }
  });
  command('tvijo.clearAttachments', async () => { ensureIdle(); attachments = []; await postChatState(); });
  command('tvijo.commands', async () => {
    const picked = await vscode.window.showQuickPick([...ACTIONS.map(([id, label, description]) => ({ id, label, description })), ...sharedCommands.map(([id, label]) => ({ id, label }))], { title: 'Tvijo commands', placeHolder: 'Attach context, manage tasks, or check your account' });
    if (picked) await handlers.get(picked.id)();
  });
  command('tvijo.terminal', async () => {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!cwd) throw new core.ServiceError('workspace_required', 'Open a project folder first.');
    const terminal = vscode.window.createTerminal({ name: 'DSHREM · project', cwd, env: { OPENAI_API_KEY: null, ANTHROPIC_API_KEY: null } });
    terminal.show();
  });
  command('tvijo.learn', () => vscode.env.openExternal(vscode.Uri.parse(new URL('/learn', client().base).toString())));
  command('tvijo.feedback', () => vscode.env.openExternal(vscode.Uri.parse(new URL('/feedback', client().base).toString())));
  command('tvijo.nativeSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:tvijo.tvijo-dshrem'));
  const settingProperties = () => require('./package.json').contributes.configuration.properties;
  function settingsValues() {
    const config = vscode.workspace.getConfiguration('tvijo');
    const values = {};
    for (const [key, property] of Object.entries(settingProperties())) {
      values[key] = config.get(key.slice('tvijo.'.length), property.default);
    }
    // A custom URL may contain user info or query credentials; never embed them.
    try { const url = new URL(values['tvijo.apiBase']); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; values['tvijo.apiBase'] = url.toString(); }
    catch { values['tvijo.apiBase'] = L('Invalid service URL', 'Некорректный адрес сервиса'); }
    return values;
  }
  command('tvijo.settings', () => {
    if (settingsPanel) { settingsPanel.reveal(); return; }
    const panel = vscode.window.createWebviewPanel('tvijo.settingsGuide', L('Tvijo · Settings & how it works', 'Tvijo · Настройки и как это работает'), vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [] });
    settingsPanel = panel;
    panel.webview.html = settingsHtml(panel.webview, { locale: uiLocale(), properties: settingProperties(), values: settingsValues() });
    const listener = panel.webview.onDidReceiveMessage(async message => {
      try {
        if (message?.type === 'openSetting' && typeof message.key === 'string' && Object.hasOwn(settingProperties(), message.key)) {
          await vscode.commands.executeCommand('workbench.action.openSettings', '@id:' + message.key);
        } else if (message?.type === 'guideAction' && typeof message.id === 'string' && Object.hasOwn(GUIDE_ACTIONS, message.id)) {
          const target = GUIDE_ACTIONS[message.id];
          if (target.startsWith('https://')) await vscode.env.openExternal(vscode.Uri.parse(target));
          else if (target === 'workbench.action.openSettings') await vscode.commands.executeCommand('tvijo.nativeSettings');
          else await vscode.commands.executeCommand(target);
        } else if (message?.type === 'refresh') {
          await panel.webview.postMessage({ type: 'settingsValues', values: settingsValues() });
        }
      } catch (error) { report(error); }
    });
    const changed = vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('tvijo')) void panel.webview.postMessage({ type: 'settingsValues', values: settingsValues() });
    });
    panel.onDidDispose(() => { listener.dispose(); changed.dispose(); if (settingsPanel === panel) settingsPanel = null; });
    context.subscriptions.push(panel, listener, changed);
  });
  const publicSite = () => {
    const url = new URL(client().base);
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? 'https://dsh.tvijo.com' : url.origin;
  };
  command('tvijo.productGuide', () => vscode.env.openExternal(vscode.Uri.parse(publicSite() + '/workspace-guide')));
  command('tvijo.connections', async () => {
    ensureIdle();
    const auth = await requireAuth(), project = shared.selection(auth.scope)?.projectId;
    if (!project) throw new core.ServiceError('project_required', 'Choose a shared project before selecting its payer.');
    const value = await client().request('/projects/' + encodeURIComponent(project) + '/byok', { token: auth.access_token });
    if (!await isCurrentAuth(auth)) return;
    const connections = (Array.isArray(value.connections) ? value.connections : []).filter(c => c.execution_available === true && !c.revoked_at && c.project_id === project);
    const picked = await vscode.window.showQuickPick([
      { label: 'Tvijo Managed', id: 'managed', description: 'Tvijo service credit, task limits and receipts' },
      ...connections.map(c => ({ label: 'BYOK · ' + c.name, id: c.id, connection: c, description: 'Your provider account + separate 0.001 TT service fee; no Managed fallback' })),
      { label: 'Manage provider keys in the browser', id: 'manage', description: value.byok?.available === true ? 'Project-scoped encrypted storage; account owner required' : 'BYOK execution unavailable until customer validation; stored key is not proof' },
      { label: 'Read connection and data-processing guide', id: 'guide', description: 'Server-held encrypted custody, separate payer, supported provider' }
    ], { title: 'Tvijo project payer · ' + (byokSelection.get(auth,project) ? 'BYOK' : 'Managed') });
    if (!picked || !await isCurrentAuth(auth)) return;
    if (picked.id === 'manage') return vscode.env.openExternal(vscode.Uri.parse('https://platform.tvijo.com/connections'));
    if (picked.id === 'guide') return vscode.env.openExternal(vscode.Uri.parse(publicSite() + '/connections'));
    if (picked.id === 'managed') { byokSelection.clear(); await postChatState('Managed selected explicitly for new tasks.'); return; }
    const cap = await vscode.window.showInputBox({ title:'Customer provider task limit (USD)', prompt:'Your own provider account is billed separately. No Managed fallback. This limit covers Tvijo requests, not other uses of the provider key.', value:picked.connection.max_task_provider_usd, ignoreFocusOut:true });
    if (cap === undefined || !await isCurrentAuth(auth)) return;
    customerConnection.providerCap(cap);
    const choice = {id:picked.connection.id,epoch:picked.connection.epoch,max_provider_usd:cap};
    const fresh = await client().request('/projects/' + encodeURIComponent(project) + '/byok', { token:auth.access_token });
    if (!await isCurrentAuth(auth)) return;
    customerConnection.validateConnection(fresh,choice,project);
    byokSelection.select(auth,project,choice);
    await postChatState('BYOK selected: customer provider account, separate 0.001 TT service fee, no Managed fallback.');
  });
  async function confirmByok(auth,project,choice,quote) {
    await customerConnection.confirmQuote({quote,choice,project,
      readChoice:() => byokSelection.get(auth,project),
      guard:async() => { if (!await isCurrentAuth(auth)) throw new core.ServiceError('account_changed','The account, project or thread changed.'); },
      confirm:async() => (await vscode.window.showWarningMessage('Use your provider account up to USD ' + choice.max_provider_usd + ', plus 0.001 TT Tvijo service fee? No Managed fallback.', {modal:true}, 'Use my provider account')) === 'Use my provider account',
      connections:() => client().request('/projects/' + encodeURIComponent(project) + '/byok',{token:auth.access_token})});
  }
  command('tvijo.usage', async () => {
    const auth = await requireAuth();
    const selected = shared.selection(auth.scope);
    const usage = selected ? await workspaceClient(client(), auth.access_token).usage(selected.projectId) : await client().request('/workspace/usage', { token: auth.access_token });
    if (!await isCurrentAuth(auth)) return;
    if (chatView) await chatView.webview.postMessage({ type: 'usage', scopeKey: auth.viewScope, usage });
    else await showPrivateDocument('json', JSON.stringify(usage, null, 2), auth);
  });
  command('tvijo.botGuide', () => vscode.env.openExternal(vscode.Uri.parse(publicSite() + '/bot')));
  command('tvijo.buyCredit', async () => {
    const auth = await requireAuth();
    if (auth.kind === 'project') { await vscode.window.showInformationMessage('Billing requires an account-owner browser session. Project keys cannot purchase or change subscriptions.'); if (await isCurrentAuth(auth)) await vscode.env.openExternal(vscode.Uri.parse('https://platform.tvijo.com/billing')); return; }
    const value = await client().request('/billing', {token:auth.access_token});
    if (!await isCurrentAuth(auth)) return;
    if (value.capability?.available !== true) { await vscode.window.showInformationMessage('Payments and subscriptions are unavailable until merchant activation is verified. No payment was collected.'); return; }
    const offers = (value.offers || []).filter(o => o.available !== false && typeof o.version === 'string');
    const offer = await vscode.window.showQuickPick(offers.map(o => ({label:o.name,description:core.formatTvijo(o.allowance_micro_tvijo) + ' TT; USD cents ' + o.amount_minor,offer:o})), {title:'Review a versioned Tvijo offer'});
    if (!offer || !await isCurrentAuth(auth)) return;
    const result = await client().request('/billing/checkout', {token:auth.access_token,method:'POST',body:{offer_version:offer.offer.version,idempotency_key:randomUUID()}});
    if (!await isCurrentAuth(auth)) return;
    await vscode.env.openExternal(vscode.Uri.parse(customerConnection.checkoutUrl(result.checkout_url)));
  });
  command('tvijo.chooseWorkflow', async () => {
    const auth = await requireAuth();
    if (shared.selection(auth.scope)) {
      const available = await workspaceClient(client(), auth.access_token).services();
      if (!await isCurrentAuth(auth)) return;
      const service = await vscode.window.showQuickPick((available.services || []).map(item => ({ label: item.name, id: item.id, description: L('Versioned Tvijo Token quote before reservation', 'Цена в Tvijo Tokens фиксируется до резервирования'), methods: item.methods })), { title: L('Tvijo service', 'Сервис Tvijo') });
      if (!service || !await isCurrentAuth(auth)) return;
      const method = await vscode.window.showQuickPick(service.methods || [], { title: L('Tvijo reasoning method', 'Метод рассуждения Tvijo') });
      if (!method || !await isCurrentAuth(auth)) return;
      const configuration = vscode.workspace.getConfiguration('tvijo');
      await configuration.update('service', service.id, vscode.ConfigurationTarget.Global);
      await configuration.update('reasoningMethod', method, vscode.ConfigurationTarget.Global);
      await postChatState(L(`Selected ${service.label} · ${method}`, `Выбрано: ${service.label} · ${method}`));
      return;
    }
    // The editor panel owns model and method selection; the command palette
    // opens that same localized menu instead of showing untranslated prompts.
    await refreshCatalogue(auth);
    await postChatState();
    await openChat();
    const open = () => { if (chatView) chatView.webview.postMessage({ type: 'openOptions' }); };
    if (chatView) open(); else setTimeout(open, 400);
  });
  command('tvijo.configureBot', async () => {
    ensureIdle();
    const auth = await requireAuth();
    const config = vscode.workspace.getConfiguration('tvijo');
    const owner = await vscode.window.showInputBox({ title: 'Your numeric Telegram owner ID', value: local.botConfig(auth.scope).ownerId || '', prompt: 'Only this account in private chat can control your bot. BotFather creates the bot; your user ID is a separate number.', validateInput: value => /^[1-9]\d{4,19}$/.test(value) ? undefined : 'Enter your numeric Telegram user ID.' });
    if (!owner) return;
    const token = await vscode.window.showInputBox({ title: 'Your BotFather token', password: true, ignoreFocusOut: true, prompt: 'Stored in VS Code SecretStorage. Never add it to settings.json or source files.' });
    if (!token) return;
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) throw new core.ServiceError('bot_token', 'Use the token from the official @BotFather /newbot command.');
    await context.secrets.store(`tvijo.telegram.token.${auth.scope}`, token);
    await local.saveBotConfig(auth.scope, { ownerId: owner, allowedServices: config.get('telegram.allowedServices', []) });
    await vscode.window.showInformationMessage('Bot configured locally. Run Tvijo: Start Telegram bot after signing in to DSHREM.');
  });
  command('tvijo.startBot', async () => {
    ensureIdle();
    if (customerBot?.running) return;
    const auth = await requireAuth();
    const config = vscode.workspace.getConfiguration('tvijo');
    const botConfig = local.botConfig(auth.scope);
    const botToken = await context.secrets.get(`tvijo.telegram.token.${auth.scope}`);
    if (!botToken || !botConfig.ownerId) throw new core.ServiceError('bot_account_setup', 'Configure Telegram bot for this signed-in account first. Older unassigned bot credentials remain preserved and are not reused.');
    let botPendingId = null;
    customerBot = createBot({ botToken, ownerId: botConfig.ownerId, apiBase: auth.api_base, accessToken: auth.access_token, allowedServices: config.get('telegram.allowedServices', []),
      withAction: async action => { if (busy) throw new Error('Editor is busy. Retry your command after it finishes.'); busy = true; try { return await action(); } finally { busy = false; await postChatState(); } },
      load: async () => {
        const pending = local.pending(auth.scope) || null;
        botPendingId = pending?.idempotencyKey || pending?.taskId || null;
        return { model: config.get('model', 'coding'), mode: config.get('agentMode', 'single'), method: config.get('reasoningMethod', 'evidence-first'), ...local.bot(auth.scope), pending };
      },
      save: async state => {
        const { pending, ...rest } = state;
        const loadedRequestId = botPendingId;
        await local.saveBot(auth.scope, rest);
        if (pending) {
          botPendingId = pending.idempotencyKey || pending.taskId;
          await local.savePending(auth.scope, pending);
        } else if (loadedRequestId) {
          // Clear only the request this bot loaded or created, never a newly
          // selected oldest journal belonging to another asynchronous action.
          const previous = local.pending(auth.scope, loadedRequestId);
          if (!previous) { if (botPendingId === loadedRequestId) botPendingId = null; return; }
          if (!previous.taskId) return;
          try {
            const state = await core.createClient({ base: auth.api_base }).taskState(auth.access_token, previous.taskId);
            if (core.pendingBlocks(state)) return;
            await local.savePending(auth.scope, undefined, loadedRequestId);
            if (botPendingId === loadedRequestId) botPendingId = null;
          } catch { /* An unresolved bot request remains recoverable in the editor. */ }
        }
      } });
    const result = await customerBot.start();
    await config.update('telegram.enabled', true, vscode.ConfigurationTarget.Global);
    customerBot.poll().catch(error => { report(error); refreshStatus(); });
    await vscode.window.showInformationMessage(`Your bot @${result.username} is running on this extension host. Send /help from your configured owner account.`);
  });
  command('tvijo.stopBot', async () => { customerBot?.stop(); customerBot = null; await vscode.workspace.getConfiguration('tvijo').update('telegram.enabled', false, vscode.ConfigurationTarget.Global); });
  context.subscriptions.push({ dispose() { customerBot?.stop(); } });
  async function showDocument(language, content) {
    const doc = await vscode.workspace.openTextDocument({ language, content });
    await vscode.window.showTextDocument(doc, { preview: false });
  }
  async function showPrivateDocument(language, content, auth, options = {}) {
    if (!await isCurrentAuth(auth)) return;
    const doc = await vscode.workspace.openTextDocument({ language, content });
    if (!await isCurrentAuth(auth)) return;
    await vscode.window.showTextDocument(doc, { preview: false, ...options });
  }
  command('tvijo.status', async () => {
    const api = client();
    const health = await api.request('/health');
    await showDocument('json', JSON.stringify({ service: api.base, health, image_mode: 'local OCR text, not visual reasoning', sends_on: 'Ask only', max_task_usd: '1' }, null, 2));
  });
  command('tvijo.tasks', async () => {
    const auth = await requireAuth();
    auth.viewScope = currentViewScope(auth.scope);
    const selected = shared.selection(auth.scope);
    const tasks = await core.createClient({ base: auth.api_base }).request('/tasks' + (selected ? '?project_id=' + encodeURIComponent(selected.projectId) : ''), { token: auth.access_token });
    await showPrivateDocument('json', JSON.stringify(tasks, null, 2), auth);
  });
  command('tvijo.metrics', async () => {
    // Local metadata only; reading it never needs an account or a paid task.
    await showDocument('json', JSON.stringify(await metrics.summary(), null, 2));
  });
  command('tvijo.export', async () => {
    const auth = await requireAuth();
    auth.viewScope = currentViewScope(auth.scope);
    const history = historyFor(auth.scope);
    await showPrivateDocument('markdown', '# Tvijo conversation\n\n' + history.map((item) => `## ${item.role === 'user' ? 'You' : 'Tvijo'}\n\n${item.display || item.content}`).join('\n\n'), auth);
  });
  command('tvijo.help', () => showDocument('markdown', '# Tvijo DSHREM\n\nClick **Attach** to choose a file on your computer, paste a PNG/JPG screenshot, or drop a file into the chat. Use **Workspace** or `/attach path/to/file` for files on the SSH host. Select code and click **Selection** to attach only those lines.\n\nImages use local text extraction (OCR); the model does not see visual layout. Files are context for the next question. Knowledge-base uploads are a separate, confirmed action. Nothing is sent to the model until **Ask**. Each question has a $1 cap. Chat answers questions and suggests changes. Use Create isolated coding task to explicitly upload selected source and immutable tests, run a bounded offline test profile, review concrete diffs and explicitly apply unchanged targets.\n\n' + ACTIONS.map(([, label, detail]) => `- **${label}**${detail ? ` — ${detail}` : ''}`).join('\n')));

  command('tvijo.signIn', async () => {
    ensureIdle();
    const attempt = ++authAttempt;
    const api = client();
    const device = await api.startDeviceLogin();
    assertAuthAttempt(attempt, api.base);
    const approval = new URL(device.verification_uri);
    approval.searchParams.set('code', device.user_code);
    const target = vscode.Uri.parse(approval.toString());
    await vscode.env.clipboard.writeText(device.user_code);
    const pick = await vscode.window.showInformationMessage(
      `Tvijo: ${device.user_code}`,
      { detail: 'Only the eight-character code was copied. Open the approval link; the code is already filled in.' },
      'Open browser', 'Copy code');
    assertAuthAttempt(attempt, api.base);
    if (pick === 'Copy code') await vscode.env.clipboard.writeText(device.user_code);
    if (pick === 'Open browser') await vscode.env.openExternal(target);
    const auth = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Tvijo: approve sign-in in your browser', cancellable: true },
      (_progress, token) => {
        const abort = new AbortController();
        token.onCancellationRequested(() => abort.abort());
        return api.pollDeviceLogin(device, { signal: abort.signal });
      });
    assertAuthAttempt(attempt, api.base);
    await commitAuthentication(attempt, api.base, async check => {
      await writeAuthSecret(check, AUTH_KEY, JSON.stringify(auth));
      await writeAuthMode(check, 'device');
      switchIdentity(null);
    });
    vscode.window.showInformationMessage('Tvijo: signed in. The token is kept in VS Code secret storage.');
  });

  command('tvijo.signOut', async () => {
    ensureIdle();
    const attempt = ++authAttempt;
    const api = client();
    // Mode owns the slot even when that mode has already been signed out.
    const mode = context.globalState.get(AUTH_MODE) === 'project' ? 'project' : 'device';
    customerBot?.stop(); customerBot = null;
    const auth = await readAuth();
    await commitAuthentication(attempt, api.base, async check => {
      await writeAuthSecret(check, mode === 'project' ? PROJECT_AUTH_KEY : AUTH_KEY, undefined);
      await writeAuthMode(check, mode);
      switchIdentity(null);
    });
    if (auth?.access_token && auth.kind !== 'project' && auth.api_base === api.base) {
      try { await api.logout(auth.access_token); } catch { /* Local sign-out already completed. */ }
    }
    assertAuthAttempt(attempt, api.base);
    vscode.window.showInformationMessage('Tvijo: signed out on this machine.');
  });

  command('tvijo.account', async () => {
    const auth = await requireAuth();
    const account = auth.kind === 'project' ? await workspaceClient(client(), auth.access_token).projects() : await core.createClient({ base: auth.api_base }).account(auth.access_token);
    await showPrivateDocument('json', JSON.stringify(account, null, 2), auth, { preview: true });
  });

  command('tvijo.newConversation', async () => {
    ensureIdle();
    const auth = await requireAuth();
    lastError = null; lastAgentOutcome = null;
    if (shared.selection(auth.scope)) return createSharedThread(auth);
    const previous = historyFor(auth.scope);
    if (previous.length) await local.archiveHistory(auth.scope, randomUUID(), previous);
    await local.saveHistory(auth.scope, []);
    attachments = [];
    await postChatState();
    vscode.window.showInformationMessage('Tvijo: new conversation started.');
  });

  // The saved idempotency key is the only durable link to a request whose
  // grant response never reached the editor. The old service answered 404 for
  // this lookup, which made every recovery path dead; the current service
  // returns {found:false} without creating a task.
  async function findPendingGrant(api, auth, idempotencyKey) {
    try { return await api.lookupGrant(auth.access_token, idempotencyKey); }
    catch (error) {
      if (error instanceof core.ServiceError && error.serverCode === 'task_not_found') return { found: false };
      throw error;
    }
  }

  command('tvijo.cancelPending', async () => {
    activeAbort?.abort();
    const auth = await requireAuth();
    const api = core.createClient({ base: auth.api_base });
    let pending = local.pending(auth.scope);
    const legacy = !pending && local.legacyPending(auth.scope);
    if (legacy) pending = legacy;
    if (pending && auth.kind === 'project' && pending.projectId !== shared.selection(auth.scope)?.projectId) throw new core.ServiceError('pending_task', L('This pending task belongs to another project. Sign in with its original account or project key to reconcile it.', 'Эта заявка относится к другому проекту. Войдите под исходным аккаунтом или ключом проекта, чтобы её закрыть.'));
    if (!pending) { vscode.window.showInformationMessage(L('Tvijo: nothing pending.', 'Tvijo: незавершённых заявок нет.')); return; }
    if (pending.apiBase && pending.apiBase !== client().base) throw new core.ServiceError('pending_task', L('Switch back to the original service to reconcile its pending task.', 'Вернитесь на исходный адрес сервиса, чтобы закрыть эту заявку.'));
    lastError = null;
    if (!pending.taskId) {
      if (!pending.idempotencyKey) throw new core.ServiceError('pending_task', L('This older request has no recoverable identifier. It is preserved locally; inspect Recent tasks and spending.', 'У этой старой заявки нет идентификатора для сверки. Она сохранена локально; смотрите «История задач» и расходы.'));
      const found = await findPendingGrant(api, auth, pending.idempotencyKey);
      if (!found?.found || !found.task?.id) {
        if (!legacy && pending.phase === 'pregrant' && found?.found === false && found.task === null) {
          await local.savePending(auth.scope, undefined, pending.idempotencyKey);
          await postChatState();
          return;
        }
        const forget = L('Forget request', 'Забыть заявку');
        const answer = await vscode.window.showWarningMessage(
          L('The service has no task for this saved request. Forget the local record? This creates and cancels no paid task.', 'Сервис не нашёл задачу для этой сохранённой заявки. Забыть локальную запись? Платная задача при этом не создаётся и не отменяется.'),
          { modal: true }, forget);
        if (answer !== forget) return;
        if (legacy) await local.markLegacyReconciled(auth.scope, legacy);
        else await local.savePending(auth.scope, undefined, pending.idempotencyKey || pending.taskId);
        lastError = null;
        await postChatState(L('Saved request forgotten. You can ask again.', 'Локальная заявка удалена. Можно задавать вопрос.'));
        return;
      }
      pending = { ...pending, taskId: found.task.id };
      if (!legacy) await local.savePending(auth.scope, pending);
    }
    await api.cancel(auth.access_token, pending.taskId);
    const state = await api.taskState(auth.access_token, pending.taskId);
    if (!core.pendingBlocks(state)) {
      if (legacy) await local.markLegacyReconciled(auth.scope, legacy);
      else await local.savePending(auth.scope, undefined, pending.idempotencyKey || pending.taskId);
    }
    lastError = null;
    vscode.window.showInformationMessage(L(`Tvijo: task ${pending.taskId} is ${state.status || 'unknown'}, held ${state.held ?? 'unknown'} USD.`, `Tvijo: задача ${pending.taskId} — ${state.status || 'неизвестно'}, удержано $${state.held ?? 'неизвестно'}.`));
  });

  // Never start a second paid task while an earlier one may still hold money.
  async function clearPending(auth) {
    // A terminal oldest journal does not prove that later journals are settled.
    // Re-read after each exact-key removal; a bounded scan fails closed if busy.
    const api = core.createClient({ base: auth.api_base });
    for (let checked = 0; checked < 100; checked++) {
      let pending = local.pending(auth.scope);
      if (!pending) return;
      if (auth.kind === 'project' && pending.projectId !== shared.selection(auth.scope)?.projectId) throw new core.ServiceError('pending_task', L('An unresolved task belongs to another project. Use its original account or key to reconcile it before another question.', 'Незавершённая задача относится к другому проекту. Закройте её под исходным аккаунтом или ключом, прежде чем задавать новый вопрос.'));
      if (pending.apiBase && pending.apiBase !== auth.api_base) throw new core.ServiceError('pending_task', L('An earlier task belongs to another service URL. Reconcile it there first.', 'Более ранняя задача относится к другому адресу сервиса. Сначала закройте её там.'));
      if (!pending.taskId) {
        if (!pending.idempotencyKey) throw new core.ServiceError('pending_task', L('This older request has no recoverable identifier. It is preserved locally; inspect Recent tasks and spending.', 'У этой старой заявки нет идентификатора для сверки. Она сохранена локально; смотрите «История задач» и расходы.'));
        const found = await findPendingGrant(api, auth, pending.idempotencyKey);
        if (pending.phase === 'pregrant' && found?.found === false && found.task === null) { await local.savePending(auth.scope, undefined, pending.idempotencyKey); continue; }
        if (!found?.found || !found.task?.id) throw new core.ServiceError('pending_task', L('The service has no task for the saved request. Open “Model & method” → “Resolve task” and choose “Forget request”, then ask again.', 'Сервис не видит задачу для сохранённой заявки. Откройте «Модель и метод» → «Проверить задачу» и выберите «Забыть заявку», затем задайте вопрос снова.'));
        pending = { ...pending, taskId: found.task.id };
        await local.savePending(auth.scope, pending);
      }
      const state = await api.taskState(auth.access_token, pending.taskId);
      if (core.pendingBlocks(state)) {
        throw new core.ServiceError('pending_task', L(`Task ${pending.taskId} is ${state.status || 'unresolved'} with held ${state.held ?? 'unknown'} USD. Choose “Resolve task” or wait; no new paid task was created.`, `Задача ${pending.taskId} — ${state.status || 'не закрыта'}, удержано $${state.held ?? 'неизвестно'}. Нажмите «Проверить задачу» или подождите; новая платная задача не создана.`));
      }
      await local.savePending(auth.scope, undefined, pending.idempotencyKey || pending.taskId);
    }
    throw new core.ServiceError('pending_task', L('More task journals need reconciliation. Use Resolve task before another question.', 'Остались неразобранные заявки. Нажмите «Проверить задачу», прежде чем задавать новый вопрос.'));
  }

  async function askQuestion(question, { showEditor = false, includeSelection = false } = {}) {
    ensureIdle();
    if (!question?.trim()) return;
    const startedAt = Date.now();
    busy = true;
    try {
    lastError = null; lastAgentOutcome = null;
    await postChatState();
    const auth = await requireAuth();
    await postActivity('prepare', L('Preparing the request…', 'Готовлю запрос…'));
    const api = core.createClient({ base: auth.api_base });
    let selectionState = shared.selection(auth.scope);
    if (selectionState && !selectionState.threadId) { await createSharedThread(auth); selectionState = shared.selection(auth.scope); }
    auth.viewScope = currentViewScope(auth.scope);
    const editor = vscode.window.activeTextEditor;
    const config = vscode.workspace.getConfiguration('tvijo');
    let selection = null;
    if (includeSelection && editor && !editor.selection.isEmpty) {
      const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      selection = {
        path: folder ? path.relative(folder.uri.fsPath, editor.document.uri.fsPath).split(path.sep).join('/') : path.basename(editor.document.uri.fsPath),
        startLine: editor.selection.start.line + 1,
        endLine: editor.selection.end.line + 1,
        language: editor.document.languageId,
        text: editor.document.getText(editor.selection)
      };
    }
    // The project block is built locally and only included when the operator
    // allowed it. It is never written to conversation history; the display
    // text stays exactly the question the user typed.
    let contextBlock = '';
    let contextSummary = null;
    const contextMode = config.get('workspaceContext', 'ask');
    let contextEnabled = contextMode === 'on';
    if (contextMode === 'ask') {
      const saved = context.globalState.get(CONTEXT_CONSENT);
      if (saved === 'on' || saved === 'off') contextEnabled = saved === 'on';
      else if (typeof vscode.window.showWarningMessage === 'function') {
        const send = L('Send context', 'Отправить контекст');
        const skip = L('No context', 'Без контекста');
        const pick = await vscode.window.showWarningMessage(
          L('Send bounded project context with this question? The extension will include a file tree, README, manifests and the active file. Secrets and binaries are excluded locally; you can preview the exact block first.', 'Отправлять ограниченный контекст проекта вместе с вопросом? Будут включены дерево файлов, README, манифесты и активный файл. Секреты и бинарные файлы исключаются локально; точный блок можно сначала посмотреть в предпросмотре.'),
          { modal: true }, send, skip);
        contextEnabled = pick === send;
        await context.globalState.update(CONTEXT_CONSENT, contextEnabled ? 'on' : 'off');
      } else contextEnabled = false;
    }
    if (contextEnabled) {
      await postActivity('scan', L('Reading the project tree and manifests…', 'Смотрю проект: дерево и манифесты…'));
      try {
        const collected = await workspaceContext.collect(vscode, { document: editor?.document || null, maxBytes: config.get('workspaceContextMaxBytes', 48000) });
        contextSummary = collected.summary;
        if (collected.text) contextBlock = collected.text + '\n\n';
        lastContextSummary = contextSummary;
        await postActivity('context', contextSummary.root + ' · ' + contextSummary.files + L(' files', ' файлов') + ' · ' + Math.ceil(contextSummary.bytes / 1024) + ' KiB' + (contextSummary.truncated ? L(' · bounded', ' · ограничено') : ''));
      } catch { contextSummary = null; lastContextSummary = null; }
    } else { lastContextSummary = null; }
    await postActivity('grant', L('Checking the task limit…', 'Проверяю лимит задачи…'));
    await clearPending(auth);
    if (!await isCurrentAuth(auth)) throw new core.ServiceError('account_changed', 'The account changed. Submit again from the intended account.');
    const history = historyFor(auth.scope);
    const sentAttachments = attachments.slice();
    const content = contextBlock + files.questionWithAttachments(core.questionWithSelection(question.trim(), selection), sentAttachments);
    const messages = [...(selectionState ? [] : history.map((item) => ({ role: item.role, content: item.content }))), { role: 'user', content }];
    core.validateMessages(messages);
    const payer = selectionState ? byokSelection.get(auth,selectionState.projectId) : null;
    const idempotencyKey = randomUUID();
    const grantRequest = { title: `VS Code: ${question.trim().slice(0, 80)}`, max_usd: selectionState ? sharedTaskCap(auth) : '1', model: config.get('model', 'coding'), mode: config.get('agentMode', 'single'), method: config.get('reasoningMethod', 'evidence-first'), idempotency_key: idempotencyKey, ...(selectionState ? { project_id: selectionState.projectId, thread_id: selectionState.threadId } : {}) };
    if (selectionState) { delete grantRequest.model; delete grantRequest.mode; delete grantRequest.max_usd; grantRequest.service_id = config.get('service', 'standard'); grantRequest.max_micro_tvijo = sharedTaskMicroCap(auth); }
    await local.savePending(auth.scope, { idempotencyKey, request: grantRequest, apiBase: auth.api_base, tenantId: auth.tenant_id, projectId: selectionState?.projectId, threadId: selectionState?.threadId, createdAt: new Date().toISOString() });
      let answer;
      try { answer = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Tvijo is answering…', cancellable: true },
      (_progress, token) => {
        const abort = new AbortController();
        activeAbort = abort;
        let taskId = null;
        token.onCancellationRequested(() => {
          abort.abort();
          if (taskId) api.cancel(auth.access_token, taskId).catch(() => { /* Best effort; no retry. */ });
        });
        const runner = selectionState ? workspaceClient(api, auth.access_token).askService : api.ask;
        return runner({
          serviceId: grantRequest.service_id, maxMicroTvijo: grantRequest.max_micro_tvijo, payer,
          beforeGrant: async () => { if (!await isCurrentAuth(auth) || (selectionState && byokSelection.get(auth,selectionState.projectId) !== payer)) throw new core.ServiceError('account_changed', 'The account, project or thread changed before reservation.'); },
          onQuote: async quote => { await confirmByok(auth,selectionState?.projectId,payer,quote); await postActivity('quote', L('Quote reserved; waiting for the model…', 'Цена зарезервирована; жду модель…')); grantRequest.quote_id = quote.quote_id; grantRequest.tariff_version = quote.tariff_version; await local.savePending(auth.scope, { idempotencyKey, request: grantRequest, apiBase: auth.api_base, tenantId: auth.tenant_id, projectId: selectionState?.projectId, threadId: selectionState?.threadId, createdAt: new Date().toISOString() }); if (chatView) await chatView.webview.postMessage({ type: 'quote', scopeKey: auth.viewScope, quote: { quote_id: quote.quote_id, ceiling_micro_tvijo: quote.ceiling_micro_tvijo, estimated_max_micro_tvijo: quote.estimated_max_micro_tvijo, tariff_version: quote.tariff_version } }); },
          projectId: selectionState?.projectId, threadId: selectionState?.threadId, maxUsd: grantRequest.max_usd,
          token: auth.access_token, messages, idempotencyKey, signal: abort.signal,
          model: grantRequest.model, mode: grantRequest.mode, method: grantRequest.method,
          title: `VS Code: ${question.trim().slice(0, 80)}`,
          onGrant: async (grant) => { taskId = grant.id; await postActivity('model', L('Model is working…', 'Модель работает…')); await local.savePending(auth.scope, { idempotencyKey, request: grantRequest, apiBase: auth.api_base, tenantId: auth.tenant_id, projectId: selectionState?.projectId, threadId: selectionState?.threadId, taskId: grant.id, createdAt: new Date().toISOString() }); }
        });
      }); } catch (error) {
        const pending = local.pending(auth.scope, idempotencyKey);
        if (error.definitiveGrantRefusal && pending?.idempotencyKey === idempotencyKey && !pending.taskId) await local.savePending(auth.scope, undefined, idempotencyKey);
        throw error;
      }
      await metrics.record({ event: 'ask', outcome: 'completed', mode: 'chat', model: config.get('model', 'coding'), method: config.get('reasoningMethod', 'evidence-first'), context: !!lastContextSummary, attachments: sentAttachments.length, task_id: answer.taskId, cost_usd: Number(answer.cost?.spent_usd || 0), duration_ms: Date.now() - startedAt });
      await postActivity('settle', L('Checking the task receipt…', 'Проверяю квитанцию задачи…'));
      let reconciled = false;
      try { reconciled = !core.pendingBlocks(await api.taskState(auth.access_token, answer.taskId)); } catch { /* A successful answer alone does not prove settlement. */ }
      if (reconciled) await local.savePending(auth.scope, undefined, idempotencyKey);
      const formatted = core.formatAnswer({ question: question.trim(), answer });
      const userDisplay = question.trim() + (sentAttachments.length ? '\n\nAttached: ' + sentAttachments.map((item) => `${item.name}${item.kind === 'image' ? ' (image text)' : ''}`).join(', ') : '');
      const stored = [...history, { role: 'user', content, display: userDisplay }, { role: 'assistant', content: answer.content, display: formatted }].slice(-40);
      if (selectionState) {
        const thread = await workspaceClient(api, auth.access_token).thread(selectionState.projectId, selectionState.threadId);
        shared.remember(auth.scope, selectionState, thread.messages || []);
      } else await local.saveHistory(auth.scope, stored);
      const sentIds = new Set(sentAttachments.map((item) => item.id));
      if (await isCurrentAuth(auth)) attachments = attachments.filter((item) => !sentIds.has(item.id));
      else tenantAttachments.set(auth.viewScope, (tenantAttachments.get(auth.viewScope) || []).filter((item) => !sentIds.has(item.id)));
      await postChatState(reconciled ? '' : 'Answer received; task settlement is not yet confirmed. Use Resolve task before another question.');
      if (showEditor) {
        await showPrivateDocument('markdown', formatted, auth, { viewColumn: vscode.ViewColumn.Beside });
      }
    } catch (error) {
      await metrics.record({ event: 'ask', outcome: 'error', mode: 'chat', model: vscode.workspace.getConfiguration('tvijo').get('model', 'coding'), error_code: error?.code || 'unknown', duration_ms: Date.now() - startedAt });
      throw error;
    } finally {
      activeAbort = null;
      busy = false;
      await postActivity('done', '');
      await postChatState();
    }
  }

  function codingGuard(auth, root, epoch) {
    return async () => {
      if (!await isCurrentAuth(auth) || epoch !== workspaceEpoch || !(vscode.workspace.workspaceFolders || []).some(folder => path.resolve(folder.uri.fsPath) === root)) throw new core.ServiceError('account_changed', 'The account, service, project, thread or workspace changed. Reopen the coding task before proceeding.');
    };
  }
  async function previewCoding(review) {
    await review.guard();
    coding.validateArtifact(review.artifact, review.snapshot);
    const summary = coding.evidenceText(review.artifact);
    await showPrivateDocument('markdown', summary, review.auth);
    await review.guard();
    for (const edit of review.artifact.edits) {
      const original = review.snapshot.files.find(file => file.path === edit.path);
      const before = await codingChecked(review.guard, vscode.workspace.openTextDocument({ content:original?.content || '', language:edit.path.endsWith('.py') ? 'python' : 'javascript' }));
      const after = await codingChecked(review.guard, vscode.workspace.openTextDocument({ content:edit.content, language:before.languageId }));
      await codingChecked(review.guard, vscode.commands.executeCommand('vscode.diff', before.uri, after.uri, 'Tvijo proposal: ' + edit.path));
    }
    codingReview = review;
    if (review.artifact.workflow && review.artifact.workflow !== 'single' && !coding.canApplyWorkflow(review.artifact)) return;
    const choice = await codingChecked(review.guard, vscode.window.showInformationMessage('Tvijo coding proposal is ready for review. Tests do not authorize editing your workspace.', 'Apply reviewed coding proposal'));
    if (choice === 'Apply reviewed coding proposal') await handlers.get('tvijo.applyCoding')();
  }
  async function codingChecked(guard, promise) { const value = await promise; await guard(); return value; }
  async function captureCoding(auth) {
    coding.requireCodingScope(auth, accountSnapshot?.key_scopes);
    const folders = vscode.workspace.workspaceFolders || [];
    if (!folders.length) throw new core.ServiceError('coding_refused', 'Open the intended project folder first.');
    const folder = folders.length === 1 ? folders[0] : (await vscode.window.showQuickPick(folders.map(folder => ({ label:folder.name, folder })), { title:'Choose coding workspace' }))?.folder;
    if (!folder) return null;
    const root = path.resolve(folder.uri.fsPath), guard = codingGuard(auth, root, workspaceEpoch);
    await guard();
    // The remote/web VS Code file picker can return one path despite
    // canSelectMany. Explicitly accumulate selections without crawling folders.
    const selected = await coding.selectFiles({ guard,
      choose:() => vscode.window.showOpenDialog({ title:'Select source and immutable test files to upload', defaultUri:folder.uri, canSelectMany:true, canSelectFolders:false, openLabel:'Select coding snapshot' }),
      next:async current => (await vscode.window.showQuickPick([
        ...(current.length < coding.MAX_FILES ? [{label:'Add another source or test file',value:'add'}] : []),
        ...(current.length >= 2 ? [{label:'Continue with '+current.length+' selected files',value:'done'}] : [])
      ], {title:'Coding snapshot: '+current.length+' files explicitly selected',ignoreFocusOut:true}))?.value
    });
    if (!selected?.length) return null;
    const paths = selected.map(uri => path.relative(root, uri.fsPath).split(path.sep).join('/'));
    const tests = await codingChecked(guard, vscode.window.showQuickPick(paths.map(value => ({ label:value, value })), { title:'Select immutable test files (at least one)', canPickMany:true }));
    if (!tests?.length) return null;
    const profile = await codingChecked(guard, vscode.window.showQuickPick([{label:'Python standard-library unittest', value:'python-unittest'}, {label:'Node built-in tests', value:'node-test'}], {title:'Select isolated offline test profile'}));
    if (!profile) return null;
    const snapshot = await coding.capture({ root, selected:paths, testFiles:tests.map(item => item.value), profile:profile.value, guard, vscode });
    return {snapshot, guard};
  }
  async function chooseCodingWorkflow(auth, guard) {
    const picked = await codingChecked(guard,vscode.window.showQuickPick([
      {label:'Single proposal',description:'1 call; sequential; depth 1; one attempt',value:'single'},
      {label:'Proposal and review',description:'2 calls; sequential; depth 1; one attempt; proposal limit up to 2048 bytes',value:'review'},
      {label:'Two proposals and review',description:'3 calls; sequential; depth 1; one attempt; each proposal limit up to 1024 bytes',value:'swarm'}
    ], {title:'Choose coding workflow under one task ceiling',ignoreFocusOut:true}));
    if (!picked) return null;
    coding.requireWorkflowScope(auth,accountSnapshot?.key_scopes,picked.value);
    if (picked.value === 'single') return {workflow:'single'};
    const requirements = [];
    for (let index = 0; index < 8; index++) {
      const text = await codingChecked(guard,vscode.window.showInputBox({title:'Review requirement ' + (index + 1),prompt:'Write one atomic requirement (1–1000 characters). It is mandatory; review cannot waive it.',ignoreFocusOut:true}));
      if (!text?.trim()) return null;
      const scope = await codingChecked(guard,vscode.window.showQuickPick([
        {label:'Implemented source behavior',value:'implemented'},
        {label:'Documented contract (select a Markdown or text document)',value:'documented'}
      ], {title:'Evidence scope for requirement ' + (index + 1),ignoreFocusOut:true}));
      if (!scope) return null;
      requirements.push({id:'requirement-' + (index + 1),text:text.trim(),scope:scope.value,mandatory:true,critical:false});
      coding.normalizeRequirements(requirements);
      if (index === 7) break;
      const next = await codingChecked(guard,vscode.window.showQuickPick([
        {label:'Continue with ' + requirements.length + ' mandatory requirements',value:'done'},
        {label:'Add another atomic requirement',value:'add'}
      ], {title:'Review requirements',ignoreFocusOut:true}));
      if (!next) return null;
      if (next.value === 'done') break;
    }
    return {workflow:picked.value,requirements};
  }
  command('tvijo.codingTask', async () => {
    ensureIdle();
    const auth = await requireAuth();
    const selected = shared.selection(auth.scope);
    if (!selected?.threadId) throw new core.ServiceError('coding_refused', 'Choose a shared project and thread before creating a coding task.');
    auth.viewScope = currentViewScope(auth.scope);
    const choiceGuard = async () => { if (!await isCurrentAuth(auth)) throw new core.ServiceError('account_changed','The coding workflow account or shared scope changed.'); };
    const payer = byokSelection.get(auth,selected.projectId);
    const workflowChoice = await chooseCodingWorkflow(auth,choiceGuard); if (!workflowChoice) return;
    if (payer && workflowChoice.workflow !== 'single') throw new core.ServiceError('byok_workflow_unavailable', 'BYOK supports one bounded coding attempt. Select single, or explicitly choose Managed before review or swarm.');
    const captured = await captureCoding(auth); if (!captured) return;
    const {snapshot, guard} = captured;
    const prompt = await codingChecked(guard, vscode.window.showInputBox({ title:'Coding proposal', prompt:'Describe the source change. Selected tests stay immutable. One quoted task; no installs or automatic retries.', ignoreFocusOut:true }));
    if (!prompt?.trim()) return;
    if (prompt.length > 12000) throw new core.ServiceError('coding_refused', 'Use a coding request of at most 12000 characters.');
    await codingChecked(guard, clearPending(auth));
    const idempotencyKey = randomUUID(), api = core.createClient({base:auth.api_base});
    const metadata = { idempotencyKey, apiBase:auth.api_base, tenantId:auth.tenant_id, projectId:selected.projectId, threadId:selected.threadId, kind:'coding', workflow:workflowChoice.workflow, createdAt:new Date().toISOString() };
    await codingChecked(guard, local.savePending(auth.scope, metadata));
    busy = true;
    try {
      const artifact = await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Tvijo coding: proposal and isolated tests',cancellable:true}, async (_progress, token) => {
        const abort = new AbortController(); activeAbort = abort;
        token.onCancellationRequested(() => { abort.abort(); const pending = local.pending(auth.scope,idempotencyKey); if (pending?.taskId) api.cancel(auth.access_token,pending.taskId).catch(() => {}); });
        return coding.codingClient(api,auth.access_token).run({snapshot,...workflowChoice,payer,projectId:selected.projectId,threadId:selected.threadId,prompt:prompt.trim(),maxMicroTvijo:sharedTaskMicroCap(auth),idempotencyKey,guard:async()=>{await guard();if(byokSelection.get(auth,selected.projectId)!==payer)throw new core.ServiceError('payer_changed','The selected payer changed before dispatch.');},signal:abort.signal,
          journal: value => local.savePending(auth.scope,{...metadata,...value}),
          onQuote: async quote => { await confirmByok(auth,selected.projectId,payer,quote); void vscode.window.showInformationMessage('Tvijo ' + workflowChoice.workflow + ' ceiling (' + coding.workflowLimits(workflowChoice.workflow).max_calls + ' calls maximum, sequential): ' + core.formatTvijo(quote.ceiling_micro_tvijo) + ' Tvijo Tokens; tariff ' + quote.tariff_version + (quote.workflow_plan ? '; quoted proposal limits: ' + quote.workflow_plan.nodes.filter(node => node.role === 'proposer').map(node => node.output_bytes_max + ' bytes').join(', ') : '') + '.'); } });
      });
      await guard();
      const state = await codingChecked(guard, api.taskState(auth.access_token,artifact.task_id));
      if (!core.pendingBlocks(state)) await codingChecked(guard, local.savePending(auth.scope,undefined,idempotencyKey));
      busy = false;
      await previewCoding({auth,snapshot,artifact,guard});
    } catch (error) {
      const pending = local.pending(auth.scope,idempotencyKey);
      if (error.definitiveGrantRefusal && !pending?.taskId) await local.savePending(auth.scope,undefined,idempotencyKey);
      throw error;
    } finally { busy = false; activeAbort = null; }
  });
  command('tvijo.openCodingTask', async () => {
    ensureIdle(); const auth = await requireAuth(); auth.viewScope = currentViewScope(auth.scope);
    const selected = shared.selection(auth.scope);
    if (!selected?.threadId) throw new core.ServiceError('coding_refused','Choose the coding task project and thread first.');
    const captured = await captureCoding(auth); if (!captured) return;
    const taskId = await codingChecked(captured.guard,vscode.window.showInputBox({title:'Open coding task',prompt:'Exact task ID from the shared project history'}));
    if (!taskId?.trim()) return;
    const artifact = await codingChecked(captured.guard,coding.codingClient(core.createClient({base:auth.api_base}),auth.access_token).artifact(taskId.trim()));
    if (artifact.task_id !== taskId.trim() || artifact.project_id !== selected.projectId || artifact.thread_id !== selected.threadId) throw new core.ServiceError('coding_refused','The coding task identity does not match.');
    await previewCoding({auth,...captured,artifact});
  });
  command('tvijo.applyCoding', async () => {
    ensureIdle(); const review = codingReview;
    if (!review) throw new core.ServiceError('coding_refused','Open and review a coding proposal first.');
    await review.guard();
    const applyEpoch = authAttempt, applyWorkspaceEpoch = workspaceEpoch, applyScope = currentViewScope(review.auth.scope);
    const guardSync = () => { if (authAttempt !== applyEpoch || workspaceEpoch !== applyWorkspaceEpoch || client().base !== review.auth.api_base || identity?.token !== review.auth.access_token || currentViewScope(review.auth.scope) !== applyScope) throw new core.ServiceError('account_changed','The coding apply scope changed.'); };
    const applied = await coding.apply({vscode,snapshot:review.snapshot,artifact:review.artifact,guard:review.guard,guardSync,
      revalidate:() => coding.codingClient(core.createClient({base:review.auth.api_base}),review.auth.access_token).artifact(review.artifact.task_id),
      confirm:async () => (await vscode.window.showWarningMessage('Apply exactly the reviewed Tvijo edits to the selected workspace? Existing selected files must still match their captured bytes. New files must still be absent.', {modal:true}, 'Apply reviewed edits')) === 'Apply reviewed edits' });
    if (applied) { codingReview = null; await vscode.window.showInformationMessage('Tvijo reviewed edits were applied to editor buffers. Review and save them explicitly.'); }
  });

  command('tvijo.ask', async () => {
    const editor = vscode.window.activeTextEditor;
    const selection = editor && !editor.selection.isEmpty;
    const question = await vscode.window.showInputBox({
      title: 'Ask Tvijo DSHREM',
      prompt: selection ? 'Ask about your selection. One paid task, capped at 1 USD.' : 'One paid task, capped at 1 USD.',
      ignoreFocusOut: true
    });
    await askQuestion(question, { showEditor: true, includeSelection: true });
  });
  command('tvijo.agent', async () => {
    const goal = await vscode.window.showInputBox({
      title: L('Agent task', 'Задача агенту'),
      prompt: L('What should the agent do? It reads and edits files and asks before each command.', 'Что должен сделать агент? Он читает и правит файлы и спрашивает перед каждой командой.'),
      ignoreFocusOut: true
    });
    if (goal?.trim()) await runAgentFlow(goal.trim(), { planMode: false });
  });
  command('tvijo.agentPlan', async () => {
    const goal = await vscode.window.showInputBox({
      title: L('Agent plan (read-only)', 'План агента (только чтение)'),
      prompt: L('What should the agent inspect? Writes and commands are disabled.', 'Что должен изучить агент? Запись и команды отключены.'),
      ignoreFocusOut: true
    });
    if (goal?.trim()) await runAgentFlow(goal.trim(), { planMode: true });
  });

  context.subscriptions.push(vscode.window.registerWebviewViewProvider('tvijo.chat', {
    resolveWebviewView(view) {
      chatView = view;
      view.webview.options = { enableScripts: true };
      view.webview.html = chatHtml(view.webview).replaceAll('Chat stays in this workspace and is separate from Copilot. Submitted tasks also appear in server history.', 'Use Commands to choose a shared project and server thread. Shared messages are available in your browser.');
      const listener = view.webview.onDidReceiveMessage(async (message) => {
        try {
          if (['ask', 'attach', 'removeAttachment', 'previewAttachment', 'copy', 'openAnswer', 'new', 'cancel', 'workspace', 'selection', 'path', 'clearAttachments', 'tasks', 'usage', 'workflow', 'setOption', 'quickEdit'].includes(message?.type) && message.scopeKey !== undefined) {
            const auth = await requireAuth();
            if (message.scopeKey !== currentViewScope(auth.scope)) throw new core.ServiceError('account_changed', 'The account changed. This action was not sent.');
          }
          if (message?.type === 'locale') {
            await context.globalState.update(UI_LOCALE, message.value === 'ru' ? 'ru' : 'en');
            await postChatState();
          } else if (message?.type === 'setOption') {
            const auth = await requireAuth();
            const options = chatOptions(auth);
            const allowed = {
              model: options.models.map(item => item.id),
              agentModel: options.models.map(item => item.id),
              agentMode: ['single', 'auto', 'council'],
              reasoningMethod: ['evidence-first', 'plan-check', 'peer-review'],
              workspaceContext: ['ask', 'on', 'off'],
              autoApply: [true, false]
            };
            if (!allowed[message.key] || !allowed[message.key].includes(message.value)) throw new core.ServiceError('invalid_option', 'Unknown model, workflow or reasoning method.');
            if (message.key === 'workspaceContext' && message.value === 'ask') await context.globalState.update(CONTEXT_CONSENT, undefined);
            await vscode.workspace.getConfiguration('tvijo').update(message.key, message.value, vscode.ConfigurationTarget.Global);
            await postChatState();
          } else if (message?.type === 'ready') {
            await refreshStatus();
            if (pendingDraft) {
              const draft = pendingDraft; pendingDraft = null;
              await view.webview.postMessage({ type: 'draft', text: draft.text, mode: draft.mode });
            }
          }
          else if (message?.type === 'attach') {
            if (typeof message.base64 !== 'string' || message.base64.length > Math.ceil(files.MAX_FILE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(message.base64)) throw new core.ServiceError('attachment_size', 'Attach a file no larger than 2 MiB.');
            const bytes = Buffer.from(message.base64, 'base64');
            if (bytes.toString('base64') !== message.base64) throw new core.ServiceError('attachment_data', 'The attachment could not be read. Attach it again.');
            await attachBytes(message.name, bytes);
          } else if (message?.type === 'removeAttachment') {
            ensureIdle(); attachments = attachments.filter((item) => item.id !== message.id); await postChatState();
          } else if (message?.type === 'previewAttachment') {
            const auth = await requireAuth();
            const item = attachments.find((item) => item.id === message.id);
            if (item) await showPrivateDocument('plaintext', item.name + '\n\n' + item.text, auth);
          } else if (message?.type === 'copy' || message?.type === 'openAnswer') {
            const auth = await requireAuth();
            const history = historyFor(auth.scope);
            const item = Number.isInteger(message.index) && history[message.index];
            if (!item || item.role !== 'assistant') return;
            if (message.type === 'copy') await vscode.env.clipboard.writeText(item.content);
            else await showPrivateDocument('markdown', item.display || item.content, auth);
          } else if (message?.type === 'account') {
            const auth = await readAuth();
            const live = auth?.access_token && auth.api_base === client().base && !(auth.expires_at && Date.now() >= Date.parse(auth.expires_at));
            await vscode.commands.executeCommand(live ? 'tvijo.account' : 'tvijo.signIn');
          } else if (['new', 'cancel', 'commands', 'workspace', 'selection', 'path', 'help', 'bot', 'workflow', 'credit', 'terminal', 'settings', 'clearAttachments', 'usage', 'connections', 'productGuide', 'tasks', 'contextPreview', 'quickEdit'].includes(message?.type)) {
            if (message.type === 'cancel' && agentRunning) { agentAbort?.abort(); return; }
            const id = { new: 'tvijo.newConversation', cancel: 'tvijo.cancelPending', commands: 'tvijo.commands', workspace: 'tvijo.attachFile', selection: 'tvijo.attachSelection', path: 'tvijo.attachPath', help: 'tvijo.help', bot: 'tvijo.botGuide', workflow: 'tvijo.chooseWorkflow', credit: 'tvijo.buyCredit', terminal: 'tvijo.terminal', learn: 'tvijo.learn', feedback: 'tvijo.feedback', settings: 'tvijo.settings', clearAttachments: 'tvijo.clearAttachments', usage: 'tvijo.usage', connections: 'tvijo.connections', productGuide: 'tvijo.productGuide', tasks: 'tvijo.tasks', contextPreview: 'tvijo.contextPreview', quickEdit: 'tvijo.quickEdit' }[message.type];
            await handlers.get(id)(); await refreshStatus();
          } else if (message?.type === 'ask' && typeof message.question === 'string') {
            try {
              const action = slashAction(message.question);
              const reference = fileReference(message.question);
              if (reference) { await attachPath(reference); await refreshStatus(); }
              else if (action) {
                if (!action.command) throw new core.ServiceError('unknown_command', L('Unknown command. Available: /help, /start, /model, /context, /edit, /agent, /plan, /new, /attach, /selection, /terminal, /usage, /metrics.', 'Неизвестная команда. Доступно: /help, /start, /model, /context, /edit, /agent, /plan, /new, /attach, /selection, /terminal, /usage, /metrics.'));
                if (action.command === 'tvijo.attachFile' && action.argument) await attachPath(action.argument);
                else await handlers.get(action.command)();
                await refreshStatus();
              } else if (message.question.trim().startsWith('!')) {
                await runUserShell(message.question.trim().slice(1).trim());
              } else if (message.agent) {
                await runAgentFlow(message.question, { planMode: !!message.plan });
              } else await askQuestion(message.question);
              await view.webview.postMessage({ type: 'submission', scopeKey: message.scopeKey, ok: true, question: message.question });
            } catch (error) {
              await view.webview.postMessage({ type: 'submission', scopeKey: message.scopeKey, ok: false, question: message.question });
              throw error;
            }
          }
        } catch (error) {
          report(error);
          const action = error?.code === 'pending_task' ? 'cancel' : error?.code === 'unauthorized' ? 'account' : typeof error?.code === 'string' && error.code.startsWith('context_budget') ? 'context' : null;
          lastError = { text: localizedMessage(error), action };
          await postChatState('', lastError);
        }
        finally { if (message?.type === 'attach') await view.webview.postMessage({ type: 'attachmentDone' }); }
      });
      context.subscriptions.push(listener);
      view.onDidDispose(() => { listener.dispose(); if (chatView === view) chatView = null; });
    }
  }));

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

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('tvijo.apiBase')) { authAttempt++; switchIdentity(null); } if (e.affectsConfiguration('tvijo.apiBase') || e.affectsConfiguration('tvijo.telegram.ownerId') || e.affectsConfiguration('tvijo.telegram.allowedServices') || (e.affectsConfiguration('tvijo.telegram.enabled') && !vscode.workspace.getConfiguration('tvijo').get('telegram.enabled', false))) { customerBot?.stop(); customerBot = null; refreshStatus(); } }));
  refreshStatus();
  if (vscode.workspace.getConfiguration('tvijo').get('telegram.enabled', false)) handlers.get('tvijo.startBot')().then(refreshStatus).catch(report);
}

function deactivate() {}

module.exports = { activate, deactivate };
