'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const coding = require('../lib/coding');
const E = process.env.TVIJO_TEST_ARTIFACTS || require('node:os').tmpdir();
async function fixture() {
  const root = await fs.mkdtemp(path.join(E,'fixture-'));
  await fs.writeFile(path.join(root,'calc.py'),'def add(a,b): return a-b\n');
  await fs.writeFile(path.join(root,'test_calc.py'),'import unittest\n');
  const documents = []; let edits = 0;
  const vscode = {
    Uri:{file:fsPath=>({fsPath})}, Position:class {constructor(line,character){Object.assign(this,{line,character});}}, Range:class {},
    WorkspaceEdit:class {createFile(){} insert(){} replace(){}},
    workspace:{textDocuments:documents, openTextDocument:async uri=>{
      let doc=documents.find(d=>d.uri.fsPath===uri.fsPath);
      if (!doc) { const content=await fs.readFile(uri.fsPath,'utf8'); doc={uri,isDirty:false,version:1,getText:()=>content,positionAt:n=>n};documents.push(doc); }
      return doc;
    },applyEdit:async()=>{edits++;return true;}}
  };
  const snapshot=await coding.capture({root,selected:['calc.py','test_calc.py'],testFiles:['test_calc.py'],profile:'python-unittest',vscode});
  const content='def add(a,b): return a+b\n';
  const artifact={task_id:'task',project_id:'p',thread_id:'t',snapshot_hash:'a'.repeat(64),financial_status:'completed',receipt:{held_micro_tvijo:0},edits:[{path:'calc.py',content,base_sha256:snapshot.files[0].sha256,new_sha256:coding.sha256(content)}],tests:{exit_code:0,reported_test_count:1,result_trust:'untrusted_test_process',test_result_verified:false}};
  return {root,vscode,snapshot,artifact,edits:()=>edits};
}
test('explicit bounded snapshot hashes text and makes selected test immutable',async()=>{
  const f=await fixture();assert.equal(f.snapshot.files.length,2);assert.equal(f.snapshot.files[1].editable,false);
  assert.equal(f.snapshot.files[0].sha256,coding.sha256(f.snapshot.files[0].content));
  assert.throws(()=>coding.validateArtifact({...f.artifact,edits:[{...f.artifact.edits[0],path:'test_calc.py',base_sha256:f.snapshot.files[1].sha256}]},f.snapshot),/immutable test/);
});
test('traversal, hidden and credential file paths fail before capture',async()=>{
  for(const p of ['../x','a/../x','/etc/passwd','a\\b','a//b','.env','config/.private','credentials.json','id_rsa','key.pem','a:stream']) assert.throws(()=>coding.safePath(p));
  const f=await fixture();await assert.rejects(coding.capture({root:f.root,selected:Array(25).fill('calc.py'),testFiles:['calc.py'],profile:'python-unittest',vscode:f.vscode}));
});
test('symlink source or parent, binary, oversized and dirty files are refused',async()=>{
  const f=await fixture();await fs.symlink('calc.py',path.join(f.root,'link.py'));await fs.symlink(f.root,path.join(f.root,'nested'));
  for(const p of ['link.py','nested/calc.py']) await assert.rejects(coding.capture({root:f.root,selected:[p,'test_calc.py'],testFiles:['test_calc.py'],profile:'python-unittest',vscode:f.vscode}));
  for(const content of [Buffer.from([0xff]),Buffer.alloc(65537,65),Buffer.from('a\0b')]) {
    const name='binary.py';await fs.writeFile(path.join(f.root,name),content);
    await assert.rejects(coding.capture({root:f.root,selected:[name,'test_calc.py'],testFiles:['test_calc.py'],profile:'python-unittest',vscode:f.vscode}));
  }
  f.vscode.workspace.textDocuments.push({uri:{fsPath:path.join(f.root,'calc.py')},isDirty:true});
  await assert.rejects(coding.capture({root:f.root,selected:['calc.py','test_calc.py'],testFiles:['test_calc.py'],profile:'python-unittest',vscode:f.vscode}),/conflicting/);
});
test('apply requires explicit positive confirmation and rechecks bytes after review',async()=>{
  const f=await fixture();assert.equal(await coding.apply({...f,confirm:async()=>false}),false);assert.equal(f.edits(),0);
  await assert.rejects(coding.apply({...f,confirm:async()=>{await fs.writeFile(path.join(f.root,'calc.py'),'concurrent bytes');return true;}}),/changed since/);
  assert.equal(f.edits(),0);
  const g=await fixture();assert.equal(await coding.apply({...g,confirm:async()=>true}),true);assert.equal(g.edits(),1);
});
test('unselected new files and any rename/delete proposal are refused',async()=>{
  const f=await fixture();const content='new source\n';const artifact={task_id:'task',edits:[{path:'new.py',content,base_sha256:null,new_sha256:coding.sha256(content)}]};
  await assert.rejects(coding.apply({...f,artifact,confirm:async()=>true}),/unknown base/);assert.equal(f.edits(),0);
  assert.throws(()=>coding.validateArtifact({task_id:'task',edits:[{path:'calc.py',content:null}]},f.snapshot));
});
test('dirty editor, symlink replacement, stale content and monotonic A B A block apply',async()=>{
  for(const scenario of ['dirty','symlink','epoch']) {
    const f=await fixture();let epoch=1;const captured=epoch;
    const guard=async()=>{if(epoch!==captured)throw Error('scope changed');};
    await assert.rejects(coding.apply({...f,guard,confirm:async()=>{
      if(scenario==='dirty'){const doc=await f.vscode.workspace.openTextDocument({fsPath:path.join(f.root,'calc.py')});doc.isDirty=true;}
      if(scenario==='symlink'){await fs.rename(path.join(f.root,'calc.py'),path.join(f.root,'preserved.py'));await fs.symlink('preserved.py',path.join(f.root,'calc.py'));}
      if(scenario==='epoch'){epoch++;epoch++;}
      return true;
    }}));assert.equal(f.edits(),0);
  }
});
test('project key scope must be proven before source upload',()=>{
  for(const scopes of [null,[],['tasks:write'],['coding:execute']])assert.throws(()=>coding.requireCodingScope({kind:'project'},scopes));
  coding.requireCodingScope({kind:'project'},['coding:execute','tasks:write']);
});
async function protocolFixture({phase, changedQuote, mutate, artifactOverrides}={}){
  const f=await fixture();let epoch=1;const calls=[],journals=[];
  const snapshotHash='a'.repeat(64);
  const api={request:async(url,options)=>{
    calls.push({url,...options});if(mutate)mutate(url,()=>{epoch++;epoch++;});
    if(url.endsWith('/coding-snapshots'))return{snapshot_id:'snapshot',snapshot_hash:snapshotHash,profile:'python-unittest',files:f.snapshot.files.map(({path,sha256,editable})=>({path,sha256,editable}))};
    if(url==='/services/quote')return{quote_id:'quote',service_id:'coding',project_id:'p',thread_id:'t',snapshot_id:'snapshot',snapshot_hash:snapshotHash,profile:'python-unittest',tariff_version:'v1',expires_at:Date.now()/1000+60,ceiling_micro_tvijo:1000,...changedQuote};
    if(url==='/tasks'){if(phase==='grant')throw Error('lost grant');return{id:'task'};}
    if(phase==='run')throw Error('provider unknown');
    return {...f.artifact,project_id:'p',thread_id:'t',snapshot_hash:snapshotHash,receipt:{held_micro_tvijo:phase==='unknown'?1000:0},...artifactOverrides};
  }};
  return{...f,calls,journals,run:()=>coding.codingClient(api,'test-key').run({snapshot:f.snapshot,projectId:'p',threadId:'t',prompt:'Fix addition',maxMicroTvijo:10000,idempotencyKey:'request',guard:async()=>{if(epoch!==1)throw Error('scope changed');},journal:async j=>journals.push(j)})};
}
test('coding binds snapshot quote and one grant/run; journal contains no code, prompt or credential',async()=>{
  const f=await protocolFixture();const result=await f.run();assert.equal(result.task_id,'task');assert.equal(f.calls.length,4);
  assert.deepEqual(f.calls[2].body,{quote_id:'quote',service_id:'coding',idempotency_key:'request'});
  assert.doesNotMatch(JSON.stringify(f.journals),/test-key|Fix addition|def add/);assert.equal(f.journals.at(-1).taskId,'task');
});
test('invalid quote or delayed scope A B A prevents grant/upload continuation',async()=>{
  for(const changedQuote of [{snapshot_hash:'bad'},{snapshot_id:'other'},{profile:'node-test'},{project_id:'other'},{ceiling_micro_tvijo:10001},{expires_at:0}]){
    const f=await protocolFixture({changedQuote});await assert.rejects(f.run(),e=>e.definitiveGrantRefusal===true);assert.equal(f.calls.length,2);
  }
  for(const phase of ['/services/quote','/tasks/task/coding']){
    const f=await protocolFixture({mutate:(url,change)=>{if(url===phase)change();}});await assert.rejects(f.run());assert.equal(f.edits(),0);
  }
});
test('lost grant/run preserve ambiguity with no replay; unknown provider hold is not a zero',async()=>{
  for(const phase of ['grant','run']){
    const f=await protocolFixture({phase});await assert.rejects(f.run(),e=>!e.definitiveGrantRefusal);assert.equal(f.calls.filter(c=>c.url==='/tasks').length,1);
    if(phase==='run')assert.equal(f.journals.at(-1).taskId,'task');
  }
  const f=await protocolFixture({phase:'unknown'});assert.equal((await f.run()).receipt.held_micro_tvijo,1000);
});
test('last-moment bytes and synchronous scope guard reject before WorkspaceEdit submission',async()=>{
  const f=await fixture();
  const original=f.vscode.WorkspaceEdit;
  f.vscode.WorkspaceEdit=class extends original {constructor(){super();require('node:fs').writeFileSync(path.join(f.root,'calc.py'),'parallel edit');}};
  await assert.rejects(coding.apply({...f,confirm:async()=>true}),/changed before apply/);assert.equal(f.edits(),0);
  const g=await fixture();await assert.rejects(coding.apply({...g,confirm:async()=>true,guardSync:()=>{throw Error('API base A B A');}}),/A B A/);assert.equal(g.edits(),0);
});

test('version-conflicted bulk edit preserves concurrently changed buffer and reports rejection',async()=>{
  const f=await fixture(); const doc=await f.vscode.workspace.openTextDocument({fsPath:path.join(f.root,'calc.py')});
  let buffer=doc.getText(); let calls=0;
  f.vscode.workspace.applyEdit=async()=>{
    // Model the inspected VS Code extension-host versioned text-edit RPC.
    const submittedVersion=doc.version;
    await Promise.resolve(); buffer='concurrent editor text';doc.version++;doc.getText=()=>buffer;
    if(doc.version!==submittedVersion)return false;
    calls++;return true;
  };
  assert.equal(await coding.apply({...f,confirm:async()=>true}),false);assert.equal(buffer,'concurrent editor text');assert.equal(calls,0);
});

test('wrong project/thread/task artifact cannot reach diff or apply',async()=>{
 for(const artifactOverrides of [{project_id:'other'},{thread_id:'other'},{task_id:'other'}]) {
  const f=await protocolFixture({artifactOverrides});await assert.rejects(f.run(),/another task or snapshot/);assert.equal(f.edits(),0);
 }
});

test('untrusted stdout counts never become verified tests or independent acceptance',async()=>{
 const f=await fixture();f.artifact.execution_status='exited_zero';
 const text=coding.evidenceText(f.artifact);
 assert.match(text,/Process exit code: 0; runner reported 1 tests/);assert.match(text,/counts are untrusted/);assert.match(text,/Correctness requires human review/);
 assert.equal(coding.validateArtifact(f.artifact,f.snapshot),f.artifact);
 assert.throws(()=>coding.validateArtifact({...f.artifact,tests:{...f.artifact.tests,test_result_verified:true}},f.snapshot),/untrusted test-process/);
 assert.throws(()=>coding.validateArtifact({...f.artifact,execution_status:'passed'},f.snapshot),/cannot independently/);
});

test('remote single-file picker accumulates only explicitly selected files with bounded guarded steps',async()=>{
 const picks=[[{fsPath:'/remote/project/calc.py'}],[{fsPath:'/remote/project/test_calc.py'}]];let calls=0;
 const selected=await coding.selectFiles({choose:async()=>picks[calls++],next:async current=>current.length<2?'add':'done'});
 assert.deepEqual(selected.map(uri=>uri.fsPath),['/remote/project/calc.py','/remote/project/test_calc.py']);assert.equal(calls,2);
 assert.equal(await coding.selectFiles({choose:async()=>undefined,next:async()=>{throw Error('must not proceed');}}),null);
 await assert.rejects(coding.selectFiles({choose:async()=>[{fsPath:'/remote/a.py'}],next:async()=>'done'}),/at least one source/);
 let epoch=1;await assert.rejects(coding.selectFiles({choose:async()=>{epoch++;epoch++;return picks[0];},next:async()=>'add',guard:async()=>{if(epoch!==1)throw Error('workspace changed');}}),/workspace changed/);
});

test('apply refuses pending frozen unknown or non-integer-zero financial hold',async()=>{
 for(const change of [{financial_status:'active'},{financial_status:'frozen'},{financial_status:undefined},{receipt:{held_micro_tvijo:null}},{receipt:{held_micro_tvijo:'0'}},{receipt:{held_micro_tvijo:1}},{receipt:undefined}]){
  const f=await fixture();await assert.rejects(coding.apply({...f,artifact:{...f.artifact,...change},confirm:async()=>true}),/financially completed/);assert.equal(f.edits(),0);
 }
});
test('fresh server artifact after human modal must retain financial closure and exact reviewed proposal',async()=>{
 for(const change of [{financial_status:'frozen',receipt:{held_micro_tvijo:1000}},{project_id:'other'},{thread_id:'other'},{snapshot_hash:'b'.repeat(64)},{edits:[]}]){
  const f=await fixture();let confirmed=false,refreshed=false;
  await assert.rejects(coding.apply({...f,confirm:async()=>{confirmed=true;return true;},revalidate:async()=>{assert(confirmed);refreshed=true;return{...f.artifact,...change};}}));
  assert(refreshed);assert.equal(f.edits(),0);
 }
 const f=await fixture();let refreshes=0;
 assert.equal(await coding.apply({...f,confirm:async()=>true,revalidate:async()=>{refreshes++;return f.artifact;}}),true);assert.equal(refreshes,1);
 const g=await fixture();await assert.rejects(coding.apply({...g,confirm:async()=>true,revalidate:async()=>{throw Error('artifact fetch failed');}}),/artifact fetch failed/);assert.equal(g.edits(),0);
});
