'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const api=()=>require('../lib/auto-commit');
async function fixture({name='x.txt',init=true,initial=true,identity=true}={}){
 const dir=fs.mkdtempSync(path.join(process.env.TVIJO_TEST_ARTIFACTS||os.tmpdir(),'git108-')),root=path.join(dir,'project'),storageRoot=path.join(dir,'storage'),home=path.join(dir,'home');
 fs.mkdirSync(root);fs.mkdirSync(storageRoot);fs.mkdirSync(home);
 const environment={...process.env,HOME:home,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
 const git=(...args)=>execFileSync('git',['--literal-pathspecs',...args],{cwd:root,env:environment,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 if(init){git('init','-b','work');if(identity){git('config','user.name','Fixture User');git('config','user.email','fixture@example.test');}}
 for(const [file,text] of [[name,'45\n'],['user.txt','user base\n'],['dirty.txt','dirty base\n']]){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),text);}
 if(init&&initial){git('add','--',name,'user.txt','dirty.txt');git('commit','-m','Fixture base');}
 const start=await api().capture({root,storageRoot,environment});
 const file=path.join(root,name);fs.writeFileSync(file,'50\n');
 const writes=[{absolute:file,previous:'45\n',content:'50\n'}];
 const events=[{type:'result',action:{tool:'replace_in_file',path:name},result:{ok:true}},{type:'result',action:{tool:'run_command',command:'npm test'},result:{ok:true}}];
 const run=options=>api().commitTask({start,writes,result:{reason:'finish',status:'done',text:'Replace 45 with 50'},events,models:['served-a','served-b'],taskId:'fixture-task',...options});
 return {root,dir,home,storageRoot,environment,git,start,file,writes,events,run,name};
}
for(const name of ['x.txt','a [*].txt','-dash.txt','nested/code.txt'])test('0.10.8 auto-commit exact saved path '+name,async()=>{
 const f=await fixture({name});f.git('config','core.fileMode','true');
 fs.writeFileSync(path.join(f.root,'user.txt'),'USER STAGED\n');f.git('add','--','user.txt');fs.writeFileSync(path.join(f.root,'dirty.txt'),'USER DIRTY\n');
 const remote=path.join(f.dir,'remote.git');execFileSync('git',['clone','--bare',f.root,remote],{env:f.environment,stdio:'pipe'});f.git('remote','add','origin',remote);
 const remoteHead=execFileSync('git',['--git-dir='+remote,'rev-parse','HEAD'],{env:f.environment,encoding:'utf8'}).trim();
 const r=await f.run();assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(f.git('diff-tree','--no-commit-id','--name-only','-r','HEAD').split('\n'),[name]);
 assert.equal(f.git('diff','--cached','--name-only'),'user.txt');assert.equal(f.git('diff','--cached','--',name),'');assert.equal(f.git('diff','--name-only'), 'dirty.txt');
 assert.equal(execFileSync('git',['--git-dir='+remote,'rev-parse','HEAD'],{env:f.environment,encoding:'utf8'}).trim(),remoteHead);
 const msg=f.git('show','-s','--format=%B','HEAD');assert.match(msg,/Tvijo-Agent: tvijo-dshrem 0\.10\.8/);assert.match(msg,/Tvijo-Model: served-a, served-b/);assert.match(msg,/Tvijo-Task: fixture-task/);assert.match(msg,/Co-Authored-By: Tvijo Agent \(served-a\)/);assert.equal(f.git('show','-s','--format=%an <%ae>'),'Fixture User <fixture@example.test>');
});
test('0.10.8 auto-commit skips mixed authorship and staged paths with reasons',async()=>{
 const f=await fixture();f.writes[0].previous='USER changed before agent\n';let r=await f.run();assert.equal(r.ok,false);assert.equal(r.skipped[0].reason,'mixed_authorship');
 const g=await fixture();g.git('add','--','x.txt');r=await g.run();assert.equal(r.ok,false);assert.equal(r.skipped[0].reason,'user_staged');
});
test('0.10.8 staged-at-start file remains protected even after unstaging',async()=>{
 const f=await fixture();fs.writeFileSync(f.file,'USER before\n');f.git('add','--','x.txt');const start=await api().capture({...f.start});f.git('reset','HEAD','--','x.txt');fs.writeFileSync(f.file,'50\n');const r=await f.run({start});assert.equal(r.skipped[0].reason,'user_staged');
});
test('0.10.8 auto-commit adds an owned new file with 100644 mode',async()=>{
 const f=await fixture();const file=path.join(f.root,'new.js');fs.writeFileSync(file,'new code');const r=await f.run({writes:[{absolute:file,previous:null,content:'new code'}]});assert.equal(r.ok,true);assert.match(f.git('ls-tree','HEAD','--','new.js'),/^100644 blob/);assert.equal(f.git('status','--porcelain','--','new.js'),'');
});
for(const [scenario,expected] of [['already-tracked','new_file_already_tracked'],['ignored','ignored'],['disk-change','disk_changed'],['missing-in-head','previous_not_in_head'],['unchanged','unchanged'],['outside','outside_repo'],['symlink','unsafe_path'],['hardlink','unsafe_path']])test('0.10.8 auto-commit file skip '+scenario,async()=>{
 const f=await fixture();let writes=f.writes;
 if(scenario==='already-tracked')writes=[{...writes[0],previous:null}];
 if(scenario==='ignored'){fs.writeFileSync(path.join(f.root,'.gitignore'),'ignored.txt\n');const file=path.join(f.root,'ignored.txt');fs.writeFileSync(file,'new');writes=[{absolute:file,previous:null,content:'new'}];}
 if(scenario==='disk-change')fs.writeFileSync(f.file,'CONCURRENT');
 if(scenario==='missing-in-head'){const file=path.join(f.root,'untracked.txt');fs.writeFileSync(file,'new');writes=[{absolute:file,previous:'user',content:'new'}];}
 if(scenario==='unchanged'){fs.writeFileSync(f.file,'45\n');writes=[{...writes[0],content:'45\n'}];}
 if(scenario==='outside'){const file=path.join(f.dir,'outside.txt');fs.writeFileSync(file,'new');writes=[{absolute:file,previous:null,content:'new'}];}
 if(scenario==='symlink'){fs.renameSync(f.file,f.file+'.preserved');fs.symlinkSync(f.file+'.preserved',f.file);}
 if(scenario==='hardlink')fs.linkSync(f.file,f.file+'.linked');
 const r=await f.run({writes});assert.equal(r.ok,false);assert.equal(r.skipped[0].reason,expected,JSON.stringify(r));assert.equal(f.git('rev-list','--count','HEAD'),'1');
});
for(const [scenario,reason] of [['no-repo','no_repo'],['unborn','unborn_head'],['detached','detached_head'],['outside-root','repo_outside_workspace'],['identity','missing_identity'],...['MERGE_HEAD','rebase-merge','rebase-apply','CHERRY_PICK_HEAD','REVERT_HEAD','BISECT_LOG','BISECT_START'].map(x=>[x,'operation_in_progress'])])test('0.10.8 auto-commit repo refusal '+scenario,async()=>{
 const f=await fixture(scenario==='no-repo'?{init:false}:scenario==='unborn'?{initial:false}:{});
 if(scenario==='detached')f.git('checkout','--detach');
 if(scenario==='identity'){f.git('config','--unset','user.name');f.git('config','--unset','user.email');}
 if(['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','BISECT_LOG','BISECT_START'].includes(scenario))fs.writeFileSync(path.join(f.root,'.git',scenario),'fixture');
 if(['rebase-merge','rebase-apply'].includes(scenario))fs.mkdirSync(path.join(f.root,'.git',scenario));
 const start=await api().capture({root:f.root,workspaceRoot:scenario==='outside-root'?path.join(f.root,'sub'):f.root,storageRoot:f.storageRoot,environment:f.environment});
 // outside-root uses an existing nested workspace root.
 if(scenario==='outside-root'){fs.mkdirSync(path.join(f.root,'sub'));const retry=await api().capture({root:f.root,workspaceRoot:path.join(f.root,'sub'),storageRoot:f.storageRoot,environment:f.environment});assert.equal(retry.reason,reason);return;}
 assert.equal(start.ok,false);assert.equal(start.reason,reason);
});
test('0.10.8 auto-commit refuses submodules',async()=>{
 const f=await fixture(),child=await fixture();f.git('-c','protocol.file.allow=always','submodule','add',child.root,'sub');const start=await api().capture({root:path.join(f.root,'sub'),workspaceRoot:f.root,storageRoot:f.storageRoot,environment:f.environment});assert.equal(start.reason,'submodule');
});
for(const kind of ['blocked','answer','step_limit','aborted','off','no-writes','red-check','stale-check'])test('0.10.8 no commit for '+kind,async()=>{
 const f=await fixture();const options={};
 if(kind==='blocked')options.result={reason:'finish',status:'blocked'};
 if(['answer','step_limit'].includes(kind))options.result={reason:kind,status:'done'};
 if(kind==='aborted')options.aborted=true;if(kind==='off')options.enabled=false;if(kind==='no-writes')options.writes=[];
 if(kind==='red-check')options.events=[f.events[0],{...f.events[1],result:{ok:false}}];if(kind==='stale-check')options.events=[f.events[1],f.events[0]];
 const r=await f.run(options);assert.equal(r.ok,false);assert.equal(f.git('rev-list','--count','HEAD'),'1');
});
test('0.10.8 moved HEAD and a changed real index block commit',async()=>{
 const f=await fixture();f.git('commit','--allow-empty','-m','User moved HEAD');assert.equal((await f.run()).reason,'head_moved');
 const g=await fixture();const r=await g.run({guard:async()=>{fs.writeFileSync(path.join(g.root,'.git','MERGE_HEAD'),'pending');}});assert.equal(r.reason,'operation_in_progress');
});
test('0.10.8 failing hook runs and preserves HEAD and user index',async()=>{
 const f=await fixture();fs.writeFileSync(path.join(f.root,'user.txt'),'STAGED');f.git('add','--','user.txt');const before=f.git('write-tree');
 fs.writeFileSync(path.join(f.root,'.git/hooks/pre-commit'),'#!/bin/sh\nprintf ran > hook-ran\nexit 1\n',{mode:0o755});
 const r=await f.run();assert.equal(r.reason,'hook_or_signing_failed');assert.equal(fs.readFileSync(path.join(f.root,'hook-ran'),'utf8'),'ran');assert.equal(f.git('rev-list','--count','HEAD'),'1');assert.equal(f.git('write-tree'),before);assert.equal(fs.existsSync(path.join(f.root,'.git/index.lock')),false);
});
test('0.10.8 hung hook is interrupted and leaves no index lock',async()=>{
 const f=await fixture();f.start.timeoutMs=400;fs.writeFileSync(path.join(f.root,'.git/hooks/pre-commit'),'#!/bin/sh\ntrap "exit 130" INT TERM\nsleep 30\n',{mode:0o755});const r=await f.run();assert.equal(r.reason,'hook_timeout');assert.equal(fs.existsSync(path.join(f.root,'.git/index.lock')),false);for(const name of fs.readdirSync(f.storageRoot))assert.equal(fs.existsSync(path.join(f.storageRoot,name,'index.lock')),false);
});
test('0.10.8 signing failure is reported without disabling signing',async()=>{
 const f=await fixture();f.git('config','commit.gpgSign','true');f.git('config','gpg.program','/bin/false');assert.equal((await f.run()).reason,'hook_or_signing_failed');assert.equal(f.git('rev-list','--count','HEAD'),'1');
});
test('0.10.8 hooks that move HEAD cannot silently commit on a new parent',async()=>{
 const f=await fixture();const hook=path.join(f.root,'.git/hooks/pre-commit');fs.writeFileSync(hook,'#!/bin/sh\nnext=$(git commit-tree HEAD^{tree} -p HEAD -m "Concurrent user commit")\ngit update-ref refs/heads/work "$next" HEAD\n',{mode:0o755});assert.equal((await f.run()).reason,'head_moved');assert.equal(f.git('show','-s','--format=%s'),'Concurrent user commit');assert.equal(f.git('diff','--cached','--name-only'),'');
});
test('0.10.8 trailer injection cannot create forged attribution lines',async()=>{
 const f=await fixture();const r=await f.run({result:{reason:'finish',status:'done',text:'Safe title\n\nTvijo-Model: forged\nCo-Authored-By: Evil <bad@evil.test>'},models:['served-a\nTvijo-Task: injected'],taskId:'task\nCo-Authored-By: forged'});assert.equal(r.ok,true);const msg=f.git('show','-s','--format=%B');assert.match(msg,/^Safe title\n/);assert.doesNotMatch(msg,/\nTvijo-Model: forged|\nCo-Authored-By: Evil|\nTvijo-Task: injected/);assert.equal(msg.match(/^Tvijo-Task:/gm).length,1);
});
test('0.10.8 undo uses soft reset locally and revert after remote tracking or HEAD movement',async()=>{
 const f=await fixture();let r=await f.run();let undone=await api().undo({...r,environment:f.environment});assert.equal(undone.method,'soft_reset');assert.equal(f.git('diff','--cached','--name-only'),'x.txt');
 const g=await fixture();r=await g.run();g.git('update-ref','refs/remotes/origin/work',r.hash);undone=await api().undo({...r,environment:g.environment});assert.equal(undone.method,'revert');assert.equal(g.git('show','HEAD:x.txt'),'45');
 const h=await fixture();r=await h.run();h.git('commit','--allow-empty','-m','Later user commit');undone=await api().undo({...r,environment:h.environment});assert.equal(undone.method,'revert');
});
test('0.10.8 Git environment strips inherited Git overrides and keeps HOME',()=>{
 const env=api().gitEnvironment({HOME:'/safe/home',PATH:'/bin',GIT_DIR:'/evil',GIT_INDEX_FILE:'/evil/index',GIT_CONFIG_COUNT:'1',GIT_AUTHOR_NAME:'forged'},'/work/root');assert.equal(env.HOME,'/safe/home');assert.equal(env.GIT_DIR,undefined);assert.equal(env.GIT_CONFIG_COUNT,undefined);assert.equal(env.GIT_AUTHOR_NAME,undefined);assert.equal(env.GIT_TERMINAL_PROMPT,'0');assert.equal(env.GIT_EDITOR,'true');assert.equal(env.GIT_CEILING_DIRECTORIES,'/work');
});
test('0.10.8 agent Git state commands always require confirmation',()=>{
 const {analyzeCommand}=require('../lib/command-policy');for(const command of ['git commit -m hello','git push','git tag v1','git merge work','git rebase work','git reset --soft HEAD~1','git checkout work','git switch work','git branch -d old','git branch -D old','git stash','git -C . commit -m hi','/usr/bin/git commit -m hi']){const d=analyzeCommand(command);assert.equal(d.ok,true,command);assert.equal(d.requiresApproval,true,command);}
});

test('0.10.8 post-commit index reconciliation preserves concurrent user staging',async()=>{
 const f=await fixture();fs.writeFileSync(path.join(f.root,'user.txt'),'USER STAGED DURING HOOK');
 fs.writeFileSync(path.join(f.root,'.git/hooks/pre-commit'),'#!/bin/sh\nunset GIT_INDEX_FILE\ngit add -- user.txt\n',{mode:0o755});
 const r=await f.run();assert.equal(r.ok,true,JSON.stringify(r));assert.equal(f.git('diff','--cached','--name-only'),'user.txt');assert.equal(f.git('diff','--cached','--','x.txt'),'');
});
test('0.10.8 partial commit excludes saved mixed-authorship and staged files',async()=>{
 const f=await fixture();const dirty=path.join(f.root,'dirty.txt'),staged=path.join(f.root,'user.txt');
 fs.writeFileSync(dirty,'USER plus agent');fs.writeFileSync(staged,'USER staging');f.git('add','--','user.txt');fs.writeFileSync(staged,'USER staging plus agent');
 const r=await f.run({writes:[...f.writes,{absolute:dirty,previous:'USER earlier',content:'USER plus agent'},{absolute:staged,previous:'user base\n',content:'USER staging plus agent'}]});
 assert.equal(r.ok,true);assert.deepEqual(r.paths,['x.txt']);assert.deepEqual(r.skipped.map(f=>f.reason).sort(),['mixed_authorship','user_staged']);assert.equal(f.git('diff','--cached','--name-only'),'user.txt');assert.equal(f.git('show',':user.txt'),'USER staging');assert.equal(f.git('diff-tree','--no-commit-id','--name-only','-r','HEAD'),'x.txt');
});
test('0.10.8 executable mode survives the isolated index commit',async()=>{
 const f=await fixture();fs.chmodSync(f.file,0o755);f.git('add','--','x.txt');f.git('commit','-m','Executable baseline');const start=await api().capture({...f.start});fs.writeFileSync(f.file,'next\n');const r=await f.run({start,writes:[{absolute:f.file,previous:'50\n',content:'next\n'}]});assert.equal(r.ok,true);assert.match(f.git('ls-tree','HEAD','--','x.txt'),/^100755 blob/);
});
test('0.10.8 foreign real-index lock is preserved and reconciliation failure is reported',async()=>{
 const f=await fixture();fs.writeFileSync(path.join(f.root,'.git/hooks/pre-commit'),'#!/bin/sh\nprintf USER_LOCK > .git/index.lock\n',{mode:0o755});const r=await f.run();assert.equal(r.ok,true);assert.equal(r.indexWarning,true);assert.equal(fs.readFileSync(path.join(f.root,'.git/index.lock'),'utf8'),'USER_LOCK');
});

test('judgefix hook formatting reconciles the actual committed blob without phantom staging',async()=>{
 const f=await fixture();fs.writeFileSync(path.join(f.root,'.git/hooks/pre-commit'),'#!/bin/sh\nprintf "50 formatted\\n" > x.txt\ngit add -- x.txt\n',{mode:0o755});
 const r=await f.run();assert.equal(r.ok,true,JSON.stringify(r));assert.equal(f.git('show','HEAD:x.txt'),'50 formatted');assert.equal(fs.readFileSync(f.file,'utf8'),'50 formatted\n');assert.equal(f.git('diff','--cached','--','x.txt'),'');assert.equal(f.git('diff','--','x.txt'),'');
});
test('judgefix hook-added paths are explicitly reported and their real index entries are untouched',async()=>{
 const f=await fixture();const before=f.git('ls-files','--stage','--','user.txt');
 fs.writeFileSync(path.join(f.root,'.git/hooks/pre-commit'),'#!/bin/sh\nprintf "hook extra\\n" > user.txt\ngit add -- user.txt\n',{mode:0o755});
 const r=await f.run();assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(r.hookAddedPaths,['user.txt']);assert.deepEqual(r.paths,['user.txt','x.txt']);assert.equal(f.git('ls-files','--stage','--','user.txt'),before);assert.equal(f.git('diff','--cached','--','x.txt'),'');assert.equal(f.git('show','HEAD:user.txt'),'hook extra');
});
test('judgefix any Git ref change refuses auto-commit even if HEAD stayed put',async()=>{
 const f=await fixture();f.git('tag','created-through-command');assert.equal(await api().refsChanged(f.start),true);assert.equal((await f.run()).reason,'refs_changed');assert.equal(f.git('rev-list','--count','HEAD'),'1');
 f.git('tag','-d','created-through-command');assert.equal(await api().refsChanged(f.start),false);assert.equal((await f.run({refChanged:true})).reason,'refs_changed');
});
test('judgefix quarantined rules are never selected for auto-commit',async()=>{
 const f=await fixture();const r=await f.run({excludedPaths:[f.file]});assert.equal(r.ok,false);assert.equal(r.skipped[0].reason,'rules_quarantined');assert.equal(f.git('rev-list','--count','HEAD'),'1');
});
