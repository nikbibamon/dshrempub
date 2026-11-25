'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { accountProcess } = require('../lib/agent-review');
const { MODEL, VERSION, CATALOG_JSON, invocation, analysisEnvironment, parseResult, stopOnUnexpectedOutput, analyzeImage } = require('../lib/image-analysis');

const thread = '01a21250-7d39-7873-be7d-d94e7aac867a';
const reported = '2026-11-25T10:46:34.628478Z  INFO codex_core::session: server reported model gpt-6.2-sol (matches requested model)';
const completion = (payload = { observation: 'Blue triangle on the right.' }, extra = []) => ({
  ok: true,
  stderr: reported,
  stdout: [
    { type: 'thread.started', thread_id: thread },
    { type: 'turn.started' },
    ...extra,
    { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(payload) } },
    { type: 'turn.completed' }
  ].map(value => JSON.stringify(value)).join('\n')
});

test('image profile uses the exact pinned tool-free settings and strips routing overrides from the child environment', () => {
  const model = JSON.parse(CATALOG_JSON).models[0];
  assert.equal(model.slug, MODEL);
  assert.equal(model.shell_type, 'disabled');
  assert.equal(model.tool_mode, 'direct');
  assert.equal(model.apply_patch_tool_type, undefined);
  assert.deepEqual(model.input_modalities, ['text', 'image']);
  assert.deepEqual(model.experimental_supported_tools, []);
  assert.equal(VERSION, 'codex-cli 0.171.0');
  const args = invocation();
  assert.ok(args.includes('chatgpt_base_url="https://chatgpt.com/backend-api/"'));
  assert.ok(args.includes('--ignore-user-config'));
  assert.ok(args.includes('--strict-config'));
  assert.ok(args.includes('approval_policy="never"'));
  assert.ok(args.includes('forced_login_method="chatgpt"'));
  assert.ok(args.includes('--image=/tvijo-image/frame.png'));
  assert.equal(args.at(-1), '-');
  const child = analysisEnvironment({ HOME: '/account', PATH: '/bin', OPENAI_API_KEY: 'synthetic', ANTHROPIC_API_KEY: 'synthetic',
    CODEX_API_KEY: 'synthetic', OPENAI_BASE_URL: 'https://wrong.invalid', HTTPS_PROXY: 'proxy', BASH_ENV: 'startup', NODE_OPTIONS: 'options' });
  assert.deepEqual(Object.keys(child).sort(), ['HOME', 'PATH', 'RUST_LOG', 'TMPDIR']);
});

test('accepted image text requires exactly one complete tool-free turn with a machine-reported model', () => {
  const good = parseResult(completion());
  assert.equal(good.observation, 'Blue triangle on the right.');
  assert.equal(good.model_report, reported);
  assert.equal(good.served_model, MODEL);
  assert.equal(good.thread_id, thread);
  assert.equal(parseResult({ ...completion(), stderr: '' }).reason, 'model_receipt_missing');
  assert.equal(parseResult({ ...completion(), stderr: reported + '\nserver reported model other while requested model was gpt-6.2-sol' }).reason, 'model_route_changed');
  assert.equal(parseResult(completion({ observation: 'x'.repeat(4097) })).reason, 'invalid_observation');
  assert.equal(parseResult(completion({ observation: '', tool: 'run' })).reason, 'invalid_observation');
  assert.equal(parseResult(completion({ observation: 'x' }, [{ type:'item.started', item:{ type:'command_execution' } }])).reason, 'unexpected_cli_event');
  assert.equal(parseResult({ ...completion(), stdout: completion().stdout.split('\n').slice(0, -1).join('\n') }).reason, 'incomplete_cli_receipt');
});

test('native capture aborts on retry diagnostics and bounds output', async () => {
  const call = accountProcess({ cwd: __dirname, env: {}, maxOutput: 512, stopOnOutput: stopOnUnexpectedOutput });
  const log = 'WARN codex_core::responses_retry: stream disconnected - retrying sampling request (1/5)';
  const retry = await call(process.execPath, ['-e', `console.error(${JSON.stringify(log)}); setTimeout(() => {}, 10000)`], '', 4000);
  assert.equal(retry.reason, 'transport_interrupted');
  const overflow = await call(process.execPath, ['-e', 'process.stdout.write("x".repeat(1000))'], '', 4000);
  assert.equal(overflow.reason, 'output_limit');
  assert.ok(Buffer.byteLength(overflow.stdout) <= 512);
  assert.equal(stopOnUnexpectedOutput('stdout', '{"type":"turn.failed","error":{"message":"usage limit reached"}}'), 'subscription_limit');
});

test('invalid frame or revoked action exits before any account subprocess', async () => {
  assert.equal((await analyzeImage({ frame: Buffer.from('plain text') })).reason, 'invalid_frame');
  const signal = AbortSignal.abort();
  const frame = Buffer.from('89504e470d0a1a0a', 'hex');
  assert.equal((await analyzeImage({ frame, storage: '/not-opened', signal })).reason, 'cancelled');
});

function rolloutFor(answer, changes = {}) {
  const turn = '01a21257-6415-7072-9def-a66735f13243';
  const cwd = '/tvijo-image/empty';
  return [
    ['session_meta', { id:thread, originator:'codex_exec', source:'exec', model_provider:'openai', cli_version:'0.171.0', cwd, account_scoped:true, ...changes.session }],
    ['turn_context', { turn_id:turn, root_turn_id:turn, cwd, model:MODEL, approval_policy:'never', permission_profile:{network:'restricted'}, ...changes.context }],
    ['event_msg', { type:'task_started', turn_id:turn }],
    ['token_usage_record', { thread_id:thread, turn_id:turn, response_id:'synthetic-response', usage:{ input_tokens:100, output_tokens:10, total_tokens:110 } }],
    ['event_msg', { type:'task_complete', turn_id:turn, last_agent_message:answer, ...changes.end }],
    ...(changes.extra || [])
  ].map(([type,payload]) => JSON.stringify({timestamp:'2026-11-25T10:54:06Z',type,payload})).join('\n');
}

test('private CLI rollout can establish provenance only for the matching completed thread and exact answer', () => {
  const payload = { observation:'Blue triangle on the right.' };
  const output = { ...completion(payload), stderr:'' };
  const answer = JSON.stringify(payload);
  const good = parseResult(output, rolloutFor(answer));
  assert.equal(good.model_evidence, 'Codex CLI turn_context');
  assert.equal(good.turn_context.thread_id, thread);
  assert.equal(good.turn_context.model, MODEL);
  assert.deepEqual(good.turn_context.usage, { input_tokens:100, output_tokens:10, total_tokens:110 });
  for (const changes of [
    { session:{id:'other-thread'} }, { session:{model_provider:'other'} }, { context:{model:'other'} },
    { end:{turn_id:'other-turn'} }, { end:{last_agent_message:'wrong answer'} },
    { extra:[['event_msg',{type:'model_reroute'}]] }
  ]) assert.equal(parseResult(output, rolloutFor(answer, changes)).reason, 'model_receipt_missing');
});
