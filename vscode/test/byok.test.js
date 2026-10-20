'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const byok = require('../lib/byok');
const {workspaceClient} = require('../workspace');
const {taskStateOf,pendingBlocks,formatAnswer}=require('../lib/client');
const {codingClient} = require('../lib/coding');
const choice = {id:'connection-a',epoch:1,max_provider_usd:'0.01'};
const quote = () => ({quote_id:'quote-a',service_id:'standard',project_id:'project-a',thread_id:'thread-a',tariff_version:'byok-v1',ceiling_micro_tvijo:1000,estimated_max_micro_tvijo:1000,expires_at:Date.now()/1000+60,billing_mode:'byok',connection_id:'connection-a',connection_epoch:1,managed_fallback:false,provider_bill_payer:'customer_provider_account',service_fee_micro_tvijo:1000,provider_max_usd:'0.01'});
test('BYOK payer, epoch, exact service fee and provider ceiling cannot change in a quote',()=>{
  assert.equal(byok.validateQuote(quote(),choice).billing_mode,'byok');
  for (const change of [{billing_mode:'managed'},{connection_id:'foreign'},{connection_epoch:2},{managed_fallback:true},{provider_bill_payer:'platform'},{service_fee_micro_tvijo:0},{ceiling_micro_tvijo:1001},{provider_max_usd:'1'}]) assert.throws(()=>byok.validateQuote({...quote(),...change},choice));
  assert.throws(()=>byok.validateQuote(quote(),null));
});
test('provider ceilings reject NaN, negative, exponent, whitespace and excessive exposure',()=>{
  for(const value of ['NaN','Infinity','-1','1e-2',' 0.01','0','10.000000001',true,null,1]) assert.throws(()=>byok.providerCap(value));
  assert.equal(byok.providerCap('0.01'),'0.01');
});
test('connection selection is bound to exact account credential, auth epoch, API service and project',()=>{
  const state=byok.createSelection(),auth={api_base:'https://dsh.tvijo.com/api/dshrem/v1',scope:'scope-a',authEpoch:1,access_token:'synthetic'};
  state.select(auth,'project-a',choice); assert.deepEqual(state.get(auth,'project-a'),choice);
  for(const next of [{...auth,authEpoch:2},{...auth,scope:'scope-b'},{...auth,api_base:'https://other.invalid'},{...auth,access_token:'new'}]) assert.equal(state.get(next,'project-a'),null);
  assert.equal(state.get(auth,'project-b'),null); state.clear(); assert.equal(state.get(auth,'project-a'),null);
});
test('post-confirmation connection must still be validated, same project/epoch, unrevoked and no fallback',()=>{
  const c={...choice,project_id:'project-a',execution_available:true,managed_fallback:false,provider_bill_payer:'customer_provider_account',max_task_provider_usd:'0.01'};
  byok.validateConnection({connections:[c]},choice,'project-a');
  for(const change of [{execution_available:false},{revoked_at:1},{epoch:2},{project_id:'other'},{max_task_provider_usd:'0.001'},{managed_fallback:true},{provider_bill_payer:'platform'}]) assert.throws(()=>byok.validateConnection({connections:[{...c,...change}]},choice,'project-a'));
});
test('checkout navigation rejects credentialed, non-HTTPS, lookalike and unrelated hosts',()=>{
  assert.equal(byok.checkoutUrl('https://checkout.stripe.com/c/pay/cs_test_fixture'),'https://checkout.stripe.com/c/pay/cs_test_fixture');
  for(const url of ['http://checkout.stripe.com/c/pay/x','https://checkout.stripe.com.evil.invalid/c/x','https://user:secret@checkout.stripe.com/c/x','https://checkout.stripe.com:444/c/x','https://evil.invalid/c/x','javascript:alert(1)','https://checkout.stripe.com/other']) assert.throws(()=>byok.checkoutUrl(url));
});
const requestArgs = {messages:[{role:'user',content:'fixture'}],idempotencyKey:'request-a',projectId:'project-a',threadId:'thread-a',maxMicroTvijo:50000000,title:'fixture',payer:choice};
test('BYOK service uses exactly one quote/reserve/request and returns separate payer receipt',async()=>{
  const calls=[]; const api={request:async(path,options)=>{calls.push({path,body:options.body});if(path==='/services/quote')return quote();if(path==='/tasks')return{id:'task-a'};return{choices:[{message:{content:'fixture answer'}}],receipt:{debited_micro_tvijo:1000,held_micro_tvijo:0},byok:{provider_cost_status:'estimated'}};}};
  const result=await workspaceClient(api,'synthetic').askService(requestArgs);
  assert.deepEqual(calls.map(c=>c.path),['/services/quote','/tasks','/tasks/task-a/chat']);
  assert.equal(calls[0].body.billing_mode,'byok');assert.equal(calls[0].body.managed_fallback,false);assert.equal(calls[0].body.max_provider_usd,'0.01');assert.equal(result.receipt.debited_micro_tvijo,1000);
});
test('BYOK stale payer quote refuses before reservation; caller cannot downgrade to Managed',async()=>{
  const calls=[];const api={request:async(path)=>{calls.push(path);return{...quote(),billing_mode:'managed'};}};
  await assert.rejects(workspaceClient(api,'synthetic').askService(requestArgs));assert.deepEqual(calls,['/services/quote']);
});
test('BYOK caller revocation after quote blocks grant and causes no fallback',async()=>{
  const calls=[];const api={request:async(path)=>{calls.push(path);return quote();}};
  await assert.rejects(workspaceClient(api,'synthetic').askService({...requestArgs,onQuote:async()=>{throw Error('revoked');}}));assert.deepEqual(calls,['/services/quote']);
});
for(const failure of ['unauthorized','rate_limited','timeout','unknown_charge']) test('BYOK '+failure+' after dispatch never retries or requests a Managed grant',async()=>{
  const calls=[]; const api={request:async(path)=>{calls.push(path);if(path==='/services/quote')return quote();if(path==='/tasks')return{id:'task-a'};throw Error(failure);}};
  await assert.rejects(workspaceClient(api,'synthetic').askService(requestArgs));assert.deepEqual(calls,['/services/quote','/tasks','/tasks/task-a/chat']);
});
test('BYOK multi coding mode refuses before even uploading customer code',async()=>{
  const calls=[];const api={request:async(path)=>{calls.push(path);throw Error('must not request');}};
  await assert.rejects(codingClient(api,'synthetic').run({payer:choice,workflow:'swarm',guard:async()=>{},snapshot:{files:[]}}));assert.deepEqual(calls,[]);
});
test('unknown customer-provider charge stays blocking even if Tvijo fee hold is zero',()=>{
 assert.equal(pendingBlocks(taskStateOf({status:'completed',receipt:{held_micro_tvijo:0},byok:{provider_cost_status:'unknown'}})),true);
 assert.equal(pendingBlocks(taskStateOf({status:'completed',receipt:{held_micro_tvijo:0},byok:{provider_cost_status:'estimated'}})),false);
});
test('provider estimate receipt is whitelisted and displayed separately from service TT',()=>{
 const receipt=byok.publicReceipt({provider_cost_usd:'0.001',provider_cost_status:'estimated',provider_cost_source:'usage.estimated_cost',api_key:'secret-fixture',internal:'private'});
 assert.equal(receipt.api_key,undefined);assert.equal(receipt.internal,undefined);
 const text=formatAnswer({question:'fixture',answer:{content:'answer',taskId:'task',evidence:[],receipt:{debited_micro_tvijo:1000,held_micro_tvijo:0},byok:receipt}});
 assert.match(text,/0.001 Tvijo Tokens/);assert.match(text,/Provider expense USD 0.001/);assert.match(text,/estimated, not a provider invoice/);assert.doesNotMatch(text,/secret-fixture/);
 const unknown=byok.publicReceipt({provider_cost_usd:'0',provider_cost_status:'unknown'});assert.equal(unknown.provider_cost_usd,null);
});
test('payer switch while post-modal connection fetch is pending blocks reservation',async()=>{
 let selected=choice,reply;const pending=new Promise(resolve=>{reply=resolve;});let started;const fetched=new Promise(resolve=>{started=resolve;});
 const run=byok.confirmQuote({quote:quote(),choice,project:'project-a',readChoice:()=>selected,guard:async()=>{},confirm:async()=>true,connections:async()=>{started();return pending;}});
 await fetched;selected=null;reply({connections:[{...choice,project_id:'project-a',execution_available:true,managed_fallback:false,provider_bill_payer:'customer_provider_account',max_task_provider_usd:'0.01'}]});await assert.rejects(run);
});
test('cancelled BYOK confirmation never fetches credentials or reaches a grant',async()=>{
 let fetched=0;await assert.rejects(byok.confirmQuote({quote:quote(),choice,project:'project-a',readChoice:()=>choice,guard:async()=>{},confirm:async()=>false,connections:async()=>{fetched++;}}));assert.equal(fetched,0);
});
