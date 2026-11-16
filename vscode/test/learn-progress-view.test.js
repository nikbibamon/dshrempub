const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {project,render,validMessage}=require('../lib/learn-progress-view'),{host}=require('./fixtures/learn-extension-host'),{derive}=require('../lib/learn-scorer');
const golden=require('./fixtures/learn-golden-vectors.json');
test('explicit nested projection discards private keys and values and practice never certifies mastery',()=>{
 const bait='private-token-123',v=golden.vectors[0],r=derive(v.events,undefined,{truth:v.truth});r.code=bait;r.rows[0].diff=bait;r.rows[0].flags.push(bait);
 const state=project({lastAttempt:r,cumulative:r});assert.deepEqual(Object.keys(state).sort(),['decisions','flags','independent_share','practice_only','skills']);
 assert.deepEqual(Object.keys(state.skills[0]).sort(),['checkPoints','id','independentTotal','practice_passed','total']);
 assert.deepEqual(Object.keys(state.decisions[0]).sort(),['assistance','candidate_id','decision','flags','outcome','points','source']);
 assert.ok(!JSON.stringify(state).includes(bait));assert.equal(state.practice_only,true);
 const html=render(state,'a'.repeat(32));assert.ok(!html.includes(bait));assert.ok(!html.includes('mastered'));assert.ok(!html.includes('localStorage'));
 for(const csp of ["default-src 'none'","connect-src 'none'","frame-src 'none'","form-action 'none'","base-uri 'none'","script-src 'nonce-" ])assert.ok(html.includes(csp));
 assert.ok(!/onclick=|onerror=/.test(html));assert.match(html,/focus-visible/);assert.match(html,/<caption>/);assert.match(html,/scope="col"/);
 assert.throws(()=>render(state,'<script>'),TypeError);
});
test('messages validate exact keys and exercise; malicious nested data cannot appear in HTML',()=>{
 for(const type of ['export','delete','open-exercise'])assert.equal(validMessage({type}),true);
 for(const message of [{type:'export',path:'/private'},{type:'open-exercise',exercise_id:'../x'},{type:'script'},{}])assert.equal(validMessage(message),false);
 const x='<img src=x onerror=alert(1)>';const state={skills:[{id:'last_attempt',total:x,extra:x}],decisions:[{candidate_id:x,outcome:x,points:x,flags:[x],source:'human'}],flags:[x],independent_share:x};assert.ok(!render(state,'b'.repeat(32)).includes(x));
});
test('real commands open host-owned progress, reject injected messages, export and confirm deletion offline',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'learn-progress-'));let offline=false;
 const app=host({root,storage:root,onRequest:async()=>{if(offline)throw Error('offline');}});try{
  app.settings.set('learn.enabled',true);await app.receive({type:'ready'});offline=true;
  await app.commands.get('tvijo.learn.startExercise')();await app.commands.get('tvijo.learn.progress')();const panel=app.panels.at(-1);assert.equal(panel.viewType,'tvijo.learn.progress');assert.deepEqual(panel.options.localResourceRoots,[]);
  const target=path.join(root,'export.json');app.vscode.window.showSaveDialog=async()=>app.Uri.file(target);
  await panel.receive({type:'export',path:'/private'});await assert.rejects(fs.access(target));
  await panel.receive({type:'export'});const value=JSON.parse(await fs.readFile(target,'utf8'));assert.ok(Array.isArray(value.events));assert.equal(value.progress.practice_only,true);
  app.warning(undefined);await app.commands.get('tvijo.learn.deleteData')();assert.equal(panel.disposed,undefined);
  app.warning('Delete local Learn data');await app.commands.get('tvijo.learn.deleteData')();assert.equal(panel.disposed,true);
  await assert.rejects(fs.access(path.join(root,'learn',app.scope('tenant-a'),'journal.jsonl')));
 }finally{app.close();}
});
