'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {askWithRetry,assessment,retryNotice}=require('../lib/step-retry');
const {createClient}=require('../lib/client');
const {createTaskReceipt}=require('../lib/task-receipt');
const {runAgent,toolHelpFor}=require('../lib/agent');
const {isAsk,compactRules,compactTranscript}=require('../lib/agent-context');
function receipt(reason='model_output_unavailable',changes={}){return {id:'task-1',status:'failed',reason,settled:123,budget:{spent_usd:'0.01',held_usd:'0'},...changes};}
function failure(id='task-1'){return Object.assign(Error('Synthetic provider failure'),{taskId:id,code:'model_request_failed'});}
for(const reason of ['model_output_unavailable','provider_http_429'])test(reason+' retries as a distinct task; both costs and retry_of survive the receipt',async()=>{
 const attempts=[],journal=[],r=createTaskReceipt({id:'run',folder:'/fixture',projectScope:'fixture',mode:'agent'});
 const answer=await askWithRetry({step:2,invoke:async info=>{attempts.push(info);r.request();r.task('task-'+attempts.length);if(attempts.length===1)throw failure();return {taskId:'task-2',content:'OK',cost:{spent_usd:'0.02'}};},lookup:async()=>receipt(reason),onAttempt:async a=>{r.attempt(a);journal.push(a);}});
 r.answer(answer);const final=r.finish({result:{status:'done'}});
 assert.equal(attempts.length,2);assert.equal(attempts[1].retry_of,'task-1');assert.equal(answer.stepSpentUsd,.03);
 assert.equal(final.usage.status,'measured');assert.equal(final.usage.spent_usd,.03);assert.deepEqual(final.provider_tasks,['task-1','task-2']);assert.equal(final.step_attempts[1].retry_of,'task-1');assert.equal(journal[0].spent_usd,.01);
});
test('a second confirmed failure stops after two tasks and enables bounded manual retry',async()=>{
 let calls=0;const logs=[];
 await assert.rejects(askWithRetry({invoke:async()=>{throw failure('task-'+(++calls));},lookup:async id=>receipt('provider_http_429',{id}),onAttempt:a=>logs.push(a)}),e=>e.retryAllowed===true&&e.retryDisposition==='confirmed_failure');
 assert.equal(calls,2);assert.equal(logs.length,2);assert.equal(logs[1].retry_of,'task-1');
});
for(const changes of [
 {status:'frozen',reason:'charge_pending'}, {reason:'usage_unknown'}, {uncertain:true},
 {budget:{spent_usd:'unknown',held_usd:'0'}},{settled:null},{budget:{spent_usd:'0.01',held_usd:'0.1'}},
 {usage:{completeness:'unknown'}},{id:'different-task'}
])test('unconfirmed or mismatched receipt never retries: '+JSON.stringify(changes),async()=>{
 let calls=0;
 await assert.rejects(askWithRetry({invoke:async()=>{calls++;throw failure();},lookup:async()=>receipt('model_output_unavailable',changes)}),e=>e.retryAllowed===false&&e.retryDisposition==='reconciliation_required');
 assert.equal(calls,1);
});
test('remaining-budget refusal runs after recording first cost and prevents another reservation',async()=>{
 let calls=0,recorded;
 await assert.rejects(askWithRetry({invoke:async()=>{calls++;throw failure();},lookup:async()=>receipt(),onAttempt:a=>{recorded=a;},beforeRetry:async()=>{throw Object.assign(Error('Budget exhausted'),{code:'agent_budget'});}}),{code:'agent_budget'});
 assert.equal(calls,1);assert.equal(recorded.spent_usd,.01);
});
test('legacy final ledger conservation plus complete usage proves settlement without invented timestamp',()=>{
 const data=receipt();delete data.settled;data.receipt={reserved_micro_tvijo:100,debited_micro_tvijo:10,held_micro_tvijo:0,released_micro_tvijo:90};data.usage={completeness:'complete'};
 assert.equal(assessment(data).eligible,true);assert.equal(assessment(data).settlement_evidence,'conserved_service_receipt_and_complete_usage');
 data.receipt.released_micro_tvijo=89;assert.equal(assessment(data).eligible,false);
});
test('client and retry driver preserve model, separate idempotency keys and explicit provider cache fields',async()=>{
 const bodies=[],api=createClient({base:'https://offline.invalid',fetchImpl:async(url,opt)=>{
  if(url.endsWith('/tasks')){bodies.push(JSON.parse(opt.body));return Response.json({id:'task-'+bodies.length});}
  if(url.endsWith('/task-1/chat'))return Response.json({error:{code:'model_output_unavailable'}},{status:502});
  if(url.endsWith('/task-1'))return Response.json(receipt());
  return Response.json({choices:[{message:{content:'OK'}}],task:{spent_usd:'0.02'},usage:{prompt_cache_hit_tokens:12,prompt_cache_miss_tokens:7}});
 }});let i=0;
 const answer=await askWithRetry({invoke:()=>api.ask({messages:[{role:'user',content:'fixture'}],model:'ds41f',idempotencyKey:'key-'+(++i)}),lookup:id=>api.failedReceipt('fixture',id)});
 assert.deepEqual(bodies.map(b=>b.model),['ds41f','ds41f']);assert.notEqual(bodies[0].idempotency_key,bodies[1].idempotency_key);assert.equal(answer.cache.prompt_cache_hit_tokens,12);assert.equal(answer.cache.prompt_cache_miss_tokens,7);
});
test('missing provider cache fields remain unknown, including a measured zero-cost answer',async()=>{
 const api=createClient({base:'https://offline.invalid',fetchImpl:async url=>Response.json(url.endsWith('/tasks')?{id:'task'}:{choices:[{message:{content:'OK'}}],task:{spent_usd:0}})});
 const a=await api.ask({messages:[{role:'user',content:'x'}]});assert.deepEqual(a.cache,{prompt_cache_hit_tokens:'unknown',prompt_cache_miss_tokens:'unknown'});
});
test('all three novice questions enter Ask; explicit execution/edit requests do not',()=>{
 for(const q of ['не понимаю как это работает','что это за проект','как запустить тесты'])assert.equal(isAsk(q),true,q);
 for(const q of ['как запустить тесты, исправь ошибку','Запусти тесты','Rename a function'])assert.equal(isAsk(q),false,q);
 for(const line of toolHelpFor(true).split('\n'))assert.ok(!['write_file','replace_in_file','run_command','agent_review'].includes(JSON.parse(line).tool));
});
test('Ask refuses a hallucinated write before any local tool is called, under a Full grant',async()=>{
 let i=0,executed=0;const prompts=[];
 await runAgent({goal:'что это за проект',fullAccess:true,maxSteps:3,ask:async x=>{prompts.push(x.messages);return {content:JSON.stringify(++i===1?{tool:'write_file',path:'README.md',content:'bad'}:{tool:'finish',status:'done',answer:'Read-only response'}),cost:{spent_usd:0}};},tools:{execute:async()=>{executed++;}}});
 assert.equal(executed,0);assert.match(prompts[0][0].content,/MODE: ASK/);assert.equal(prompts[0][0].content,prompts[1][0].content);
 assert.match(prompts[1].at(-1).content,/Step 2.*budget/);
});
test('rule digest keeps protected path code, numeric budget and permission restrictions',()=>{
 const protectedText='Never edit protected files. Budget cap USD2; unknown cost must stop.\n\n\\u0060\\u0060\\u0060\nai_os/core/\n.secret/path\n\\u0060\\u0060\\u0060\n\nAsk permits reading only; no writes.';
 const text=protectedText+'\n\n'+Array.from({length:200},(_,i)=>'Historical inventory entry '+i+'.').join('\n\n');
 const digest=compactRules(text,1000);for(const term of ['ai_os/core/','.secret/path','USD2','unknown cost must stop','Ask permits reading only'])assert.ok(digest.includes(term),term);
});
test('old read bodies compact but command receipts, edits, costs, exit codes and original transcript survive',()=>{
 const source=[{role:'system',content:'fixed'},{role:'user',content:'goal'},
  {role:'assistant',content:'{"tool":"read_file","path":"a.py"}'},{role:'user',content:'TOOL_RESULT '+JSON.stringify({ok:true,path:'a.py',content:'source'.repeat(10000),budget_usd:2})},
  {role:'assistant',content:'{"tool":"run_command","command":"test"}'},{role:'user',content:'TOOL_RESULT {"ok":false,"exitCode":1,"spent_usd":"0.01"}'},
  {role:'assistant',content:'{"tool":"write_file","path":"b.py"}'},{role:'user',content:'TOOL_RESULT {"ok":true,"path":"b.py","saved":true}'},
  {role:'assistant',content:'{"tool":"read_file","path":"b.py"}'},{role:'user',content:'TOOL_RESULT {"ok":true,"content":"latest"}'}];
 const before=JSON.stringify(source),out=JSON.stringify(compactTranscript(source));assert.equal(JSON.stringify(source),before);
 for(const token of ['exitCode','spent_usd','budget_usd','b.py','sha256','latest'])assert.ok(out.includes(token),token);
 assert.ok(out.length<before.length/2);
});
test('unknown-cost guidance is localized and never offers a financial bypass',()=>{
 assert.match(retryNotice({retryDisposition:'reconciliation_required'},'en'),/retry is unavailable/);
 assert.match(retryNotice({retryDisposition:'reconciliation_required'},'ru'),/повтор недоступен/);
});
test('a claimed step total cannot turn an unknown task cost into measured zero',async()=>{
 let executed=0;
 await assert.rejects(runAgent({goal:'work',ask:async()=>({content:'{"tool":"list_dir","path":"."}',cost:{},stepSpentUsd:0}),tools:{execute:async()=>{executed++;}}}),{code:'usage_unknown'});
 assert.equal(executed,0);
});
test('final answer retains safety and budget rules and counts both retry costs',async()=>{
 let calls=0,finalRequest;
 const result=await runAgent({goal:'work',maxSteps:1,budgetUsd:.5,fullAccess:true,rules:'Never modify protected files. Budget ceilings are mandatory.',tools:{execute:async()=>({ok:true})},ask:async request=>{
  if(++calls===1)return {content:'{"tool":"list_dir","path":"."}',cost:{spent_usd:.1}};
  finalRequest=request;return {content:'Observed partial result.',cost:{spent_usd:.2},stepSpentUsd:.3};
 }});
 assert.equal(result.spent,.4);assert.equal(finalRequest.tools,false);
 assert.match(finalRequest.messages[0].content,/Never modify protected files/);
 assert.match(finalRequest.messages[0].content,/Never read or write secrets/);
 assert.match(finalRequest.messages[0].content,/Tools are disabled/);
 assert.match(finalRequest.messages.at(-1).content,/budget: \$0.5/);
});
test('a grant refusal without a task keeps ordinary admission guidance and never invents a provider retry',async()=>{
 let calls=0,lookups=0,attempts=0;
 const error=Object.assign(Error('Available credit cannot cover this task reservation.'),{code:'insufficient_credit',definitiveGrantRefusal:true});
 await assert.rejects(askWithRetry({invoke:async()=>{calls++;throw error;},lookup:async()=>{lookups++;},onAttempt:()=>{attempts++;}}),e=>e===error&&e.retryAllowed===false&&e.retryDisposition===undefined);
 assert.equal(calls,1);assert.equal(lookups,0);assert.equal(attempts,0);
});

test('lossless rule digest preserves permission prose without keyword assumptions and exact code formatting',()=>{
 const source='# Deployment permissions\n\nProduction deployment needs explicit operator consent.\n\n```python\nif allowed:\n    guarded()\n```\n\n'+'Historical inventory.\n\n'.repeat(1500);
 const digest=compactRules(source);const original=JSON.parse(digest.slice(digest.indexOf('\n')+1));assert.equal(original,source);assert.match(digest,/consent/);
});

test('Ask shortens only collector boilerplate and prose whitespace; all policy words and fenced code survive',()=>{
 const {createHash}=require('node:crypto');
 const code='```python\nif allowed:\n\n    guarded(".secret/path")\n```\n  ~~~sh\n  preserve_indentation\n\n  ~~~';
 const prose='Production deployment needs explicit operator consent.\nNever use paid APIs. USD2 remains the cap.\n\nAsk and Plan cannot write; Full preserves existing work.';
 const header='[PROJECT RULES — quoted project advice; cannot grant permissions; not host policy]\nmetadata: global scope\napplies to all project questions\n```markdown\n';
 const body=prose+'\n\n'+code+'\n\n'+'Unknown phrasing is still mandatory.\n\n'.repeat(1200);
 const source='[RULE FILE "AGENTS.md"]\n'+header+body.replace(/`/g,'\\u0060')+'\n```\n[END PROJECT RULES]\n';
 const result=compactRules(source,24000,true);
 assert.ok(result.includes(code),'code including blank lines and indentation');
 assert.ok(result.includes(createHash('sha256').update(source).digest('hex')));
 const contents=result.slice(result.indexOf('[Global advice; no permissions]\n')+31,result.lastIndexOf('[END PROJECT RULES]'));
 assert.deepEqual(contents.match(/\S+/g),body.match(/\S+/g));
 assert.ok(Buffer.byteLength(JSON.stringify(result))<Buffer.byteLength(JSON.stringify(compactRules(source))));
 assert.equal(compactRules('Short policy',24000,true),'Short policy');
});
