'use strict';
const { createHash, randomUUID } = require('node:crypto');
const core = require('./lib/client');
const byok = require('./lib/byok');

const PROJECT_AUTH_KEY = 'tvijo.project.auth';
const AUTH_MODE = 'tvijo.auth.mode';
const segment = value => encodeURIComponent(value);
const viewScope = (scope, project, thread) => project ? createHash('sha256').update(JSON.stringify([scope, project, thread || null])).digest('hex') : scope;
function sharedTaskCap(auth) {
  if (auth.kind !== 'project') return '0.05';
  const cap = auth.key_limits?.max_task_usd;
  if (typeof cap !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(cap) || !Number.isFinite(Number(cap)) || Number(cap) <= 0) throw new core.ServiceError('key_limit_unknown', 'The project key task limit could not be verified. Sign in with this key again before sending a question.');
  return Number(cap) < 0.05 ? cap : '0.05';
}

// Decimal USD legacy caps map exactly to integer micro-Tvijo units at pilot v1.
function sharedTaskMicroCap(auth) {
  const cap = sharedTaskCap(auth);
  const [whole, fraction = ''] = cap.split('.');
  if (fraction.length > 9 && /[1-9]/.test(fraction.slice(9))) throw new core.ServiceError('key_limit_unknown', 'The key limit cannot be represented exactly in service units.');
  const units = BigInt(whole) * 1000000000n + BigInt((fraction + '000000000').slice(0, 9));
  if (units <= 0n || units > 50000000n) throw new core.ServiceError('key_limit_unknown', 'The key service limit could not be verified.');
  return Number(units);
}

function workspaceState(context) {
  const selections = new Map();
  const histories = new Map();
  const epochs = new Map();
  return {
    selection(scope) { return selections.has(scope) ? selections.get(scope) : context.workspaceState.get(`tvijo.workspace.v1.${scope}`) || null; },
    async select(scope, project, thread = null) {
      const value = project ? { projectId: project.id, projectName: project.name || project.id, threadId: thread?.id || null, threadTitle: thread?.title || '' } : null;
      selections.set(scope, value);
      epochs.set(scope, (epochs.get(scope) || 0) + 1);
      await context.workspaceState.update(`tvijo.workspace.v1.${scope}`, value);
      if (project && thread) await context.workspaceState.update(`tvijo.workspace.thread.v1.${scope}.${project.id}`, thread.id);
      return value;
    },
    preferredThread(scope, projectId, threads) {
      const selected = this.selection(scope);
      const id = selected?.projectId === projectId && selected.threadId || context.workspaceState.get(`tvijo.workspace.thread.v1.${scope}.${projectId}`);
      return threads.find(thread => thread.id === id) || threads[0] || null;
    },
    scope(scope) { const value = this.selection(scope); return viewScope(scope, value?.projectId, value?.threadId); },
    guard(scope) { const value = this.scope(scope), epoch = epochs.get(scope) || 0; return epoch ? createHash('sha256').update(JSON.stringify([value, epoch])).digest('hex') : value; },
    history(scope) { return histories.get(this.scope(scope)) || []; },
    remember(scope, selection, messages) { histories.set(viewScope(scope, selection.projectId, selection.threadId), messages); },
    matches(scope, selection) { const now = this.selection(scope); return now?.projectId === selection?.projectId && now?.threadId === selection?.threadId; }
  };
}

function sharedThreadUrl(selection) {
  if (!selection?.projectId || !selection?.threadId) return null;
  const query = new URLSearchParams({ project: selection.projectId, thread: selection.threadId });
  return 'https://dsh.tvijo.com/?' + query;
}

function workspaceClient(api, token) {
  const request = (path, options = {}) => api.request(path, { ...options, token });
  const threadPath = (projectId, threadId) => `/projects/${segment(projectId)}/threads${threadId ? '/' + segment(threadId) : ''}`;
  return {
    services: () => request('/services'),
    usage: projectId => request('/services/usage?project_id=' + segment(projectId)),
    async askService({ messages, idempotencyKey, title, serviceId = 'standard', method = 'evidence-first', projectId, threadId, maxMicroTvijo, payer = null, signal, onQuote, beforeGrant, onGrant }) {
      core.validateMessages(messages);
      if (!projectId || !threadId || !Number.isSafeInteger(maxMicroTvijo) || maxMicroTvijo <= 0 || maxMicroTvijo > 50000000) throw new core.ServiceError('key_limit_unknown', 'A verified shared service-unit limit is required before starting a task.');
      let quote;
      try {
        quote = await request('/services/quote', { method: 'POST', signal, body: { service_id: serviceId, project_id: projectId, thread_id: threadId, title: title.slice(0, 120), messages, max_tokens: 2048, method, idempotency_key: idempotencyKey, max_micro_tvijo: maxMicroTvijo, ...byok.quoteFields(payer) } });
        if (!quote?.quote_id || quote.service_id !== serviceId || quote.project_id !== projectId || quote.thread_id !== threadId || typeof quote.tariff_version !== 'string' || !quote.tariff_version || !Number.isSafeInteger(quote.ceiling_micro_tvijo) || quote.ceiling_micro_tvijo <= 0 || quote.ceiling_micro_tvijo > maxMicroTvijo || !Number.isFinite((typeof quote.expires_at === 'number' ? quote.expires_at * 1000 : Date.parse(quote.expires_at))) || (typeof quote.expires_at === 'number' ? quote.expires_at * 1000 : Date.parse(quote.expires_at)) <= Date.now()) throw new core.ServiceError('invalid_quote', 'The service quote could not be verified. No task was reserved.');
        byok.validateQuote(quote,payer);
        if (beforeGrant) await beforeGrant();
        if (onQuote) await onQuote(quote);
        if (beforeGrant) await beforeGrant();
        if (signal?.aborted) throw new core.ServiceError('interrupted', 'Request was cancelled before reservation.');
      } catch (error) { error.definitiveGrantRefusal = true; throw error; }
      // One reservation attempt, and no fresh quote after ambiguous transport failure.
      const grant = await request('/tasks', { method: 'POST', signal, body: { quote_id: quote.quote_id, service_id: serviceId, idempotency_key: idempotencyKey } });
      if (!grant?.id) throw new core.ServiceError('incomplete', 'The service returned no task identifier. Resolve the pending request before retrying.');
      if (onGrant) await onGrant(grant);
      if (beforeGrant) await beforeGrant();
      if (signal?.aborted) throw new core.ServiceError('interrupted', 'Task was reserved but chat was cancelled. Resolve the pending task before retrying.');
      const response = await request(`/tasks/${segment(grant.id)}/chat`, { method: 'POST', signal, timeoutMs: 210000, body: { messages, max_tokens: 2048 } });
      const content = response?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new core.ServiceError('no_output', 'The service returned no assistant text.');
      return { taskId: grant.id, content, usage: response.usage ?? null, receipt: response.receipt ?? null, byok: byok.publicReceipt(response.byok), cost: response.task ?? null, evidence: Array.isArray(response.evidence) ? response.evidence : [] };
    },
    projects: () => request('/projects'),
    threads: projectId => request(threadPath(projectId)),
    thread: (projectId, threadId) => request(threadPath(projectId, threadId)),
    createThread: (projectId, title) => request(threadPath(projectId), { method: 'POST', body: { title, idempotency_key: randomUUID() } }),
    async ask({ messages, idempotencyKey, title, model, mode, method, projectId, threadId, maxUsd, signal, onGrant }) {
      core.validateMessages(messages);
      let grant;
      if (typeof maxUsd !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(maxUsd) || !(Number(maxUsd) > 0 && Number(maxUsd) <= 0.05)) throw new core.ServiceError('key_limit_unknown', 'A verified shared task limit is required before starting a task.');
      try { grant = await request('/tasks', { method: 'POST', signal, body: { title: title.slice(0, 120), max_usd: maxUsd, model, mode, method, idempotency_key: idempotencyKey, project_id: projectId, thread_id: threadId } }); }
      catch (error) {
        // The protocol core only exposes serverCode for its exact no-grant allowlist.
        if (error instanceof core.ServiceError && error.status >= 400 && error.status < 500 && error.serverCode) error.definitiveGrantRefusal = true;
        throw error;
      }
      if (!grant?.id) throw new core.ServiceError('incomplete', 'The service returned no task identifier. Resolve the pending request before retrying.');
      if (onGrant) await onGrant(grant);
      const response = await request(`/tasks/${segment(grant.id)}/chat`, { method: 'POST', signal, timeoutMs: 210000, body: { messages, max_tokens: 2048 } });
      const content = response?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new core.ServiceError('no_output', 'The service returned no assistant text.');
      return { taskId: grant.id, content, usage: response.usage || null, cost: response.task || null, evidence: Array.isArray(response.evidence) ? response.evidence : [] };
    }
  };
}
module.exports = { sharedThreadUrl, PROJECT_AUTH_KEY, AUTH_MODE, viewScope, workspaceState, workspaceClient, sharedTaskCap, sharedTaskMicroCap };
