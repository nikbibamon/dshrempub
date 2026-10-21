'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { analyzeCommand, parseCommand } = require('../lib/command-policy');
const { createTools, cleanEnv, autoCommand } = require('../lib/local-tools');

async function workspace() {
  const parent = process.env.TVIJO_TEST_ARTIFACTS || os.tmpdir();
  return await fs.mkdtemp(path.join(parent, 'command-policy-'));
}

test('parser yields literal argv and immutable command decision', () => {
  const decision = analyzeCommand('printf "a > b"');
  assert.equal(decision.ok, true);
  assert.equal(decision.executable, 'printf');
  assert.deepEqual(decision.args, ['a > b']);
  assert.equal(Object.isFrozen(decision), true);
  assert.equal(Object.isFrozen(decision.args), true);
  for (const raw of ['echo a | cat', 'echo a > out', 'echo $(id)', 'echo "$(id)"', 'echo "$HOME"', 'A=b npm test', 'echo "unterminated', 'echo a\necho b', 'echo `id`']) {
    assert.equal(analyzeCommand(raw).ok, false, raw);
  }
});

test('hard denials cover quoted and absolute executables and git option positions before approval', async () => {
  const root = await workspace(); let approvals = 0;
  const tools = createTools({ root, confirmRun:async()=>{ approvals++; return true; } });
  const denied = ['sudo id', '"/bin/rm" -r -f /', '/usr/bin/git reset --hard', 'git -C . reset --hard', 'git --no-pager clean -fx', 'git checkout -- .', '/sbin/reboot', 'env OPENAI_API_KEY=x npm test', 'busybox sh -c id'];
  for (const command of denied) {
    assert.equal(analyzeCommand(command).denied, true, command);
    await assert.rejects(tools.execute({tool:'run_command', command}), /blocked by the local safety rules/, command);
  }
  assert.equal(approvals, 0);
});

test('Auto allowlist remains exactly the original five raw command vectors', () => {
  const vectors = ['npm test', 'pnpm test', 'yarn test', 'go test ./...', 'cargo test'];
  assert.deepEqual(vectors.map(autoCommand), [['npm','test'], ['pnpm','test'], ['yarn','test'], ['go','test','./...'], ['cargo','test']]);
  for (const command of [' npm test', 'npm  test', 'npm test -- --run', '"npm" test', '/usr/bin/npm test', 'env npm test']) assert.equal(autoCommand(command), null, command);
  assert.equal(analyzeCommand('npm test -- --run').auto, false);
  assert.equal(analyzeCommand(' npm test').auto, false);
  assert.equal(analyzeCommand('"npm" test').auto, false);
});

test('confirmation receives original raw command text for exact Auto classification', async () => {
  const root = await workspace(); let seen;
  const tools = createTools({ root, confirmRun:async info=>{ seen=info; return false; } });
  const result = await tools.execute({tool:'run_command', command:' npm test '});
  assert.equal(result.refused, true);
  assert.equal(seen.command, ' npm test ');
  assert.equal(seen.decision.auto, false);
});

test('accepted commands execute literal argv and clean environment', async () => {
  const root = await workspace(), decision=analyzeCommand('printf "literal > text"');
  const tools = createTools({ root, confirmRun:async info=>{ assert.equal(info.decision, decision); assert.equal(info.decision.auto, false); return true; } });
  const result = await tools.execute({tool:'run_command', command:'printf "literal > text"', commandDecision:decision});
  assert.equal(result.ok, true);
  assert.equal(result.stdout, 'literal > text');
  process.env.TV_TEST_PROVIDER_CANARY = 'do-not-forward';
  try {
    assert.equal(Object.hasOwn(cleanEnv(), 'TV_TEST_PROVIDER_CANARY'), false);
    for (const name of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','TVIJO_API_KEY']) assert.equal(Object.hasOwn(cleanEnv(), name), false);
  } finally { delete process.env.TV_TEST_PROVIDER_CANARY; }
});

test('quoted forwarding wrappers, filesystem tools and opaque git config never acquire permission',()=>{
  for(const raw of [
    '"/usr/bin/env" "sudo" "true"',
    'nice "/usr/bin/sudo" true',
    '"/sbin/mkfs.ext4" /dev/example',
    '"/bin/chmod" "777" "/"',
    'git -c "alias.wipe=!sudo true" wipe',
    'git --mystery-option status',
    '"/bin/rm" "--recursive" "--force" "//"'
  ]) assert.equal(analyzeCommand(raw).ok,false,raw);
});
