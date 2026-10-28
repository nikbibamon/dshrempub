'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFullAccess, EXTRA_LIMITS } = require('../lib/full-access');
const { assertExtraSandbox } = require('../lib/extra-sandbox');

test('Extra refuses enablement without a passing launcher and names the reason', async () => {
  const folder = {uri:{scheme:'file',authority:'',fsPath:'/work/project'}};
  const values = new Map(), prompts = [];
  const vscode = {workspace:{isTrusted:true,workspaceFolders:[folder]},window:{showWarningMessage:async message=>prompts.push(message)}};
  const access = createFullAccess({vscode,state:{get:key=>values.get(key),update:async(key,v)=>values.set(key,v)},scope:()=> 'a'.repeat(64)});
  assert.equal(await access.enable(folder,{extra:true}),false);
  assert.equal(access.status(folder).enabled,false);
  assert.equal(values.size,0);
  assert.match(prompts[0],/Extra unavailable.*preflight/);
  assert.throws(()=>assertExtraSandbox(null),/host shell is forbidden at uid 0/);
});

test('Extra consent names the copy, isolation boundaries, disk secrets and outward actions EN/RU', () => {
  assert.match(EXTRA_LIMITS.en,/own repository copy/);
  assert.match(EXTRA_LIMITS.en,/unprivileged.*OS sandbox/);
  assert.match(EXTRA_LIMITS.en,/secrets on disk/);
  assert.match(EXTRA_LIMITS.en,/HOME.*\/root.*\/etc\/aios/);
  assert.match(EXTRA_LIMITS.en,/Apply, push and PR/);
  assert.match(EXTRA_LIMITS.ru,/собственной копии репозитория/);
  assert.match(EXTRA_LIMITS.ru,/секреты на диске/);
  assert.match(EXTRA_LIMITS.ru,/непривилегированного.*песочнице ОС/);
});

const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const extra=require('../lib/extra-sandbox');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'extra-unit-'));
test('Task copy includes HEAD and staged/unstaged/untracked changes without shared objects or env blobs',()=>{
 const root=temp(),env={PATH:process.env.PATH,HOME:root,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
 const git=(...args)=>execFileSync('git',args,{cwd:root,env,stdio:['ignore','pipe','pipe']}).toString().trim();
 git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@localhost');
 fs.writeFileSync(path.join(root,'a.txt'),'base');fs.writeFileSync(path.join(root,'removed.txt'),'base');fs.writeFileSync(path.join(root,'.env'),'OWNED FIXTURE SECRET');git('add','.');git('commit','-qm','base');
 const base=git('rev-parse','HEAD');fs.writeFileSync(path.join(root,'a.txt'),'staged');git('add','a.txt');fs.writeFileSync(path.join(root,'a.txt'),'working');fs.writeFileSync(path.join(root,'new.txt'),'untracked');fs.unlinkSync(path.join(root,'removed.txt'));
 const before=git('status','--porcelain'),copy=extra.createTaskCopy(root);
 assert.equal(copy.baseCommit,base);assert.equal(fs.readFileSync(path.join(copy.root,'a.txt'),'utf8'),'working');assert.equal(fs.readFileSync(path.join(copy.root,'new.txt'),'utf8'),'untracked');assert.equal(fs.existsSync(path.join(copy.root,'removed.txt')),false);assert.equal(fs.existsSync(path.join(copy.root,'.env')),false);
 assert.equal(fs.existsSync(path.join(copy.root,'.git/objects/info/alternates')),false);
 assert.throws(()=>execFileSync('git',['show','HEAD:.env'],{cwd:copy.root,env,stdio:'pipe'}));assert.equal(git('status','--porcelain'),before);
 fs.writeFileSync(path.join(copy.root,'a.txt'),'agent');assert.equal(fs.readFileSync(path.join(root,'a.txt'),'utf8'),'working');assert.deepEqual(extra.changes(copy).files.map(row=>row.path),['a.txt']);
});
test('Task snapshot refuses links without reading through them and does not read env files',()=>{
 const root=temp();fs.writeFileSync(path.join(root,'.env'),'fixture');fs.symlinkSync('/nonexistent',path.join(root,'link'));
 assert.throws(()=>extra.snapshot(root),/Symlinks/);assert.equal(extra.deniedPart('.env.production'),true);
});
test('Sandbox mount whitelist, network default, readonly system and root fallback guard',()=>{
 const root=temp();const args=extra.sandboxArgs(root);
 assert.ok(args.includes('--unshare-user'));assert.ok(args.includes('--remount-ro'));assert.ok(!args.includes('--unshare-net'));
 assert.ok(extra.sandboxArgs(root,{network:false}).includes('--unshare-net'));
 assert.equal(require('../package.json').contributes.configuration.properties['tvijo.agent.extraNetwork'].default,true);
 for(const source of extra.mountList())assert.ok(!source.startsWith('/root')&&!source.startsWith('/etc/aios')&&!source.split('/').some(extra.deniedPart));
 if(process.getuid?.()===0)assert.throws(()=>extra.createSandbox({root,mode:'host-confirmed'}),/forbidden at uid 0/);
});

test('Non-root fallback needs the second native confirmation, which is captured in the grant',async t=>{
 t.mock.method(process,'getuid',()=>1000);
 const folder={uri:{scheme:'file',authority:'',fsPath:'/work/project'}},values=new Map(),prompts=[];let allowHost=false;
 const vscode={workspace:{isTrusted:true,workspaceFolders:[folder]},window:{showWarningMessage:async(message,options,label)=>{prompts.push({message,options,label});return label==='Enable ExtraFullAccess'||allowHost?label:undefined;}}};
 const access=createFullAccess({vscode,state:{get:k=>values.get(k),update:async(k,v)=>values.set(k,v)},scope:()=> 'b'.repeat(64),extraPreflight:async()=>({available:false,fallback_possible:true,reason:'user namespaces unavailable',network:true})});
 assert.equal(await access.enable(folder,{extra:true}),false);assert.equal(prompts.length,2);assert.equal(access.status(folder).enabled,false);
 assert.match(prompts[1].message,/secrets on disk/);allowHost=true;assert.equal(await access.enable(folder,{extra:true}),true);
 const grant=access.capture(folder);assert.equal(grant.sandboxMode,'host-confirmed');assert.equal(grant.explicitHostConfirmation,true);
});

test('Selected monorepo subproject copy stays within its declared folder',()=>{
 const root=temp(),env={PATH:process.env.PATH,HOME:root,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
 const git=(...args)=>execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@localhost',...args],{cwd:root,env,stdio:'pipe'});
 git('init','-q');fs.mkdirSync(path.join(root,'project'));fs.writeFileSync(path.join(root,'project','code.txt'),'selected');fs.writeFileSync(path.join(root,'sibling.txt'),'not selected');git('add','.');git('commit','-qm','base');
 const copy=extra.createTaskCopy(path.join(root,'project'));assert.equal(copy.sourcePrefix,'project/');assert.equal(fs.readFileSync(path.join(copy.root,'code.txt'),'utf8'),'selected');assert.equal(fs.existsSync(path.join(copy.root,'sibling.txt')),false);assert.equal(fs.existsSync(path.join(copy.root,'project')),false);
});
