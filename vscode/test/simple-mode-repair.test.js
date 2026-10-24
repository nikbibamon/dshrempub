'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createActiveWorkspace,KEY}=require('../lib/active-workspace');
const {fitContext,wireBytes}=require('../lib/context-budget');
const fs=require('node:fs'),path=require('node:path');
const fixture=fs.mkdtempSync(path.join(process.env.TVIJO_TEST_ARTIFACTS || require('node:os').tmpdir(),'scope-test-'));
const folder=p=>{p=path.join(fixture,p);fs.mkdirSync(p,{recursive:true});return {name:path.basename(p),uri:{scheme:'file',fsPath:p}};};
const Uri={file:fsPath=>({scheme:'file',fsPath})};
test('multi-root selection is explicit, persistent and unaffected by editor focus or root order',async()=>{
 const parent=folder('/projects'),a=folder('/projects/ai-os'),b=folder('/projects/centabot');
 const data=new Map(),state={get:k=>data.get(k),update:async(k,v)=>data.set(k,v)};
 const vscode={Uri,workspace:{workspaceFolders:[parent,a,b]},window:{showQuickPick:async rows=>rows.find(r=>r.folder===a)}};
 let changed=0;const active=createActiveWorkspace({vscode,state,onChange:()=>changed++});
 assert.equal(active.current().uri.fsPath,parent.uri.fsPath);assert.equal((await active.choose()).uri.fsPath,a.uri.fsPath);assert.equal(changed,1);
 vscode.workspace.workspaceFolders=[b,parent,a];assert.equal(createActiveWorkspace({vscode,state}).current().uri.fsPath,a.uri.fsPath);
 assert.equal(active.hasNested(a),false);assert.equal(active.hasNested(parent),true);
 vscode.workspace.workspaceFolders=[parent,b];assert.equal(active.current(),null);assert.ok(data.get(KEY));
});
test('cancelled workspace choice does not infer parent or silently change consent',async()=>{
 const data=new Map(),state={get:k=>data.get(k),update:async(k,v)=>data.set(k,v)};
 const vscode={Uri,workspace:{workspaceFolders:[folder('/projects'),folder('/projects/a')]},window:{showQuickPick:async()=>undefined}};
 const active=createActiveWorkspace({vscode,state});assert.equal(await active.choose(),null);assert.equal(data.size,0);assert.equal(active.current().uri.fsPath,vscode.workspace.workspaceFolders[0].uri.fsPath);
});
test('short prompt survives huge historical multilingual context without mutating history',()=>{
 const messages=[{role:'user',content:'старый '.repeat(20000)},{role:'assistant',content:'answer '.repeat(9000)},{role:'user',content:'List this folder'}];
 const before=JSON.stringify(messages),account={preview:{tokens_remaining:37096}};
 const result=fitContext(messages,account);
 assert.ok(result.removed>=1);assert.equal(result.messages.at(-1).content,'List this folder');assert.equal(JSON.stringify(messages),before);assert.ok(wireBytes(result.messages)<10000);
});
test('admin ignores obsolete trial count but obeys context window; explicit prompt is not truncated',()=>{
 const account={preview:{source:'operator_test_allowance',tokens_remaining:0}};
 assert.equal(fitContext([{role:'user',content:'hello'}],account).removed,0);
 assert.throws(()=>fitContext([{role:'user',content:'x'.repeat(100000)}],account),e=>e.code==='context_limit');
 assert.throws(()=>fitContext([{role:'user',content:'hello'}],{preview:{tokens_remaining:200}}),e=>e.code==='free_preview_exhausted');
});
test('agent compaction preserves original goal, tool protocol system and latest result',()=>{
 const messages=[{role:'system',content:'TOOLS_PROTOCOL'},{role:'user',content:'ORIGINAL_GOAL'},{role:'assistant',content:'old '.repeat(10000)},{role:'user',content:'TOOL_RESULT latest'}];
 const result=fitContext(messages,{preview:{tokens_remaining:37096}},{preserveFirstUser:true});
 assert.ok(result.removed);assert.equal(result.messages[0].content,'TOOLS_PROTOCOL');assert.ok(result.messages.some(m=>m.content==='ORIGINAL_GOAL'));assert.equal(result.messages.at(-1).content,'TOOL_RESULT latest');
});
