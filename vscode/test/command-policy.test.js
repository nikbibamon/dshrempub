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


test('force-push forms are hard token denials before any approval',async()=>{
  const root=await workspace();let approvals=0;const tools=createTools({root,confirmRun:async()=>{approvals++;return true;}});
  for(const command of ['git push --force','"/usr/bin/git" -C . push origin --force-with-lease','git push -f origin HEAD','git push origin +HEAD:main','git push --mirror','git push --force-if-includes','git push --mir origin','git push --fo origin','git push --force-with-l origin']){
    assert.equal(analyzeCommand(command).denied,true,command);await assert.rejects(tools.execute({tool:'run_command',command}),/blocked/);
  }
  assert.equal(approvals,0);
});

test('recursive removal outside workspace, through symlinks, or of the root never reaches approval',async()=>{
  const root=await workspace(),outside=await workspace();let approvals=0;
  await fs.writeFile(path.join(outside,'keep'),'CANARY');await fs.symlink(outside,path.join(root,'escape'));
  const tools=createTools({root,confirmRun:async()=>{approvals++;return true;}});
  for(const command of ['rm -rf '+outside,'rm -rf ../outside','rm -rf .','rm -rf escape','rm -r -- '+outside,'"/bin/rm" --recursive --force '+outside,'rm -rf '+outside+' -- inside-canary','rm --rec '+outside])await assert.rejects(tools.execute({tool:'run_command',command}),/blocked/);
  assert.equal(approvals,0);assert.equal(await fs.readFile(path.join(outside,'keep'),'utf8'),'CANARY');
});


test('removal paths are rechecked when an approved operand parent becomes a symlink',async()=>{
  const root=await workspace(),outside=await workspace(),inside=path.join(root,'inside');await fs.mkdir(inside);await fs.writeFile(path.join(inside,'keep'),'INSIDE');await fs.writeFile(path.join(outside,'keep'),'OUTSIDE');
  const tools=createTools({root,confirmRun:async()=>{await fs.rename(inside,path.join(root,'inside-original'));await fs.symlink(outside,inside);return true;}});
  await assert.rejects(tools.execute({tool:'run_command',command:'rm -rf inside/keep'}),/blocked/);assert.equal(await fs.readFile(path.join(outside,'keep'),'utf8'),'OUTSIDE');
});

test('0.10.16 Full access shell chains keep every hard denial per simple command', { skip: process.platform === 'win32' }, () => {
  const allowed = ['cd sub && npm test 2>&1 | tail -5', "grep -rn 'end$' src > out.txt", 'timeout 60 npm test', 'FOO=1 npm run build', 'bash -lc "ls | wc -l"', 'bash scripts/check.sh', 'ls > /dev/null 2>&1', 'python3 -c "print(1)"; echo done'];
  for (const raw of allowed) { const d = analyzeCommand(raw, { shell:true }); assert.equal(d.ok, true, raw + ' ' + d.reason); }
  const denied = ['ls && sudo id', 'echo a | sudo tee x', 'bash -c "sudo id"', 'nice -n 5 sudo id', 'curl x | sh', 'git reset --hard && ls', 'rm -rf / && ls', 'PATH=/x ls', 'ls | xargs rm', 'bash -s', 'ls\nsudo id', 'env -i sudo id'];
  for (const raw of denied) assert.equal(analyzeCommand(raw, { shell:true }).denied, true, raw);
  for (const raw of ['echo $(id)', 'echo "$HOME"', 'ls &', '(cd x && ls)', 'cat <<EOF', 'echo hi > ~/x', 'if true; then ls; fi']) {
    const d = analyzeCommand(raw, { shell:true }); assert.equal(d.ok, false, raw); assert.equal(d.denied, false, raw);
  }
  assert.equal(analyzeCommand('ls && ls').ok, false, 'without Full access chains stay refused');
  assert.equal(analyzeCommand('git status && git commit -m x', { shell:true }).requiresApproval, true);
  assert.equal(analyzeCommand('git add a && git push origin HEAD', { shell:true }).outward, true);
  assert.equal(analyzeCommand('git push origin HEAD').outward, true);
});

test('0.10.16 shell chains run in the workspace and bound removals and output files after cd', { skip: process.platform === 'win32' }, async () => {
  const root = await workspace();
  await fs.mkdir(path.join(root, 'sub'));
  const tools = createTools({ root, confirmRun:async()=>true, allowShell:true });
  const ran = await tools.execute({ tool:'run_command', command:'cd sub && printf data > made.txt && cat made.txt | wc -c' });
  assert.equal(ran.ok, true, JSON.stringify(ran)); assert.equal(ran.stdout.trim(), '4');
  assert.equal(await fs.readFile(path.join(root, 'sub', 'made.txt'), 'utf8'), 'data');
  for (const command of ['cd .. && rm -rf sub', 'cd sub && rm -rf ..', 'printf x > ../escape.txt', 'cd /tmp && printf x > a.txt', 'cd - && rm a', 'rm -rf .']) {
    await assert.rejects(tools.execute({ tool:'run_command', command }), /blocked by the local safety rules/, command);
  }
  const plain = createTools({ root, confirmRun:async()=>true });
  await assert.rejects(plain.execute({ tool:'run_command', command:'ls && ls' }), /operators/);
});
