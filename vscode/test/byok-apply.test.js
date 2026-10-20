'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const coding=require('../lib/coding');
async function fixture(){
 const root=await fs.mkdtemp(path.join(process.env.TVIJO_TEST_ARTIFACTS || require('node:os').tmpdir(),'byok-apply-'));
 await fs.writeFile(path.join(root,'calc.py'),'def add(a,b): return a-b\n');await fs.writeFile(path.join(root,'test_calc.py'),'import unittest\n');
 const docs=[];let edits=0;
 const vscode={Uri:{file:fsPath=>({fsPath})},Position:class{},Range:class{},WorkspaceEdit:class{replace(){}createFile(){}insert(){}},workspace:{textDocuments:docs,openTextDocument:async uri=>{let d=docs.find(d=>d.uri.fsPath===uri.fsPath);if(!d){const content=await fs.readFile(uri.fsPath,'utf8');d={uri,isDirty:false,version:1,getText:()=>content,positionAt:n=>n};docs.push(d);}return d;},applyEdit:async()=>{edits++;return true;}}};
 const snapshot=await coding.capture({root,selected:['calc.py','test_calc.py'],testFiles:['test_calc.py'],profile:'python-unittest',vscode});const content='def add(a,b): return a+b\n';
 const artifact={task_id:'task',project_id:'project',thread_id:'thread',snapshot_hash:'a'.repeat(64),financial_status:'completed',receipt:{held_micro_tvijo:0},edits:[{path:'calc.py',content,base_sha256:snapshot.files[0].sha256,new_sha256:coding.sha256(content)}],tests:{result_trust:'untrusted_test_process',test_result_verified:false},billing_mode:'byok',byok:{connection_id:'connection-a',connection_epoch:1,provider_bill_payer:'customer_provider_account',provider_max_usd:'0.01',provider_cost_usd:'0.000004',provider_cost_status:'estimated',provider_cost_source:'provider:estimated_cost',managed_fallback:false,service_fee_micro_tvijo:1000}};
 return {root,vscode,snapshot,artifact,edits:()=>edits};
}
test('BYOK financially unknown receipt never permits Apply despite zero TT hold',async()=>{
 const f=await fixture();f.artifact.byok.provider_cost_status='unknown';f.artifact.byok.provider_cost_usd=null;
 await assert.rejects(coding.apply({...f,guard:async()=>{},confirm:async()=>true}));assert.equal(f.edits(),0);
});
for(const change of [{billing_mode:'managed',byok:undefined},{byok:{connection_id:'other'}},{byok:{connection_epoch:2}},{byok:{provider_cost_usd:'0.000005'}},{byok:{managed_fallback:true}},{byok:{cancel_requested:true}},{byok:{provider_cost_status:'unknown',provider_cost_usd:null}}])test('post-confirmation BYOK payer receipt mutation blocks editor Apply '+JSON.stringify(change),async()=>{
 const f=await fixture();const fresh={...f.artifact,...change,byok:change.byok ? {...f.artifact.byok,...change.byok}:change.byok};
 await assert.rejects(coding.apply({...f,guard:async()=>{},confirm:async()=>true,revalidate:async()=>fresh}));assert.equal(f.edits(),0);assert.equal(await fs.readFile(path.join(f.root,'calc.py'),'utf8'),'def add(a,b): return a-b\n');
});
test('stable confirmed BYOK receipt permits only buffer Apply and never implicit disk save',async()=>{
 const f=await fixture();await coding.apply({...f,guard:async()=>{},confirm:async()=>true,revalidate:async()=>f.artifact});assert.equal(f.edits(),1);assert.equal(await fs.readFile(path.join(f.root,'calc.py'),'utf8'),'def add(a,b): return a-b\n');
});
