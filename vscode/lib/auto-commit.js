'use strict';
// Host-only Git operations. The model supplies neither argv nor commit trailers.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{randomBytes,createHash}=require('node:crypto');
const {safePath}=require('./local-tools');
const within=(root,file)=>{const r=path.relative(root,file);return !r || r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};
const clean=value=>String(value??'').replace(/[\x00-\x1f\x7f-\x9f]/g,' ').replace(/\s+/g,' ').trim();
function gitEnvironment(source,workspaceRoot,index){
 const env=Object.fromEntries(Object.entries(source||process.env).filter(([key])=>!/^GIT_/i.test(key)));
 Object.assign(env,{GIT_TERMINAL_PROMPT:'0',GIT_EDITOR:'true',GIT_CEILING_DIRECTORIES:path.dirname(workspaceRoot)});
 if(index)env.GIT_INDEX_FILE=index;return env;
}
function runGit(start,args,{input,index,timeoutMs=start.timeoutMs||120000,signal:abortSignal,onPrepared}={}){
 return new Promise((resolve,reject)=>{
  if(abortSignal?.aborted){resolve({ok:false,code:null,cancelled:true,stdout:Buffer.alloc(0),stderr:Buffer.alloc(0)});return;}
  const child=spawn('git',[...(args[0]==='check-ignore'?[]:['--literal-pathspecs']),...args],{cwd:start.root,env:gitEnvironment(start.environment,start.workspaceRoot,index),shell:false,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
  let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),timedOut=false,cancelled=false,finished=false,truncated=false,term,kill;
  const send=s=>{try{if(process.platform!=='win32')process.kill(-child.pid,s);else child.kill(s);}catch{}};
  const stop=()=>{send('SIGINT');if(!term)term=setTimeout(()=>{send('SIGTERM');kill=setTimeout(()=>send('SIGKILL'),1000);},1000);};
  const onAbort=()=>{cancelled=true;stop();};
  const append=(old,data)=>{const combined=Buffer.concat([old,data]);if(combined.length>1024*1024)truncated=true;return combined.subarray(0,1024*1024);};
  let prepared=false;
  child.stdout.on('data',data=>{stdout=append(stdout,data);if(onPrepared && !prepared && stdout.includes(Buffer.from('prepare: ok\n'))){prepared=true;let accept=false;try{accept=onPrepared()===true;}catch{}child.stdin.end(accept?'commit\n':'abort\n');}});child.stderr.on('data',data=>{stderr=append(stderr,data);});
  const timer=setTimeout(()=>{timedOut=true;stop();},timeoutMs);
  function finish(error,code){if(finished)return;finished=true;clearTimeout(timer);clearTimeout(term);clearTimeout(kill);abortSignal?.removeEventListener('abort',onAbort);if(timedOut||cancelled)send('SIGKILL');if(error)reject(error);else resolve({ok:code===0&&!timedOut&&!cancelled&&!truncated,code,timedOut,cancelled,truncated,stdout,stderr});}
  child.once('error',e=>finish(e));child.once('close',code=>finish(null,code));child.stdin.on('error',()=>{});if(onPrepared)child.stdin.write(input);else child.stdin.end(input);
  abortSignal?.addEventListener('abort',onAbort,{once:true});if(abortSignal?.aborted)onAbort();
 });
}
const output=r=>r.stdout.toString('utf8').trim();
async function git(start,args,options){const r=await runGit(start,args,options);if(!r.ok)throw Object.assign(Error(clean(r.stderr.toString('utf8')).slice(0,2000)||'Git failed'),{reason:r.timedOut?'hook_timeout':'git_failed'});return r;}
function entries(buffer){return buffer.toString('utf8').split('\0').filter(Boolean).map(row=>{const tab=row.indexOf('\t');const [mode,oid,stage]=row.slice(0,tab).split(' ');return {mode,oid,stage,path:row.slice(tab+1)};});}
async function headEntry(start,relative,revision=start.head){const r=await git(start,['ls-tree','-z',revision,'--',relative]);const row=entries(r.stdout)[0];return row?{mode:row.mode,oid:row.stage,path:row.path}:null;}
async function indexEntries(start,relative,index){return entries((await git(start,['ls-files','--stage','-z','--',relative],{index})).stdout);}
const sameEntry=(list,head)=>head?list.length===1&&list[0].stage==='0'&&list[0].mode===head.mode&&list[0].oid===head.oid:list.length===0;
async function readRefs(start){
 if(!start?.head)return null;
 return {head:output(await git(start,['rev-parse','HEAD'])),branch:output(await git(start,['symbolic-ref','-q','HEAD']).catch(()=>({stdout:Buffer.alloc(0)}))),refs:output(await git(start,['for-each-ref','--format=%(refname) %(objectname)']))};
}
async function refsChanged(start){if(!start?.refs)return false;try{return JSON.stringify(await readRefs(start))!==JSON.stringify(start.refs);}catch{return true;}}
const inProgress=['MERGE_HEAD','rebase-merge','rebase-apply','CHERRY_PICK_HEAD','REVERT_HEAD','BISECT_LOG','BISECT_START'];
async function progressReason(start){for(const marker of inProgress){const r=await git(start,['rev-parse','--git-path',marker]);const file=path.resolve(start.root,output(r));if(fs.existsSync(file))return 'operation_in_progress';}return null;}
const MAX_REFLOG_BYTES=8*1024*1024;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function readLog(file){
 const fd=fs.openSync(file,fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
 try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.nlink!==1||stat.size>MAX_REFLOG_BYTES)throw Error('Unusable reflog');const data=fs.readFileSync(fd);if(data.length!==stat.size)throw Error('Reflog changed while reading');return data;}finally{fs.closeSync(fd);}
}
function logEntry(line){const match=/^([a-f0-9]{40,64}) ([a-f0-9]{40,64}) [^\n]+\t([^\n]*)\n$/.exec(line);return match?{old:match[1],hash:match[2],message:match[3]}:null;}
async function reflogPaths(start,branch){
 return Object.fromEntries(await Promise.all([['head','logs/HEAD'],['branch','logs/'+branch]].map(async([key,name])=>[key,path.resolve(start.root,output(await git(start,['rev-parse','--git-path',name])))])));
}
async function reflogsEnabled(start){const r=await runGit(start,['config','--get','core.logAllRefUpdates']);return r.code===1 || r.ok && ['true','yes','on','1','always'].includes(output(r).toLowerCase());}
async function captureReflogs(start){
 try{if(!await reflogsEnabled(start))return null;const paths=await reflogPaths(start,start.branch),logs={};
  for(const key of ['head','branch']){const data=readLog(paths[key]),last=data.toString('utf8').split('\n').filter(Boolean).at(-1);if(logEntry(last+'\n')?.hash!==start.head)return null;logs[key]={bytes:data.length,digest:digest(data)};}
  return logs;
 }catch{return null;}
}
function creationLogs(paths,identity,{allowLater=false}={}){
 const logs={},hashes=[identity.parent,identity.hash];let ok=true;
 for(const key of ['head','branch'])try{
  const data=readLog(paths[key]),before=identity.logs?.[key]?.before,after=identity.logs?.[key]?.after;
  if(!before || !Number.isSafeInteger(before.bytes)||before.bytes<0||data.length<before.bytes||digest(data.subarray(0,before.bytes))!==before.digest)throw Error('Reflog baseline mismatch');
  const tail=data.subarray(before.bytes).toString('utf8'),lines=tail.match(/[^\n]*\n/g) || [];
  for(const line of lines){const entry=logEntry(line);if(entry)hashes.push(entry.old,entry.hash);}
  if(!lines.length || (!allowLater && (lines.length!==1 || lines[0]!==tail))){ok=false;continue;}
  const entry=logEntry(lines[0]);if(!entry||entry.old!==identity.parent||entry.hash!==identity.hash||!entry.message.startsWith('commit: ')){ok=false;continue;}
  const end=before.bytes+Buffer.byteLength(lines[0]);
  if(allowLater && (!after || after.bytes!==end || digest(data.subarray(0,end))!==after.digest)){ok=false;continue;}
  logs[key]={before,after:{bytes:end,digest:digest(data.subarray(0,end))}};
 }catch{ok=false;}
 return {ok,logs,hashes};
}
async function proveCommit(start,identity,{allowLater=false}={}){
 let hashes=[identity?.parent,identity?.hash].filter(Boolean);
 try{
  if(identity?.schema!==1 || !/^[a-f0-9]{64}$/.test(identity.nonce) || !/^[a-f0-9]{40,64}$/.test(identity.hash)||!identity.branch?.startsWith('refs/heads/')||!await reflogsEnabled(start))return {ok:false,hashes};
  const paths=await reflogPaths(start,identity.branch),checked=creationLogs(paths,identity,{allowLater});hashes=checked.hashes;
  if(!checked.ok)return {ok:false,hashes};
  const parents=output(await git(start,['rev-list','--parents','-n','1',identity.hash])).split(' ');
  const body=(await git(start,['show','-s','--format=%B',identity.hash])).stdout.toString('utf8'),nonces=body.split('\n').filter(line=>line.startsWith('Tvijo-Commit-Nonce:'));
  if(parents.length!==2||parents[1]!==identity.parent||nonces.length!==1||nonces[0]!=='Tvijo-Commit-Nonce: '+identity.nonce)return {ok:false,hashes};
  return {...checked,paths,identity:{...identity,logs:checked.logs}};
 }catch{return {ok:false,hashes};}
}
function identityFailure(response,hashes){return {...response,ok:false,withdrawn:false,reason:'commit_identity_unproven',identityWarning:true,observedHashes:[...new Set(hashes.filter(value=>/^[a-f0-9]{40,64}$/.test(value)))].slice(0,12)};}
async function capture({root,workspaceRoot=root,storageRoot,environment=process.env,timeoutMs=120000}={}){
 const start={root,workspaceRoot,storageRoot,environment,timeoutMs,ok:false};
 try{
  start.root=fs.realpathSync(root);start.workspaceRoot=fs.realpathSync(workspaceRoot);
  if(!within(start.workspaceRoot,start.root))return {...start,reason:'repo_outside_workspace'};
  // Detect an enclosing repository without asking Git to operate beyond scope.
  let dir=start.root;while(!fs.existsSync(path.join(dir,'.git'))&&path.dirname(dir)!==dir)dir=path.dirname(dir);
  if(!fs.existsSync(path.join(dir,'.git')))return {...start,reason:'no_repo'};
  if(!within(start.workspaceRoot,dir))return {...start,reason:'repo_outside_workspace'};
  const top=await git(start,['rev-parse','--show-toplevel']);start.root=fs.realpathSync(output(top));
  if(!within(start.workspaceRoot,start.root))return {...start,reason:'repo_outside_workspace'};
  if(output(await git(start,['rev-parse','--show-superproject-working-tree'])))return {...start,reason:'submodule'};
  const branch=await runGit(start,['symbolic-ref','-q','HEAD']);if(!branch.ok)return {...start,reason:'detached_head'};start.branch=output(branch);
  const head=await runGit(start,['rev-parse','--verify','HEAD']);if(!head.ok)return {...start,reason:'unborn_head'};start.head=output(head);start.refs=await readRefs(start);start.commitNonce=randomBytes(32).toString('hex');start.reflogs=await captureReflogs(start);
  const progress=await progressReason(start);if(progress)return {...start,reason:progress};
  const name=await runGit(start,['config','user.name']),email=await runGit(start,['config','user.email']);
  if(!name.ok||!email.ok||!output(name)||!output(email))return {...start,reason:'missing_identity'};
  start.startIndex=entries((await git(start,['ls-files','--stage','-z'])).stdout);
  return {...start,ok:true};
 }catch(error){return {...start,reason:error.reason||'no_repo'};}
}
function buildMessage({summary,paths,checks,models,taskId,commitNonce}){
 // Only the first physical line can become the title; model text cannot add trailers.
 const title=clean(String(summary||'Update project files').split(/[\r\n]/)[0]).slice(0,72)||'Update project files';
 const served=[...new Set((models||[]).map(clean).filter(Boolean))].map(x=>x.replace(/[<>()]/g,'_').slice(0,160));
 const safeModels=served.length?served:['unknown'];
 return title+'\n\nSaved Tvijo edits:\n'+paths.map(p=>'- '+clean(p)).join('\n')+'\n\nChecks:\n'+(checks.length?checks.map(c=>'- '+clean(c.command)+': '+(c.ok?'ok':'failed')).join('\n'):'- No command checks recorded.')+'\nCommand side effects (including removals and renames) are not tracked or committed.\n\nTvijo-Agent: tvijo-dshrem 0.10.8\nTvijo-Model: '+safeModels.join(', ')+'\nTvijo-Task: '+clean(taskId).slice(0,160)+'\n'+(commitNonce?'Tvijo-Commit-Nonce: '+commitNonce+'\n':'')+safeModels.map(model=>'Co-Authored-By: Tvijo Agent ('+model+') <noreply@tvijo.com>').join('\n')+'\n';
}
async function unchangedHead(start){return output(await git(start,['rev-parse','HEAD']))===start.head && output(await git(start,['symbolic-ref','-q','HEAD']))===start.branch;}
async function reconcileIndex(start,selected,identityCheck=()=>true){
 const index=path.resolve(start.root,output(await git(start,['rev-parse','--git-path','index']))),lock=index+'.lock';
 let fd,owned=false;const updated=[],skipped=[];
 try{
  fd=fs.openSync(lock,'wx',0o600);owned=true;
  // Preserve the source index timestamp: otherwise a same-size, same-second
  // user edit can become falsely clean in Git's racy-stat cache.
  if(fs.existsSync(index)){const originalStat=fs.statSync(index);fs.writeFileSync(fd,fs.readFileSync(index));fs.futimesSync(fd,originalStat.atime,originalStat.mtime);}fs.closeSync(fd);fd=undefined;
  for(const file of selected){const current=await indexEntries(start,file.relative,lock);if(sameEntry(current,file.head))updated.push(file);else skipped.push({path:file.relative,reason:'index_changed_after_commit'});}
  if(updated.length)await git(start,['update-index','-z','--index-info'],{index:lock,input:updated.map(f=>f.mode+' '+f.oid+'\t'+f.relative+'\0').join('')});
  if(!identityCheck())throw Object.assign(Error('Commit identity changed'),{reason:'commit_identity_unproven'});
  fs.renameSync(lock,index);owned=false;
  return {updated:updated.map(f=>f.relative),skipped};
 }finally{if(fd!==undefined)fs.closeSync(fd);if(owned)fs.unlinkSync(lock);}
}
async function withdrawCommit(start,hash,identityCheck=()=>false){
 // prepare locks both HEAD and its branch. Check the symbolic branch while
 // those locks are held, then commit the compare-and-swap (tested with Git 2.43).
 const headPath=path.resolve(start.root,output(await git(start,['rev-parse','--git-path','HEAD'])));
 let sameBranch=false;
 const transaction=await runGit(start,['update-ref','--stdin'],{
  input:'start\nupdate HEAD '+start.head+' '+hash+'\nprepare\n',
  onPrepared:()=>{sameBranch=fs.readFileSync(headPath,'utf8').trim()==='ref: '+start.branch && identityCheck();return sameBranch;}
 });
 return transaction.ok && sameBranch;
}
async function commitTask({start,writes=[],result,aborted=false,signal,events=[],models=[],taskId,guard=async()=>{},enabled=true,refChanged=false,excludedPaths=[]}={}){
 const cancelled=()=>aborted || signal?.aborted===true;
 const response={ok:false,skipped:[],commandSideEffects:'Command side effects (including removals and renames) are not tracked or committed.'};
 if(!enabled)return {...response,reason:'off'};
 if(cancelled())return {...response,reason:'task_cancelled'};
 if(result?.reason!=='finish'||result?.status!=='done')return {...response,reason:'task_not_done'};
 if(!start?.ok)return {...response,reason:start?.reason||'no_repo'};
 if(refChanged)return {...response,reason:'refs_changed'};
 const writesList=writes instanceof Map?[...writes.values()]:writes;if(!writesList.length)return {...response,reason:'no_saved_edits'};
 const checks=events.map((e,index)=>({...e,index})).filter(e=>e.type==='result'&&e.action?.tool==='run_command').map(e=>({command:e.action.command,ok:e.result?.ok===true,index:e.index}));
 const lastWrite=events.findLastIndex(e=>e.type==='result'&&['write_file','replace_in_file'].includes(e.action?.tool)&&e.result?.ok===true);
 if(checks.length && !checks.at(-1).ok)return {...response,reason:'check_failed'};
 if(checks.length && checks.at(-1).index<lastWrite)return {...response,reason:'check_before_last_write'};
 let temp;
 try{
  await guard();if(!await unchangedHead(start))return {...response,reason:'head_moved'};if(await refsChanged(start))return {...response,reason:'refs_changed'};
  const progress=await progressReason(start);if(progress)return {...response,reason:progress};
  if(!start.storageRoot || !path.isAbsolute(start.storageRoot))return {...response,reason:'storage_unavailable'};
  fs.mkdirSync(start.storageRoot,{recursive:true,mode:0o700});
  if(within(start.root,fs.realpathSync(start.storageRoot)))return {...response,reason:'storage_inside_repo'};
  temp=fs.mkdtempSync(path.join(start.storageRoot,'auto-commit-'));const index=path.join(temp,'index');
  await git(start,['read-tree',start.head],{index});const selected=[];
  for(const file of writesList){
   if(cancelled())return {...response,reason:'task_cancelled'};
   const absolute=file.absolute||file.document?.uri?.fsPath;const relative=path.relative(start.root,absolute).split(path.sep).join('/');
   const skip=reason=>response.skipped.push({path:relative,reason});
   if(!within(start.root,absolute)){skip('outside_repo');continue;}
   if(require('./project-rules').quarantineMatch(absolute,excludedPaths)){skip('rules_quarantined');continue;}
   let checked;try{checked=safePath(start.root,relative,true);const stat=fs.lstatSync(checked);if(!stat.isFile()||stat.nlink!==1)throw Error();}catch{skip('unsafe_path');continue;}
   const head=await headEntry(start,relative),current=await indexEntries(start,relative),original=start.startIndex.filter(e=>e.path===relative);
   if(file.previous===null && (head||current.length||original.length)){skip('new_file_already_tracked');continue;}
   if(!sameEntry(original,head)||!sameEntry(current,head)){skip('user_staged');continue;}
   const ignored=await runGit(start,['check-ignore','-q','--',relative]);if(ignored.code===0){skip('ignored');continue;}if(ignored.code!==1){skip('git_failed');continue;}
   if(file.previous!==null){if(!head){skip('previous_not_in_head');continue;}
    const previousHash=output(await git(start,['hash-object','--path='+relative,'--stdin'],{input:Buffer.from(file.previous,'utf8')}));if(previousHash!==head.oid){skip('mixed_authorship');continue;}}
   const bytes=Buffer.isBuffer(file.content)?file.content:Buffer.from(file.content,'utf8');
   if(!fs.readFileSync(checked).equals(bytes)){skip('disk_changed');continue;}
   const oid=output(await git(start,['hash-object','-w','--path='+relative,'--stdin'],{input:bytes}));
   if(oid===head?.oid){skip('unchanged');continue;}
   const mode=head?.mode||'100644';if(!['100644','100755'].includes(mode)){skip('unsupported_mode');continue;}
   await git(start,['update-index','--add','--cacheinfo',mode,oid,relative],{index});selected.push({relative,head,mode,oid,bytes,absolute:checked});
  }
  if(!selected.length)return {...response,reason:'no_eligible_edits'};
  const message=buildMessage({summary:result.text,paths:selected.map(f=>f.relative),checks,models,taskId,commitNonce:start.commitNonce});const messageFile=path.join(temp,'message');fs.writeFileSync(messageFile,message,{flag:'wx',mode:0o600});
  await guard();if(!await unchangedHead(start))return {...response,reason:'head_moved'};if(await refsChanged(start))return {...response,reason:'refs_changed'};
  if(await progressReason(start))return {...response,reason:'operation_in_progress'};
  for(const file of selected){if(!sameEntry(await indexEntries(start,file.relative),file.head))return {...response,reason:'index_changed'};if(!fs.readFileSync(safePath(start.root,file.relative,true)).equals(file.bytes))return {...response,reason:'disk_changed'};}
  if(cancelled())return {...response,reason:'task_cancelled'};
  const committed=await runGit(start,['commit','-F',messageFile],{index,signal});
  const observedHead=await runGit(start,['rev-parse','HEAD']),observed=output(observedHead);
  if(!observedHead.ok)return identityFailure(response,[start.head]);
  if(!committed.ok && observed===start.head)return {...response,reason:cancelled()?'task_cancelled':committed.timedOut?'hook_timeout':'hook_or_signing_failed',detail:clean(committed.stderr.toString('utf8')).slice(0,2000)};
  const candidate={schema:1,hash:observed,parent:start.head,branch:start.branch,nonce:start.commitNonce,logs:Object.fromEntries(['head','branch'].map(key=>[key,{before:start.reflogs?.[key]}]))};
  const proof=await proveCommit(start,candidate);
  const currentBranch=await runGit(start,['symbolic-ref','-q','HEAD']);
  if(!proof.ok || !currentBranch.ok || output(currentBranch)!==start.branch)return identityFailure(response,[start.head,observed,...proof.hashes]);
  // H is independently identified by both reflogs and the private host nonce.
  // HEAD alone, the task trailer, and a matching parent are not attribution.
  const {hash,parent}=proof.identity;
  const stillProven=()=>{try{return creationLogs(proof.paths,proof.identity).ok;}catch{return false;}};
  const record={...response,ok:true,hash,identity:proof.identity,cancelledAfterCommit:cancelled(),root:start.root,workspaceRoot:start.workspaceRoot,paths:selected.map(f=>f.relative),checks};
  try{
   // Hooks run with the temporary index and can restage or add paths. Inspect
   // what Git actually committed before changing any entry in the user's index.
   const diff=(await git(start,['diff-tree','-r','--no-commit-id','--name-status','-z','--no-renames',parent,hash])).stdout.toString('utf8').split('\0').filter(Boolean);
   record.paths=[];for(let i=0;i<diff.length;i+=2)record.paths.push(diff[i+1]);
   const selectedPaths=new Set(selected.map(file=>file.relative));record.hookAddedPaths=record.paths.filter(file=>!selectedPaths.has(file));
   if(record.hookAddedPaths.length){
    const withdrawn=await withdrawCommit(start,hash,stillProven);
    if(!withdrawn)return identityFailure(response,[hash,output(await git(start,['rev-parse','HEAD'])),start.head]);
    return {...record,ok:!withdrawn,withdrawn,reason:withdrawn?'hook_added_paths_withdrawn':'hook_added_paths_withdraw_failed',indexWarning:!withdrawn};
   }
   const actual=[];for(const file of selected){const entry=await headEntry(start,file.relative,hash);actual.push({...file,mode:entry?.mode || '0',oid:entry?.oid || '0'.repeat(hash.length)});}
   if(!stillProven())return identityFailure(response,[hash,output(await git(start,['rev-parse','HEAD'])),start.head]);
   const reconciled=await reconcileIndex(start,actual,stillProven);record.skipped.push(...reconciled.skipped);
  }catch(error){if(error.reason==='commit_identity_unproven')return identityFailure(response,[hash,output(await git(start,['rev-parse','HEAD'])),start.head]);record.indexWarning=true;}
  record.cancelledAfterCommit=cancelled();return record;
 }catch(error){return {...response,reason:error.reason||'git_failed'};}
 finally{if(temp)for(const name of ['index.lock','index','message'])try{fs.unlinkSync(path.join(temp,name));}catch(error){if(error.code!=='ENOENT'){} }}
}
async function undo({root,workspaceRoot,hash,identity,environment=process.env,timeoutMs=120000}){
 const start=await capture({root,workspaceRoot,environment,timeoutMs});if(!start.ok)return {ok:false,reason:start.reason};
 if(!/^[a-f0-9]{40,64}$/.test(hash))return {ok:false,reason:'invalid_commit'};
 if(identity?.hash!==hash)return {ok:false,reason:'commit_identity_unproven'};
 const proof=await proveCommit(start,identity,{allowLater:true});if(!proof.ok)return {ok:false,reason:'commit_identity_unproven'};
 const remote=output(await git(start,['for-each-ref','--format=%(refname)','--contains',hash,'refs/remotes/']));
 const soft=start.head===hash && start.branch===identity.branch && !remote;
 try{
  if(soft){const valid=()=>{try{return creationLogs(proof.paths,identity,{allowLater:true}).ok;}catch{return false;}};
   // CAS has soft-reset semantics: move only this proven tip, preserving index
   // and disk. A concurrent amend/switch cannot turn Undo into a reset of B.
   if(!await withdrawCommit({...start,head:identity.parent},hash,valid))return {ok:false,reason:'commit_identity_unproven'};
  }else await git(start,['revert','--no-edit',hash]);
  return {ok:true,method:soft?'soft_reset':'revert'};
 }catch(error){return {ok:false,reason:error.reason||'git_failed'};}
}
const REASONS={
 commit_identity_unproven:['HEAD changed during commit — Tvijo withdrew nothing; inspect the history','HEAD изменился во время коммита — Tvijo ничего не отзывал; проверьте историю'],task_cancelled:['cancelled before a commit was created','отменено до создания коммита'],hook_added_paths_withdrawn:['hook added paths; commit withdrawn, edits remain on disk','хук добавил файлы — коммит отозван, изменения остались на диске'],hook_added_paths_withdraw_failed:['hook added paths; concurrent HEAD/branch change prevented withdrawal — review this commit','хук добавил файлы; изменение HEAD/ветки помешало отзыву — проверьте коммит'],refs_changed:['HEAD or Git refs changed during the task; review the command effects','HEAD или ссылки Git изменились во время задачи; проверьте действия команд'],rules_quarantined:['rules file is quarantined','файл правил в карантине'],off:['disabled in Settings','выключен в настройках'],task_not_done:['the task did not finish with status done','задача не завершилась со статусом done'],no_saved_edits:['no saved editor edits','нет сохранённых правок редактора'],no_repo:['no Git repository','нет репозитория Git'],detached_head:['HEAD is detached','HEAD не привязан к ветке'],unborn_head:['the branch has no first commit','в ветке нет первого коммита'],operation_in_progress:['a Git operation is in progress','идёт операция Git'],repo_outside_workspace:['the repository root is outside this workspace','корень репозитория вне рабочей области'],submodule:['submodule commits need manual review','коммит подмодуля требует ручной проверки'],missing_identity:['configure Git user.name and user.email','задайте user.name и user.email в Git'],head_moved:['HEAD changed during the task','HEAD изменился во время задачи'],no_eligible_edits:['no files with exclusively Tvijo edits','нет файлов только с правками Tvijo'],user_staged:['user-staged file preserved','пользовательский staging сохранён'],mixed_authorship:['pre-existing user edits preserved','исходные правки пользователя сохранены'],new_file_already_tracked:['new-file path is already tracked','путь нового файла уже отслеживается Git'],ignored:['file is ignored by Git','файл исключён Git'],outside_repo:['file is outside the repository','файл вне репозитория'],unsafe_path:['file path or link identity is unsafe','небезопасный путь или связь файла'],previous_not_in_head:['previous file version is absent from HEAD','исходной версии файла нет в HEAD'],disk_changed:['file changed on disk','файл изменился на диске'],unchanged:['no saved change','нет сохранённых изменений'],check_failed:['the last command failed','последняя команда завершилась ошибкой'],check_before_last_write:['the last check preceded the last edit','последняя проверка была до последней правки'],hook_timeout:['Git hook timed out','истекло время Git-хука'],hook_or_signing_failed:['Git hook or signing failed','ошибка Git-хука или подписи'],index_changed:['user staging changed before commit','staging пользователя изменился до коммита'],index_changed_after_commit:['new user staging preserved after commit','новый staging пользователя сохранён после коммита'],git_failed:['Git failed; saved edits are preserved','ошибка Git; сохранённые правки оставлены'],storage_unavailable:['local commit storage is unavailable','локальное хранилище коммитов недоступно'],storage_inside_repo:['commit storage is inside the repository','хранилище коммитов внутри репозитория'],unsupported_mode:['unsupported file mode','неподдерживаемый режим файла']};
function describe(reason,locale='en'){return REASONS[reason]?.[locale==='ru'?1:0] || reason;}
// Undo is a user action; its outcome must be readable without knowing Git internals.
function undoMessage(result,hash,locale='en'){
 const ru=locale==='ru',short=String(hash||'').slice(0,12);
 if(result?.ok)return result.method==='soft_reset'
  ? (ru?'Коммит '+short+' снят с ветки; правки остались на диске и в индексе.':'Commit '+short+' removed from the branch; edits stay on disk and staged.')
  : (ru?'Коммит '+short+' уже нельзя снять с ветки, поэтому создан коммит отмены (revert).':'Commit '+short+' could not be removed from the branch, so a revert commit was created.');
 if(result?.reason==='commit_identity_unproven')return ru
  ? 'Отмена не выполнена: Tvijo не может доказать, что коммит '+short+' создан им, поэтому ничего не менял. Проверьте историю: git log и git reflog.'
  : 'Undo refused: Tvijo cannot prove it created commit '+short+', so nothing was changed. Check the history with git log and git reflog.';
 return (ru?'Не удалось отменить коммит '+short+': ':'Could not undo commit '+short+': ')+describe(result?.reason||'git_failed',locale)+(ru?'. Больше ничего не изменено.':'. Nothing else was changed.');
}
module.exports={capture,commitTask,undo,buildMessage,gitEnvironment,describe,undoMessage,readRefs,refsChanged};
