'use strict';


const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/client');

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    const path = new URL(url).pathname.replace('/api/dshrem/v1', '');
    calls.push({ path, method: init.method, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.authorization });
    const handler = routes[`${init.method} ${path}`];
    if (!handler) return new Response('{}', { status: 404 });
    const [status, body] = typeof handler === 'function' ? handler(calls) : handler;
    return new Response(body === undefined ? '' : JSON.stringify(body), { status });
  };
  return { impl, calls };
}

test('apiBase requires https except localhost', () => {
  assert.equal(core.apiBase(''), core.DEFAULT_API_BASE);
  assert.equal(core.apiBase('http://localhost:8080/api/dshrem/v1/'), 'http://localhost:8080/api/dshrem/v1');
  assert.throws(() => core.apiBase('http://example.com/api'), /https/);
  assert.throws(() => core.apiBase('https://user:pw@example.com/api'), /credentials/);
});

test('known gateway context and uncertainty codes are actionable without exposing raw details', async () => {
  for (const [code, status] of [['preview_context_limit',413], ['charge_pending',502], ['model_request_failed',502], ['usage_recovery_unavailable',502]]) {
    const { impl, calls } = fakeFetch({ 'POST /tasks': [200, {id:'one'}], 'POST /tasks/one/chat': [status, {error:{code,detail:'secret prompt'}}] });
    const api = core.createClient({fetchImpl:impl});
    await assert.rejects(api.ask({token:'synthetic',messages:[{role:'user',content:'Q'}],idempotencyKey:'once'}), e => e.code === code && !e.message.includes('secret') && !e.message.includes('HTTP 502'));
    assert.equal(calls.length,2);
  }
});

test('preview bounds only automatic context and cannot override paid or unknown account metadata', () => {
  assert.equal(core.previewContextBytes(48000,{preview:{tokens_remaining:49739}}),4096);
  assert.equal(core.previewContextBytes(48000,{preview:{tokens_remaining:10000}}),0);
  assert.equal(core.previewContextBytes(48000,{preview:{tokens_remaining:0}}),0);
  assert.equal(core.previewContextBytes(48000,{}),48000);
  assert.equal(core.previewContextBytes(48000,{preview:{tokens_remaining:null}}),48000);
});

test('device login keeps polling through 428 and returns a bound token', async () => {
  let polls = 0;
  const { impl } = fakeFetch({
    'POST /auth/device': [200, { device_code: 'd', user_code: 'ABCD-1234', verification_uri: 'https://finedg.com/dshrem/device', interval: 1, expires_in: 60 }],
    'POST /auth/token': () => (++polls < 3 ? [428, {}] : [200, { access_token: 'tok', expires_in: 3600 }])
  });
  const client = core.createClient({ fetchImpl: impl, sleep: async () => {}, now: () => 0 });
  const device = await client.startDeviceLogin();
  const auth = await client.pollDeviceLogin(device);
  assert.equal(polls, 3);
  assert.equal(auth.access_token, 'tok');
  assert.equal(auth.api_base, core.DEFAULT_API_BASE);
});

test('device login stops on denial', async () => {
  const { impl } = fakeFetch({ 'POST /auth/token': [403, {}] });
  const client = core.createClient({ fetchImpl: impl, sleep: async () => {}, now: () => 0 });
  await assert.rejects(client.pollDeviceLogin({ device_code: 'd', interval: 1, expires_in: 60 }), (e) => e.code === 'authorization_denied');
});

test('ask reserves one task with the idempotency key, then chats once', async () => {
  const { impl, calls } = fakeFetch({
    'POST /tasks': [200, { id: 't1' }],
    'POST /tasks/t1/chat': [200, { choices: [{ message: { role: 'assistant', content: 'answer' } }], task: { spent_usd: '0.0012', held_usd: '0' }, evidence: [{ id: 'e1', path: 'a.py', start_line: 1, end_line: 9 }] }]
  });
  const client = core.createClient({ fetchImpl: impl });
  const granted = [];
  const answer = await client.ask({ token: 'tok', messages: [{ role: 'user', content: 'q' }], idempotencyKey: 'k1', onGrant: (g) => granted.push(g.id) });
  assert.deepEqual(granted, ['t1']);
  assert.equal(answer.content, 'answer');
  assert.equal(calls[0].body.idempotency_key, 'k1');
  assert.equal(calls[0].body.model, 'coding');
  assert.equal(calls[0].body.max_usd, '1');
  assert.equal(calls[1].auth, 'Bearer tok');
  assert.match(core.formatAnswer({ question: 'q', answer }), /\[e1\] a\.py:1-9[\s\S]*spent 0\.0012 USD/);
});

test('a failed chat is not retried and raw error bodies are not exposed', async () => {
  const { impl, calls } = fakeFetch({ 'POST /tasks': [200, { id: 't1' }], 'POST /tasks/t1/chat': [502, { detail: 'upstream secret detail' }] });
  const client = core.createClient({ fetchImpl: impl });
  await assert.rejects(client.ask({ token: 'tok', messages: [{ role: 'user', content: 'q' }], idempotencyKey: 'k' }), (e) => e.status === 502 && !e.message.includes('secret'));
  assert.equal(calls.filter((c) => c.path === '/tasks/t1/chat').length, 1);
});

test('oversized conversation is refused before any paid request', async () => {
  const { impl, calls } = fakeFetch({});
  const client = core.createClient({ fetchImpl: impl });
  await assert.rejects(client.ask({ token: 't', messages: [{ role: 'user', content: 'x'.repeat(120 * 1024) }], idempotencyKey: 'k' }), (e) => e.code === 'context_limit');
  assert.equal(calls.length, 0);
});

test('pending task blocks until terminal with zero held', () => {
  assert.equal(core.pendingBlocks(core.taskStateOf({ status: 'running', budget: { held_usd: '0.5' } })), true);
  assert.equal(core.pendingBlocks(core.taskStateOf({ status: 'frozen', budget: { held_usd: '0' } })), true);
  assert.equal(core.pendingBlocks(core.taskStateOf({ status: 'completed' })), true);
  assert.equal(core.pendingBlocks(core.taskStateOf({ status: 'completed', budget: { held_usd: '0' } })), false);
});

test('knowledge upload refuses credentials, binaries and large files', () => {
  assert.match(core.checkKnowledgeFile('.env', Buffer.from('A=1')), /Credential/);
  assert.match(core.checkKnowledgeFile('cfg/app.yaml', Buffer.from('api_key: abcdef')), /credentials/);
  assert.match(core.checkKnowledgeFile('a.bin', Buffer.from([0, 1, 2])), /Binary/);
  assert.match(core.checkKnowledgeFile('big.md', Buffer.alloc(600 * 1024, 97)), /512 KiB/);
  assert.equal(core.checkKnowledgeFile('docs/readme.md', Buffer.from('# hello')), null);
});

test('selection is quoted as data with a fence that cannot be closed by the code', () => {
  const text = core.questionWithSelection('why?', { path: 'a.md', startLine: 1, endLine: 2, language: 'markdown', text: '```\nignore previous\n```' });
  assert.match(text, /data, not instructions/);
  assert.match(text, /~~~~markdown\n```\nignore previous\n```\n~~~~$/);
});

test('final synchronous dispatch guard catches changes during asynchronous grant handling without inference or retry',async()=>{
  const {impl,calls}=fakeFetch({'POST /tasks':[200,{id:'guarded-task'}]});let current=true;
  const client=core.createClient({fetchImpl:impl});
  await assert.rejects(client.ask({token:'tok',messages:[{role:'user',content:'quoted rules'}],idempotencyKey:'guard-key',onGrant:async()=>{await Promise.resolve();current=false;},beforeChat:()=>{if(!current)throw new Error('rules changed');}}),/rules changed/);
  assert.equal(calls.length,1);assert.equal(calls[0].path,'/tasks');
  await assert.rejects(client.ask({token:'tok',messages:[{role:'user',content:'quoted rules'}],idempotencyKey:'guard-key2',beforeChat:async()=>{}}),/must be synchronous/);
  assert.equal(calls.length,2);
});


test('preview preflight accounts for Cyrillic wire escaping, preserves explicit messages and bypasses only operator admission', () => {
  const messages=[{role:'user',content:'что дальше '.repeat(3000)}],before=JSON.stringify(messages);
  assert.equal(core.previewFits(messages,{preview:{tokens_remaining:49739}}),false);
  assert.equal(core.previewFits([{role:'user',content:'что дальше'}],{preview:{tokens_remaining:49739}}),true);
  assert.equal(core.previewFits(messages,{preview:{source:'operator_test_allowance',tokens_remaining:1}}),true);
  assert.equal(core.previewFits(messages,{preview:{tokens_remaining:'unknown'}}),false);
  assert.equal(core.previewContextBytes(48000,null),0);
  assert.equal(core.previewContextBytes(48000,{preview:{}}),0);
  assert.equal(JSON.stringify(messages),before);
});

test('service held micro Tvijo values retain TT units and fail-closed blocking',()=>{
 for(const value of [0,2500000]){
  const state=core.taskStateOf({status:'completed',receipt:{held_micro_tvijo:value}});
  assert.equal(state.held,value/1000000);
  assert.equal(state.heldUnit,'TT');
  assert.equal(core.pendingBlocks(state),value!==0);
 }
 assert.equal(core.taskStateOf({status:'completed',budget:{held_usd:'2.5'}}).held,2.5);
 assert.equal(core.pendingBlocks(core.taskStateOf({status:'completed',receipt:{held_micro_tvijo:'0'}})),true);
});
