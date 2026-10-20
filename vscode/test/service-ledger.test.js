'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { workspaceClient, sharedTaskMicroCap } = require('../workspace');
const { createClient, taskStateOf, pendingBlocks, formatAnswer, formatTvijo, ServiceError } = require('../lib/client');
const args = () => ({ projectId: 'p', threadId: 't', title: 'Test', serviceId: 'standard', messages: [{ role: 'user', content: 'Private question' }], idempotencyKey: 'request', maxMicroTvijo: 10000000 });
const quote = overrides => ({ quote_id: 'q', service_id: 'standard', project_id: 'p', thread_id: 't', tariff_version: 'pilot-v1', expires_at: Math.floor(Date.now() / 1000) + 300, ceiling_micro_tvijo: 2345678, ...overrides });
function apiFixture({ changedQuote, grantError, chatError } = {}) {
  const calls = [];
  const api = { request: async (path, options) => {
    calls.push({ path, ...options });
    if (path === '/services/quote') return quote(changedQuote);
    if (path === '/tasks') { if (grantError) throw grantError; return { id: 'task' }; }
    if (path === '/tasks/task/chat') { if (chatError) throw chatError; return { choices: [{ message: { content: 'Answer' } }], receipt: { tariff_version: 'pilot-v1', debited_micro_tvijo: 234, held_micro_tvijo: 0 }, usage: { prompt_tokens: null, completion_tokens: 2, total_tokens: null, completeness: 'partial' } }; }
    throw new Error('Unexpected path');
  } };
  return { client: workspaceClient(api, 'private-test-key'), calls };
}
test('service protocol binds exact content, project, ceiling and immutable quote before one reservation', async () => {
  const { client, calls } = apiFixture(); const order = [];
  const result = await client.askService({ ...args(), onQuote: q => order.push(q.quote_id), beforeGrant: () => order.push('epoch-checked'), onGrant: g => order.push(g.id) });
  assert.deepEqual(order, ['epoch-checked', 'q', 'epoch-checked', 'task', 'epoch-checked']);
  assert.deepEqual(calls.map(c => c.path), ['/services/quote', '/tasks', '/tasks/task/chat']);
  assert.equal(calls[0].body.max_micro_tvijo, 10000000);
  assert.deepEqual(calls[0].body.messages, calls[2].body.messages);
  assert.equal(calls[0].body.max_tokens, calls[2].body.max_tokens);
  assert.deepEqual(calls[1].body, { quote_id: 'q', service_id: 'standard', idempotency_key: 'request' });
  for (const c of calls) { assert.equal(c.body.model, undefined); assert.equal(c.body.max_usd, undefined); assert.equal(c.token, 'private-test-key'); }
  assert.equal(result.usage.total_tokens, null);
  assert.equal(result.receipt.debited_micro_tvijo, 234);
});
test('mismatched scope/service/tariff, expired or inflated quote refuses before reservation', async () => {
  for (const changedQuote of [{ project_id:'other' }, { thread_id:'other' }, { service_id:'other' }, { tariff_version: null }, { expires_at: 1 }, { expires_at: 'bad' }, { ceiling_micro_tvijo:10000001 }, { ceiling_micro_tvijo:null }, { ceiling_micro_tvijo:0 }, { ceiling_micro_tvijo:1.2 }]) {
    const { client, calls } = apiFixture({ changedQuote });
    await assert.rejects(client.askService(args()), e => e.code === 'invalid_quote' && e.definitiveGrantRefusal);
    assert.equal(calls.length, 1);
  }
});
test('auth or project epoch changed after quote cannot reserve, even after A B A', async () => {
  const { client, calls } = apiFixture(); let epoch = 1; const captured = epoch;
  await assert.rejects(client.askService({ ...args(), onQuote: () => { epoch++; epoch++; }, beforeGrant: () => { if (epoch !== captured) throw new ServiceError('account_changed', 'Changed'); } }), e => e.code === 'account_changed' && e.definitiveGrantRefusal);
  assert.equal(calls.length, 1);
});
test('lost reservation/chat never requotes, retries, or claims no grant', async () => {
  for (const phase of ['grantError', 'chatError']) {
    const error = new ServiceError('unreachable', 'Lost synthetic response');
    const { client, calls } = apiFixture({ [phase]:error });
    await assert.rejects(client.askService(args()), e => e === error && !e.definitiveGrantRefusal);
    assert.equal(calls.filter(c => c.path === '/services/quote').length, 1);
    assert.equal(calls.filter(c => c.path === '/tasks').length, 1);
    assert.equal(calls.length, phase === 'grantError' ? 2 : 3);
  }
});
test('bad key limit fails locally and exact unit conversion preserves fractional legacy caps', async () => {
  assert.equal(sharedTaskMicroCap({ kind:'project', key_limits:{ max_task_usd:'0.000000001' } }), 1);
  assert.equal(sharedTaskMicroCap({ kind:'project', key_limits:{ max_task_usd:'0.01' } }), 10000000);
  assert.equal(sharedTaskMicroCap({ kind:'project', key_limits:{ max_task_usd:'2' } }), 50000000);
  assert.throws(() => sharedTaskMicroCap({ kind:'project', key_limits:{ max_task_usd:'0.0000000001' } }), /represented exactly/);
  const { client, calls } = apiFixture();
  for (const maxMicroTvijo of [null, undefined, 0, -1, 1.5, 50000001, '10000000']) await assert.rejects(client.askService({ ...args(), maxMicroTvijo }));
  assert.equal(calls.length,0);
});
test('unknown service hold blocks next task and explicit integer zero alone settles', () => {
  for (const held of [null, '0', undefined, -1, 0.5]) {
    const state = taskStateOf({ status:'completed', receipt: { held_micro_tvijo:held } });
    assert.equal(pendingBlocks(state), true);
  }
  assert.equal(pendingBlocks(taskStateOf({ status:'completed', receipt:{ held_micro_tvijo:0 } })), false);
  assert.equal(pendingBlocks(taskStateOf({ status:'active', receipt:{ held_micro_tvijo:0 } })), true);
});
test('receipt distinguishes service credits from incomplete actual model-token counts', async () => {
  const { client } = apiFixture(); const answer = await client.askService(args());
  const text = formatAnswer({ question:'Question',answer });
  assert.match(text,/debited 0.000234 Tvijo Tokens/);
  assert.match(text,/actual model tokens unknown \(partial\)/);
  assert.doesNotMatch(text,/undefined|USD|private-test-key/);
  assert.equal(formatTvijo(null),'unknown'); assert.equal(formatTvijo(0),'0'); assert.equal(formatTvijo(1000001),'1.000001');
});
test('untrusted quote error body never echoes key, prompt or private provider details', async () => {
  const api = createClient({ base:'http://localhost', fetchImpl:async () => Response.json({ error:{ code:'private-test-key Private question Provider secret' } },{ status:400 }) });
  await assert.rejects(workspaceClient(api,'private-test-key').askService(args()), error => !/private-test-key|Private question|Provider secret/.test(error.message) && error.definitiveGrantRefusal);
});
