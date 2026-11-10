'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {attributedReceipt} = require('../lib/attributed-receipt');
const {createTaskReceipt,formatReceipt} = require('../lib/task-receipt');
const observed = {id:'task-a',project_id:'project-a',status:'completed',receipt:{held_micro_tvijo:0,debited_micro_tvijo:123},byok:{provider_cost_usd:'0.000000123',provider_cost_status:'reported',provider_cost_source:'provider:cost'}};

test('service credits and provider Decimal text remain distinct with an unknown invoice',()=>{
  const r=attributedReceipt(observed,'project-a');
  assert.equal(r.cost.debited,123);assert.equal(r.cost.provider_usd,'0.000000123');assert.equal(r.cost.invoice_usd,null);
  assert.equal(r.verification.status,'not_independently_verified');assert.equal(r.runtime_ack,'UNKNOWN');
});
test('a local selected project cannot substitute for a confirmed server binding',()=>{
  assert.equal(attributedReceipt({...observed,project_id:'project-other'},'project-a'),null);
  assert.equal(attributedReceipt({...observed,project_id:undefined},'project-a'),null);
  assert.equal(attributedReceipt({...observed,id:'task-a\n'},'project-a'),null);
});
test('unknown provider outcome is not confirmed zero or accepted completion',()=>{
  const r=attributedReceipt({...observed,reason:'usage_unknown',byok:{provider_cost_usd:'0'}},'project-a');
  assert.equal(r.cost.provider_usd,null);assert.equal(r.verification.status,'not_independently_verified');
});
test('projection excludes secrets, private paths, prose and untrusted acceptance claims',()=>{
  const r=attributedReceipt({...observed,prompt:'secret=synthetic-value',path:'/private/source',verification:{status:'PASS',reviewer:'self'}},'project-a');
  assert.ok(!JSON.stringify(r).includes('synthetic'));assert.ok(!JSON.stringify(r).includes('/private/'));
  assert.equal(r.verification.reviewer,null);
});
test('noninteger service units and binary floating point provider values stay unknown',()=>{
  const r=attributedReceipt({...observed,receipt:{debited_micro_tvijo:1.5,held_micro_tvijo:NaN},byok:{provider_cost_usd:0.1}},'project-a');
  assert.equal(r.cost.debited,null);assert.equal(r.cost.held,null);assert.equal(r.cost.provider_usd,null);
});
test('existing retained task receipt receives only matching attributable service IDs',()=>{
  const local=createTaskReceipt({id:'local-a',projectScope:'scope',projectId:'project-a',folder:'workspace',mode:'agent'});
  local.answer({taskId:'task-a',cost:observed});
  local.answer({taskId:'task-a',cost:observed}); // Same service identity is a single receipt, not two invoices.
  local.answer({taskId:'task-forged',cost:observed});
  const r=local.finish({result:{status:'done'}});
  assert.equal(r.attributed_service_receipts.length,1);assert.equal(r.verification.status,'not_independently_verified');
  const text=formatReceipt(r,'en');assert.match(text,/provider USD 0.000000123/);assert.match(text,/invoice UNKNOWN/);
});
test('older retained receipts without the additive field still render',()=>{
  const local=createTaskReceipt({id:'local-a',projectScope:'scope',folder:'workspace',mode:'agent'});
  const r=local.finish();delete r.attributed_service_receipts;
  assert.match(formatReceipt(r,'en'),/Task receipt/);
});
test('new attribution cannot exceed the existing durable receipt size bound',()=>{
  const local=createTaskReceipt({id:'local-a',projectScope:'scope',projectId:'project-a',folder:'workspace',mode:'agent'});
  for(let n=0;n<201;n++){
    const id='task-'+String(n).padStart(3,'0')+'x'.repeat(85);
    local.answer({taskId:id,cost:{...observed,id,configuration_hash:'a'.repeat(64)}});
  }
  const result=local.finish({result:{status:'done'}});
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=60000);
  assert.equal(result.verification.truncated,true);
});
for(const status of ['unknown','invented-state','running','frozen',undefined]) test('uncertain outcome keeps supplied zero unknown: '+status,()=>{
  const r=attributedReceipt({...observed,status,byok:{provider_cost_usd:'0',provider_cost_status:'reported'}},'project-a');
  assert.equal(r.cost.provider_usd,null);assert.equal(r.cost.provider_cost_status,'unknown');
});
test('server-shaped estimated cost and provenance remain separate from an invoice',()=>{
  const r=attributedReceipt({...observed,byok:{provider_cost_usd:'0.123456789',provider_cost_status:'estimated',provider_cost_source:'provider:estimated_cost'}},'project-a');
  assert.equal(r.cost.provider_usd,'0.123456789');assert.equal(r.cost.provider_cost_status,'estimated');
  assert.equal(r.cost.provider_cost_source,'provider:estimated_cost');assert.equal(r.cost.invoice_usd,null);
});
test('Decimal precision beyond service units remains exact text',()=>{
  const r=attributedReceipt({...observed,byok:{provider_cost_usd:'0.0000000001234',provider_cost_status:'reported',provider_cost_source:'provider:cost'}},'project-a');
  assert.equal(r.cost.provider_usd,'0.0000000001234');
});
test('unsupported provenance cannot promote zero but a reported final zero remains known',()=>{
  for(const status of ['unknown','not_dispatched','invented',undefined]){
    const r=attributedReceipt({...observed,byok:{provider_cost_usd:'0',provider_cost_status:status}},'project-a');
    assert.equal(r.cost.provider_usd,null);
  }
  const zero=attributedReceipt({...observed,byok:{provider_cost_usd:'0',provider_cost_status:'reported',provider_cost_source:'provider_rejected'}},'project-a');
  assert.equal(zero.cost.provider_usd,'0');assert.equal(zero.cost.provider_cost_source,'provider_rejected');
});
for (const byok of [
  {provider_cost_usd:'1.25',provider_cost_status:'reported'},
  {provider_cost_usd:'0',provider_cost_status:'reported',provider_cost_source:'invented'},
  {provider_cost_usd:'1.25',provider_cost_status:'reported',provider_cost_source:'provider:estimated_cost'},
  {provider_cost_usd:'1.25',provider_cost_status:'estimated',provider_cost_source:'provider:cost'},
]) test('missing or mismatched source cannot establish provider cost: '+JSON.stringify(byok),()=>{
  const r=attributedReceipt({...observed,byok},'project-a');
  assert.equal(r.cost.provider_usd,null);assert.equal(r.cost.provider_cost_status,'unknown');assert.equal(r.cost.provider_cost_source,null);
});
for(const zero of ['0','0.0','0.000']) test('estimated zero is not an attested no-charge result: '+zero,()=>{
  const r=attributedReceipt({...observed,byok:{provider_cost_usd:zero,provider_cost_status:'estimated',provider_cost_source:'provider:estimated_cost'}},'project-a');
  assert.equal(r.cost.provider_usd,null);
});
test('expired is displayed consistently with its supported final charge',()=>{
  const r=attributedReceipt({...observed,status:'expired'},'project-a');
  assert.equal(r.status,'expired');assert.equal(r.cost.provider_usd,'0.000000123');
});
test('a refusal source cannot attest a positive provider charge',()=>{
  const r=attributedReceipt({...observed,status:'failed',byok:{provider_cost_usd:'1',provider_cost_status:'reported',provider_cost_source:'provider_rejected'}},'project-a');
  assert.equal(r.cost.provider_usd,null);
});
