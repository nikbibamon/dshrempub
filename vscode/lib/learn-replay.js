'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{constants}=require('node:fs');
const {sha256,canonicalJson,treeSha256}=require('./learn-candidate'),{relative}=require('./learn-exercise'),{validateCase}=require('./learn-case');
const {analyzeCommand}=require('./command-policy'),{createTools}=require('./local-tools');
const RUNNERS=Object.freeze({'python-unittest':dir=>['python3','-B','-m','unittest','discover','-s',dir+'/tests','-p','test_*.py'],'python-case-harness':(dir,data)=>['python3','-B','learn_case_harness.py',dir+'/planner.py',canonicalJson(data)]});
const fail=code=>{throw Object.assign(new Error(code),{code});};
function prepare({exercise,artifact,mode,context='exercise'}){
 if(context!=='exercise'||!['trusted','case'].includes(mode))fail('replay_refused_by_policy');
 const task=exercise.manifest.tasks[artifact.task_id];if(!task)fail('no_candidate');const dir=relative(task.dir),files={};
 for(const [name,bytes]of Object.entries(exercise.files))if(name.startsWith('stand/'))files[dir+'/'+name.slice(6)]=bytes;
 for(const e of artifact.edits){relative(e.path);if(!e.path.startsWith(dir+'/')||typeof e.content!=='string')fail('replay_refused_by_policy');files[e.path]=e.content;}
 // Both test files come from the pinned pack, regardless of editable snapshot tests.
 for(const [name,bytes]of Object.entries(exercise.files))if(name.startsWith('stand/tests/'))files[dir+'/'+name.slice(6)]=bytes;
 if(mode==='case'){for(const name of Object.keys(files))if(name.startsWith(dir+'/tests/'))delete files[name];for(const name of ['reference_planner.py','learn_case_harness.py']){if(typeof exercise.files[name]!=='string')fail('manifest_hash_mismatch');files[name]=exercise.files[name];}}
 return Object.freeze({files:Object.freeze(files),dir,mode,expected_tree_sha256:treeSha256(files),runner:mode==='trusted'?exercise.manifest.runner:'python-case-harness'});
}
async function hashDisk(root){const files={};async function walk(dir,base=''){for(const e of await fs.readdir(dir,{withFileTypes:true})){const name=base+e.name,p=path.join(dir,e.name);if(e.isSymbolicLink())fail('replay_refused_by_policy');if(e.isDirectory())await walk(p,name+'/');else if(e.isFile()){const s=await fs.stat(p);if(s.size>65536)fail('replay_refused_by_policy');files[name]=await fs.readFile(p);}else fail('replay_refused_by_policy');}}await walk(root);return treeSha256(files);}
async function run({prepared,storageRoot,data=null,guard=async()=>{},signal,policy=analyzeCommand,execute,timeoutMs=60000}){
 const start=Date.now(),empty=sha256(''),out={result:'unknown',exit_code:null,tree_sha256:empty,tree_sha256_after:empty,expected_tree_sha256:prepared.expected_tree_sha256,input_sha256:null,output_sha256:empty,duration_ms:0,bound:false};
 if(prepared.mode==='case'){if(validateCase(data).length)return {...out,error:'case_invalid'};out.input_sha256=sha256(canonicalJson(data));}
 const argv=RUNNERS[prepared.runner]?.(prepared.dir,data);if(!argv)return {...out,error:'replay_refused_by_policy'};
 const command=argv.map(x=>"'"+x.replace(/'/g,"'\\''")+"'").join(' '),d=policy(command);
 if(!d.ok||d.shell||!['python3','node'].includes(d.executable)||d.executable!==argv[0]||canonicalJson(d.args)!==canonicalJson(argv.slice(1)))return {...out,error:'replay_refused_by_policy'};
 await guard();const base=path.join(storageRoot,'learn/sandbox');await fs.mkdir(base,{recursive:true,mode:0o700});const root=await fs.mkdtemp(path.join(base,'run-'));await fs.chmod(root,0o700);
 for(const [name,bytes]of Object.entries(prepared.files)){const f=path.join(root,relative(name));await fs.mkdir(path.dirname(f),{recursive:true,mode:0o700});const h=await fs.open(f,constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW|constants.O_WRONLY,0o400);try{await h.writeFile(bytes);await h.chmod(0o444);}finally{await h.close();}}
 async function lock(dir){for(const e of await fs.readdir(dir,{withFileTypes:true}))if(e.isDirectory()){const p=path.join(dir,e.name);await lock(p);await fs.chmod(p,0o555);}}await lock(root);
 async function lockDirectories(dir){for(const e of await fs.readdir(dir,{withFileTypes:true}))if(e.isDirectory()){const child=path.join(dir,e.name);await lockDirectories(child);await fs.chmod(child,0o555);}}
 await lockDirectories(root);
 const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 let timer;try{
  out.tree_sha256=await hashDisk(root);
  const tools=execute||createTools({root,guard,confirmRun:async()=>true,confirmWrite:async()=>false,signal:controller.signal}).execute;
  const r=await Promise.race([tools({tool:'run_command',command,commandDecision:d,timeout_ms:60000},{signal:controller.signal}),new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({timedOut:true});},Math.min(timeoutMs,60000));})]);
  out.tree_sha256_after=await hashDisk(root);out.bound=out.tree_sha256===out.tree_sha256_after&&out.tree_sha256===out.expected_tree_sha256;
  out.exit_code=Number.isInteger(r.exitCode)?r.exitCode:null;out.output_sha256=sha256((r.stdout||'')+(r.stderr||''));
  if(!r.timedOut&&!r.cancelled&&out.exit_code!==null)out.result=prepared.mode==='case'&&out.exit_code===2?'unknown':out.exit_code===0?'pass':'fail';
  if(r.timedOut||r.cancelled)out.error='replay_timeout';else if(out.exit_code===null)out.error='toolchain_missing';
 }catch{out.error='replay_refused_by_policy';}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);out.duration_ms=Date.now()-start;}
 return out;
}
module.exports={prepare,run,RUNNERS,hashDisk};
