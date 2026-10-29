'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createTools, autoCommand, cleanEnv } = require('../lib/local-tools');
const { autoWritePolicy } = require('../lib/modes');

test('privileged Extra is refused before commands, file tools, reviewer probes or confirmations; Full remains usable',async()=>{
 const root=await workspace();let confirms=0,reviews=0;
 const extra=createTools({root,allowShell:true,extraAccess:true,isPrivileged:()=>true,confirmRun:async()=>{confirms++;return true;},agentReview:{status:async()=>{reviews++;}}});
 for(const action of [{tool:'run_command',command:'printf denied'},{tool:'agent_capabilities'},{tool:'read_file',path:'a.txt'}])await assert.rejects(extra.execute(action),e=>e.code==='root_extra_access_refused' && e.stopAgent===true);
 assert.equal(confirms,0);assert.equal(reviews,0);
 const full=createTools({root,allowShell:true,isPrivileged:()=>true,confirmRun:async()=>true});const result=await full.execute({tool:'run_command',command:'printf FULL_STILL_SUPPORTED'});assert.equal(result.stdout,'FULL_STILL_SUPPORTED');
});
test('Full review dispatch requires its own grant; Plan denies even with that grant',async()=>{
 const root=await workspace();let probes=0,reviews=0;
 const reviewer={status:async()=>{probes++;return {ok:true};},review:async()=>{reviews++;return {ok:true,output:'advice'};}};
 const plain=createTools({root,allowShell:true,agentReview:reviewer});assert.equal((await plain.execute({tool:'agent_capabilities'})).review,false);assert.equal((await plain.execute({tool:'agent_review'})).reason,'account_review_grant_required');assert.equal(probes,0);
 const allowed=createTools({root,allowShell:true,agentReview:reviewer,reviewEnabled:true});const caps=await allowed.execute({tool:'agent_capabilities'});assert.equal(caps.review,true);assert.equal(caps.mode,'full');assert.equal(caps.host_shell,false);
 assert.equal((await allowed.execute({tool:'agent_review',agent:'codex',prompt:'Supplied source'})).ok,true);assert.equal(reviews,1);
 assert.equal((await allowed.execute({tool:'agent_review'},{planMode:true})).reason,'plan_mode');assert.equal((await allowed.execute({tool:'agent_capabilities'},{planMode:true})).review,false);assert.equal(reviews,1);
});

test('native code intelligence is read-only in Plan with explicit unavailable and guarded dispatch', async () => {
  const root = await workspace(), controller = new AbortController();
  const action = {tool:'code_intelligence',operation:'symbols',path:'source.js'};
  assert.equal((await createTools({root}).execute(action,{planMode:true})).reason,'code_intelligence_unavailable');
  let calls=0,guards=0;
  const tools=createTools({root,guard:async()=>{guards++;},codeIntelligence:async(actual,context)=>{
    calls++;assert.deepEqual(actual,action);assert.equal(context.signal,controller.signal);
    return {ok:true,results:[{path:'source.js',name:'value',line:1,column:1}]};
  }});
  assert.equal((await tools.execute(action,{planMode:true,signal:controller.signal})).results[0].name,'value');
  assert.equal(calls,1);assert.equal(guards,2);
  await assert.rejects(tools.execute({...action,command:'arbitrary.command'}),/Unknown code intelligence/);
  await assert.rejects(tools.execute({...action,operation:'rename'}),/Unknown code intelligence/);
  assert.equal(calls,1);
});

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
  await fs.mkdir(path.join(root,'.tvijo'));await fs.writeFile(path.join(root,'.tvijo','permissions.json'),'PRIVATE_RULES_CANARY\n');
  const tools=createTools({root,confirmRun:async()=>true,confirmWrite:async()=>true});
  for(const action of [{tool:'read_file',path:'.tvijo/permissions.json'},{tool:'search',path:'.tvijo/permissions.json',query:'PRIVATE'},{tool:'write_file',path:'.tvijo/permissions.json',content:'changed'}]){
    await assert.rejects(tools.execute(action),/excluded directory/);
  }
  assert.equal(await fs.readFile(path.join(root,'.tvijo','permissions.json'),'utf8'),'PRIVATE_RULES_CANARY\n');
});


test('Plan inspection accepts only fixed operations and cannot authorize writes or commands', async () => {
  const root = await workspace(); let effects = 0; const operations = [];
  const tools = createTools({root, confirmRun:async()=>{effects++;return true;},confirmWrite:async()=>{effects++;return true;},planInspect:async operation=>{operations.push(operation);return {operation,scope:'open dirty buffers',files:[]};}});
  for (const operation of ['pwd','buffer_status','buffer_diff_stat']) assert.equal((await tools.execute({tool:'plan_inspect',operation},{planMode:true})).ok,true);
  for (const action of [{tool:'plan_inspect',operation:'git status'},{tool:'plan_inspect',operation:'pwd',command:'echo bad'}]) await assert.rejects(tools.execute(action,{planMode:true}),/Unknown Plan/);
  for (const action of [{tool:'run_command',command:'echo forbidden'},{tool:'write_file',path:'source.js',content:'bad'},{tool:'replace_in_file',path:'source.js',old:'old',new:'bad'}]) assert.equal((await tools.execute(action,{planMode:true})).reason,'plan_mode');
  assert.equal(effects,0); assert.deepEqual(operations,['pwd','buffer_status','buffer_diff_stat']);
  assert.equal((await createTools({root}).execute({tool:'plan_inspect',operation:'pwd'},{planMode:true})).reason,'plan_inspection_unavailable');
});

test('Plan search treats regex syntax literally without invoking rg', async () => {
  const root = await workspace(); const bin = path.join(root,'owned-bin'); await fs.mkdir(bin);
  const marker=path.join(root,'rg-invoked'); await fs.writeFile(path.join(bin,'rg'),'#!/bin/sh\nprintf invoked > "'+marker+'"\n',{mode:0o700});
  await fs.writeFile(path.join(root,'literal.txt'),'bracket [ stays literal\n');
  const previous=process.env.PATH; process.env.PATH=bin;
  try {
    const result=await createTools({root}).execute({tool:'search',path:'literal.txt',query:'['},{planMode:true});
    assert.equal(result.mode,'literal'); assert.match(result.matches[0].text,/bracket/);
    await assert.rejects(fs.stat(marker),{code:'ENOENT'});
  } finally {process.env.PATH=previous;}
});


test('unique trailing whitespace replacement previews its exact span and requires approval',async()=>{
  const root=await workspace(),target=path.join(root,'source.js');
  const before='prefix\n  first \t\n  second  \nsuffix\n';await fs.writeFile(target,before);
  let approval;
  const tools=createTools({root,confirmWrite:async info=>{approval=info;return true;}});
  const result=await tools.execute({tool:'replace_in_file',path:'source.js',old:'  first\n  second',new:'  next\n  block',matchKind:'exact'});
  assert.equal(result.ok,true);assert.equal(approval.matchKind,'trailing_whitespace');
  assert.equal(approval.previous,before);assert.equal(approval.content,'prefix\n  next\n  block\nsuffix\n');
  assert.equal(autoWritePolicy(approval.operation,approval.previous,approval.matchKind),false);
  assert.equal(await fs.readFile(target,'utf8'),approval.content);
});

test('trailing fallback refusal, ambiguity and combined EOL drift preserve original bytes',async()=>{
  const root=await workspace(),target=path.join(root,'source.js');let approvals=0;
  const tools=createTools({root,confirmWrite:async()=>{approvals++;return false;}});
  await fs.writeFile(target,'a  \nb\t\n');
  assert.equal((await tools.execute({tool:'replace_in_file',path:'source.js',old:'a\nb\n',new:'x\n'})).refused,true);
  assert.equal(await fs.readFile(target,'utf8'),'a  \nb\t\n');assert.equal(approvals,1);
  const ambiguous='a \nb\n--\na\nb \n';await fs.writeFile(target,ambiguous);
  await assert.rejects(tools.execute({tool:'replace_in_file',path:'source.js',old:'a\nb\n',new:'x\n'}),/appears more than once/);
  assert.equal(await fs.readFile(target,'utf8'),ambiguous);assert.equal(approvals,1);
  const mixed='a \r\nb\r\n';await fs.writeFile(target,mixed);
  await assert.rejects(tools.execute({tool:'replace_in_file',path:'source.js',old:'a\nb\n',new:'x\n'}),/not found/);
  assert.equal(await fs.readFile(target,'utf8'),mixed);assert.equal(approvals,1);
});

test('exact match retains priority over other trailing-whitespace candidates',async()=>{
  const root=await workspace(),target=path.join(root,'source.js');let approval;
  await fs.writeFile(target,'one\ntwo\n--\none \ntwo\t\n');
  const tools=createTools({root,confirmWrite:async info=>{approval=info;return true;}});
  await tools.execute({tool:'replace_in_file',path:'source.js',old:'one\ntwo\n',new:'exact\n'});
  assert.equal(approval.matchKind,'exact');
  assert.equal(await fs.readFile(target,'utf8'),'exact\n--\none \ntwo\t\n');
});

test('indentation mismatch returns an exact bounded current block without any write side effects',async()=>{
  const root=await workspace(),target=path.join(root,'source.js');let effects=0;
  const before='head\r\n    if ready:\r\n        act() \t\r\ntail\r\n';await fs.writeFile(target,before);
  const tools=createTools({root,confirmWrite:async()=>{effects++;return true;},beforeWrite:()=>{effects++;},applyWrite:async()=>{effects++;}});
  const result=await tools.execute({tool:'replace_in_file',path:'source.js',old:'  if ready:\r\n    act()\r\n',new:'changed'});
  assert.equal(result.ok,false);assert.equal(result.reason,'indentation_mismatch');
  assert.deepEqual(result.hint,{text:'    if ready:\r\n        act() \t\r\n',startLine:2,endLine:3});
  assert.equal(effects,0);assert.equal(await fs.readFile(target,'utf8'),before);
});

test('trailing fallback still refuses changed files after confirmation and before checkpoint write',async()=>{
  const root=await workspace(),target=path.join(root,'source.js');let checkpoints=0;
  await fs.writeFile(target,'one \ntwo\n');
  const tools=createTools({root,confirmWrite:async()=>{await fs.writeFile(target,'USER_CHANGED');return true;},beforeWrite:()=>{checkpoints++;}});
  await assert.rejects(tools.execute({tool:'replace_in_file',path:'source.js',old:'one\ntwo\n',new:'changed\n'}),/File changed/);
  assert.equal(checkpoints,0);assert.equal(await fs.readFile(target,'utf8'),'USER_CHANGED');
});
