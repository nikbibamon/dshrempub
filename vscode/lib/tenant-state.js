'use strict';
const { createHash } = require('node:crypto');

// Legacy keys are deliberately never modified or assigned to the next login.
const LEGACY_HISTORY = 'tvijo.conversation';
const LEGACY_PENDING = 'tvijo.pending';
function scopeKey(base, tenant) {
  if (typeof tenant !== 'string' || !tenant || typeof base !== 'string' || !base) throw new Error('Verified service and tenant are required');
  return createHash('sha256').update(JSON.stringify([base, tenant])).digest('hex');
}
const key = (scope, name) => {
  if (!/^[a-f0-9]{64}$/.test(scope || '')) throw new Error('Verified tenant scope is required');
  return `tvijo.tenant.v1.${scope}.${name}`;
};
function tenantState(context) {
  const pendingKey = (scope, id) => key(scope, `pending.${id}`);
  const pendingEntries = scope => {
    const prefix = key(scope, 'pending.');
    return context.globalState.keys().filter(name => name.startsWith(prefix)).map(name => context.globalState.get(name)).filter(Boolean);
  };
  return {
    history: scope => context.workspaceState.get(key(scope, 'conversation')) || [],
    saveHistory: (scope, value) => context.workspaceState.update(key(scope, 'conversation'), value),
    pending: (scope, id) => id ? context.globalState.get(pendingKey(scope, id)) : pendingEntries(scope).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))[0],
    savePending: (scope, value, id) => {
      const requestId = id || value?.idempotencyKey || value?.taskId;
      if (!requestId) throw new Error('An exact pending request identifier is required');
      return context.globalState.update(pendingKey(scope, requestId), value);
    },
    bot: scope => context.globalState.get(key(scope, 'bot')) || {},
    saveBot: (scope, value) => context.globalState.update(key(scope, 'bot'), value),
    botConfig: scope => context.globalState.get(key(scope, 'bot-config')) || {},
    saveBotConfig: (scope, value) => context.globalState.update(key(scope, 'bot-config'), value),
    legacyHistory: () => context.workspaceState.get(LEGACY_HISTORY) || [],
    legacyPending: scope => {
      const pending = context.globalState.get(LEGACY_PENDING);
      return pending && context.globalState.get(key(scope, 'legacy-reconciled')) !== (pending.idempotencyKey || pending.taskId) ? pending : null;
    },
    markLegacyReconciled: (scope, pending) => context.globalState.update(key(scope, 'legacy-reconciled'), pending.idempotencyKey || pending.taskId),
    // Older builds stored a bare array; readers accept both (see conversation-branch.normalizeArchive).
    archiveHistory: (scope, id, history, meta = {}) => context.workspaceState.update(key(scope, `archive.${id}`), { schema: 1, at: meta.at ?? Date.now(), reason: meta.reason, history }),
    archives: scope => {
      const prefix = key(scope, 'archive.');
      return context.workspaceState.keys().filter(name => name.startsWith(prefix)).map(name => ({ id: name.slice(prefix.length), raw: context.workspaceState.get(name) })).filter(row => row.raw);
    },
    removeArchive: (scope, id) => context.workspaceState.update(key(scope, `archive.${id}`), undefined)
  };
}
module.exports = { scopeKey, tenantState };
