'use strict';

// The broker owns plans outside the writable copy. Only this fixed worker runs
// privileged; project commands enter the chroot after setpriv has dropped uid,
// groups and every capability. No host-shell fallback is possible for root.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn, execFileSync} = require('node:child_process');
const {randomUUID, createHash} = require('node:crypto');
const {analyzeCommand} = require('./command-policy');
const SYSTEM = ['/usr', '/bin', '/sbin', '/lib', '/lib64'];
const ENV = Object.freeze({PATH:'/usr/sbin:/usr/bin:/sbin:/bin',LANG:'C.UTF-8'});
const LIMITS = Object.freeze({'memory.max':'805306368','memory.swap.max':'0','pids.max':'128','cpu.max':'100000 100000'});
const deniedPart = name => /^(?:\.env|\.codex$|\.claude$|\.ssh$|\.aws$|\.gnupg$|\.npmrc$|\.netrc$|auth\.json$|credentials?(?:\.|$)|secrets?(?:\.|$)|id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx)$)/i.test(name);
function unavailable(reason = 'Extra sandbox launcher has not passed preflight; host shell is forbidden at uid 0.') { return {available:false,reason}; }
// SPEC-238 fitness is not accepted: two reference repositories cannot be
// copied by this prototype. Isolation preflight is not release acceptance.
// No setting or environment flag bypasses this gate.
async function releasePreflight() { return unavailable('reference_fitness_unaccepted'); }
function failure(reason) {return Object.assign(new Error(reason),{code:'extra_sandbox_unavailable',stopAgent:true});}
function assertExtraSandbox(sandbox) {if (!sandbox || sandbox.ready !== true || typeof sandbox.execute !== 'function') throw failure(unavailable().reason);}
function within(root, target) {const rel=path.relative(root,target);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
function safeTask(root) {
  const canonical=fs.realpathSync(root);
  if(canonical!==path.resolve(root)||['/root','/etc/aios',os.homedir()].filter(p=>p!=='/').some(p=>within(p,canonical))) throw failure('Task storage must be outside host HOME, /root and /etc/aios.');
  return canonical;
}
function identity() {
  try {const row=execFileSync('/usr/bin/getent',['passwd','tvijo-agent'],{env:ENV,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split(':');const uid=Number(row[2]),gid=Number(row[3]);if(uid>0&&gid>0)return {uid,gid};} catch { /* No account creation. */ }
  return {uid:65534,gid:65534};
}
function mountList() {
  return [...SYSTEM.filter(p=>fs.existsSync(p)),...['/etc/ld.so.cache','/etc/ssl/certs','/etc/resolv.conf'].filter(p=>fs.existsSync(p))];
}
function sandboxArgs(task, {network=true, uid=65534, gid=65534, root=false} = {}) {
  const args=['--die-with-parent','--new-session','--unshare-pid','--unshare-ipc','--unshare-uts'];
  if(!root)args.push('--unshare-user');
  if(!network)args.push('--unshare-net');
  for(const source of mountList()) args.push('--ro-bind',source,source);
  args.push('--proc','/proc','--dev','/dev','--size','67108864','--tmpfs','/tmp','--dir','/tmp/home','--bind',safeTask(task),'/workspace','--chdir','/workspace','--clearenv','--setenv','PATH',ENV.PATH,'--setenv','LANG',ENV.LANG,'--setenv','HOME','/tmp/home','--setenv','TMPDIR','/tmp','--cap-drop','ALL','--remount-ro','/');
  return args;
}
function rootArgs(planFile, unit, timeout) {
  return ['--quiet','--wait','--pipe','--collect','--unit='+unit,'--property=Type=exec','--property=MemoryMax=768M','--property=MemorySwapMax=0','--property=CPUQuota=100%','--property=TasksMax=128','--property=KillMode=control-group','--property=TimeoutStopSec=2','--property=RuntimeMaxSec='+Math.ceil(timeout/1000+5),'--property=LimitCORE=0','--property=LimitFSIZE=536870912','--property=LimitNOFILE=512','--property=UMask=0077','--property=SystemCallArchitectures=native','/usr/bin/unshare','--mount','--pid','--fork','--kill-child=KILL','--ipc','--uts',...(!JSON.parse(fs.readFileSync(planFile)).network?['--net']:[]),'/usr/bin/node',__filename,'--worker',planFile];
}
function worker(planFile) {
  const st=fs.lstatSync(planFile);
  if(process.getuid()!==0 || st.uid!==0 || st.nlink!==1 || !st.isFile() || (st.mode&0o077))throw failure('Unsafe privileged launcher plan.');
  process.umask(0o022);
  const p=JSON.parse(fs.readFileSync(planFile,'utf8')), task=safeTask(p.task), stage=path.join(path.dirname(planFile),'rootfs');
  if(!Number.isInteger(p.uid)||p.uid<=0||!Number.isInteger(p.gid)||p.gid<=0)throw failure('Sandbox identity must be unprivileged.');
  const cgroup=fs.readFileSync('/proc/self/cgroup','utf8').trim().split('::')[1];
  if(!cgroup || !cgroup.endsWith('/'+p.unit+'.service'))throw failure('Owned cgroup not found.');
  const limits=Object.fromEntries(Object.keys(LIMITS).map(name=>[name,fs.readFileSync('/sys/fs/cgroup'+cgroup+'/'+name,'utf8').trim()]));
  if(JSON.stringify(limits)!==JSON.stringify(LIMITS))throw failure('Cgroup enforcement mismatch: '+JSON.stringify(limits));
  const run=(bin,args)=>execFileSync(bin,args,{env:ENV,stdio:['ignore','pipe','pipe']});
  const mount=(...args)=>run('/usr/bin/mount',args);
  mount('--make-rprivate','/');fs.mkdirSync(stage,{mode:0o700});
  mount('-t','tmpfs','-o','size=32m,mode=755,nosuid,nodev','tmpfs',stage);
  function bind(source,dest,writable=false) {
    const target=path.join(stage,dest);fs.mkdirSync(path.dirname(target),{recursive:true});
    if(fs.statSync(source).isDirectory())fs.mkdirSync(target,{recursive:true});else fs.writeFileSync(target,'');
    mount('--bind',source,target);mount('-o','remount,bind,nosuid,nodev'+(writable?'':',ro'),target);
  }
  for(const source of mountList()) {
    if(fs.lstatSync(source).isSymbolicLink()&&SYSTEM.includes(source)) {fs.symlinkSync(fs.readlinkSync(source),path.join(stage,source));continue;}
    bind(source,source);
  }
  for(const name of ['workspace','tmp','proc','dev','etc'])fs.mkdirSync(path.join(stage,name),{recursive:true});
  bind(task,'workspace',true);
  mount('-t','tmpfs','-o','size=64m,mode=1777,nosuid,nodev','tmpfs',path.join(stage,'tmp'));
  fs.mkdirSync(path.join(stage,'tmp/home'),{mode:0o700});fs.chownSync(path.join(stage,'tmp/home'),p.uid,p.gid);
  mount('-t','proc','-o','nosuid,nodev,noexec','proc',path.join(stage,'proc'));
  for(const name of ['null','zero','random','urandom']) {const dest=path.join(stage,'dev',name);fs.writeFileSync(dest,'');mount('--bind','/dev/'+name,dest);mount('-o','remount,bind,nosuid,noexec',dest);}
  fs.writeFileSync(path.join(stage,'etc/passwd'),`tvijo-agent:x:${p.uid}:${p.gid}:Sandbox:/tmp/home:/bin/sh\n`);
  fs.writeFileSync(path.join(stage,'etc/group'),`tvijo-agent:x:${p.gid}:\n`);
  mount('-o','remount,ro,nosuid,nodev',stage);
  fs.writeFileSync(path.join(path.dirname(planFile),'attestation.json'),JSON.stringify({cgroup,limits,uid:p.uid,gid:p.gid,mounts:mountList(),network:p.network}),{flag:'wx',mode:0o600});
  const args=[stage,'/usr/bin/setpriv','--reuid='+p.uid,'--regid='+p.gid,'--clear-groups','--bounding-set=-all','--inh-caps=-all','--ambient-caps=-all','--no-new-privs','/usr/bin/env','-i','--chdir=/workspace'+(p.cwd==='.'?'':'/'+p.cwd),'PATH='+ENV.PATH,'LANG='+ENV.LANG,'HOME=/tmp/home','TMPDIR=/tmp','GIT_CONFIG_NOSYSTEM=1','GIT_CONFIG_GLOBAL=/dev/null','/bin/sh','-c',p.command];
  // Synchronous supervision keeps namespace PID1 alive until the command exits.
  const result=require('node:child_process').spawnSync('/usr/sbin/chroot',args,{env:ENV,stdio:'inherit'});
  process.exit(result.status??1);
}
function ownedTree(root, uid, gid) {
  for(const entry of fs.readdirSync(root,{withFileTypes:true})) {const file=path.join(root,entry.name);if(entry.isSymbolicLink())throw failure('Symlinks are not copied into Extra tasks.');if(entry.isDirectory())ownedTree(file,uid,gid);fs.chownSync(file,uid,gid);}
  fs.chownSync(root,uid,gid);
}
function git(cwd,args,{input}={}) {return execFileSync('git',['--literal-pathspecs','-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','protocol.file.allow=always',...args],{cwd,env:{...ENV,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'},maxBuffer:16*1024*1024,input});}
function snapshot(root, {paths=null,includePrivate=false}={}) {
  const files=new Map();let bytes=0;
  function add(relative) {
    if(relative.split('/').some(n=>n==='.git'||(!includePrivate&&deniedPart(n))))return;
    const file=path.resolve(root,relative);if(!within(root,file))throw failure('Unsafe snapshot path.');
    let cursor=root;for(const part of relative.split('/')) {cursor=path.join(cursor,part);try{if(fs.lstatSync(cursor).isSymbolicLink())throw failure('Symlinks are not copied into tasks: '+relative);}catch(e){if(e.code==='ENOENT')return;throw e;}}
    let st;try{st=fs.lstatSync(file);}catch(e){if(e.code==='ENOENT')return;throw e;}
    if(st.isDirectory())return;
    if(!st.isFile()||st.nlink!==1)throw failure('Unsafe task file: '+relative);
    bytes+=st.size;if(bytes>256*1024*1024||files.size>=20000)throw failure('Task copy exceeds bounds.');
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try {const data=fs.readFileSync(fd);files.set(relative,{data,mode:st.mode&0o777,hash:createHash('sha256').update(data).digest('hex')});}finally{fs.closeSync(fd);}
  }
  function walk(dir,rel='') {for(const row of fs.readdirSync(dir,{withFileTypes:true})) {
    if(row.name==='.git'||(!includePrivate&&deniedPart(row.name)))continue;
    const relative=rel?rel+'/'+row.name:row.name;
    if(row.isDirectory())walk(path.join(dir,row.name),relative);else add(relative);
  }}
  if(paths)for(const name of paths)add(name);else walk(root);
  const hash=createHash('sha256');for(const [name,file] of [...files].sort(([a],[b])=>a.localeCompare(b)))hash.update(JSON.stringify([name,file.mode,file.hash]));
  return {hash:hash.digest('hex'),files};
}
function createTaskCopy(source, parent=os.tmpdir()) {
  const base=git(source,['rev-parse','HEAD']).toString().trim(),sourcePrefix=git(source,['rev-parse','--show-prefix']).toString().trim();
  const selected=git(source,['ls-files','-z','--cached','--others','--exclude-standard']).toString().split('\0').filter(Boolean),before=snapshot(source,{paths:selected});
  const dir=fs.mkdtempSync(path.join(parent,'tvijo-extra-')),task=path.join(dir,'task');fs.mkdirSync(task,{mode:0o755});safeTask(task);
  // Build a filtered base instead of sharing object storage: a tracked .env
  // blob must not remain readable through `git show` in the task's history.
  git(task,['init','-q']);const baseFiles=new Set();let baseBytes=0;
  const tree=git(source,['ls-tree','-r','-z','--full-tree',base,'--',sourcePrefix||'.']).toString().split('\0').filter(Boolean);
  for(const row of tree) {
    const split=row.indexOf('\t'),[mode,type,oid]=row.slice(0,split).split(' '),fullName=row.slice(split+1);
    if(sourcePrefix&&!fullName.startsWith(sourcePrefix))throw failure('Base tree escaped selected project.');
    const name=fullName.slice(sourcePrefix.length);
    if(name.split('/').some(n=>n==='.git'||deniedPart(n)))continue;
    if(type!=='blob'||mode==='120000')throw failure('Unsupported symlink or submodule in base: '+name);
    const data=git(source,['cat-file','blob',oid]);baseBytes+=data.length;if(baseBytes>256*1024*1024)throw failure('Base tree exceeds bounds.');
    const dest=path.resolve(task,name);if(!within(task,dest))throw failure('Invalid base tree path.');
    fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data,{flag:'wx',mode:parseInt(mode,8)&0o777});baseFiles.add(name);
  }
  const stagedPaths=[...baseFiles];for(let at=0;at<stagedPaths.length;at+=200)git(task,['add','--',...stagedPaths.slice(at,at+200)]);
  git(task,['-c','user.name=Tvijo Sandbox','-c','user.email=sandbox@localhost','-c','commit.gpgsign=false','commit','--quiet','--allow-empty','-m','Filtered task base from '+base]);
  const baseSnapshot=snapshot(task);
  for(const name of new Set([...baseFiles,...selected])) {
    if(name.split('/').some(n=>n==='.git'||deniedPart(n)))continue;
    const file=before.files.get(name),dest=path.resolve(task,name);if(!within(task,dest))throw failure('Invalid task copy path.');
    if(!file) {if(baseFiles.has(name))fs.unlinkSync(dest);continue;}
    fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,file.data,{mode:file.mode,flag:baseFiles.has(name)?'w':'wx'});fs.chmodSync(dest,file.mode);
  }
  if(snapshot(source,{paths:selected}).hash!==before.hash||git(source,['rev-parse','HEAD']).toString().trim()!==base)throw failure('Source changed while making task copy.');
  return {dir,root:task,baseCommit:base,sourcePrefix,source:path.resolve(source),baseline:before,baseSnapshot,selected,initial:snapshot(task)};
}
function createSandbox({root,artifactParent=path.dirname(root),network=true,mode='root-namespaces',uid,gid}={}) {
  safeTask(root);if(process.getuid?.()===0&&mode!=='root-namespaces')throw failure('Host shell is forbidden at uid 0.');
  const who=uid?{uid,gid}:identity();
  if(mode==='root-namespaces')ownedTree(root,who.uid,who.gid);
  let ready=false;
  async function execute(action,{signal,onLifecycle=()=>{},trusted=false}={}) {
    if(!ready&&!trusted)throw failure('Extra preflight has not passed.');
    const decision=analyzeCommand(action.command,{extra:true});if(!decision.ok)throw failure(decision.reason);
    const cwd=action.cwd||'.';if(path.isAbsolute(cwd)||cwd.split(/[\\/]/).some(x=>x==='..')||!within(root,path.resolve(root,cwd)))throw failure('Command directory escapes task copy.');
    const resolved=fs.realpathSync(path.resolve(root,cwd));if(!within(root,resolved)||resolved!==path.resolve(root,cwd))throw failure('Unsafe command directory.');
    const timeout=Math.min(180000,Math.max(1000,Number(action.timeout_ms)||60000));
    const id=randomUUID(),unit='tvijo-extra-'+id,dir=fs.mkdtempSync(path.join(artifactParent,'launch-'));
    const planFile=path.join(dir,'plan.json');const plan={task:root,command:action.command,cwd,network,unit,...who};
    fs.writeFileSync(planFile,JSON.stringify(plan),{flag:'wx',mode:0o600});
    const executable=mode==='root-namespaces'?'/usr/bin/systemd-run':mode==='bwrap'?'/usr/bin/bwrap':'/bin/sh';
    const args=mode==='root-namespaces'?rootArgs(planFile,unit,timeout):mode==='bwrap'?[...sandboxArgs(root,{network}), '--','/bin/sh','-c','cd '+JSON.stringify('/workspace'+(cwd==='.'?'':'/'+cwd))+' && '+action.command]:['-c',action.command];
    return new Promise(resolve=>{
      let stdout='',stderr='',finished=false,timedOut=false,cancelled=false,killer;
      const child=spawn(executable,args,{cwd:root,env:{...ENV,HOME:mode==='host-confirmed'?os.homedir():'/tmp/home'},stdio:['ignore','pipe','pipe'],detached:true});
      const stop=()=> {if(mode==='root-namespaces')try{execFileSync('/usr/bin/systemctl',['kill','--kill-whom=all','--signal=KILL',unit+'.service'],{env:ENV,stdio:'ignore',timeout:3000});}catch{}try{process.kill(-child.pid,'SIGTERM');}catch{}killer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},1000);};
      const abort=()=>{cancelled=true;stop();};const timer=setTimeout(()=>{timedOut=true;stop();},timeout);
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
      child.stdout.on('data',b=>{if(stdout.length<24576)stdout+=b.toString();});child.stderr.on('data',b=>{if(stderr.length<24576)stderr+=b.toString();});
      child.once('spawn',()=>onLifecycle({type:'start',id,unit,status:'running',startedAt:Date.now()}));
      const end=(exitCode,error)=>{if(finished)return;finished=true;clearTimeout(timer);clearTimeout(killer);signal?.removeEventListener('abort',abort);let attestation=null;try{attestation=JSON.parse(fs.readFileSync(path.join(dir,'attestation.json')));}catch{}
        const result={ok:exitCode===0&&!error&&!timedOut&&!cancelled,exitCode,command:action.command,cwd:root,stdout:stdout.slice(0,24576),stderr:stderr.slice(0,24576),error,timedOut,cancelled,sandbox:mode,network,attestation};onLifecycle({type:'exit',id,unit,status:result.ok?'completed':'failed',exitCode,endedAt:Date.now()});resolve(result);};
      child.once('error',e=>end(null,e.message));child.once('close',code=>end(code));
    });
  }
  async function preflight() {
    const code=`const fs=require('fs'); console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),groups:process.getgroups(),env:Object.keys(process.env),status:fs.readFileSync('/proc/self/status','utf8'),ns:Object.fromEntries(['mnt','pid','ipc','uts','net'].map(n=>[n,fs.readlinkSync('/proc/self/ns/'+n)])),root:fs.existsSync('/root'),home:fs.existsSync('${os.homedir()}')}))`;
    const result=await execute({command:'/usr/bin/node -e '+"'"+code.replace(/'/g,"'\\''")+"'",timeout_ms:10000},{trusted:true});
    try {
      if(!result.ok)throw Error(result.stderr||result.error||'launcher exited '+result.exitCode);
      const p=JSON.parse(result.stdout.trim());
      if(mode==='host-confirmed') {if(process.getuid()===0)throw Error('uid 0 fallback denied');}
      else {
        if(p.uid===0||p.root||p.home)throw Error('uid or host HOME isolation failed');
        for(const n of ['mnt','pid','ipc','uts',...(!network?['net']:[])])if(p.ns[n]===fs.readlinkSync('/proc/self/ns/'+n))throw Error(n+' namespace unchanged');
        if(!/NoNewPrivs:\s+1/.test(p.status)||['CapEff','CapPrm','CapBnd','CapAmb','CapInh'].some(n=>!new RegExp(n+':\\s+0{16}').test(p.status)))throw Error('Capabilities or no_new_privileges failed');
        if(mode==='root-namespaces'&&(!result.attestation||JSON.stringify(result.attestation.limits)!==JSON.stringify(LIMITS)))throw Error('Cgroup attestation missing');
        if(p.env.some(n=>!['PATH','LANG','HOME','TMPDIR','PWD','GIT_CONFIG_NOSYSTEM','GIT_CONFIG_GLOBAL'].includes(n)))throw Error('Parent environment inherited');
      }
      ready=true;return {available:true,mode,network,uid:p.uid,probe:p,attestation:result.attestation};
    } catch(e) {return unavailable(e.message);}
  }
  return {get ready(){return ready;},root,mode,network,identity:who,execute,preflight};
}
async function preflight({artifactParent=os.tmpdir(),network=true,confirmHost=async()=>false}={}) {
  if(process.platform!=='linux')return unavailable('Extra sandbox requires Linux.');
  const dir=fs.mkdtempSync(path.join(artifactParent,'tvijo-extra-preflight-')),root=path.join(dir,'task');fs.mkdirSync(root,{mode:0o755});
  const mode=process.getuid()===0?'root-namespaces':'bwrap';
  const sandbox=createSandbox({root,artifactParent:dir,network,mode});const result=await sandbox.preflight();
  if(result.available||process.getuid()===0)return result;
  if(await confirmHost(result.reason)!==true)return {...result,fallback_possible:true,network};
  return {available:true,mode:'host-confirmed',network,uid:process.getuid(),explicit_host_confirmation:true};
}
module.exports={unavailable,releasePreflight,assertExtraSandbox,preflight,createSandbox,createTaskCopy,snapshot,sandboxArgs,rootArgs,mountList,LIMITS,deniedPart};
if(require.main===module&&process.argv[2]==='--worker') {try{worker(process.argv[3]);}catch(e){process.stderr.write('Extra worker refused: '+e.message+'\n');process.exit(125);}}

function changes(copy, {againstBase=false}={}) {
  const initial=againstBase?copy.baseSnapshot:copy.initial;
  const current=snapshot(copy.root,{includePrivate:true}),rows=[];
  for(const name of new Set([...initial.files.keys(),...current.files.keys()])) {
    const before=initial.files.get(name),after=current.files.get(name);
    if(before?.hash!==after?.hash||before?.mode!==after?.mode)rows.push({path:name,previous:before?.data??null,content:after?.data??null,mode:after?.mode??null});
  }
  return {hash:current.hash,files:rows};
}
module.exports.changes=changes;

// Publication uses a fresh broker-owned index, never the model-writable .git.
async function publishTask(copy, id) {
  const remote=git(copy.source,['remote','get-url','origin']).toString().trim();
  const match=/^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(remote);
  if(!match)throw Error('PR publication requires a GitHub origin without embedded credentials.');
  const baseBranch=git(copy.source,['symbolic-ref','--short','HEAD']).toString().trim();
  const repo=match[1],branch='tvijo-extra/'+id,dir=fs.mkdtempSync(path.join(os.tmpdir(),'tvijo-extra-publish-'));
  git(dir,['init','-q']);git(dir,['fetch','--quiet','--no-tags','--depth=1',copy.source,copy.baseCommit]);
  git(dir,['symbolic-ref','HEAD','refs/heads/'+branch]);git(dir,['update-ref','refs/heads/'+branch,copy.baseCommit]);git(dir,['read-tree',copy.baseCommit]);
  for(const row of changes(copy,{againstBase:true}).files) {
    if(row.path.split('/').some(deniedPart))throw Error('Secret-like task files cannot be published.');
    if(row.content===null)git(dir,['update-index','--force-remove','--',copy.sourcePrefix+row.path]);
    else {const oid=git(dir,['hash-object','-w','--stdin'],{input:row.content}).toString().trim();git(dir,['update-index','--add','--cacheinfo',row.mode&0o111?'100755':'100644',oid,copy.sourcePrefix+row.path]);}
  }
  git(dir,['-c','user.name=Tvijo Agent','-c','user.email=agent@tvijo.local','-c','commit.gpgsign=false','commit','--quiet','-m','Extra task '+id]);
  git(dir,['remote','add','origin',remote]);
  const env={...ENV,HOME:os.homedir(),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'};
  // No key env vars or API fallback. gh/ssh use only the explicitly approved account action.
  execFileSync('git',['-c','core.hooksPath=/dev/null','-c','credential.helper=!gh auth git-credential','push','origin','HEAD:refs/heads/'+branch],{cwd:dir,env,stdio:['ignore','pipe','pipe'],timeout:60000});
  const url=execFileSync('gh',['pr','create','--repo',repo,'--head',branch,'--base',baseBranch,'--title','Extra task '+id,'--body','Task-copy changes explicitly reviewed in Tvijo. Engine check evidence is in the local task receipt.'],{cwd:dir,env,encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}).trim();
  if(!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+$/.test(url))throw Error('PR URL receipt unavailable; inspect the pushed branch.');
  return {url,branch,commit:git(dir,['rev-parse','HEAD']).toString().trim()};
}
module.exports.publishTask=publishTask;
