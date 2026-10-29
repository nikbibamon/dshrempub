'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn,execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {createSandbox,LIMITS}=require('../lib/extra-sandbox');
const skip=process.platform!=='linux'?'Linux namespaces are required':process.getuid()!==0?'root trusted-launcher host probe requires uid 0':false;

test('SPEC-238 root host: actual preflight and SPEC-207 escape probes',{skip,timeout:40000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'extra-host-probes-')),task=path.join(dir,'task'),repo=path.join(dir,'user-repository');
 fs.mkdirSync(task,{mode:0o755});fs.mkdirSync(repo);fs.mkdirSync(path.join(repo,'.git'));
 fs.mkdirSync(path.join(dir,'another-task'),{mode:0o755});
 const hostUnit='tvijo-extra-host-probe-'+randomUUID()+'.service';
 execFileSync('/usr/bin/systemd-run',['--quiet','--collect','--unit='+hostUnit,'--property=RuntimeMaxSec=120','/usr/bin/sleep','120'],{stdio:'pipe'});
 const canary=path.join(dir,'host-secret-canary');fs.writeFileSync(canary,'OWNED TEST CANARY ONLY',{mode:0o600,flag:'wx'});
 const sentinel=spawn('/usr/bin/sleep',['120'],{stdio:'ignore'});
 const sandbox=createSandbox({root:task,artifactParent:dir,network:false});
 const ready=await sandbox.preflight();
 assert.equal(ready.available,true,'STOP: root launcher preflight failed: '+ready.reason);
 console.log('preflight '+JSON.stringify({mode:ready.mode,uid:ready.uid,attestation:ready.attestation}));
 assert.deepEqual(ready.attestation.limits,LIMITS);
 const script=`
 const fs=require('fs'),cp=require('child_process'),net=require('net');
 const failures=[],results=[];const probe=(name,ok)=>{results.push({name,pass:ok});if(!ok)failures.push(name);};
 function unreadable(p){try{fs.accessSync(p,fs.constants.R_OK);return false;}catch{return true;}}
 for(const [name,p] of Object.entries(${JSON.stringify({host_secret:canary,codex_auth:'/root/.codex/auth.json',ssh:'/root/.ssh',env:'/root/ai-os-workspaces/.env',env_glob:'/root/ai-os-workspaces',other_task:dir+'/another-task'})}))probe(name,unreadable(p));
 for(const [name,p] of Object.entries(${JSON.stringify({repository:repo+'/escape-write',git:repo+'/.git/escape-write'})})){let denied=false;try{fs.writeFileSync(p,'ESCAPE',{flag:'wx'});}catch{denied=true;}probe(name,denied);}
 for(const [name,bin,args] of [['crontab','crontab',['-l']],['systemctl','systemctl',['stop',${JSON.stringify(hostUnit)}]]]){let denied=false;try{cp.execFileSync(bin,args,{stdio:'ignore',timeout:2000});}catch{denied=true;}probe(name,denied);}
 let killed=false;try{process.kill(${sentinel.pid},'SIGTERM');killed=true;}catch{}probe('kill_host_process',!killed);
 probe('uid',process.getuid()!==0);probe('environment',!process.env.SPEC238_PARENT_SECRET&&!process.env.OPENAI_API_KEY&&!process.env.ANTHROPIC_API_KEY);
 const status=fs.readFileSync('/proc/self/status','utf8');probe('no_new_privileges',/NoNewPrivs:\\s+1/.test(status));
 probe('capabilities',['CapInh','CapPrm','CapEff','CapBnd','CapAmb'].every(n=>new RegExp(n+':\\\\s+0{16}').test(status)));
 probe('host_proc',!fs.existsSync('/proc/${sentinel.pid}'));probe('system_readonly',fs.readFileSync('/proc/mounts','utf8').split('\\n').some(l=>l.split(' ')[1]==='/usr'&&l.split(' ')[3].split(',').includes('ro')));
 probe('task_writable',(()=>{try{fs.writeFileSync('/workspace/probe-write','ok');return true;}catch{return false;}})());
 probe('other_homes_absent',!fs.existsSync('/root')&&!fs.existsSync('/etc/aios')&&!fs.existsSync('/run')&&!fs.existsSync('/sys'));
 probe('account_cli_credentials',unreadable('/tmp/home/.codex/auth.json')&&unreadable('/tmp/home/.ssh')&&unreadable('/tmp/home/.claude'));
 let sizeDenied=false;const fd=fs.openSync('/tmp/file-size-canary','w');try{fs.ftruncateSync(fd,512*1024*1024+1);}catch(e){sizeDenied=e.code==='EFBIG';}finally{fs.closeSync(fd);}probe('file_size_limit',sizeDenied);
 const temporary=fs.statfsSync('/tmp');probe('bounded_tmpfs',temporary.blocks*temporary.bsize<=64*1024*1024);
 async function unreachable(host){return new Promise(resolve=>{const s=net.connect({host,port:80});s.setTimeout(500);s.on('connect',()=>{s.destroy();resolve(false);});s.on('error',()=>resolve(true));s.on('timeout',()=>{s.destroy();resolve(true);});});}
 (async()=>{for(const host of ['127.0.0.1','169.254.169.254','1.1.1.1'])probe('network_'+host,await unreachable(host));console.log(JSON.stringify({results,failures}));process.exitCode=failures.length?1:0;})();
 `;
 process.env.SPEC238_PARENT_SECRET='not-a-real-secret';
 const command='/usr/bin/node -e '+"'"+script.replace(/'/g,"'\\''")+"'";
 try {
  const result=await sandbox.execute({command,timeout_ms:10000});
  console.log('escape-probes '+result.stdout);if(!result.ok)console.log('launcher stderr '+result.stderr);
  assert.equal(result.ok,true,'STOP: escape probe failed; never weaken the probe');
  const report=JSON.parse(result.stdout.trim());assert.deepEqual(report.failures,[]);assert.equal(report.results.every(p=>p.pass),true);
  assert.equal(fs.existsSync(path.join(repo,'escape-write')),false);assert.equal(fs.existsSync(path.join(repo,'.git/escape-write')),false);
  assert.doesNotThrow(()=>process.kill(sentinel.pid,0));
  assert.doesNotThrow(()=>execFileSync('/usr/bin/systemctl',['is-active','--quiet',hostUnit],{stdio:'pipe'}));
 } finally {sentinel.kill('SIGTERM');delete process.env.SPEC238_PARENT_SECRET;execFileSync('/usr/bin/systemctl',['stop',hostUnit],{stdio:'pipe'});}
});
