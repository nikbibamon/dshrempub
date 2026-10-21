'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {createRulesHost} = require('../lib/rules-host');

async function fixture() {
  const root = await fs.mkdtemp(path.join(process.env.TVIJO_TEST_ARTIFACTS || os.tmpdir(),'trust-host-'));
  await fs.mkdir(path.join(root,'.tvijo'));
  await fs.writeFile(path.join(root,'.tvijo','rules.md'),'RULE_APPROVAL_CANARY\n');
  const uri = fsPath => ({scheme:'file',authority:'',fsPath});
  const folder = {uri:uri(root),name:'same-name'};
  const values = new Map(), previews = [], warnings = [];
  const state = {get:key=>values.get(key),update:async(key,value)=>{values.set(key,value);}};
  const vscode = {Uri:{joinPath:(base,...parts)=>uri(path.join(base.fsPath,...parts))},FileType:{Directory:2,SymbolicLink:64},
    workspace:{isTrusted:true,workspaceFolders:[folder],getWorkspaceFolder:()=>folder,fs:{readDirectory:async()=>[],stat:async target=>{const s=await fs.lstat(target.fsPath);return {type:s.isDirectory()?2:1};},readFile:target=>fs.readFile(target.fsPath)}},
    window:{showQuickPick:async choices=>choices[0],showWarningMessage:async(...args)=>{warnings.push(args);return 'Trust these rules';}}};
  let revoked=0;
  const storageRoot=await fs.mkdtemp(root+'-host-storage-');
  const options={vscode,state,storageRoot,showPreview:async text=>{previews.push(text);},onRevoke:()=>{revoked++;}};
  const host=createRulesHost(options);
  return {root,folder,uri,values,previews,warnings,state,vscode,options,host,get revoked(){return revoked;}};
}

test('global context and local preview do not authorize rules; exact native approval persists across host restart',async()=>{
  const f=await fixture();
  let result=await f.host.collect({contextMode:'preview'});
  assert.equal(result.summary.rules.status,'unapproved');assert.ok(!result.text.includes('RULE_APPROVAL_CANARY'));assert.equal(f.values.size,0);
  assert.equal(f.host.inspect(f.folder).status,'ready');assert.equal(f.values.size,0);
  assert.equal(await f.host.approve(f.folder),true);assert.match(f.previews[0],/RULE_APPROVAL_CANARY/);assert.equal(f.warnings[0][1].modal,true);
  result=await createRulesHost(f.options).collect({});assert.equal(result.summary.rules.status,'included');assert.match(result.text,/RULE_APPROVAL_CANARY/);
  f.host.assertCurrent(result.ruleGrants);
  f.vscode.workspace.isTrusted=false;
  assert.ok(!(await f.host.collect({})).text.includes('RULE_APPROVAL_CANARY'));
  assert.throws(()=>f.host.assertCurrent(result.ruleGrants));
});

test('changed raw rules bytes invalidate a prepared request and require a new native approval',async()=>{
  const f=await fixture();await f.host.approve(f.folder);const result=await f.host.collect({});
  await fs.writeFile(path.join(f.root,'.tvijo','rules.md'),'RULE_APPROVAL_CANARY\r\n');
  assert.throws(()=>f.host.assertCurrent(result.ruleGrants),/approval changed/);
  assert.equal((await f.host.collect({})).summary.rules.status,'unapproved');
  assert.equal(f.host.decision(f.folder,f.host.inspect(f.folder).hash).status,'changed');
});

test('revocation aborts active use, survives restart and cannot be granted by command arguments',async()=>{
  const f=await fixture();await f.host.approve(f.folder);const result=await f.host.collect({});
  await f.host.revoke(f.folder);assert.equal(f.revoked,1);assert.throws(()=>f.host.assertCurrent(result.ruleGrants));
  assert.equal((await createRulesHost(f.options).collect({})).summary.rules.status,'unapproved');
  f.vscode.window.showWarningMessage=async()=>undefined;
  assert.equal(await f.host.approve(f.folder,{approved:true}),false);assert.equal((await f.host.collect({})).summary.rules.status,'unapproved');
});

test('rules or workspace changes during modal approval fail closed',async()=>{
  const f=await fixture();
  f.vscode.window.showWarningMessage=async()=>{await fs.writeFile(path.join(f.root,'.tvijo','rules.md'),'CHANGED_DURING_MODAL\n');return 'Trust these rules';};
  await assert.rejects(f.host.approve(f.folder),/changed during approval/);assert.equal(f.values.size,0);
  f.vscode.window.showWarningMessage=async()=>{f.vscode.workspace.isTrusted=false;return 'Trust these rules';};
  await assert.rejects(f.host.approve(f.folder));assert.equal(f.values.size,0);
});

test('same-name multi-root folders and removed folders cannot inherit each other rules approval',async()=>{
  const f=await fixture(),g=await fixture();await f.host.approve(f.folder);
  f.vscode.workspace.workspaceFolders.push(g.folder);f.vscode.window.showQuickPick=async choices=>choices[1];
  assert.equal(await f.host.chooseFolder(),g.folder);assert.notEqual(f.host.scope(f.folder),f.host.scope(g.folder));
  assert.equal((await f.host.collect({folder:g.folder})).summary.rules.status,'unapproved');
  f.vscode.workspace.workspaceFolders=[g.folder];
  await assert.rejects(f.host.collect({folder:f.folder}),/no longer available/);
});

test('credential-bearing and symlinked rules cannot be approved or previewed as safe rules',async()=>{
  const f=await fixture();await fs.writeFile(path.join(f.root,'.tvijo','rules.md'),'password=NEVER_ECHO\n');
  assert.equal(f.host.inspect(f.folder).status,'rejected');await assert.rejects(f.host.approve(f.folder));assert.equal(f.previews.length,0);
  const link=f.root+'-link';await fs.symlink(f.root,link);assert.equal(f.host.scope({uri:f.uri(link)}),null);
});

test('shared memento and identical file URI cannot transfer approval to a different extension host storage',async()=>{
  const f=await fixture();await f.host.approve(f.folder);
  const otherStorage=await fs.mkdtemp(f.root+'-other-host-');
  const other=createRulesHost({...f.options,storageRoot:otherStorage});
  assert.notEqual(other.scope(f.folder),f.host.scope(f.folder));
  assert.equal((await other.collect({})).summary.rules.status,'unapproved');
  assert.ok(!(await other.collect({})).text.includes('RULE_APPROVAL_CANARY'));
  assert.equal((await createRulesHost(f.options).collect({})).summary.rules.status,'included');
});
