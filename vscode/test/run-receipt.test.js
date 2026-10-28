'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createRunReceipt,priceOf,usageOf,projectChecks,compactReceipt,receiptText}=require('../lib/run-receipt');
const {createRunJournal}=require('../lib/run-journal');const {sidebar}=require('./helpers/sidebar');
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'receipt-'));return {root,engine:createRunReceipt({taskId:'receipt-fixture',baseCommit:'base-commit',root,sandboxMode:'root-namespaces',network:false})};}
test('Receipt uses gateway cost/tokens only; unknown prices and token counts stay null',()=>{
 for(const value of [undefined,null,'',false,-1,'invented',Infinity])assert.equal(priceOf({cost:{spent_usd:value}}),null);
 assert.equal(priceOf({content:'Cost is 0.00'}),null);assert.equal(priceOf({cost:{spent_usd:'0'}}),0);
 const {engine}=fixture();engine.recordGateway({taskId:'gateway-task',content:'cost $999, tokens 123',cost:{spent_usd:'0.012'},usage:{prompt_tokens:13,completion_tokens:7,total_tokens:20}});
 let r=engine.finish();assert.equal(r.metered_api_cost_usd,0.012);assert.deepEqual(r.tokens,{input_tokens:13,output_tokens:7,total_tokens:20});assert.equal(r.api_calls[0].task_id,'gateway-task');
 engine.recordGateway({cost:null,usage:null});r=engine.finish();assert.equal(r.metered_api_cost_usd,null);assert.equal(r.tokens.total_tokens,null);
 assert.deepEqual(usageOf({}),{input_tokens:null,output_tokens:null,total_tokens:null});
});
test('Subscription calls and advisory verdicts come from adapter receipts, with requested/served models and duration',()=>{
 const {engine}=fixture();engine.recordReview({id:'adapter-receipt',agent:'codex',requested_model:'gpt-6-astra',served_model:'unknown',started_at:'2026-10-28T00:00:00Z',ended_at:'2026-10-28T00:00:02Z',ok:true,output:'Supplied-evidence advice.'});
 const r=engine.finish();assert.deepEqual(r.subscription_calls,[{agent:'codex',requested_model:'gpt-6-astra',served_model:'unknown',duration_ms:2000,outcome:'completed',receipt_id:'adapter-receipt'}]);assert.equal(r.reviewer_verdicts[0].trust,'untrusted_advisory');assert.equal(r.metered_api_cost_usd,null);
});
test('Run journal has a durable receipt entry and a separate scoped JSON, including all required fields',()=>{
 const {root,engine}=fixture(),scope='a'.repeat(64),journal=createRunJournal(root),r=engine.finish('unverified','no_checks_defined');
 journal.begin(scope,{id:r.task_id,kind:'agent',prompt:'fixture',historyScope:scope});journal.receipt(scope,r.task_id,r);journal.finish(scope,r.task_id);
 const restored=createRunJournal(root);assert.deepEqual(restored.getReceipt(scope,r.task_id),r);assert.equal(restored.get(scope,r.task_id).events.at(-1).type,'receipt');assert.equal(restored.getReceipt('b'.repeat(64),r.task_id),null);assert.deepEqual(restored.list(scope).notes,[]);
 for(const key of ['task_id','base_commit','base_tree_hash','final_tree_hash','files_changed','checks','final_status','metered_api_cost_usd','tokens','subscription_calls','reviewer_verdicts','sandbox_mode','network','duration_ms'])assert.ok(Object.hasOwn(r,key),key);
 assert.throws(()=>restored.getReceipt(scope,'../../outside'));
});
test('Project check definition is pinned from the initial manifest, never a model-supplied command',()=>{
 const {root}=fixture();assert.deepEqual(projectChecks(root),[]);fs.writeFileSync(path.join(root,'package.json'),'{"scripts":{"test":"node --test"}}');assert.deepEqual(projectChecks(root),['npm test']);assert.deepEqual(projectChecks(root,['python3 -m unittest']),['python3 -m unittest']);
});
test('Compact receipt EN/RU displays unknown cost and the scoped copy button',()=>{
 const {engine}=fixture(),r=compactReceipt(engine.finish('unverified','no_checks_defined'));
 for(const locale of ['en','ru']) {
  assert.match(receiptText(r,locale),/unverified/);assert.ok(!receiptText(r,locale).includes('$0.000000'));
  const view=sidebar({locale},{messages:[{role:'assistant',content:'Finished',receipt:r,extraTaskId:r.task_id}]});
  const copy=view.created.find(n=>n.textContent===(locale==='ru'?'Копировать квитанцию':'Copy receipt'));assert.ok(copy);copy.click();
  const msg=view.outgoing.at(-1);assert.equal(msg.type,'copyRunReceipt');assert.equal(msg.id,r.task_id);assert.equal(msg.scopeKey,'tenant-a');
 }
});

test('Engine hashes hidden task config writes even though the source-copy filter excludes them',()=>{
 const {root,engine}=fixture(),before=engine.capture();fs.writeFileSync(path.join(root,'.npmrc'),'audit=false');
 engine.recordAction({tool:'run_command',command:'fixture command writes config'},{ok:true,exitCode:0},before);
 const receipt=engine.finish();assert.deepEqual(receipt.files_changed,['.npmrc']);assert.notEqual(receipt.base_tree_hash,receipt.final_tree_hash);assert.deepEqual(receipt.writes[0].files,['.npmrc']);
});
