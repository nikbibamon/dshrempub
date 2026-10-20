'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scopeKey, tenantState } = require('../lib/tenant-state');
function memory(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { get: key => values.get(key), keys: () => [...values.keys()], update: async (key, value) => values.set(key, value) };
}
test('tenant state separates service and owner while preserving legacy bytes', async () => {
  const legacyHistory = [{ role: 'user', content: 'Unassigned private text' }];
  const legacyPending = { idempotencyKey: 'legacy-key', request: { title: 'Unassigned title' } };
  const context = { workspaceState: memory({ 'tvijo.conversation': legacyHistory }), globalState: memory({ 'tvijo.pending': legacyPending }) };
  const local = tenantState(context), a = scopeKey('https://one.example/api', 'A'), b = scopeKey('https://one.example/api', 'B'), other = scopeKey('https://two.example/api', 'A');
  await local.saveHistory(a, [{ role: 'user', content: 'A content' }]);
  await local.savePending(a, { idempotencyKey: 'new-key', taskId: 'task-A' });
  for (const scope of [b, other]) { assert.deepEqual(local.history(scope), []); assert.equal(local.pending(scope), undefined); }
  assert.deepEqual(local.legacyHistory(), legacyHistory);
  await local.markLegacyReconciled(a, legacyPending);
  assert.equal(local.legacyPending(a), null);
  assert.deepEqual(local.legacyPending(b), legacyPending);
  assert.deepEqual(context.globalState.get('tvijo.pending'), legacyPending);
  assert.deepEqual(context.workspaceState.get('tvijo.conversation'), legacyHistory);
});
test('distinct request journals cannot clear or overwrite each other', async () => {
  const context = { workspaceState: memory(), globalState: memory() };
  const firstWindow = tenantState(context), secondWindow = tenantState(context), scope = scopeKey('https://one.example/api', 'A');
  await Promise.all([
    firstWindow.savePending(scope, { idempotencyKey: 'first', taskId: 'held-task', createdAt: '2026-10-18T00:00:00Z' }),
    secondWindow.savePending(scope, { idempotencyKey: 'second', createdAt: '2026-10-18T00:00:01Z' })
  ]);
  await secondWindow.savePending(scope, undefined, 'second');
  assert.equal(firstWindow.pending(scope).taskId, 'held-task');
  assert.equal(firstWindow.pending(scope, 'second'), undefined);
  assert.throws(() => firstWindow.savePending(scope, undefined), /exact pending request/);
});
