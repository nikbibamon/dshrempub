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
 return {h,review,docs,folder,setChoice:v=>choice=v,setScope:v=>scope=v};
}
test('frozen revalidate uses no journal or loader; altered instance and thrown integrity check refuse',async()=>{
 let loads=0,io=0;const f=await coreFixture({loadExercise:async id=>{loads++;return exercise.load(id);},openJournal:async()=>({read:async()=>[],append:async()=>{io++;return {};}})});
 await f.h.flush();const before=io;assert.strictEqual(f.h.revalidate(f.review),f.review.artifact);assert.equal(io,before);assert.equal(loads,1);
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
