const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {verify}=require('../lib/learn-exercise'),{sha256}=require('../lib/learn-candidate'),{validateCase}=require('../lib/learn-case'),{prepare,run}=require('../lib/learn-replay'),{analyzeCommand}=require('../lib/command-policy');
const golden=require('./fixtures/learn-golden-vectors.json');
for(const v of golden.case_vectors)test(v.id,()=>assert.deepEqual(validateCase(v.case),v.errors));
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'learn-replay-'));
 const files={'stand/planner.py':'VALUE=1\n','stand/tests/test_planner.py':"import unittest,sys\nfrom pathlib import Path\nsys.path.insert(0,str(Path(__file__).resolve().parents[1]))\nimport planner\nclass T(unittest.TestCase):\n def test_value(self): self.assertEqual(planner.VALUE,2)\n",'reference_planner.py':'VALUE=2\n','learn_case_harness.py':"import sys,json,importlib.util\ns=importlib.util.spec_from_file_location('candidate',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nc=json.loads(sys.argv[2])\nif c['expected']!=[['a',2]]: sys.exit(2)\nsys.exit(0 if m.VALUE==2 else 1)\n",'proposals/p1.json':'{}'};
 const manifest={id:'day-planner/1',runner:'python-unittest',files:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,sha256(v)])),tasks:{'task-dp-p1':{dir:'p1',proposal:'proposals/p1.json'}},truth:{'task-dp-p1':'correct'},criteria_without_check:[]};
 for(const [n,b]of Object.entries(files)){const f=path.join(root,n);await fs.mkdir(path.dirname(f),{recursive:true});await fs.writeFile(f,b);}
 const manifestBytes=JSON.stringify(manifest),exercise=await verify({root,manifestBytes,expectedSha:sha256(manifestBytes)}),artifact={task_id:'task-dp-p1',edits:[{path:'p1/planner.py',content:'VALUE=2\n'}]};
 return {root,manifest,manifestBytes,exercise,artifact};
}
test('verified bytes are frozen; actual policy/run_command passes trusted and case; wrong expectation is unknown',async()=>{
 const f=await fixture();assert.ok(Object.isFrozen(f.exercise.files));
 const p=prepare({...f,mode:'trusted'}),r=await run({prepared:p,storageRoot:f.root});assert.equal(r.result,'pass');assert.equal(r.bound,true);
 const c=prepare({...f,mode:'case'}),data={tasks:[{id:'a',priority:1,minutes:1}],slots:[[0,60]],expected:[['a',2]]};
 assert.equal((await run({prepared:c,storageRoot:f.root,data})).result,'pass');
 assert.equal((await run({prepared:c,storageRoot:f.root,data:{...data,expected:[['a',3]]}})).result,'unknown');
 assert.equal((await run({prepared:c,storageRoot:f.root,data:{...data,tasks:[{id:'a',priority:1,minutes:0}]}})).error,'case_invalid');
 await fs.writeFile(path.join(f.root,'stand/planner.py'),'TAMPER');
 await assert.rejects(verify({root:f.root,manifestBytes:f.manifestBytes,expectedSha:sha256(f.manifestBytes)}),/manifest_hash_mismatch/);
 // A disk change after preload does not change bytes executed from memory.
 assert.equal((await run({prepared:p,storageRoot:f.root})).result,'pass');
});
test('paths, links, commands in manifest, foreign context are refused',async()=>{
 for(const name of ['../x','/tmp/x','a/../x']){const f=await fixture(),m={...f.manifest,files:{[name]:sha256('x')}},b=JSON.stringify(m);await assert.rejects(verify({root:f.root,manifestBytes:b,expectedSha:sha256(b)}));}
 const f=await fixture();await fs.symlink('planner.py',path.join(f.root,'stand/link.py'));const m={...f.manifest,files:{'stand/link.py':sha256('VALUE=1\n')}},b=JSON.stringify(m);await assert.rejects(verify({root:f.root,manifestBytes:b,expectedSha:sha256(b)}));
 const c=JSON.stringify({...f.manifest,commands:['evil']});await assert.rejects(verify({root:f.root,manifestBytes:c,expectedSha:sha256(c)}));
 assert.throws(()=>prepare({...f,mode:'trusted',context:'project'}),/replay_refused/);
});
test('argv mismatch, refusal, timeout, missing toolchain and changed tree are conservative',async()=>{
 const f=await fixture(),p=prepare({...f,mode:'trusted'});
 for(const policy of [()=>({ok:false}),c=>({...analyzeCommand(c),args:['evil']})])assert.equal((await run({prepared:p,storageRoot:f.root,policy})).error,'replay_refused_by_policy');
 assert.equal((await run({prepared:p,storageRoot:f.root,execute:async()=>({error:'ENOENT'})})).result,'unknown');
 assert.equal((await run({prepared:p,storageRoot:f.root,execute:()=>new Promise(()=>{}),timeoutMs:5})).error,'replay_timeout');
});
test('tree changes lose binding; A to B to A remains outside the D14 guarantee',async()=>{
 const f=await fixture(),p=prepare({...f,mode:'trusted'});
 async function change(restore){return async()=>{
  const parent=path.join(f.root,'learn/sandbox'),roots=await fs.readdir(parent);assert.equal(roots.length,1);
  const target=path.join(parent,roots[0],'p1/planner.py'),original=await fs.readFile(target);await fs.chmod(target,0o600);await fs.writeFile(target,'VALUE=99\n');if(restore)await fs.writeFile(target,original);
  return {exitCode:0,stdout:'synthetic execution window',stderr:''};
 };}
 const changed=await run({prepared:p,storageRoot:f.root,execute:await change(false)});assert.equal(changed.bound,false);assert.notEqual(changed.tree_sha256,changed.tree_sha256_after);
 const f2=await fixture(),p2=prepare({...f2,mode:'trusted'});
 const restored=await run({prepared:p2,storageRoot:f2.root,execute:async()=>{
  const parent=path.join(f2.root,'learn/sandbox'),roots=await fs.readdir(parent),target=path.join(parent,roots[0],'p1/planner.py'),original=await fs.readFile(target);await fs.chmod(target,0o600);await fs.writeFile(target,'VALUE=99\n');await fs.writeFile(target,original);return {exitCode:0,stdout:'',stderr:''};
 }});assert.equal(restored.bound,true,'before/after hashes cannot detect the intervening replacement');
});
