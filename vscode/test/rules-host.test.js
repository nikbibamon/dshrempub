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
  const vscode = {Uri:{file:uri,joinPath:(base,...parts)=>uri(path.join(base.fsPath,...parts))},FileType:{Directory:2,SymbolicLink:64},
    workspace:{isTrusted:true,workspaceFolders:[folder],getWorkspaceFolder:()=>folder,fs:{readDirectory:async()=>[],stat:async target=>{const s=await fs.lstat(target.fsPath);return {type:s.isDirectory()?2:1};},readFile:target=>fs.readFile(target.fsPath)}},
    window:{showQuickPick:async choices=>choices[0],showWarningMessage:async(...args)=>{warnings.push(args);return 'Trust these rules';}}};
  let revoked=0;
  const storageRoot=await fs.mkdtemp(root+'-host-storage-');
  const options={vscode,state,storageRoot,showPreview:async text=>{previews.push(text);},onRevoke:()=>{revoked++;}};
  const host=createRulesHost(options);
  return {root,folder,uri,values,previews,warnings,state,vscode,options,host,get revoked(){return revoked;}};
}

test('0.10.8 trusted rules load automatically as a separate snapshot; changes affect next task',async()=>{
 const f=await fixture();const first=await f.host.collect({});
 assert.equal(first.summary.rules.status,'included');assert.match(first.rulesText,/RULE_APPROVAL_CANARY/);assert.doesNotMatch(first.text,/RULE_APPROVAL_CANARY/);assert.equal(f.warnings.length,0);
 await fs.writeFile(path.join(f.root,'.tvijo','rules.md'),'NEXT_TASK_RULES\n');
 f.host.assertCurrent(first.ruleGrants);assert.match(first.rulesText,/RULE_APPROVAL_CANARY/);assert.match((await f.host.collect({})).rulesText,/NEXT_TASK_RULES/);
 f.vscode.workspace.isTrusted=false;assert.throws(()=>f.host.assertCurrent(first.ruleGrants));assert.equal((await f.host.collect({})).rulesText,'');
 assert.equal(f.host.approve,undefined);assert.equal(f.host.revoke,undefined);
});
test('0.10.8 per-file toggles persist and context off disables all rules',async()=>{
 const f=await fixture();const first=await f.host.collect({});const id=first.summary.rules.files[0].id;await f.host.toggle(id);
 assert.equal((await createRulesHost(f.options).collect({})).rulesText,'');
 await f.host.toggle(id);assert.match((await f.host.collect({})).rulesText,/RULE_APPROVAL_CANARY/);
 assert.equal((await f.host.collect({contextMode:'off'})).rulesText,'');
});
test('0.10.8 rules inherit nearest first and stop at the selected repository',async()=>{
 const f=await fixture();const sub=path.join(f.root,'sub');await fs.mkdir(sub);await fs.writeFile(path.join(f.root,'AGENTS.md'),'PARENT_STYLE');await fs.writeFile(path.join(sub,'CLAUDE.md'),'CHILD_STYLE');
 const folder=require('../lib/active-workspace').resolveFolder(f.vscode,{uri:f.uri(sub)});let result=await f.host.collect({folder});assert.ok(result.rulesText.indexOf('CHILD_STYLE')<result.rulesText.indexOf('PARENT_STYLE'));
 await fs.mkdir(path.join(sub,'.git'));result=await f.host.collect({folder});assert.match(result.rulesText,/CHILD_STYLE/);assert.doesNotMatch(result.rulesText,/PARENT_STYLE|RULE_APPROVAL_CANARY/);
});
test('0.10.8 whole-file secrets are scanned before 32 KiB aggregate truncation',async()=>{
 const f=await fixture();await fs.writeFile(path.join(f.root,'AGENTS.md'),'a'.repeat(40000)+'\nsecret=DO_NOT_SEND');
 let r=await f.host.collect({});assert.equal(r.summary.rules.files.find(x=>x.file==='AGENTS.md').reason,'credential-content');assert.doesNotMatch(r.rulesText,/DO_NOT_SEND/);
 await fs.writeFile(path.join(f.root,'AGENTS.md'),'a'.repeat(40000));r=await f.host.collect({});assert.ok(Buffer.byteLength(r.rulesText)<=32768);assert.equal(r.summary.rules.truncated,true);assert.match(r.rulesText,/TRUNCATED/);
});

test('judgefix task fingerprints quarantine rule changes, creations and deletions across host restarts',async()=>{
 const f=await fixture();await f.host.collect({});const tracker=f.host.beginTask(f.folder);
 await fs.writeFile(path.join(f.root,'AGENTS.md'),'COMMAND_INJECTED_RULES');await fs.mkdir(path.join(f.root,'.clinerules'));await fs.writeFile(path.join(f.root,'.clinerules','a.md'),'NESTED_COMMAND_RULES');await fs.unlink(path.join(f.root,'.tvijo','rules.md'));
 const found=await tracker.check();assert.equal(tracker.approvalRequired,true);for(const name of ['AGENTS.md','.clinerules/a.md','.tvijo/rules.md'])assert.ok(found.some(row=>row.file===name),name);
 const restarted=createRulesHost(f.options);let next=await restarted.collect({});assert.doesNotMatch(next.rulesText,/COMMAND_INJECTED_RULES|NESTED_COMMAND_RULES/);assert.ok(next.summary.rules.files.some(row=>row.file==='.tvijo/rules.md'&&row.quarantined));
 for(const row of next.summary.rules.files.filter(row=>row.quarantined))await restarted.reenable(row.id);
 next=await restarted.collect({});assert.match(next.rulesText,/COMMAND_INJECTED_RULES/);assert.match(next.rulesText,/NESTED_COMMAND_RULES/);assert.equal(next.summary.rules.files.some(row=>row.quarantined),false);
});
test('judgefix explicitly approved direct rules writes do not quarantine unrelated files or approve later command writes',async()=>{
 const f=await fixture();const tracker=f.host.beginTask(f.folder),target=path.join(f.root,'AGENTS.md');await fs.writeFile(target,'APPROVED_DIRECT');assert.deepEqual(await tracker.check({approvedPath:target}),[]);assert.equal(tracker.approvalRequired,false);
 await fs.writeFile(target,'LATER_COMMAND');assert.ok((await tracker.check()).some(row=>row.file==='AGENTS.md'));assert.equal(tracker.approvalRequired,true);assert.doesNotMatch((await f.host.collect({})).rulesText,/LATER_COMMAND/);
});

for(const relative of ['sub/AGENTS.md','sub/Agents.MD'])test('judgefix2 subtree quarantine survives later folder selection and case aliases: '+relative,async()=>{
 const f=await fixture(),tracker=f.host.beginTask(f.folder);await fs.mkdir(path.join(f.root,'sub'));const target=path.join(f.root,relative);await fs.writeFile(target,'SUBTREE_RULE_CANARY');
 assert.ok((await tracker.check()).some(row=>row.file===relative));assert.equal(tracker.approvalRequired,true);
 const sub=require('../lib/active-workspace').resolveFolder(f.vscode,{uri:f.uri(path.join(f.root,'sub'))});let next=await f.host.collect({folder:sub});assert.doesNotMatch(next.rulesText,/SUBTREE_RULE_CANARY/);
 const canonical=path.join(f.root,'sub/AGENTS.md');if(target!==canonical)await fs.rename(target,canonical);
 next=await createRulesHost(f.options).collect({folder:sub});assert.doesNotMatch(next.rulesText,/SUBTREE_RULE_CANARY/);const row=next.summary.rules.files.find(row=>row.file==='AGENTS.md');assert.equal(row.quarantined,true);
 const restarted=createRulesHost(f.options);await restarted.collect({folder:sub});await restarted.reenable(row.quarantineId || row.id);assert.match((await restarted.collect({folder:sub})).rulesText,/SUBTREE_RULE_CANARY/);
});
test('judgefix2 any nested clinerules change quarantines the directory including case variants and non-Markdown files',async()=>{
 const f=await fixture(),dir=path.join(f.root,'.clinerules');await fs.mkdir(dir);await fs.writeFile(path.join(dir,'a.md'),'EXISTING_ADVICE');const tracker=f.host.beginTask(f.folder);
 await fs.mkdir(path.join(dir,'nested'));await fs.writeFile(path.join(dir,'nested/new.txt'),'NOT_MARKDOWN');await tracker.check();let next=await f.host.collect({});assert.doesNotMatch(next.rulesText,/EXISTING_ADVICE/);assert.equal(next.summary.rules.files.find(row=>row.file==='.clinerules/a.md').quarantined,true);
 await fs.rename(dir,path.join(f.root,'.Clinerules'));next=await f.host.collect({});assert.doesNotMatch(next.rulesText,/EXISTING_ADVICE/);const row=next.summary.rules.files.find(row=>row.file==='.Clinerules/a.md');assert.equal(row.quarantined,true);await f.host.reenable(row.quarantineId || row.id);assert.match((await f.host.collect({})).rulesText,/EXISTING_ADVICE/);
 await fs.unlink(path.join(f.root,'.Clinerules/nested/new.txt'));assert.ok((await tracker.check()).length);assert.doesNotMatch((await f.host.collect({})).rulesText,/EXISTING_ADVICE/);
});
test('judgefix2 bounded fingerprint scan exposes truncation and requires command approval on directory or entry caps',async()=>{
 for(const limits of [{maxDirectories:1,maxEntries:20000},{maxDirectories:1024,maxEntries:1}]){
  const f=await fixture();await fs.mkdir(path.join(f.root,'sub'));await fs.writeFile(path.join(f.root,'sub/AGENTS.md'),'SUB');
  const host=createRulesHost({...f.options,scanOptions:limits}),tracker=host.beginTask(f.folder);assert.equal(tracker.scanTruncated,true);assert.equal(tracker.approvalRequired,true);await tracker.check();assert.equal(host.scanTruncated(),true);assert.equal((await host.collect({})).summary.rules.scanTruncated,true);
 }
});
test('judgefix2 quarantine is canonical-path persistent and account scoped',async()=>{
 const f=await fixture();let account='account-A';const options={...f.options,accountScope:()=>account};const host=createRulesHost(options),tracker=host.beginTask(f.folder);await fs.writeFile(path.join(f.root,'AGENTS.md'),'ACCOUNT_RULE_CANARY');await tracker.check();assert.doesNotMatch((await host.collect({})).rulesText,/ACCOUNT_RULE_CANARY/);
 account='account-B';assert.match((await host.collect({})).rulesText,/ACCOUNT_RULE_CANARY/);account='account-A';assert.doesNotMatch((await createRulesHost(options).collect({})).rulesText,/ACCOUNT_RULE_CANARY/);
});
