import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { testEnvironment, runTestFiles } from './test-runner.mjs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

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
