'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createTaskBudget}=require('../lib/task-limits');
const {runAgent}=require('../lib/agent');
test('budget offers exact additions at 80%, keeps prior spend and never persists a raise',async()=>{
 const b=createTaskBudget(2);let prompts=0;
 await b.beforeStep(1.59,()=>{prompts++;});assert.equal(prompts,0);
 await b.beforeStep(1.6,({additions})=>{prompts++;assert.deepEqual(additions,[2,5,10]);return 5;});
 assert.equal(b.ceiling,7);assert.equal(b.remaining(1.6),5.4);assert.equal(createTaskBudget(2).ceiling,2);
});
test('decline prompts once, stops exhausted runs, rejects unknown costs and forged additions',async()=>{
 const b=createTaskBudget(2);let prompts=0;const choose=()=>{prompts++;return 999;};
 await b.beforeStep(1.8,choose);await b.beforeStep(1.9,choose);assert.equal(prompts,1);
 await assert.rejects(b.beforeStep(2,choose),{code:'agent_budget'});assert.equal(b.ceiling,2);
 await assert.rejects(b.beforeStep(NaN,choose));
 const c=createTaskBudget(2);let calls=0;await assert.rejects(c.beforeStep(1.8,()=>10,async()=>{if(++calls===2)throw Error('cancelled');}),/cancelled/);assert.equal(c.ceiling,2);
});
test('step continuation retains context and spend; decline summarizes without tools',async()=>{
 let n=0;const r=await runAgent({goal:'work',maxSteps:1,budgetUsd:2,tools:{execute:async()=>({ok:true})},requestMoreSteps:async state=>{assert.equal(state.steps,1);return 30;},ask:async()=>({content:++n===1?'{"tool":"read_file","path":"x"}':'{"tool":"finish","status":"done","answer":"Done"}',cost:{spent_usd:0.1}})});
 assert.equal(r.steps,2);assert.equal(r.spent,0.2);
 let finalized=false;const stopped=await runAgent({goal:'work',maxSteps:1,tools:{execute:async()=>({ok:true})},requestMoreSteps:async()=>0,ask:async({finalization,tools})=>{if(finalization){finalized=true;assert.equal(tools,false);}return {content:finalization?'Partial':'{"tool":"read_file","path":"x"}',cost:{spent_usd:0.01}};}});
 assert.equal(stopped.reason,'step_limit');assert.ok(finalized);
});
test('approved budget reaches agent accounting without resetting cumulative spending',async()=>{
 const budget=createTaskBudget(2);let n=0;
 const r=await runAgent({goal:'work',maxSteps:4,getBudget:()=>budget.ceiling,tools:{execute:async()=>({ok:true})},ask:async()=>{await budget.beforeStep(n*0.9,()=>2);return {content:++n===4?'{"tool":"finish","status":"done","answer":"done"}':'{"tool":"read_file","path":"x"}',cost:{spent_usd:0.9}};}});
 assert.equal(budget.ceiling,4);assert.equal(r.spent,3.6);
});

test('continued step allowance reaches the next system prompt without changing the goal',async()=>{
 let count=0;await runAgent({goal:'keep this goal',maxSteps:1,requestMoreSteps:async()=>30,tools:{execute:async()=>({ok:true})},ask:async({messages})=>{
 count++;assert.match(messages[0].content,count===1?/Step 1 of at most 1/:/Step 2 of at most 31/);assert.equal(messages[1].content,'keep this goal');
 return {content:count===1?' {"tool":"list_dir","path":"."}':'{"tool":"finish","answer":"done"}',cost:{spent_usd:0}};
 }});
});
