'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {measuredCost,createTaskReceipt,formatReceipt,outcomeOf}=require('../lib/task-receipt');
const fixture=()=>createTaskReceipt({id:'run-1',projectScope:'a'.repeat(64),projectId:'project-1',folder:'/work/customer',mode:'full',model:'ds41f',startedAt:1});

test('unknown billing is never synthesized as zero; explicit measured zero remains valid',()=>{
 for(const value of [undefined,null,'',false,{},-1,NaN,Infinity,'NaN','.01','1e-3'])assert.equal(measuredCost({cost:{spent_usd:value}}),null);
 assert.equal(measuredCost({}),null);assert.equal(measuredCost({cost:{spent_usd:'0'}}),0);assert.equal(measuredCost({cost:{budget:{spent_usd:'0.012'}}}),0.012);
});
test('receipt preserves real exits and file-tool edits but never turns a model claim into verification',()=>{
 const r=fixture();r.request();r.task('provider-1','served-model');r.answer({taskId:'provider-1',cost:{spent_usd:'0.01'}});
 r.event({type:'result',step:1,action:{tool:'replace_in_file',path:'app.js'},result:{ok:true,path:'app.js',saved:true,lint_feedback:'syntax passed for version 2'}});
 r.event({type:'result',step:2,action:{tool:'run_command',command:'node --test app.test.js'},result:{ok:false,exitCode:1,cwd:'/work/customer'}});
 const value=r.finish({result:{status:'done',reason:'finish',steps:3},endedAt:4});
 assert.equal(value.execution.outcome,'done');assert.equal(value.verification.status,'not_independently_verified');
 assert.equal(value.verification.commands[0].exit_code,1);assert.equal(value.verification.commands[0].ok,false);
 assert.equal(value.verification.edits[0].path,'app.js');assert.equal(value.verification.editor_checks.length,1);
 assert.equal(value.usage.spent_usd,0.01);assert.equal(value.usage.status,'measured');assert.deepEqual(value.provider_tasks,['provider-1']);
 assert.deepEqual(value.models.granted,['served-model']);assert.deepEqual(value.models.reported_served,[],'a grant alias cannot prove the served model');
 assert.match(formatReceipt(value),/not independent verification/);assert.match(formatReceipt(value),/exit 1/);
});
test('lost grant response, missing cost and cancellation retain unknown versus measured costs separately',()=>{
 const r=fixture();r.request();r.task('first');r.answer({taskId:'first',cost:{spent_usd:0.2}});r.request();
 let receipt=r.finish({cancelled:true,error:{code:'connection_lost'}});
 assert.equal(receipt.execution.outcome,'cancelled');assert.equal(receipt.usage.spent_usd,null);assert.equal(receipt.usage.known_spent_usd,0.2);assert.equal(receipt.usage.status,'unknown');
 r.answer({taskId:'second'});receipt=r.finish({error:{code:'usage_unknown'}});assert.equal(receipt.usage.status,'unknown');assert.match(formatReceipt(receipt),/unknown; measured \$0.200000/);
});
test('blocked and partial outcomes preserve external prerequisites; no tools means no observed command receipt',()=>{
 const value=fixture().finish({result:{status:'blocked',reason:'finish',remainingOperatorSteps:['Configure DNS with owner account']}});
 assert.equal(value.execution.outcome,'blocked');assert.equal(value.usage.status,'no_provider_calls');
 assert.match(formatReceipt(value),/Remaining external steps: Configure DNS/);assert.match(formatReceipt(value),/No run_command/);
 assert.equal(outcomeOf({status:'done',partial:true}),'partial');assert.equal(outcomeOf({reason:'answer'}),'partial');
});
test('maximum provider identifiers and command history fit the durable receipt cap and declare truncation',()=>{
 const r=fixture();for(let n=0;n<201;n++){r.task(String(n)+'x'.repeat(250));r.event({type:'result',step:n,action:{tool:'run_command',command:'a'.repeat(4000)},result:{ok:true,cwd:'b'.repeat(4000),exitCode:0}});}
 const value=r.finish({result:{status:'blocked'}});assert.ok(Buffer.byteLength(JSON.stringify(value))<=60000);assert.equal(value.verification.truncated,true);
});
