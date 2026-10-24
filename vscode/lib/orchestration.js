'use strict';
// Host-only dispatch. Never send account tokens or prompts to a server shell.
const {spawn,execFileSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {createHash,randomUUID}=require('node:crypto');
const PREFIX='tvijo.orchestration.run.';
function discoverHost(home=os.homedir()){
 const file=path.join(home,'.config','tvijo','orchestrator.json');
 try{
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o022)||(process.getuid&&stat.uid!==process.getuid()))return null;
  const parent=fs.statSync(path.dirname(file));
  if((parent.mode&0o022)||(process.getuid&&parent.uid!==process.getuid()))return null;
  const value=JSON.parse(fs.readFileSync(file,'utf8'));
  if(value.version!==1||!['controller','state','python'].every(k=>typeof value[k]==='string'&&path.isAbsolute(value[k])))return null;
  return value;
 }catch{return null;}
}
function settings(config){
 const enabled=config.get('orchestration.enabled',false)===true;
 const profile=config.get('orchestration.profile','dsh-harness');
 const policy=config.get('orchestration.workerPolicy','sol');
 if(enabled&&(profile!=='dsh-harness'||!['sol','sol-astra','sol-astra-claude'].includes(policy)))throw Error('Unsupported orchestration profile or worker policy.');
 const agentCount=config.get('orchestration.agentCount',3),reportFormat=config.get('orchestration.reportFormat','both');
 if(!Number.isInteger(agentCount)||agentCount<3||agentCount>6)throw Error('Team role count must be an integer from 3 to 6.');
 if(!['light','dark','rainbow','both'].includes(reportFormat))throw Error('Unsupported orchestration report format.');
 if(enabled&&policy==='sol-astra-claude'&&agentCount<4)throw Error('Sol + Astra + Claude requires at least 4 team roles including the coordinator.');
 const host=discoverHost();
 return {enabled,profile,policy,agentCount,reportFormat,python:config.get('orchestration.pythonPath','')||host?.python||'python3',controller:config.get('orchestration.controllerPath','')||host?.controller||'',state:config.get('orchestration.statePath','')||host?.state||''};
}
function safeEnv(source=process.env){return Object.fromEntries(['PATH','HOME','LANG','LC_ALL','TMPDIR','XDG_CACHE_HOME'].filter(k=>source[k]).map(k=>[k,source[k]]));}
function invoke(config,command,payload={},options={}){
 if(!path.isAbsolute(config.controller)||!path.isAbsolute(config.state))return Promise.reject(Error('DSH Harness is not set up on this project host. Use Tvijo: Set up orchestration. No packages are installed automatically.'));
 return new Promise((resolve,reject)=>{
  const child=spawn(config.python,[config.controller,'--state',config.state,command],{cwd:options.cwd,env:safeEnv(),shell:false,stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='',finished=false;
  const timer=setTimeout(()=>{child.kill('SIGTERM');finish(Error('Orchestration controller timed out. Inspect status before retrying.'));},30000);
  function finish(error,value){if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(value);}
  child.stdout.on('data',b=>{stdout+=b;if(stdout.length>2*1024*1024){child.kill('SIGTERM');finish(Error('Controller response too large.'));}});
  child.stderr.on('data',b=>{stderr=(stderr+b).slice(-2000);});
  child.on('error',()=>finish(Error('Orchestration runtime is unavailable. Configure the installed controller and Python on this extension host.')));
  child.on('close',code=>{if(code!==0)return finish(Error(stderr||'Orchestration refused the request. Run doctor.'));try{finish(null,JSON.parse(stdout));}catch{finish(Error('Invalid controller response; inspect the durable status.'));}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(payload));
 });
}
const keyFor=(scope,root)=>PREFIX+createHash('sha256').update(scope+'\0'+root).digest('hex');
function completedModels(report){
 return Object.entries(report?.completed_native_models||{}).filter(([model,proof])=>['gpt-6.1-sol','gpt-6-astra','claude-opus-5-5'].includes(model)&&proof?.verified===true&&typeof proof.receipt==='string').map(([model])=>model);
}
function commitEvidence(report,start){
 const writes=[];
 if(!start?.ok)return {writes,events:[]};
 for(const entry of report.edit_receipts?.writes||[]){
  try{
   if(typeof entry.path!=='string'||path.isAbsolute(entry.path)||entry.path.split(/[\\/]/).includes('..'))continue;
   const absolute=fs.realpathSync(path.join(start.root,entry.path)),rel=path.relative(start.root,absolute);
   if(!rel||rel.startsWith('..')||path.isAbsolute(rel))continue;
   const content=fs.readFileSync(absolute);
   if(content.length>200000||createHash('sha256').update(content).digest('hex')!==entry.sha256)continue;
   let previous=null;
   try{previous=execFileSync('git',['show',start.head+':'+entry.path],{cwd:start.root,env:safeEnv(),encoding:'utf8',maxBuffer:200000,stdio:['ignore','pipe','pipe']});}catch(error){if(error.status!==128)continue;}
   writes.push({absolute,previous,content});
  }catch{}
 }
 return {writes,events:report.edit_receipts?.events||[]};
}
function createOrchestrator({state,configuration,invokeController=invoke,pollMs=1000}){
 const active=new Map();
 const call=(config,command,payload,cwd)=>invokeController(config,command,payload,{cwd});
 async function stop(record){if(record?.root_id)await call(record.config,'stop',{root_id:record.root_id},record.project);}
 async function run({scope,tenant,account,project,prompt,goalRef,planMode=false,budgetUsd=2,maxSteps=11,guard,signal,onStatus=async()=>{},authorityRoot}){
  const config=settings(configuration());
  if(!config.enabled)throw Error('DSH orchestration is disabled.');
  await guard();
  const canonical=fs.realpathSync(project),key=keyFor(scope,canonical);
  const previous=state.get(key);
  if(previous&&(previous.qualityChecking||['queued','running','launching','quality_running','cancel_requested','reconcile_required','reconnect_required'].includes(previous.status)))throw Error('This project has a durable orchestration task. Use Status, Resume or Stop before a new task.');
  const doctor=await call(config,'doctor',{},canonical);await guard();
  if(doctor.setup_required)throw Error('DSH Harness needs setup on a Linux local or Remote SSH project host. Run Orchestration doctor and follow https://dsh.tvijo.com/orchestration/setup');
  // An old controller may silently ignore additive authorize fields. Require its
  // advertised team-options capability before claiming a configured team.
  if(!doctor.team_options||typeof doctor.team_options!=='object'||Array.isArray(doctor.team_options))throw Error('This host runtime does not advertise team options. Update it through explicit host setup before starting a team task.');
  const selectedPolicy=Array.isArray(doctor.team_options.policies)?doctor.team_options.policies.find(item=>item.id===config.policy):null;
  if(!Array.isArray(doctor.team_options.agent_counts)||!doctor.team_options.agent_counts.includes(config.agentCount)||!Array.isArray(doctor.team_options.report_formats)||!doctor.team_options.report_formats.includes(config.reportFormat))throw Error('The selected team size or report format is not supported by this host runtime. Update the host or choose a supported option.');
  if(!selectedPolicy||selectedPolicy.available!==true||!Array.isArray(selectedPolicy.agent_counts)||!selectedPolicy.agent_counts.includes(config.agentCount))throw Error('The selected subscription worker policy is unavailable for this team size on this host. No paid API fallback.');
  if(config.policy==='sol-astra-claude'&&!doctor.native_claude_verified)throw Error('Claude native provider, exact model and subscription quota are not verified on this host. Select Sol or Sol + Astra.');
  const workspace=createHash('sha256').update(canonical).digest('hex');
  const binding={tenant,workspace,account,project:canonical};
  // authorityRoot is a host-only continuation input for explicit bounded repair/tests;
  // a webview message is never allowed to supply it.
  const authority=authorityRoot?{id:authorityRoot}:await call(config,'authorize',{...binding,cap_usd:String(Math.min(2,budgetUsd)),turns_max:Math.min(11,maxSteps),children_max:config.agentCount-1,agent_count:config.agentCount,report_format:config.reportFormat,policy:config.policy,trusted:true},canonical);
  const record={root_id:authority.id,project:canonical,scope,status:'queued',config};
  active.set(key,record);await state.update(key,record);
  let authorityInvalid=false;
  const checkAuthority=async()=>{try{await guard();}catch(error){authorityInvalid=true;throw error;}};
  const abort=()=>{void stop(record).catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try{
   await checkAuthority();if(signal?.aborted)throw Error('Orchestration cancelled.');
   const submitted=await call(config,'submit',{root_id:record.root_id,...binding,event_id:'editor-'+randomUUID(),goal:goalRef||'goal-'+randomUUID(),prompt,read_only:planMode},canonical);
   Object.assign(record,submitted);await state.update(key,record);await onStatus(record);
   while(true){
    await checkAuthority();if(signal?.aborted)throw Error('Orchestration cancelled.');
    const snapshot=await call(config,'status',{root_id:record.root_id,tenant,workspace},canonical);
    const job=snapshot.jobs.find(j=>j.id===record.job_id);if(!job)throw Error('Durable job missing; reconciliation required.');
    record.status=job.status;record.qualityChecking=job.execution_active===true;await state.update(key,record);await onStatus({...record,snapshot});
    if(!job.execution_active&&!['queued','running','launching','quality_running','cancel_requested'].includes(job.status))return {record,snapshot,job};
    await new Promise(resolve=>setTimeout(resolve,pollMs));
   }
  }catch(error){
   if(authorityInvalid||signal?.aborted){await stop(record);record.status='cancelled';}
   else {record.status='reconnect_required';error.message+=' The durable task is preserved. Use Orchestration status or Resume; do not submit it again.';}
   await state.update(key,record);throw error;
  }
  finally{signal?.removeEventListener('abort',abort);active.delete(key);}
 }
 return {run,enabled:()=>settings(configuration()).enabled,settings:()=>settings(configuration()),
  doctor:()=>call(settings(configuration()),'doctor',{}),
  saved:(scope,project)=>state.get(keyFor(scope,fs.realpathSync(project))),
  async status(scope,project){const r=this.saved(scope,project);if(!r)throw Error('No orchestration task saved for this account and project.');const snapshot=await call(r.config,'status',{root_id:r.root_id},r.project);const job=snapshot.jobs?.find(j=>j.id===r.job_id)||(r.job_id?null:snapshot.jobs?.length===1?snapshot.jobs[0]:null);if(job){r.job_id=job.id;r.status=job.status;r.qualityChecking=job.execution_active===true;await state.update(keyFor(scope,r.project),r);}return snapshot;},
  async resume(scope,project){const r=this.saved(scope,project);if(!r)throw Error('No saved task.');if(!r.job_id)await this.status(scope,project);if(!r.job_id)throw Error('Submission outcome is unknown. Inspect the original authority before retrying.');return call(r.config,'resume',{job_id:r.job_id},r.project);},
  async stop(scope,project){const r=this.saved(scope,project);await stop(r);if(r){r.status='cancelled';await state.update(keyFor(scope,r.project),r);}},
  async repair(scope,project,prompt){const r=this.saved(scope,project);if(!r)throw Error('No original task authority.');const next=await call(r.config,'repair',{job_id:r.job_id,event_id:'repair-'+r.job_id,prompt},r.project);Object.assign(r,next);await state.update(keyFor(scope,r.project),r);return next;},
  async invalidate(){
   const records=new Map([...active.values()].map(r=>[r.root_id,r]));
   for(const key of state.keys?.()||[]){const r=key.startsWith(PREFIX)?state.get(key):null;if(r&&(r.qualityChecking||['queued','running','launching','quality_running','cancel_requested','reconcile_required','reconnect_required'].includes(r.status)))records.set(r.root_id,r);}
   await Promise.all([...records.values()].map(stop));
  },
 };
}
module.exports={settings,safeEnv,invoke,createOrchestrator,keyFor,discoverHost,commitEvidence,completedModels};
