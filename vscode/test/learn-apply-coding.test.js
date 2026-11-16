const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {host}=require('./fixtures/learn-extension-host'),{createHost}=require('../lib/learn-host'),exercise=require('../lib/learn-exercise'),{sha256}=require('../lib/learn-candidate'),{derive}=require('../lib/learn-scorer'),coding=require('../lib/coding');
async function documents(){const all=[];return {all,open:async uri=>{if(!uri.fsPath)return {uri:{fsPath:'untitled'},languageId:uri.language||'plaintext',getText:()=>uri.content};let d=all.find(x=>x.uri.fsPath===uri.fsPath);if(!d){let text=await fs.readFile(uri.fsPath,'utf8');d={uri,isDirty:false,version:1,languageId:'python',getText:()=>text,positionAt:n=>n,set(value){text=value;this.isDirty=true;this.version++;}};all.push(d);}return d;}};}
async function appFixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'learn-integration-')),docs=await documents();
 let offline=false;const attempted=[];
 const app=host({root,storage:root,onRequest:async r=>{if(offline){attempted.push(r.url);throw Error('offline fixture: no service available');}},documentFor:docs.open,applyEdit:async edit=>{for(const op of edit.operations){const d=await docs.open(op.uri);d.set(op.text);}return true;},syntaxHost:{invalidate(){},cancelActive(){},dispose(){},check:async()=>null,newRun:()=>({})}});
 Object.defineProperty(app.vscode.workspace,'textDocuments',{get:()=>docs.all});app.settings.set('learn.enabled',true);
 await app.receive({type:'ready'});offline=true;await app.commands.get('tvijo.learn.startExercise')();
 // The stand is a subfolder of this fixture's open workspace; the real activeWorkspace.select is used.
 return {app,docs,root,attempted,stand:path.join(root,'learn/workspaces/day-planner/1'),async rows(){await new Promise(r=>setTimeout(r,15));const f=path.join(root,'learn',app.scope('tenant-a'),'journal.jsonl');return (await fs.readFile(f,'utf8')).trim().split('\n').map(x=>JSON.parse(x));}};
}
test('real capture, previewCoding and apply: P1/P2 apply to buffers, P3..P5 remain openable; no server/hints',async()=>{
 const f=await appFixture(),{app}=f;try{
  const before=app.requests.length;
  for(let n=1;n<=5;n++){
   await app.commands.get('tvijo.learn.openProposal')('task-dp-p'+n);assert.deepEqual(app.errors,[]);
   const preview=app.infos.findLast(x=>x[0]==='Review this candidate and choose your next step.');assert.deepEqual(preview.slice(1),['Run trusted tests','Run my check','Apply reviewed coding proposal']);
   assert.ok(!app.shown.some(d=>/truth|integrity|test_result_verified|candidate_modified|zero_duration_task/.test(d?.getText?.()||'')));
   await app.commands.get('tvijo.learn.runTrustedTests')();
   app.warning(n<3?'Apply reviewed edits':n===5?'Ask independent review':'Return for rework');
   await app.commands.get('tvijo.applyCoding')();assert.deepEqual(app.errors,[]);
   assert.equal(app.warnings.at(-1).length,5);
  }
  assert.equal(app.requests.length,before,'no successful service calls after confirmed sign-in');assert.ok(f.attempted.every(url=>url.endsWith('/account')),'only the existing command wrapper attempts an optional account refresh; all attempts fail offline');
  assert.equal(f.docs.all.filter(d=>d.isDirty).length,2);
  await app.commands.get('tvijo.learn.openProposal')('task-dp-p1');assert.match(app.posts.filter(x=>x.type==='state').at(-1).error.text,/already decided/);
  // Progress awaits the real recorder flush; a fixed 15 ms sleep cannot prove persistence.
  await app.commands.get('tvijo.learn.progress')();
  const rows=await f.rows();assert.equal(rows.filter(x=>x.type==='candidate_presented').length,5);assert.equal(new Set(rows.filter(x=>x.type==='candidate_presented').map(x=>x.candidate_id)).size,5);
  const pack=await exercise.load('day-planner/1');const result=derive(rows,undefined,{truth:pack.manifest.truth,ctx:exercise.ctxFor(pack)});assert.deepEqual(result.rows.map(x=>x.outcome),['justified','justified','return_without_grounds','justified','justified']);
 }finally{app.close();}
});
test('stand mutations: saved edge changes P1 identity, P4 refuses saved edge; dirty and edited targets refuse without overwrite',async()=>{
 const f=await appFixture(),{app}=f;try{
  await fs.appendFile(path.join(f.stand,'p1/tests/test_planner_edge.py'),'\n# learner edge\n');await app.commands.get('tvijo.learn.openProposal')('task-dp-p1');assert.deepEqual(app.errors,[]);
  await fs.appendFile(path.join(f.stand,'p4/tests/test_planner_edge.py'),'\n# preserved\n');await app.commands.get('tvijo.learn.openProposal')('task-dp-p4');assert.match(app.posts.filter(x=>x.type==='state').at(-1).error.text,/changed since the exercise started/);
  await fs.appendFile(path.join(f.stand,'p3/planner.py'),'\n# preserved\n');await app.commands.get('tvijo.learn.openProposal')('task-dp-p3');assert.match(app.posts.filter(x=>x.type==='state').at(-1).error.text,/changed since the exercise started/);
  (await f.docs.open(app.Uri.file(path.join(f.stand,'p5/tests/test_planner_edge.py')))).isDirty=true;await app.commands.get('tvijo.learn.openProposal')('task-dp-p5');assert.match(app.posts.filter(x=>x.type==='state').at(-1).error.text,/Save pending changes/);
 }finally{app.close();}
});
async function coreFixture(options={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'learn-core-'));let folder=root,scope=sha256('account'),choice='Apply reviewed edits';const docs=await documents();
 const vscode={workspace:{get textDocuments(){return docs.all;}},window:{showWarningMessage:async()=>choice,showInformationMessage:async()=>{},showInputBox:async()=>'{invalid'}};
 const h=createHost({vscode,storageRoot:root,enabled:()=>true,scope:()=>scope,folder:()=>folder,...options});folder=await h.start('day-planner/1',scope);const review=await h.openProposal('task-dp-p1',async()=>{});h.present(review);
 return {h,review,docs,folder,vscode,setChoice:v=>choice=v,setScope:v=>scope=v};
}
test('frozen revalidate uses no journal or loader; altered instance and thrown integrity check refuse',async()=>{
 let loads=0,io=0;const f=await coreFixture({loadExercise:async id=>{loads++;return exercise.load(id);},openJournal:async()=>({read:async()=>[],append:async()=>{io++;return {};}})});
 await f.h.flush();const pack=f.h.active().exercise,templateBytes=pack.files[pack.manifest.tasks['task-dp-p1'].proposal],hashes=require('../lib/learn-candidate'),fields={thread_id:f.review.artifact.thread_id,snapshot_hash:f.review.artifact.snapshot_hash},anchor={candidate_id:hashes.candidateId(f.review.artifact),instance_sha256:hashes.artifactSha256(f.review.artifact)};
 assert.notEqual(hashes.sha256(templateBytes),anchor.instance_sha256);
 const frozenInput={templateBytes,manifestSha256:hashes.sha256(templateBytes),frozenArtifact:f.review.artifact,fields,anchor};assert.deepEqual(exercise.checkFrozen(frozenInput),[]);assert.ok(exercise.checkFrozen({...frozenInput,templateBytes:templateBytes+' '}).includes('template_hash_mismatch'));assert.ok(exercise.checkFrozen({...frozenInput,anchor:{...anchor,instance_sha256:'0'.repeat(64)}}).includes('anchor_mismatch'));
 const before=io;assert.strictEqual(f.h.revalidate(f.review),f.review.artifact);assert.equal(io,before);assert.equal(loads,1);
 const honest=f.review.artifact;f.review.artifact={...honest,thread_id:'foreign'};assert.throws(()=>f.h.revalidate(f.review),{code:'learn_integrity'});
 f.review.artifact=null;assert.throws(()=>f.h.revalidate(f.review),{code:'learn_integrity'});f.review.artifact=honest;
 const check=exercise.checkFrozen;exercise.checkFrozen=()=>{throw Error('broken integrity');};try{assert.throws(()=>f.h.revalidate(f.review),{code:'learn_integrity'});}finally{exercise.checkFrozen=check;}
});
test('observer throws, hangs or becomes unavailable: gate falls back without waiting; Esc is not terminal',async()=>{
 for(const append of [()=>{throw Error('append');},()=>new Promise(()=>{})]){
  let timeout;const timers={setTimeout(fn){timeout=fn;return 1;},clearTimeout(){}};
  const f=await coreFixture({openJournal:async()=>({read:async()=>[],append}),recorderFactory:opts=>require('../lib/learn-recorder').createRecorder({...opts,timers,diagnostics(){throw Error('diagnostic');}})});
  assert.equal(await f.h.confirm(f.review,async()=>true),true);
  for(let i=0;i<20;i++){await Promise.resolve();timeout?.();}
  assert.equal(f.h.ready(f.review),false);assert.equal(await f.h.confirm(f.review,async()=>true),true);
 }
 const f=await coreFixture();f.setChoice(undefined);assert.equal(await f.h.confirm(f.review,async()=>true),false);await f.h.flush();assert.equal(f.h.active().decided.size,0);
 f.setChoice('Apply reviewed edits');assert.equal(await f.h.confirm(f.review,async()=>false),true);f.h.recordApply(f.review,true);await f.h.flush();assert.equal(f.h.active().decided.size,1);
});
test('confirm during an unfinished check returns immediately and records unknown; late check cannot rescue it',async()=>{
 const f=await coreFixture(),replay=require('../lib/learn-replay'),old=replay.run;let release;replay.run=()=>new Promise(r=>release=r);
 try{
  const pending=f.h.check(f.review,'trusted');await Promise.resolve();assert.equal(await f.h.confirm(f.review,async()=>false),true);f.h.recordApply(f.review,true);await f.h.flush();
  const pack=f.h.active().exercise;let rows=await f.h.active().journal.read();assert.equal(derive(rows,undefined,{truth:pack.manifest.truth}).rows[0].outcome,'unknown');
  const e=rows[0],hash=e.expected_tree_trusted;release({result:'pass',bound:true,tree_sha256:hash,tree_sha256_after:hash,expected_tree_sha256:hash,input_sha256:null,output_sha256:sha256(''),exit_code:0,duration_ms:1});await pending;await f.h.flush();rows=await f.h.active().journal.read();assert.equal(rows.at(-1).type,'check');assert.equal(derive(rows,undefined,{truth:pack.manifest.truth}).rows[0].outcome,'unknown');
 }finally{replay.run=old;}
});
test('real apply refuses a changed account, target or workspace without writing',async()=>{
 for(const kind of ['account','target','workspace']){
  const f=await appFixture(),{app}=f;try{
   await app.commands.get('tvijo.learn.openProposal')('task-dp-p1');app.warning('Apply reviewed edits');
   if(kind==='account')await app.context.secrets.store('tvijo.auth',JSON.stringify({access_token:'different-account',api_base:app.base}));
   if(kind==='target')await fs.appendFile(path.join(f.stand,'p1/planner.py'),'\n# preserve changed target\n');
   if(kind==='workspace'){app.vscode.workspace.workspaceFolders=[];app.workspaceChanged();}
   await app.commands.get('tvijo.applyCoding')();assert.equal(f.docs.all.filter(d=>d.isDirty).length,0,kind);
   assert.equal((await f.rows()).filter(e=>e.type==='decision').length,0,kind);
  }finally{app.close();}
 }
});
test('real apply records integrity refusal as unknown and does not write a buffer',async()=>{
 const module=require('../lib/learn-host'),original=module.createHost;let h;module.createHost=opts=>(h=original(opts));let f;
 try{f=await appFixture();}finally{module.createHost=original;}
 const {app}=f;try{
  await app.commands.get('tvijo.learn.openProposal')('task-dp-p1');h.revalidate=()=>{throw Object.assign(new Error('synthetic integrity refusal'),{code:'learn_integrity'});};app.warning('Apply reviewed edits');await app.commands.get('tvijo.applyCoding')();
  const rows=await f.rows(),pack=h.active().exercise;assert.equal(rows.at(-1).type,'decision');assert.equal(rows.at(-1).observer_ok,false);assert.equal(derive(rows,undefined,{truth:pack.manifest.truth}).rows[0].outcome,'unknown');assert.equal(f.docs.all.filter(d=>d.isDirty).length,0);
 }finally{app.close();}
});
test('throwing readiness, unavailable journal and disabled scope preserve both base gate values',async()=>{
 for(const options of [{openJournal:async()=>{throw Error('offline journal');}},{recorderFactory:()=>({ready(){throw Error('ready');},submit(){throw Error('submit');},flush:async()=>{}})}]){
  const f=await coreFixture(options);for(const approved of [true,false])assert.equal(await f.h.confirm(f.review,async()=>approved),approved);
 }
 const f=await coreFixture();f.setScope(sha256('other-account'));assert.equal(f.h.ready(f.review),false);assert.equal(await f.h.confirm(f.review,async()=>false),false);
});
test('account changes while decision modal is open cannot write an old candidate into the new account journal',async()=>{
 const f=await coreFixture();await f.h.flush();const oldJournal=f.h.active().journal,before=await oldJournal.read();
 f.vscode.window.showWarningMessage=async()=>{f.setScope(sha256('new-account'));await f.h.start('day-planner/1',sha256('new-account'));return 'Apply reviewed edits';};
 assert.equal(await f.h.confirm(f.review,async()=>false),true);f.h.recordApply(f.review,false);await f.h.flush();
 const afterOld=await oldJournal.read(),afterNew=await f.h.active().journal.read();
 if(process.env.LEARN_REPRO_RECEIPTS){const name='repro-account-modal-'+Date.now()+'.json';await fs.writeFile(path.join(process.env.LEARN_REPRO_RECEIPTS,name),JSON.stringify({sequence:['present old account candidate','open decision modal','switch scope and start new account exercise while modal is open','choose Apply','record integrity failure after guard refuses'],before,afterOld,afterNew},null,2),{flag:'wx'});}
 assert.deepEqual(afterOld,before);assert.deepEqual(afterNew,[]);
});

// AC-5: a finite, slow append is distinct from a hung or throwing append.
test('AC-5 slow append: virtual clock confirm returns the disabled-Learn approved value before journal write', async () => {
 const {createRecorder}=require('../lib/learn-recorder');
 const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
 for(const approved of [true,false]){
  let now=0,next=0,on=true;const tasks=new Map(),written=[];
  const timers={setTimeout(fn,ms){const id=++next;tasks.set(id,{at:now+ms,fn});return id;},clearTimeout(id){tasks.delete(id);}};
  const tick=async ms=>{now+=ms;for(const [id,job]of [...tasks])if(job.at<=now){tasks.delete(id);job.fn();}await drain();};
  const f=await coreFixture({enabled:()=>on,openJournal:async()=>({read:async()=>[],append:event=>new Promise(resolve=>timers.setTimeout(()=>{written.push(event);resolve();},100))}),recorderFactory:opts=>createRecorder({...opts,timers})});
  await drain();f.setChoice(approved?'Apply reviewed edits':'Return for rework');
  on=false;const baseline=await f.h.confirm(f.review,async()=>approved);on=true;
  let returned=false;const confirming=f.h.confirm(f.review,async()=>{throw Error('unexpected base fallback');}).then(value=>{returned=true;return value;});
  await drain();assert.equal(returned,true,'confirm must settle while the clock is frozen');
  assert.equal(await confirming,baseline);assert.equal(now,0);assert.deepEqual(written,[]);
  if(approved)f.h.recordApply(f.review,true);
  let flushed=false;const flushing=f.h.flush().then(()=>{flushed=true;});await drain();assert.equal(flushed,false);
  await tick(99);assert.deepEqual(written,[]);assert.equal(flushed,false);
  await tick(1);assert.equal(written[0].type,'candidate_presented');assert.equal(flushed,false);
  await tick(100);await flushing;
  assert.equal(written.at(-1).type,'decision');assert.equal(written.at(-1).decision,approved?'accept':'return');
  assert.equal(f.h.ready(f.review),true,'finite slow writes do not degrade observation');
 }
});

for(const mode of ['rejection','timeout'])test(`AC-5 verified pack preload ${mode}: pack_preload_failed, exercise never starts and apply is refused`,async t=>{
 const module=require('../lib/learn-host'),original=module.createHost;let h,entered,preloadError;
 const starting=new Promise(resolve=>entered=resolve);
 module.createHost=opts=>{
  h=original({...opts,loadExercise:()=>mode==='rejection'?Promise.reject(Error('synthetic loader failure')):new Promise(()=>{})});
  const start=h.start;h.start=(...args)=>{t.mock.timers.enable({apis:['setTimeout']});const pending=start(...args).catch(error=>{preloadError=error;throw error;});entered();return pending;};return h;
 };
 let f;
 try{
  const pending=appFixture();await starting;
  if(mode==='timeout')t.mock.timers.tick(2000);
  f=await pending;t.mock.timers.reset();
  assert.equal(h.active(),null);assert.deepEqual(f.docs.all,[]);
  const error=f.app.posts.filter(x=>x.type==='state'&&x.error).at(-1).error;
  assert.equal(preloadError.code,'pack_preload_failed');assert.match(error.text,/exercise could not be loaded and verified/i);
  assert.ok(!f.app.infos.some(x=>/Exercise ready|Review this candidate/.test(x[0])));
  await assert.rejects(fs.stat(f.stand),{code:'ENOENT'});
  await f.app.commands.get('tvijo.applyCoding')();
  assert.match(f.app.posts.filter(x=>x.type==='state'&&x.error).at(-1).error.text,/Open and review a coding proposal first/);
  assert.deepEqual(f.docs.all,[]);assert.equal(f.app.warnings.length,0);
 }finally{module.createHost=original;t.mock.timers.reset();f?.app.close();}
});

// AC-8: compare the same task in the same attempt before and after a saved edit.
for(const n of [1,4])test(`AC-8 paired candidate_id before/after saved edge-test edit P${n}: ${n===1?'new snapshot and candidate, no refusal':'stand_modified, file preserved'}`,async()=>{
 const f=await coreFixture(),task='task-dp-p'+n,edge=path.join(f.folder,`p${n}/tests/test_planner_edge.py`);
 // P1 is opened by coreFixture; P4 uses the very same real capture path.
 const before=n===1?f.review:await f.h.openProposal(task,async()=>{});
 const {candidateId,treeSha256}=require('../lib/learn-candidate');
 const beforeId=candidateId(before.artifact),beforeHash=before.artifact.snapshot_hash;
 const saved=(await fs.readFile(edge,'utf8'))+'\n# learner saved edge check\n';await fs.writeFile(edge,saved);
 const stat=await fs.stat(edge);
 if(n===1){
  const after=await f.h.openProposal(task,async()=>{});
  assert.notEqual(after.artifact.snapshot_hash,beforeHash);assert.notEqual(candidateId(after.artifact),beforeId);
  assert.equal(after.artifact.thread_id,before.artifact.thread_id,'same exercise attempt');
  assert.equal(after.artifact.snapshot_hash,treeSha256(Object.fromEntries(after.snapshot.files.map(file=>[file.path,file.content]))));
  assert.equal(after.snapshot.files.find(file=>file.path==='p1/tests/test_planner_edge.py').content,saved);
  assert.ok(!after.artifact.edits.some(edit=>edit.path.endsWith('test_planner_edge.py')));
  assert.doesNotThrow(()=>coding.validateArtifact(after.artifact,after.snapshot));
 }else{
  assert.ok(before.artifact.edits.some(edit=>edit.path==='p4/tests/test_planner_edge.py'));
  await assert.rejects(f.h.openProposal(task,async()=>{}),{code:'stand_modified'});
 }
 assert.equal(await fs.readFile(edge,'utf8'),saved);assert.equal((await fs.stat(edge)).mtimeMs,stat.mtimeMs);
 await f.h.flush();
});
