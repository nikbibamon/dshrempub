'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {createSyntaxHost,PREFIX}=require('../lib/syntax-host');
const pythonAvailable=process.platform==='linux'&&sync.existsSync('/usr/bin/python3');
const pythonTest=pythonAvailable?test:test.skip;
async function fixture({runCheck,executable='/usr/bin/python3'}={}){
  const base=await fs.mkdtemp(path.join(process.env.TVIJO_TEST_ARTIFACTS||os.tmpdir(),'syntax-host-'));
  const root=path.join(base,'project'),storage=path.join(base,'storage');await fs.mkdir(root);await fs.mkdir(storage);
  const uri=fsPath=>({scheme:'file',authority:'',fsPath,toString:()=> 'file://'+fsPath}),folder={uri:uri(root)},values=new Map(),warnings=[],diagnostics=new Map(),changed=[];
  const state={get:key=>values.get(key),update:async(key,value)=>{values.set(key,value);}};
  const vscode={workspace:{isTrusted:true,workspaceFolders:[folder]},window:{showQuickPick:async choices=>choices[0],showOpenDialog:async()=>[uri(executable)],showWarningMessage:async(...args)=>{warnings.push(args);return 'Approve this syntax tool';}}};
  vscode.workspace.onDidChangeTextDocument=fn=>{changed.push(fn);return {dispose:()=>{const i=changed.indexOf(fn);if(i>=0)changed.splice(i,1);}};};
  vscode.languages={createDiagnosticCollection:()=>({set:(uri,rows)=>diagnostics.set(uri.toString(),rows),delete:uri=>diagnostics.delete(uri.toString()),clear:()=>diagnostics.clear(),dispose:()=>diagnostics.clear()})};
  vscode.Position=class{constructor(line,character){this.line=line;this.character=character;}};
  vscode.Range=class{constructor(start,end){this.start=start;this.end=end;}};
  vscode.Diagnostic=class{constructor(range,message,severity){Object.assign(this,{range,message,severity});}};vscode.DiagnosticSeverity={Error:0};
  const scope=()=>createHash('sha256').update(root).digest('hex');
  const host=createSyntaxHost({vscode,state,storageRoot:storage,chooseFolder:async()=>folder,scope,runCheck});
  const file=path.join(root,'source.py');await fs.writeFile(file,'value = 1\n');
  let text='print("BUFFER_BODY_CANARY"\n';
  const document={uri:uri(file),version:2,isDirty:true,isClosed:false,getText:()=>text};
  return {base,root,file,storage,folder,values,warnings,vscode,scope,host,document,diagnostics,setText:value=>{text=value;document.version++;for(const fn of [...changed])fn({document});}};
}

pythonTest('syntax checks are off until native tool approval; current unsaved buffer is parsed without changing disk',async()=>{
  const f=await fixture(),run=f.host.newRun();
  assert.equal(await f.host.check(f.document,f.folder,{run}),null);assert.equal(f.values.size,0);
  assert.equal(await f.host.configure(),true);assert.equal(f.warnings[0][1].modal,true);
  const before=await fs.stat(f.file,{bigint:true}),body=await fs.readFile(f.file);
  const result=await f.host.check(f.document,f.folder,{run});
  assert.equal(result.status,'failed');assert.equal(result.version,f.document.version);assert.equal(result.contentHash,createHash('sha256').update(f.document.getText()).digest('hex'));
  assert.ok(!JSON.stringify(result).includes('BUFFER_BODY_CANARY'));assert.ok(result.diagnostics[0].line>=1);
  assert.deepEqual(await fs.readFile(f.file),body);assert.equal((await fs.stat(f.file,{bigint:true})).mtimeNs,before.mtimeNs);assert.equal(f.document.isDirty,true);
  assert.equal((await f.host.check(f.document,f.folder,{run})).reason,'duplicate_snapshot');
  f.host.dispose();
});

pythonTest('valid unsaved code passes even when disk has a syntax error, without executing the supplied code',async()=>{
  const f=await fixture();await f.host.configure();await fs.writeFile(f.file,'def (\n');
  const marker=path.join(f.root,'MUST_NOT_EXECUTE');f.setText('__import__("pathlib").Path('+JSON.stringify(marker)+').write_text("unexpected")\n');
  const before=await fs.stat(f.file,{bigint:true});const result=await f.host.check(f.document,f.folder,{run:f.host.newRun()});
  assert.equal(result.status,'passed');await assert.rejects(fs.stat(marker),{code:'ENOENT'});
  assert.equal(await fs.readFile(f.file,'utf8'),'def (\n');assert.equal((await fs.stat(f.file,{bigint:true})).mtimeNs,before.mtimeNs);
});

pythonTest('a wrong native binary cannot enable a syntax profile by always returning success',async()=>{
  const f=await fixture({executable:'/bin/true'});await assert.rejects(f.host.configure(),/self-check/);
  assert.equal(f.values.size,0);assert.equal(await f.host.check(f.document,f.folder,{run:f.host.newRun()}),null);
});

pythonTest('host limits checks per run, drops stale results and disables without new execution',async()=>{
  let calls=0,release,entered;
  const runCheck=async options=>{
    await options.guard();calls++;
    if(options.snapshot.version===99){entered?.();await new Promise(r=>{release=r;});}
    return {status:/^(?:def \(|const value = ;)/.test(options.snapshot.text)?'failed':'passed',profileId:options.profile.profileId,path:options.snapshot.path,version:options.snapshot.version,contentHash:options.snapshot.contentHash,diagnostics:[]};
  };
  const f=await fixture({runCheck});await f.host.configure();const baseline=calls,run=f.host.newRun();
  for(let i=0;i<4;i++){f.setText('value = '+i+'\n');assert.equal((await f.host.check(f.document,f.folder,{run})).status,'passed');}
  f.setText('value = 8\n');assert.equal((await f.host.check(f.document,f.folder,{run})).reason,'run_limit');assert.equal(calls-baseline,4);
  f.document.version=99;const ready=new Promise(r=>{entered=r;});const pending=f.host.check(f.document,f.folder,{run:f.host.newRun()});await ready;f.setText('changed = 1\n');release();assert.equal((await pending).status,'stale');
  await f.host.disable();const after=calls;assert.equal(await f.host.check(f.document,f.folder,{run:f.host.newRun()}),null);assert.equal(calls,after);assert.equal(f.values.get(PREFIX+f.scope()),undefined);
});

pythonTest('profile revocation cancels an in-flight check and Restricted Mode never enables it',async()=>{
  let enter,release;
  const f=await fixture({runCheck:async options=>{
    await options.guard();
    if(options.snapshot.version!==0){enter?.();await new Promise(r=>{release=r;});}
    return {status:options.snapshot.text.startsWith('def (')?'failed':'passed',diagnostics:[]};
  }});
  await f.host.configure();const ready=new Promise(r=>{enter=r;});const pending=f.host.check(f.document,f.folder,{run:f.host.newRun()});await ready;await f.host.disable();release();assert.equal((await pending).status,'cancelled');
  f.vscode.workspace.isTrusted=false;await assert.rejects(f.host.configure(),/Trust this local workspace/);assert.equal(await f.host.check(f.document,f.folder,{run:f.host.newRun()}),null);
});

test('unsupported hosts refuse before showing approval or running probes',async()=>{
  const vm=require('node:vm'),{createRequire}=require('node:module'),source=sync.readFileSync(require.resolve('../lib/syntax-host'),'utf8'),module={exports:{}};
  vm.runInNewContext(source,{module,exports:module.exports,require:createRequire(require.resolve('../lib/syntax-host')),process:{platform:'win32'},Buffer});
  let calls=0;
  const host=module.exports.createSyntaxHost({vscode:{workspace:{}},state:{},chooseFolder:()=>{calls++;},scope:()=>null,runCheck:()=>{calls++;}});
  await assert.rejects(host.configure(),/Linux extension host/);assert.equal(await host.check(null,null),null);assert.equal(calls,0);
});

pythonTest('owned Problems markers show actual syntax errors and clear on user edits or disable',async()=>{
  const f=await fixture();await f.host.configure();const result=await f.host.check(f.document,f.folder,{run:f.host.newRun()});
  assert.equal(result.status,'failed');const rows=f.diagnostics.get(f.document.uri.toString());
  assert.equal(rows.length,1);assert.equal(rows[0].source,'Tvijo syntax');assert.equal(rows[0].code,'python-ast');assert.equal(rows[0].message,'Syntax error');
  f.setText('value = 1\n');assert.equal(f.diagnostics.size,0);
  f.setText('def (\n');await f.host.check(f.document,f.folder,{run:f.host.newRun()});assert.equal(f.diagnostics.size,1);
  await f.host.disable();assert.equal(f.diagnostics.size,0);
});
