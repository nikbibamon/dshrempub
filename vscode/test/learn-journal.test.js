const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {open}=require('../lib/learn-journal'),{createRecorder}=require('../lib/learn-recorder'),{validateEvent}=require('../lib/learn-schema'),{derive}=require('../lib/learn-scorer'),{sha256,eventId}=require('../lib/learn-candidate');
const golden=require('./fixtures/learn-golden-vectors.json');
const ctx={tasks:new Set(['task-dp-p1']),exercises:new Set(['day-planner/1']),criteria:new Set(['zero_duration_task'])};
for(const s of golden.schema_vectors)test(s.id,()=>assert.deepEqual(validateEvent(s.event,s.ctx&&Object.fromEntries(Object.entries(s.ctx).map(([k,v])=>[k,new Set(v)]))),s.errors));
test('validator is total for mutations of every field of all event types',()=>{let n=0;for(const s of golden.schema_vectors.filter(x=>x.valid))for(const key of Object.keys(s.event))for(const value of [null,[],{},true,false,1,-1,0,1.5,2**40,'','x','constructor','__proto__',{'toString':{}},[null],[1],{version:{}},{name:[]},'a'.repeat(65)]){const e={...s.event,[key]:value};assert.doesNotThrow(()=>validateEvent(e,ctx));assert.doesNotThrow(()=>derive([e]));if(validateEvent(e).length){const v=golden.vectors[0],r=derive([v.events[0],e, {...v.events[2],seq:3}],undefined,{truth:v.truth});assert.equal(r.rows.at(-1).outcome,'unknown');}n++;}assert.ok(n>1000);});
test('journal persists, deduplicates facts but never position gaps, rejects bait, reports damage',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'learn-journal-')),scope=sha256('scope');
 await assert.rejects(open({root,scope}),/ctx_required/);await assert.rejects(open({root,ctx}),/scope_missing/);
 const j=await open({root,scope,ctx}),e={...golden.schema_vectors[0].event};delete e.event_id;
 const a=await j.append(e);assert.equal(a.seq,1);assert.equal(a.event_id,eventId(a));assert.deepEqual(await j.append(e),a);
 await assert.rejects(j.append({...a,observer_ok:false}),/event_conflict/);
 await assert.rejects(j.append({...e,task_id:'private-token-123'}),/not_in_pack/);await assert.rejects(j.append({...e,code:'private secret'}),/unknown_field/);
 const gap={schema:'tvijo.learn.event/1',type:'observation_gap',candidate_id:null,reason:'append_failed'};await j.append(gap);await j.append(gap);
 assert.equal((await j.read()).length,3);const again=await open({root,scope,ctx});assert.equal((await again.exportAll()).length,3);
 const f=path.join(root,'learn',scope,'journal.jsonl');assert.equal((await fs.stat(f)).mode&0o777,0o600);
 await fs.appendFile(f,'broken\n'+JSON.stringify({...a,seq:9})+'\n');assert.equal((await again.read())[3],null);assert.deepEqual(await j.stats(),{lines:5,unreadable:1,seq_gaps:1});
 await j.purge();assert.deepEqual(await j.read(),[]);
});
test('D14 boundary: a format-valid secret hash passes even with pinned ctx',()=>{const e=golden.schema_vectors.find(s=>s.event.type==='check'&&s.valid).event;assert.deepEqual(validateEvent({...e,output_sha256:'a'.repeat(64)},ctx),[]);});
test('recorder never waits in submit, degrades permanently on throws/timeouts; diagnostics cannot escape',async()=>{
 for(const append of [()=>{throw Error('x');},()=>new Promise(()=>{})]){
  const tasks=[];let id=0;const timers={setTimeout(fn){tasks.push(fn);return ++id;},clearTimeout(){}};
  const r=createRecorder({journal:{append},diagnostics(){throw Error('diagnostic');},timers});assert.equal(r.ready(),true);assert.equal(r.submit({}),undefined);
  await Promise.resolve();await Promise.resolve();for(let i=0;i<20;i++){tasks.splice(0).forEach(f=>f());await Promise.resolve();}
  await r.flush();assert.equal(r.ready(),false);assert.equal(r.submit({}),undefined);
 }
});

test('journal default client metadata follows the installed package version',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'learn-client-version-'));
 const journal=await open({root,scope:sha256('scope'),ctx});
 const event=await journal.append({type:'observation_gap',candidate_id:null,reason:'append_failed'});
 assert.deepEqual(event.client,{name:'tvijo-vsix',version:require('../package.json').version});
 assert.deepEqual((await journal.read())[0].client,event.client);
});
