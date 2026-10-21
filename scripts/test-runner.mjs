#!/usr/bin/env node
// Shared, dependency-free test entry point. Fixtures are retained for inspection.
import { mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const suiteTimeoutMs = 9 * 60 * 1000;

export function testEnvironment(source = process.env) {
  const parent = path.resolve(source.TVIJO_TEST_ARTIFACTS || tmpdir());
  mkdirSync(parent, { recursive: true });
  const artifacts = mkdtempSync(path.join(parent, 'tvijo-test-'));
  const fit = path.join(artifacts, 'fit');
  mkdirSync(fit);
  const env = { ...source, TVIJO_TEST_ARTIFACTS: artifacts, TMPDIR: artifacts, TVIJO_FIT_TEST_TMP: fit };
  // Do not forward subscription/API credentials or the legacy mixed-case override.
  delete env.OPENAI_API_KEY;
  delete env.ANTHROPIC_API_KEY;
  delete env.TVijO_TEST_ARTIFACTS;
  // A launcher check may itself be running under node:test; its children are new suites.
  delete env.NODE_TEST_CONTEXT;
  return env;
}

export function runTestFiles({ cwd, files, env, timeoutMs = suiteTimeoutMs, stdio = 'inherit' }) {
  return new Promise((resolve) => {
    const grouped = process.platform !== 'win32';
    const child = spawn(process.execPath, ['--test', '--test-timeout=60000', '--test-concurrency=1', ...files], {
      cwd, env, stdio, shell: false, detached: grouped,
    });
    let timedOut = false;
    let interruptedCode;
    let escalation;
    let finished = false;
    function signalChild(signal) {
      try {
        if (grouped && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    function terminate(signal) {
      signalChild(signal);
      if (!escalation) escalation = setTimeout(() => signalChild('SIGKILL'), 1000);
    }
    const onInterrupt = () => { interruptedCode = 130; terminate('SIGINT'); };
    const onTerminate = () => { interruptedCode = 143; terminate('SIGTERM'); };
    process.on('SIGINT', onInterrupt);
    process.on('SIGTERM', onTerminate);
    // A test timeout alone cannot bound a leaked handle in the test runner itself.
    const timer = setTimeout(() => {
      timedOut = true;
      console.error('Test suite exceeded its wall-clock deadline.');
      terminate('SIGTERM');
    }, timeoutMs);
    function finish(code) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(escalation);
      process.removeListener('SIGINT', onInterrupt);
      process.removeListener('SIGTERM', onTerminate);
      // On every exit, stop any remaining members of our owned process group.
      // The runner can finish before a descendant that ignores TERM or inherits no pipes.
      if (grouped) signalChild('SIGKILL');
      resolve(interruptedCode ?? (timedOut ? 124 : code));
    }
    child.once('error', (error) => { console.error(error.message); finish(1); });
    child.once('close', (code) => finish(code ?? 1));
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--extension')) {
    throw new Error('Usage: node scripts/test-runner.mjs [--extension]');
  }
  const env = testEnvironment();
  console.log(`Test artifacts: ${env.TVIJO_TEST_ARTIFACTS}`);
  const suites = args[0] === '--extension' ? ['vscode'] : ['scripts', '.', 'vscode'];
  const deadline = Date.now() + suiteTimeoutMs;
  for (const suite of suites) {
    const cwd = path.join(repoRoot, suite);
    const files = suite === 'scripts' ? ['test-runner.test.mjs'] : readdirSync(path.join(cwd, 'test'))
      .filter(name => name.endsWith(suite === 'vscode' ? '.test.js' : '.test.mjs'))
      .sort().map(name => path.join('test', name));
    if (files.length === 0) throw new Error(`No tests found in ${suite}`);
    const remaining = deadline - Date.now();
    const code = remaining <= 0 ? 124 : await runTestFiles({ cwd, files, env, timeoutMs: remaining });
    if (code !== 0) { process.exitCode = code; return; }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
