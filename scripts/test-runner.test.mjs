import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { testEnvironment, testBatches, runTestPlan, runTestFiles } from './test-runner.mjs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const parent = mkdtempSync(path.join(process.env.TVIJO_TEST_ARTIFACTS || tmpdir(), 'runner-check-'));

async function recordedPid(file) {
  const deadline = Date.now() + 5000;
  while (!existsSync(file) && Date.now() < deadline) await delay(20);
  const pid = Number(readFileSync(file, 'utf8'));
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  return pid;
}

async function assertStopped(pid) {
  const deadline = Date.now() + 3000;
  do {
    try {
      process.kill(pid, 0);
      // A killed orphan may await reaping by the container's init; it cannot run.
      if (process.platform === 'linux' && /\) Z /.test(readFileSync(`/proc/${pid}/stat`, 'utf8'))) return;
    } catch (error) {
      if (error.code === 'ESRCH' || error.code === 'ENOENT') return;
      throw error;
    }
    await delay(20);
  } while (Date.now() < deadline);
  assert.fail(`Owned test process ${pid} survived launcher cleanup`);
}

test('each invocation creates fresh owned artifact and fit directories without changing caller paths', () => {
  const sentinel = path.join(parent, 'preserve.txt');
  writeFileSync(sentinel, 'caller data');
  const source = { TVIJO_TEST_ARTIFACTS: parent, TMPDIR: parent, TVIJO_FIT_TEST_TMP: parent,
    TVijO_TEST_ARTIFACTS: parent, OPENAI_API_KEY: 'synthetic', ANTHROPIC_API_KEY: 'synthetic' };
  const a = testEnvironment(source), b = testEnvironment(source);
  assert.notEqual(a.TVIJO_TEST_ARTIFACTS, b.TVIJO_TEST_ARTIFACTS);
  assert.equal(path.dirname(a.TVIJO_TEST_ARTIFACTS), parent);
  assert.equal(a.TMPDIR, a.TVIJO_TEST_ARTIFACTS);
  assert.equal(path.dirname(a.TVIJO_FIT_TEST_TMP), a.TVIJO_TEST_ARTIFACTS);
  assert.ok(existsSync(a.TVIJO_FIT_TEST_TMP));
  assert.equal(a.OPENAI_API_KEY, undefined);
  assert.equal(a.ANTHROPIC_API_KEY, undefined);
  assert.equal(a.TVijO_TEST_ARTIFACTS, undefined);
  assert.equal(source.TVIJO_FIT_TEST_TMP, parent);
  assert.equal(readFileSync(sentinel, 'utf8'), 'caller data');
});

test('an invocation with no artifact variables creates absolute usable directories', () => {
  const env = testEnvironment({});
  assert.ok(path.isAbsolute(env.TVIJO_TEST_ARTIFACTS));
  assert.ok(existsSync(env.TMPDIR));
  assert.ok(existsSync(env.TVIJO_FIT_TEST_TMP));
});

test('child receives the isolated environment, test timeout and literal paths with spaces', async () => {
  const file = path.join(parent, 'passing fixture.test.mjs');
  writeFileSync(file, `import assert from 'node:assert/strict';
    import { existsSync } from 'node:fs';
    assert.equal(process.env.TMPDIR, process.env.TVIJO_TEST_ARTIFACTS);
    assert.ok(existsSync(process.env.TVIJO_FIT_TEST_TMP));
    assert.ok(process.execArgv.includes('--test-timeout=60000'));
    assert.equal(process.env.OPENAI_API_KEY, undefined);
  `);
  assert.equal(await runTestFiles({ cwd: parent, files: [file], env: testEnvironment(), stdio: 'ignore' }), 0);
});

test('only the exact extension aggregate gets 180 seconds, with every discovered file retained in order', () => {
  const directory = fileURLToPath(new URL('../vscode/test/', import.meta.url));
  const files = readdirSync(directory).filter(name => name.endsWith('.test.js')).sort().map(name => path.join('test', name));
  const batches = testBatches('vscode', [...files].reverse());
  assert.equal(batches.length, 3);
  assert.deepEqual(batches.map(batch => batch.testTimeoutMs), [60000, 180000, 60000]);
  assert.deepEqual(batches[1].files, [path.join('test', 'extension.test.js')]);
  assert.deepEqual(batches.flatMap(batch => batch.files), files);
  assert.equal(new Set(batches.flatMap(batch => batch.files)).size, files.length);
  for (const suite of ['scripts', '.']) assert.deepEqual(testBatches(suite, files), [{ files, testTimeoutMs: 60000 }]);
  const lookalikes = ['extension.test.js', path.join('nested', 'extension.test.js'), path.join('test', 'extension-extra.test.js')].sort();
  assert.deepEqual(testBatches('vscode', lookalikes), [{ files: lookalikes, testTimeoutMs: 60000 }]);
});

test('all 262 aggregate registrations keep an individual 60-second ceiling and existing options', () => {
  const filename = fileURLToPath(new URL('../vscode/test/extension.test.js', import.meta.url));
  const source = readFileSync(filename, 'utf8');
  const registered = [];
  const realRequire = createRequire(filename);
  const context = { require: name => name === 'node:test' ? (...args) => registered.push(args) : realRequire(name), __dirname: path.dirname(filename), __filename: filename, process, Buffer, setTimeout, clearTimeout, console };
  // Only registrations run; test callbacks are recorded, never replaced by a
  // claimed aggregate pass. The full aggregate is verified by the suite runner.
  vm.runInNewContext(source, context, { filename });
  assert.equal(registered.length, 262);
  assert(registered.every(([name, options, callback]) => typeof name === 'string' && options.timeout === 60000 && typeof callback === 'function'));
  const existing = registered.find(([name]) => name.startsWith('approved Python syntax checks'));
  assert.equal(existing[1].skip, process.platform !== 'linux' || !existsSync('/usr/bin/python3'));
  vm.runInNewContext("test('registration options', {skip:true, concurrency:1, timeout:20}, () => {}); test('capped options', {timeout:90000}, () => {});", context);
  assert.equal(registered[262][1].skip, true);
  assert.equal(registered[262][1].concurrency, 1);
  assert.equal(registered[262][1].timeout, 20);
  assert.equal(registered[263][1].timeout, 60000);
});

test('three real child batches receive their exact budgets, concurrency one and unfiltered inventory', async () => {
  const cwd = mkdtempSync(path.join(parent, 'batches-'));
  mkdirSync(path.join(cwd, 'test'));
  const files = ['before.test.js', 'extension.test.js', 'z-after.test.js'].map(name => path.join('test', name));
  for (const [index, file] of files.entries()) {
    writeFileSync(path.join(cwd, file), `const assert=require('node:assert/strict'),fs=require('node:fs');
      assert(process.execArgv.includes('--test-timeout=${index === 1 ? 180000 : 60000}'));
      assert(process.execArgv.includes('--test-concurrency=1'));
      assert(!process.execArgv.some(arg=>arg.startsWith('--test-name-pattern')));
      assert.equal(process.env.OPENAI_API_KEY,undefined);assert.equal(process.env.ANTHROPIC_API_KEY,undefined);
      fs.appendFileSync(${JSON.stringify(path.join(cwd, 'executed.jsonl'))},JSON.stringify(${JSON.stringify(file)})+'\\n');`);
  }
  const batches = testBatches('vscode', files).map(batch => ({ cwd, ...batch, stdio: 'ignore' }));
  const env = testEnvironment({ ...process.env, OPENAI_API_KEY: 'synthetic', ANTHROPIC_API_KEY: 'synthetic' });
  assert.equal(await runTestPlan({ batches, env, deadline: Date.now() + 10000 }), 0);
  assert.deepEqual(readFileSync(path.join(cwd, 'executed.jsonl'), 'utf8').trim().split('\n').map(JSON.parse), files);
});

test('one shared nine-minute deadline is consumed across batches, without resetting or hiding failures', async () => {
  const batches = testBatches('vscode', [path.join('test', 'before.test.js'), path.join('test', 'extension.test.js'), path.join('test', 'z.test.js')]);
  let clock = 1000;
  const remaining = [];
  const deadline = clock + 540000;
  assert.equal(await runTestPlan({ batches, env: {}, deadline, now: () => clock, run: async options => { remaining.push(options.timeoutMs); clock += 270000; return 0; } }), 124);
  assert.deepEqual(remaining, [540000, 270000]);
  for (const expected of [1, 124, 130, 143]) {
    let calls = 0;
    assert.equal(await runTestPlan({ batches, env: {}, deadline: 540000, now: () => 0, run: async () => { calls++; return expected; } }), expected);
    assert.equal(calls, 1);
  }
});

test('the aggregate registration wrapper enforces a stricter individual deadline in a real child', async () => {
  const source = readFileSync(new URL('../vscode/test/extension.test.js', import.meta.url), 'utf8');
  const wrapper = source.slice(0, source.indexOf("const assert = require('node:assert/strict');"));
  const file = path.join(parent, 'individual-deadline.test.cjs');
  writeFileSync(file, wrapper + "test('intentional timeout', {timeout:20}, async () => { await new Promise(resolve => setTimeout(resolve,200)); });\n");
  assert.equal(await runTestFiles({ cwd: parent, files: [file], env: testEnvironment(), testTimeoutMs: 180000, timeoutMs: 5000, stdio: 'ignore' }), 1);
});

test('failed tests fail the launcher', async () => {
  const file = path.join(parent, 'failure.test.mjs');
  writeFileSync(file, "import assert from 'node:assert/strict'; assert.fail('synthetic failure');");
  assert.equal(await runTestFiles({ cwd: parent, files: [file], env: testEnvironment(), stdio: 'ignore' }), 1);
});

test('a leaked handle is terminated at the wall-clock deadline', async () => {
  const file = path.join(parent, 'hanging.test.mjs');
  const pidFile = path.join(parent, 'hanging.pid');
  writeFileSync(file, `import { writeFileSync } from 'node:fs';
    writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
    process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);`);
  const start = Date.now();
  assert.equal(await runTestFiles({ cwd: parent, files: [file], env: testEnvironment(), timeoutMs: 1000, stdio: 'ignore' }), 124);
  assert.ok(Date.now() - start < 10000);
  await assertStopped(await recordedPid(pidFile));
});

test('success and early failure clean up owned descendants with no inherited pipes', { skip: process.platform === 'win32' }, async () => {
  for (const failed of [false, true]) {
    const file = path.join(parent, `descendant-${failed}.test.mjs`);
    const pidFile = path.join(parent, `descendant-${failed}.pid`);
    writeFileSync(file, `import { spawn } from 'node:child_process';
      import { writeFileSync } from 'node:fs';
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      await new Promise(resolve => child.once('spawn', resolve));
      writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
      child.unref(); ${failed ? "throw new Error('synthetic early failure');" : ''}`);
    assert.equal(await runTestFiles({ cwd: parent, files: [file], env: testEnvironment(), stdio: 'ignore' }), failed ? 1 : 0);
    await assertStopped(await recordedPid(pidFile));
  }
});

test('SIGINT and SIGTERM cancel the launcher and stop its owned suite', { skip: process.platform === 'win32' }, async () => {
  for (const [signal, expected] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    const file = path.join(parent, `${signal}.test.mjs`);
    const pidFile = path.join(parent, `${signal}.pid`);
    const harness = path.join(parent, `${signal}-launcher.mjs`);
    writeFileSync(file, `import { writeFileSync } from 'node:fs';
      process.on('SIGINT', () => {}); process.on('SIGTERM', () => {});
      writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
      setInterval(() => {}, 1000);`);
    writeFileSync(harness, `import { runTestFiles } from ${JSON.stringify(new URL('./test-runner.mjs', import.meta.url).href)};
      process.exitCode = await runTestFiles({ cwd: ${JSON.stringify(parent)},
        files: [${JSON.stringify(file)}], env: process.env, stdio: 'ignore' });`);
    const child = spawn(process.execPath, [harness], { env: testEnvironment(), stdio: 'ignore' });
    const closed = new Promise(resolve => child.once('close', (code, exitSignal) => resolve({ code, exitSignal })));
    const pid = await recordedPid(pidFile);
    child.kill(signal);
    assert.deepEqual(await closed, { code: expected, exitSignal: null });
    await assertStopped(pid);
  }
});
