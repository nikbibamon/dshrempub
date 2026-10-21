'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createTools, autoCommand, cleanEnv } = require('../lib/local-tools');
const { autoWritePolicy } = require('../lib/modes');

async function workspace() {
  const parent = process.env.TVIJO_TEST_ARTIFACTS || os.tmpdir();
  const root = await fs.mkdtemp(path.join(parent,'slice2-tools-'));
  await fs.writeFile(path.join(root,'source.js'),'const old = 1;\n','utf8');
  return root;
}

test('tool dispatcher supplies trusted operation identity for write_file and unique replacement', async () => {
  const root=await workspace(), operations=[];
  const tools=createTools({root,confirmWrite:async info=>{operations.push(info);return false;}});
  const whole=await tools.execute({tool:'write_file',path:'source.js',content:'const next = 2;\n',operation:'replace_in_file'});
  const replacement=await tools.execute({tool:'replace_in_file',path:'source.js',old:'const old = 1;',new:'const next = 2;'});
  assert.equal(whole.refused,true); assert.equal(replacement.refused,true);
  assert.deepEqual(operations.map(item=>item.operation),['write_file','replace_in_file']);
  assert.equal(autoWritePolicy(operations[0].operation,operations[0].previous),false);
  assert.equal(autoWritePolicy(operations[1].operation,operations[1].previous,operations[1].matchKind),true);
  assert.equal(await fs.readFile(path.join(root,'source.js'),'utf8'),'const old = 1;\n');
});

test('blocked command never reaches approval or process spawn; Auto vectors stay exact', async () => {
  const root=await workspace(); let approvals=0;
  const tools=createTools({root,confirmRun:async()=>{approvals++;return true;}});
  await assert.rejects(tools.execute({tool:'run_command',command:'sudo echo blocked'}),/blocked by the local safety rules/);
  assert.equal(approvals,0);
  assert.deepEqual(['npm test','pnpm test','yarn test','go test ./...','cargo test'].map(autoCommand),[
    ['npm','test'],['pnpm','test'],['yarn','test'],['go','test','./...'],['cargo','test']
  ]);
  assert.equal(autoCommand('npm test -- --run'),null);
  for (const name of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','TVIJO_API_KEY']) assert.equal(Object.hasOwn(cleanEnv(),name),false);
});

test('approved command emits owned start and observed exit lifecycle events', async () => {
  const root=await workspace(), events=[];
  const tools=createTools({root,confirmRun:async()=>true,onCommandLifecycle:event=>events.push(event)});
  const result=await tools.execute({tool:'run_command',command:'node -e "process.stdout.write(\'bounded\')"'});
  assert.equal(result.ok,true);
  assert.equal(result.termination,'observed_exit');
  assert.deepEqual(events.map(event=>event.type),['start','exit']);
  assert.equal(events[0].status,'running');
  assert.equal(events[1].status,'completed');
  assert.ok(events[1].endedAt >= events[0].startedAt);
  assert.equal(typeof events[0].id,'string');
});

test('cancellation and timeout signal only the owned child and report exit evidence', async () => {
  const root=await workspace(), controller=new AbortController(), cancelledEvents=[];
  const cancelledTools=createTools({root,confirmRun:async()=>true,signal:controller.signal,onCommandLifecycle:event=>cancelledEvents.push(event)});
  const pending=cancelledTools.execute({tool:'run_command',command:'node -e "setTimeout(()=>{},30000)"'});
  await new Promise(resolve=>setTimeout(resolve,150)); controller.abort();
  const cancelled=await pending;
  assert.equal(cancelled.cancelled,true); assert.equal(cancelled.termination,'observed_exit');
  assert.deepEqual(cancelledEvents.map(event=>event.type),['start','cancel_requested','exit']);
  const timeoutEvents=[];
  const timeoutTools=createTools({root,confirmRun:async()=>true,onCommandLifecycle:event=>timeoutEvents.push(event)});
  const timed=await timeoutTools.execute({tool:'run_command',command:'node -e "setTimeout(()=>{},30000)"',timeout_ms:1000});
  assert.equal(timed.timedOut,true); assert.equal(timed.termination,'observed_exit');
  assert.deepEqual(timeoutEvents.map(event=>event.type),['start','timeout','exit']);
});

test('EOL fallback replaces only its mapped span and requires host-marked manual approval', async () => {
  const root=await workspace();
  const before='prefix\r\nfirst\r\nsecond\r\nsuffix\r\n';
  await fs.writeFile(path.join(root,'source.js'),before,'utf8');
  let approval;
  const tools=createTools({root,confirmWrite:async info=>{approval=info;return true;}});
  const result=await tools.execute({tool:'replace_in_file',path:'source.js',old:'first\nsecond',new:'new\nblock'});
  assert.equal(result.ok,true);
  assert.equal(approval.matchKind,'eol');
  assert.equal(autoWritePolicy(approval.operation,approval.previous,approval.matchKind),false);
  assert.equal(await fs.readFile(path.join(root,'source.js'),'utf8'),'prefix\r\nnew\nblock\r\nsuffix\r\n');
});

test('replacement refuses overlapping, ambiguous, and mixed-EOL fallback without changing bytes', async () => {
  const root=await workspace(); let approvals=0;
  const tools=createTools({root,confirmWrite:async()=>{approvals++;return true;}});
  const target=path.join(root,'source.js');
  await fs.writeFile(target,'aaaa','utf8');
  await assert.rejects(tools.execute({tool:'replace_in_file',path:'source.js',old:'aaa',new:'x'}),/appears 2 times/);
  await fs.writeFile(target,'a\r\nb\r\n--\r\na\r\nb\r\n','utf8');
  await assert.rejects(tools.execute({tool:'replace_in_file',path:'source.js',old:'a\nb',new:'x'}),/appears more than once/);
  await fs.writeFile(target,'a\r\nb\nc\n','utf8');
  await assert.rejects(tools.execute({tool:'replace_in_file',path:'source.js',old:'a\nb\nc',new:'x'}),/not found/);
  assert.equal(approvals,0);
  assert.equal(await fs.readFile(target,'utf8'),'a\r\nb\nc\n');
});

test('replacement refusal and checkpoint failure leave original content unchanged', async () => {
  const root=await workspace(), target=path.join(root,'source.js');
  const initial=await fs.readFile(target,'utf8');
  const refused=createTools({root,confirmWrite:async()=>false});
  const result=await refused.execute({tool:'replace_in_file',path:'source.js',old:'const old = 1;',new:'const next = 2;'});
  assert.equal(result.refused,true);
  const failed=createTools({root,confirmWrite:async()=>true,beforeWrite:()=>{throw new Error('checkpoint failed');}});
  await assert.rejects(failed.execute({tool:'replace_in_file',path:'source.js',old:'const old = 1;',new:'const next = 2;'}),/checkpoint failed/);
  assert.equal(await fs.readFile(target,'utf8'),initial);
});

test('EOL fallback accepts a complete final newline and preserves external bytes',async()=>{
  const root=await workspace(),target=path.join(root,'source.js');
  await fs.writeFile(target,'prefix\r\none\r\ntwo\r\nsuffix\r\n');
  let kind;
  const tools=createTools({root,confirmWrite:async info=>{kind=info.matchKind;return true;}});
  await tools.execute({tool:'replace_in_file',path:'source.js',old:'one\ntwo\n',new:'three\nfour\n'});
  assert.equal(kind,'eol');assert.equal(await fs.readFile(target,'utf8'),'prefix\r\nthree\nfour\nsuffix\r\n');
});

test('a same-byte inode replacement during approval never reaches Apply',async()=>{
  const root=await workspace(),target=path.join(root,'source.js'),original=await fs.readFile(target,'utf8');let applies=0;
  const tools=createTools({root,confirmWrite:async()=>{
    const replacement=path.join(root,'user-replacement.js');await fs.writeFile(replacement,original);await fs.rename(replacement,target);return true;
  },applyWrite:async()=>{applies++;}});
  await assert.rejects(tools.execute({tool:'replace_in_file',path:'source.js',old:'const old = 1;',new:'const next = 2;'}),/File changed/);
  assert.equal(applies,0);assert.equal(await fs.readFile(target,'utf8'),original);
});

test('a checkpoint-time user rewrite remains intact and prevents direct write',async()=>{
  const root=await workspace(),target=path.join(root,'source.js');
  const tools=createTools({root,confirmWrite:async()=>true,beforeWrite:async()=>{await fs.writeFile(target,'USER_CHANGED_DURING_CHECKPOINT');}});
  await assert.rejects(tools.execute({tool:'replace_in_file',path:'source.js',old:'const old = 1;',new:'const next = 2;'}),/File changed/);
  assert.equal(await fs.readFile(target,'utf8'),'USER_CHANGED_DURING_CHECKPOINT');
});

test('an exact no-op replacement creates no approval, checkpoint or Apply',async()=>{
  const root=await workspace();let effects=0;
  const tools=createTools({root,confirmWrite:async()=>{effects++;return true;},beforeWrite:()=>{effects++;},applyWrite:async()=>{effects++;}});
  const result=await tools.execute({tool:'replace_in_file',path:'source.js',old:'const old = 1;',new:'const old = 1;'});
  assert.equal(result.unchanged,true);assert.equal(effects,0);
});

test('private Tvijo configuration is unavailable through agent tools',async()=>{
  const root=await fs.mkdtemp(path.join(process.env.TVIJO_TEST_ARTIFACTS || os.tmpdir(),'tools-rules-denied-'));
  await fs.mkdir(path.join(root,'.tvijo'));await fs.writeFile(path.join(root,'.tvijo','rules.md'),'PRIVATE_RULES_CANARY\n');
  const tools=createTools({root,confirmRun:async()=>true,confirmWrite:async()=>true});
  for(const action of [{tool:'read_file',path:'.tvijo/rules.md'},{tool:'search',path:'.tvijo/rules.md',query:'PRIVATE'},{tool:'write_file',path:'.tvijo/rules.md',content:'changed'}]){
    await assert.rejects(tools.execute(action),/excluded directory/);
  }
  assert.equal(await fs.readFile(path.join(root,'.tvijo','rules.md'),'utf8'),'PRIVATE_RULES_CANARY\n');
});
