'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createRunReceipt}=require('../lib/run-receipt');const {runAgent}=require('../lib/agent');
function fixture(checks=['npm test']) {
 let hash='initial',files=new Map([['a.js',{hash,mode:420}]]);
 const tree=()=>({hash,files:new Map(files)}),receipt=createRunReceipt({taskId:'fixture',checks,tree});
 const write=()=>{const before=tree();hash='written';files.set('a.js',{hash,mode:420});receipt.recordAction({tool:'write_file'},{ok:true},before);};
 const check=(code=0)=>receipt.recordAction({tool:'run_command',command:'npm test'},{ok:code===0,exitCode:code},tree());
 return {receipt,write,check,drift:()=>{hash='external';},tree};
}
test('Model claims done with zero runs: engine refuses verified',async()=>{
 const {receipt}=fixture();let runs=0;
 const result=await runAgent({goal:'Do work',extraAccess:true,verification:receipt,maxSteps:1,tools:{execute:async()=>{runs++;}},ask:async()=>({content:'{"tool":"finish","status":"done","answer":"Tests all passed"}',cost:{spent_usd:'0'}})});
 assert.equal(runs,0);assert.equal(result.status,'unverified');assert.equal(result.verification.reason,'no_checks_run');
});
test('Extra without a verification tracker cannot accept done',async()=>{
 const result=await runAgent({goal:'work',extraAccess:true,maxSteps:1,tools:{execute:async()=>{}},ask:async()=>({content:'{"tool":"finish","status":"done","answer":"ok"}'})});
 assert.equal(result.status,'unverified');assert.equal(result.verification.reason,'no_checks_defined');
});
for(const [name,setup,status,reason] of [
 ['undefined checks',()=>fixture([]),'unverified','no_checks_defined'],
 ['zero runs',()=>fixture(),'unverified','no_checks_run'],
 ['check before write',()=>{const f=fixture();f.check();f.write();return f;},'unverified','check_before_last_write'],
 ['failed check',()=>{const f=fixture();f.write();f.check(7);return f;},'unverified','check_failed'],
 ['tree changed',()=>{const f=fixture();f.write();f.check();f.drift();return f;},'unverified','tree_changed'],
 ['checked after last write',()=>{const f=fixture();f.write();f.check();return f;},'verified',null]
])test('Verified done matrix: '+name,()=>{const f=setup(),result=f.receipt.verify();assert.equal(result.status,status);assert.equal(result.reason,reason);});
test('Engine records shell writes and only checks fixed before the model ran',async()=>{
 const f=fixture();const tools=f.receipt.wrap({execute:async action=>{
  if(action.command==='write')f.write();return {ok:true,exitCode:0};
 }});
 await tools.execute({tool:'run_command',command:'write'});assert.equal(f.receipt.verify().status,'unverified');
 await tools.execute({tool:'run_command',command:'echo tests passed'});assert.equal(f.receipt.verify().status,'unverified');
 await tools.execute({tool:'run_checks',command:'echo fake'});assert.equal(f.receipt.verify().status,'verified');
 const receipt=f.receipt.finish('verified');assert.ok(receipt.writes.length);assert.equal(receipt.checks[0].command,'npm test');assert.equal(receipt.checks[0].after_last_write,true);
});
test('All project-defined checks must pass; a check that changes the tree cannot verify',()=>{
 const f=fixture(['npm test','npm run lint']);f.check();assert.equal(f.receipt.verify().reason,'no_checks_run');
 const before=f.tree();f.write();f.receipt.recordAction({tool:'run_command',command:'npm run lint'},{ok:true,exitCode:0},before);assert.notEqual(f.receipt.verify().status,'verified');
});
