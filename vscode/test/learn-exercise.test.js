const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const exercise=require('../lib/learn-exercise'),{prepare,run}=require('../lib/learn-replay'),{candidateId,treeSha256}=require('../lib/learn-candidate'),coding=require('../lib/coding'),{derive}=require('../lib/learn-scorer');
const golden=require('./fixtures/learn-golden-vectors.json');
test('pinned exercise replays P1..P5 and fresh starts change candidate identities',async()=>{
 const pack=await exercise.load('day-planner/1'),storageRoot=await fs.mkdtemp(path.join(os.tmpdir(),'learn-exercise-'));
 const first=await exercise.start({exercise:pack,storageRoot}),second=await exercise.start({exercise:pack,storageRoot});assert.notEqual(first.instance,second.instance);
 assert.deepEqual(Object.values(pack.manifest.truth),['correct','correct','defective','defective','ambiguous']);
 const ids=[];
 for(let n=1;n<=5;n++){
  const task='task-dp-p'+n,template=JSON.parse(pack.files[pack.manifest.tasks[task].proposal]);
  const snapshot=await coding.capture({root:second.root,selected:[`p${n}/planner.py`,`p${n}/tests/test_planner.py`,`p${n}/tests/test_planner_edge.py`],testFiles:[`p${n}/tests/test_planner.py`],profile:'python-unittest',vscode:{workspace:{textDocuments:[]}}});
  const hash=treeSha256(Object.fromEntries(snapshot.files.map(f=>[f.path,f.content]))),fields={thread_id:second.thread_id,snapshot_hash:hash},artifact=exercise.instantiateProposal(template,fields);
  coding.validateArtifact(artifact,snapshot);// sameProposal is private; I6 exercises it through the real coding.apply.
  ids.push(candidateId(artifact));assert.notEqual(ids.at(-1),candidateId(exercise.instantiateProposal(template,{...fields,thread_id:first.thread_id})));
  const prepared=prepare({exercise:pack,artifact,mode:'trusted'}),r=await run({prepared,storageRoot});assert.equal(r.result,n===4?'fail':'pass','P'+n);assert.equal(r.bound,true);
  if(n===3){const data={tasks:[{id:'a',priority:1,minutes:60}],slots:[[0,60]],expected:[['a',0]]};assert.equal((await run({prepared:prepare({exercise:pack,artifact,mode:'case'}),storageRoot,data})).result,'fail');}
  if(n===5){const v=golden.vectors[0],present={...v.events[0],candidate_id:ids.at(-1),task_id:task,criteria_without_check:['zero_duration_task']},check={...v.events[1],candidate_id:ids.at(-1)},decision={...v.events[2],candidate_id:ids.at(-1)};assert.equal(derive([present,check,decision],undefined,{truth:pack.manifest.truth}).rows[0].outcome,'accepted_open_question');}
 }
 assert.equal(new Set(ids).size,5);
});
test('seeded authored property check: P1/P2/P5 agree on 300 valid cases, P3 exact-fit and P4 overflow differ',async()=>{
 const pack=await exercise.load('day-planner/1');const files=Object.fromEntries(Object.entries(pack.manifest.tasks).map(([t,row])=>[t,JSON.parse(pack.files[row.proposal]).edits[0].content]));
 const script=`import json,random\nsource=json.loads(${JSON.stringify(JSON.stringify({reference:pack.files['reference_planner.py'],...files}))})\nfunctions={}\nfor name,code in source.items():\n ns={};exec(code,ns);functions[name]=ns['plan_day']\nrng=random.Random(30420)\nfor i in range(300):\n tasks=[dict(id=chr(97+j),priority=rng.randrange(10),minutes=rng.randrange(1,121)) for j in range(rng.randrange(1,10))]\n slots=[(0,130),(150,300),(400,600)]\n expected=functions['reference'](tasks,slots)\n for name in ['task-dp-p1','task-dp-p2','task-dp-p5']:\n  assert functions[name](tasks,slots)==expected,(name,i)\nexact=[dict(id='a',priority=1,minutes=60)]\nassert functions['task-dp-p3'](exact,[(0,60)])!=functions['reference'](exact,[(0,60)])\noverflow=[dict(id='a',priority=2,minutes=70),dict(id='b',priority=1,minutes=50)]\nassert functions['task-dp-p4'](overflow,[(0,100)])!=functions['reference'](overflow,[(0,100)])\nzero=[dict(id='a',priority=1,minutes=0)]\nassert functions['task-dp-p5'](zero,[(0,60)])!=functions['reference'](zero,[(0,60)])\nprint('300 cases; seed 30420')`;
 assert.match(execFileSync('python3',['-B','-c',script],{encoding:'utf8'}),/300 cases/);
});
