'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const profiles = require('../lib/lint-profiles');
const { buildInvocation, run } = require('../lib/auto-lint');

const cwd = process.env.TVIJO_FIT_TEST_TMP;
const executable = { 'python-ast': '/usr/bin/python3', 'node-cjs': process.execPath, 'node-esm': process.execPath };
const scopeKey = 'a'.repeat(64);
const approved = new Map();
function snapshot(file, text) {
  return { scopeKey: 'a'.repeat(64), path: file, version: 1, text, contentHash: crypto.createHash('sha256').update(text).digest('hex') };
}
async function profile(id) {
  let record = approved.get(id);
  if (!record) {
    record = await profiles.inspectExecutable({ profileId: id, executable: executable[id], scopeKey, workspaceRoots: [] });
    approved.set(id, record);
  }
  return { ...record, cwd, workspaceRoots: [] };
}
const guard = async () => true;
const isCurrent = () => true;
const assertLaunchAllowed = () => {};
async function mockRun(args, options = {}) {
  const originalSpawn = options.spawn || (() => mockChild());
  const wrappedSpawn = (...callArgs) => {
    const child = originalSpawn(...callArgs);
    process.nextTick(() => child.emit('spawn'));
    return child;
  };
  return run({ ...args, assertLaunchAllowed:args.assertLaunchAllowed||assertLaunchAllowed }, { ...options, spawn: wrappedSpawn,
    pinExecutable: options.pinExecutable || (async () => {
      let closed = false;
      return { fd: 987, close: async () => { assert.equal(closed, false); closed = true; } };
    }), groupStatus: options.groupStatus, signalGroup: options.signalGroup });
}

function mockChild({ closeOnKill = true, output = '', onEnd } = {}) {
  const child = new EventEmitter();
  child.pid = 987654;
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
  child.kills = [];
  child.kill = (signal) => {
    child.kills.push(signal);
    if (closeOnKill) process.nextTick(() => child.emit('close', null));
    return true;
  };
  child.stdin.end = () => {
    if (output) child.stdout.write(output);
    if (onEnd) onEnd(child);
    else process.nextTick(() => child.emit('close', 0));
  };
  return child;
}

test('buildInvocation exposes only fixed syntax argv', () => {
  assert.deepEqual(buildInvocation({ profileId: 'node-cjs', executable: '/usr/bin/node' }), { executable: '/usr/bin/node', args: ['--input-type=commonjs', '--check', '-'] });
  assert.deepEqual(buildInvocation({ profileId: 'node-esm', executable: '/usr/bin/node' }).args, ['--input-type=module', '--check', '-']);
  const py = buildInvocation({ profileId: 'python-ast', executable: '/usr/bin/python3' });
  assert.deepEqual(py.args.slice(0, 4), ['-I', '-S', '-B', '-c']);
  assert.throws(() => buildInvocation({ profileId: 'shell', executable: '/bin/sh' }));
});

test('explicit .js is accepted for either Node mode, while cross-profile extensions skip', { skip: process.platform !== 'linux' }, async () => {
  assert.equal((await run({ profile: await profile('node-cjs'), snapshot: snapshot('chosen.js', ''), guard, isCurrent, assertLaunchAllowed })).status, process.platform === 'linux' ? 'passed' : 'skipped');
  assert.equal((await run({ profile: await profile('node-esm'), snapshot: snapshot('chosen.js', ''), guard, isCurrent, assertLaunchAllowed })).status, process.platform === 'linux' ? 'passed' : 'skipped');
  assert.equal((await run({ profile: await profile('node-cjs'), snapshot: snapshot('wrong.mjs', ''), guard, isCurrent, assertLaunchAllowed })).status, 'skipped');
  assert.equal((await run({ profile: await profile('node-esm'), snapshot: snapshot('wrong.cjs', ''), guard, isCurrent, assertLaunchAllowed })).status, 'skipped');
});

test('real Python AST check uses unsaved stdin and reports safe positions', { skip: process.platform !== 'linux' }, async () => {
  const bad = await run({ profile: await profile('python-ast'), snapshot: snapshot('src/bad.py', 'print(\"not source in feedback\"\n'), guard, isCurrent, assertLaunchAllowed });
  assert.equal(bad.status, 'failed');
  assert.equal(bad.diagnostics[0].message, 'Syntax error');
  assert.equal(JSON.stringify(bad).includes('not source'), false);
  const good = await run({ profile: await profile('python-ast'), snapshot: snapshot('src/good.py', 'x = 1\n'), guard, isCurrent, assertLaunchAllowed });
  assert.equal(good.status, 'passed');
});

test('real Node check reports generic syntax feedback and does not trust source-shaped stderr', { skip: process.platform !== 'linux' }, async () => {
  const result = await run({ profile: await profile('node-cjs'), snapshot: snapshot('src/bad.cjs', 'const canary = ;\n'), guard, isCurrent, assertLaunchAllowed });
  assert.equal(result.status, 'failed');
  assert.equal(result.diagnostics[0].message, 'Syntax error');
  assert.equal(JSON.stringify(result).includes('canary'), false);
});

test('invalid, unsupported, stale and pre-cancelled snapshots do not spawn', async () => {
  let calls = 0;
  const fake = () => { calls += 1; throw new Error('must not spawn'); };
  const unsupported = await mockRun({ profile: await profile('node-cjs'), snapshot: snapshot('a.ts', 'x'), guard, isCurrent }, { spawn: fake });
  assert.equal(unsupported.status, 'skipped');
  const mismatch = snapshot('a.cjs', 'ok'); mismatch.contentHash = '0'.repeat(64);
  assert.equal((await mockRun({ profile: await profile('node-cjs'), snapshot: mismatch, guard, isCurrent }, { spawn: fake })).reason, 'snapshot_hash_mismatch');
  const controller = new AbortController(); controller.abort();
  assert.equal((await mockRun({ profile: await profile('node-cjs'), snapshot: snapshot('a.cjs', 'ok'), signal: controller.signal, guard, isCurrent }, { spawn: fake })).status, 'cancelled');
  assert.equal(calls, 0);
  const stale = await mockRun({ profile: await profile('node-cjs'), snapshot: snapshot('a.cjs', 'ok'), guard, isCurrent: () => false });
  assert.equal(stale.status, 'stale');
});

test('combined output overflow is bounded, kills child, and returns no output text', async () => {
  let child;
  const mockSpawn = () => { child = mockChild({ onEnd: (c) => c.stderr.write('SECRET_SOURCE '.repeat(1000)) }); return child; };
  const result = await mockRun({ profile: await profile('node-cjs'), snapshot: snapshot('a.cjs', 'const secret = 1'), guard, isCurrent }, { spawn: mockSpawn });
  assert.equal(result.reason, 'output_limit_exceeded');
  assert.equal(JSON.stringify(result).includes('SECRET_SOURCE'), false);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 8 * 1024);
  assert.deepEqual(child.kills, ['SIGTERM']);
});

test('an async guard is serialized before either run can spawn', async () => {
  let release;
  let entered;
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  const guardPromise = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const first = mockRun({ profile: await profile('node-cjs'), snapshot: snapshot('a.cjs', ''), guard: () => { entered(); return guardPromise; }, isCurrent }, { spawn: () => { calls += 1; return mockChild(); } });
  await enteredPromise;
  const second = await mockRun({ profile: await profile('node-cjs'), snapshot: snapshot('b.cjs', ''), guard: async () => true, isCurrent }, { spawn: () => { calls += 1; return mockChild(); } });
  assert.equal(second.reason, 'runner_busy');
  release(undefined); // undefined from a void-returning host guard is approval
  assert.equal((await first).status, 'passed');
  assert.equal(calls, 1);
});

test('a guard rejected after pin closes the owned FD and prevents spawn', async () => {
  let closes = 0;
  let calls = 0;
  let guards = 0;
  const result = await mockRun({ profile: await profile('node-cjs'), snapshot: snapshot('a.cjs', ''),
    guard: async () => { guards += 1; if (guards === 2) throw new Error('revoked'); }, isCurrent }, {
    spawn: () => { calls += 1; return mockChild(); },
    pinExecutable: async () => ({ fd: 123, close: async () => { closes += 1; } }),
  });
  assert.equal(result.reason, 'profile_not_approved');
  assert.equal(calls, 0);
  assert.equal(closes, 1);
});

test('cancellation terminates the owned mock child and never signals its invented PID', async () => {
  let child;
  const controller = new AbortController();
  const pending = mockRun({ profile: await profile('node-cjs'), snapshot: snapshot('a.cjs', ''), signal: controller.signal, guard, isCurrent }, { spawn: () => {
    child = mockChild({ onEnd: () => setImmediate(() => controller.abort()) });
    child.kill = (signal) => { child.kills.push(signal); process.nextTick(() => child.emit('close', null)); return true; };
    return child;
  } });
  const result = await pending;
  assert.equal(result.status, 'cancelled');
  assert.deepEqual(child.kills, ['SIGTERM']);
});

test('timeout escalates TERM to KILL and returns without leaking output', async () => {
  let child;
  let groupPresent = true;
  const groupSignals = [];
  const result = await mockRun({ profile: await profile('node-cjs'), snapshot: snapshot('a.cjs', ''), guard, isCurrent }, {
    groupStatus: () => groupPresent ? 'present' : 'absent',
    signalGroup: (_pid, signal) => {
      groupSignals.push(signal);
      if (signal === 'SIGTERM') process.nextTick(() => child.emit('close', null)); // parent exits; group member remains
      if (signal === 'SIGKILL') groupPresent = false;
    },
    spawn: () => {
    child = mockChild({ closeOnKill: false, onEnd: () => {} });
    return child;
  } });
  assert.equal(result.status, 'timed_out');
  assert.deepEqual(groupSignals, ['SIGTERM', 'SIGKILL']);
  assert.equal(JSON.stringify(result).includes('SyntaxError'), false);
});

test('Node zero exit with unexpected output is a tool error', async () => {
  const result = await mockRun({ profile: await profile('node-cjs'), snapshot: snapshot('a.cjs', ''), guard, isCurrent }, { spawn: () => mockChild({ output: 'wrong tool echo' }) });
  assert.equal(result.reason, 'unexpected_node_output');
});

test('normal child close with leftover group is terminated before reporting', async () => {
  let groupPresent = true;
  const signals = [];
  const result = await mockRun({ profile: await profile('node-cjs'), snapshot: snapshot('a.cjs', ''), guard, isCurrent }, {
    groupStatus: () => groupPresent ? 'present' : 'absent',
    signalGroup: (_pid, signal) => { signals.push(signal); if (signal === 'SIGKILL') groupPresent = false; },
    spawn: () => mockChild(),
  });
  assert.equal(result.status, 'tool_error');
  assert.equal(result.reason, 'unexpected_process_group');
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
});

test('cancel, stale buffers and synchronous authority refusal after pin close FD without a spawn',async()=>{
  for(const scenario of ['cancel','stale','deny','promise']){
    const controller=new AbortController();let current=true,closes=0,spawns=0;
    const result=await mockRun({profile:await profile('node-cjs'),snapshot:snapshot('a.cjs',''),signal:controller.signal,guard,isCurrent:()=>current,
      assertLaunchAllowed:()=>scenario==='promise'?Promise.resolve():scenario==='deny'?false:undefined},{
      pinExecutable:async()=>{if(scenario==='cancel')controller.abort();if(scenario==='stale')current=false;return {fd:123,close:async()=>{closes++;}};},
      spawn:()=>{spawns++;return mockChild();}});
    assert.equal(spawns,0,scenario);assert.equal(closes,1,scenario);
    assert.ok(['cancelled','stale','tool_error'].includes(result.status),scenario);
  }
});

test('invalid host data is bounded and an unconfirmed child quarantines the runner', async () => {
  const oversized = { scopeKey: 'not-a-hash', path: 'p'.repeat(1000), version: Number.MAX_SAFE_INTEGER + 1, contentHash: 'x'.repeat(1000) };
  const invalid = await mockRun({ profile: await profile('node-cjs'), snapshot: oversized, guard, isCurrent });
  assert.ok(Buffer.byteLength(JSON.stringify(invalid)) <= 8 * 1024);
  let calls = 0;
  const stuck = await mockRun({ profile: await profile('node-cjs'), snapshot: snapshot('a.cjs', ''), guard, isCurrent }, { spawn: () => {
    calls += 1;
    const child = mockChild({ closeOnKill: false, onEnd: (c) => c.stderr.write('x'.repeat(9000)) });
    child.kill = (signal) => { child.kills.push(signal); return true; };
    return child;
  } });
  assert.equal(stuck.reason, 'termination_unconfirmed');
  const quarantined = await mockRun({ profile: await profile('node-cjs'), snapshot: snapshot('b.cjs', ''), guard, isCurrent }, { spawn: () => { calls += 1; return mockChild(); } });
  assert.equal(quarantined.reason, 'runner_quarantined');
  assert.equal(calls, 1);
});

test('an unknown process-group state quarantines even when the direct child closed',async()=>{
  const id=require.resolve('../lib/auto-lint'),cached=require.cache[id];delete require.cache[id];const fresh=require('../lib/auto-lint');require.cache[id]=cached;
  const signals=[];
  const result=await fresh.run({profile:await profile('node-cjs'),snapshot:snapshot('a.cjs',''),guard,isCurrent,assertLaunchAllowed},{
    spawn:()=>{const child=mockChild();process.nextTick(()=>child.emit('spawn'));return child;},
    pinExecutable:async()=>({fd:123,close:async()=>{}}),groupStatus:()=> 'unknown',signalGroup:(_pid,signal)=>{signals.push(signal);return false;}});
  assert.equal(result.reason,'termination_unconfirmed');assert.deepEqual(signals,['SIGTERM','SIGKILL']);
  let calls=0;const blocked=await fresh.run({profile:await profile('node-cjs'),snapshot:snapshot('b.cjs',''),guard,isCurrent,assertLaunchAllowed},{spawn:()=>{calls++;}});
  assert.equal(blocked.reason,'runner_quarantined');assert.equal(calls,0);
});

test('non-Linux runner refuses before authority checks or executable pinning',async()=>{
  const fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module'),module={exports:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../lib/auto-lint'),'utf8'),{require:createRequire(require.resolve('../lib/auto-lint')),module,exports:module.exports,process:{platform:'darwin'},Buffer});
  let calls=0;const result=await module.exports.run({profile:{profileId:'node-cjs'},guard:()=>{calls++;}},{spawn:()=>{calls++;},pinExecutable:()=>{calls++;}});
  assert.equal(result.status,'skipped');assert.equal(result.reason,'platform_not_supported');assert.equal(calls,0);
});
