'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createOrchestrator,settings,safeEnv,keyFor}=require('../lib/orchestration');
const teamOptions=()=>({agent_counts:[3,4,5,6],report_formats:['light','dark','rainbow','both'],policies:[{id:'sol',available:true,agent_counts:[3,4,5,6]}]});
function fixture(extra={},intercept){
 const root=fs.mkdtempSync(path.join(process.env.TVIJO_TEST_ARTIFACTS||os.tmpdir(),'orchestration-'));
 const values=new Map(),calls=[];
 const config={'orchestration.enabled':true,'orchestration.controllerPath':'/runtime/scripts/tvijo_orchestrator.py','orchestration.statePath':root+'/state',...extra};
 const invokeController=async(c,command,data,options)=>{calls.push({command,data,options});if(intercept){const value=await intercept(command,data);if(value!==undefined)return value;}
  if(command==='doctor')return {setup_required:false,team_options:teamOptions()};if(command==='authorize')return {id:'root-1'};
  if(command==='submit')return {root_id:'root-1',job_id:'job-1',tmux:'tvijo-123abc',status:'queued'};
  if(command==='status')return {jobs:[{id:'job-1',status:'quality_pending',report:'{}'}]};return {};};
 const state={get:k=>values.get(k),keys:()=>[...values.keys()],update:async(k,v)=>values.set(k,v)};
 const host=createOrchestrator({state,configuration:()=>({get:(k,d)=>config[k]??d}),invokeController,pollMs:1});
 return {root,values,calls,config,host,options:{scope:'scope-a',tenant:'tenant-a',account:'account-a',project:root,prompt:'$(touch INJECTION) secret-free goal',guard:async()=>{}}};
}
test('DSH mode is opt-in and refuses unknown worker policy',()=>{
 assert.equal(settings({get:(k,d)=>d}).enabled,false);
 assert.throws(()=>settings({get:(k,d)=>k==='orchestration.enabled'?true:k==='orchestration.workerPolicy'?'fallback':d}));
});
test('disabled team preferences cannot break single-model startup',()=>{
 const values={'orchestration.enabled':false,'orchestration.agentCount':1,'orchestration.reportFormat':'obsolete','orchestration.workerPolicy':'obsolete'};
 assert.equal(settings({get:(key,fallback)=>values[key]??fallback}).enabled,false);
 values['orchestration.enabled']=true;
 assert.throws(()=>settings({get:(key,fallback)=>values[key]??fallback}),error=>error.code==='orchestration_preferences');
});
test('missing controller yields a fixed diagnostic instead of a workspace-file error',async()=>{
 const {invoke}=require('../lib/orchestration'),{notice}=require('../lib/runtime-errors');
 await assert.rejects(invoke({controller:'',state:''},'doctor'),error=>{
  assert.equal(error.code,'orchestration_setup');
  assert.match(notice(error.code,'en'),/turn off DSH Harness/);
  assert.match(notice(error.code,'ru'),/выключите DSH Harness/);
  return true;
 });
 assert.equal(notice('__proto__'),null);assert.equal(notice('unexpected_secret_error'),null);
});
test('controller failure does not expose arbitrary stderr in either locale',async()=>{
 const {invoke}=require('../lib/orchestration'),{notice}=require('../lib/runtime-errors');
 const root=fs.mkdtempSync(path.join(process.env.TVIJO_TEST_ARTIFACTS||os.tmpdir(),'orchestration-stderr-'));
 const controller=path.join(root,'refuse.cjs');
 fs.writeFileSync(controller,"process.stderr.write('PRIVATE_STDERR_SENTINEL');process.exit(1);");
 await assert.rejects(invoke({controller,state:root,python:process.execPath},'doctor'),error=>{
  assert.equal(error.code,'orchestration_runtime');
  for(const locale of ['en','ru'])assert.ok(!notice(error.code,locale).includes('PRIVATE_STDERR_SENTINEL'));
  assert.ok(!error.message.includes('PRIVATE_STDERR_SENTINEL'));return true;
 });
});
test('production adapter dispatch binds root account and caps; prompt is JSON not shell',async()=>{
 const f=fixture();const result=await f.host.run(f.options);
 assert.equal(result.job.status,'quality_pending');
 const grant=f.calls.find(c=>c.command==='authorize').data;
 assert.equal(grant.account,'account-a');assert.equal(grant.tenant,'tenant-a');assert.equal(grant.project,f.root);
 assert.equal(grant.cap_usd,'2');assert.equal(grant.turns_max,11);assert.equal(grant.children_max,2);assert.equal(grant.agent_count,3);assert.equal(grant.report_format,'both');
 const submit=f.calls.find(c=>c.command==='submit').data;
 assert.equal(submit.root_id,'root-1');assert.equal(submit.prompt,f.options.prompt);
 assert.ok(!fs.existsSync(path.join(f.root,'INJECTION')));
 assert.ok(f.host.saved('scope-a',f.root));assert.equal(f.host.saved('scope-b',f.root),undefined);
});
test('production adapter waits through queued and running quality before returning to auto-commit',async()=>{
 let polls=0;const observed=[];
 const f=fixture({},async command=>{
  if(command==='status'){
   polls++;
   return {jobs:[{id:'job-1',status:polls===2?'quality_running':'quality_pending',execution_active:polls<3,report:'{}'}]};
  }
 });
 const result=await f.host.run({...f.options,onStatus:async r=>observed.push(r.status)});
 assert.equal(polls,3);assert.equal(result.job.execution_active,false);assert.ok(observed.includes('quality_running'));
 assert.equal(f.host.saved('scope-a',f.root).qualityChecking,false);
});
test('saved unfinished quality blocks a new authority and is stopped on trust invalidation',async()=>{
 const f=fixture();await f.host.run(f.options);const record=f.host.saved('scope-a',f.root);
 record.status='quality_pending';record.qualityChecking=true;f.calls.length=0;
 await assert.rejects(f.host.run(f.options),/durable orchestration task/);
 assert.equal(f.calls.some(c=>c.command==='authorize'),false);
 await f.host.invalidate();assert.equal(f.calls.filter(c=>c.command==='stop').length,1);
});
test('trust/workspace/account guard revokes already-minted authority',async()=>{
 const f=fixture();let checks=0;
 await assert.rejects(f.host.run({...f.options,guard:async()=>{if(++checks===3)throw Error('workspace_changed');}}),/workspace_changed/);
 assert.equal(f.calls.filter(c=>c.command==='stop').length,1);
 assert.equal(f.calls.filter(c=>c.command==='submit').length,0);
});
test('cancel before submit revokes lifetime authority and cannot silently fallback',async()=>{
 const f=fixture(),abort=new AbortController();abort.abort();
 await assert.rejects(f.host.run({...f.options,signal:abort.signal}),/cancelled/);
 assert.equal(f.calls.some(c=>c.command==='stop'),true);
 assert.equal(f.calls.some(c=>c.command==='submit'),false);
 assert.equal(f.calls.some(c=>c.command==='chat'),false);
});
test('resume and status use original job without new authority or cap',async()=>{
 const f=fixture();await f.host.run(f.options);f.calls.length=0;
 await f.host.resume('scope-a',f.root);await f.host.status('scope-a',f.root);
 assert.deepEqual(f.calls.map(c=>c.command),['resume','status']);
 assert.deepEqual(f.calls[0].data,{job_id:'job-1'});
 await assert.rejects(f.host.resume('scope-b',f.root),/No saved task/);
});
test('no provider keys, tokens, shell hooks or gateway credentials reach controller',()=>{
 assert.deepEqual(safeEnv({HOME:'/home/x',PATH:'/bin',OPENAI_API_KEY:'key',ANTHROPIC_API_KEY:'key',NODE_OPTIONS:'bad',BASH_ENV:'bad',ACCESS_TOKEN:'secret'}),{HOME:'/home/x',PATH:'/bin'});
});
test('actual host dispatch branch uses settings before the existing engine',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../extension.js'),'utf8');
 assert.match(source,/if \(orchestration\.enabled\(\) && !fullGrant\?\.extra\) return runHarnessFlow/);
 assert.match(source,/orchestration\.run\(/);assert.match(source,/vscode\.workspace\.isTrusted !== true/);
 assert.match(source,/agentAbort\?\.abort\(\); await orchestration\.invalidate/);
});

test('status transport loss preserves dispatched authority and reconnect never resubmits',async()=>{
 let lost=true;
 const f=fixture({},async command=>{if(command==='status'&&lost){lost=false;throw Error('connection lost');}});
 await assert.rejects(f.host.run(f.options),/durable task is preserved/);
 const record=f.host.saved('scope-a',f.root);assert.equal(record.status,'reconnect_required');assert.equal(record.job_id,'job-1');
 assert.equal(f.calls.filter(c=>c.command==='stop').length,0);
 await assert.rejects(f.host.run(f.options),/durable orchestration task/);
 await f.host.resume('scope-a',f.root);await f.host.status('scope-a',f.root);
 assert.equal(f.calls.filter(c=>c.command==='authorize').length,1);
 assert.equal(f.calls.filter(c=>c.command==='submit').length,1);
 assert.equal(f.calls.filter(c=>c.command==='stop').length,0);
 assert.equal(f.host.saved('scope-a',f.root).status,'quality_pending');
});
test('lost submit response recovers the original job through its root without replay',async()=>{
 const f=fixture({},async command=>{if(command==='submit')throw Error('response lost after accept');});
 await assert.rejects(f.host.run(f.options),/preserved/);
 await f.host.resume('scope-a',f.root);
 assert.equal(f.host.saved('scope-a',f.root).job_id,'job-1');
 assert.equal(f.calls.filter(c=>c.command==='submit').length,1);
 assert.equal(f.calls.filter(c=>c.command==='authorize').length,1);
 assert.equal(f.calls.filter(c=>c.command==='stop').length,0);
});
test('host discovery accepts private owner config and rejects writable or symlink manifest',()=>{
 const {discoverHost}=require('../lib/orchestration');const f=fixture();
 const dir=path.join(f.root,'.config/tvijo');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const file=path.join(dir,'orchestrator.json'),value={version:1,python:'/usr/bin/python3',controller:'/volume/controller.py',state:'/volume/private'};
 fs.writeFileSync(file,JSON.stringify(value),{mode:0o600});assert.deepEqual(discoverHost(f.root),value);
 fs.chmodSync(file,0o666);assert.equal(discoverHost(f.root),null);
});
test('auto-commit evidence requires observed matching bytes inside exact root',()=>{
 const {commitEvidence}=require('../lib/orchestration'),{createHash}=require('node:crypto');const f=fixture();
 const {execFileSync}=require('node:child_process');execFileSync('git',['init','-q',f.root]);
 fs.writeFileSync(path.join(f.root,'new.txt'),'bounded edit');
 const sha256=createHash('sha256').update('bounded edit').digest('hex');
 const evidence=commitEvidence({edit_receipts:{writes:[{path:'new.txt',sha256},{path:'../escape',sha256},{path:'/etc/passwd',sha256},{path:'new.txt',sha256:'wrong'}]}},{ok:true,root:f.root,head:'HEAD'});
 assert.equal(evidence.writes.length,1);assert.equal(evidence.writes[0].previous,null);
});

test('commit model attribution uses completed verified receipts, never worker policy or alias',()=>{
 const {completedModels}=require('../lib/orchestration');
 assert.deepEqual(completedModels({coordinator_alias:'ds41f',workerPolicy:'sol-astra-claude'}),[]);
 assert.deepEqual(completedModels({completed_native_models:{'gpt-6.1-sol':{verified:true,receipt:'codex-1.jsonl'},'gpt-6-astra':{verified:false,receipt:'codex-2.jsonl'},'sol-astra-claude':{verified:true,receipt:'fake'}}}),['gpt-6.1-sol']);
});

test('team preferences validate role count, report format and Claude minimum',()=>{
 for(const extra of [{'orchestration.agentCount':2},{'orchestration.agentCount':7},{'orchestration.agentCount':3.5},{'orchestration.reportFormat':'auto'},{'orchestration.workerPolicy':'sol-astra-claude','orchestration.agentCount':3}])assert.throws(()=>settings({get:(key,fallback)=>({'orchestration.enabled':true,...extra})[key]??fallback}));
});
test('explicit team count and format reach authorize with coherent sequential worker slots',async()=>{
 const f=fixture({'orchestration.agentCount':6,'orchestration.reportFormat':'rainbow'});await f.host.run(f.options);const grant=f.calls.find(c=>c.command==='authorize').data;
 assert.equal(grant.agent_count,6);assert.equal(grant.children_max,5);assert.equal(grant.report_format,'rainbow');assert.equal(grant.policy,'sol');
});
test('old runtimes and unavailable advertised worker policies stop before authorize',async()=>{
 for(const doctor of [{setup_required:false},{setup_required:false,team_options:{...teamOptions(),policies:[{id:'sol',available:false,agent_counts:[3,4,5,6]}]}}]){
 const f=fixture({},async command=>command==='doctor'?doctor:undefined);await assert.rejects(f.host.run(f.options),/team options|unavailable/);assert.equal(f.calls.some(c=>c.command==='authorize'),false);
 }
});

test('partial and unsupported team capabilities fail before reserving money',async()=>{
 for(const options of [{}, {...teamOptions(),agent_counts:[4,5,6]}, {...teamOptions(),report_formats:['light']}, {...teamOptions(),policies:[]}, {...teamOptions(),policies:[{id:'sol',available:true,agent_counts:[4]}]}]){const f=fixture({},async command=>command==='doctor'?{setup_required:false,team_options:options}:undefined);await assert.rejects(f.host.run(f.options),/not supported|unavailable/);assert.equal(f.calls.some(c=>c.command==='authorize'),false);}
});

test('sol-claude is a capability-checked three participant policy with unchanged defaults',async()=>{
 const properties=require('../package.json').contributes.configuration.properties;
 assert.equal(properties['tvijo.orchestration.workerPolicy'].default,'sol');
 assert.ok(properties['tvijo.orchestration.workerPolicy'].enum.includes('sol-claude'));
 const f=fixture({'orchestration.workerPolicy':'sol-claude','orchestration.agentCount':3},async command=>command==='doctor'?{setup_required:false,team_options:{...teamOptions(),policies:[{id:'sol-claude',available:true,agent_counts:[3,4,5,6]}]}}:undefined);
 await f.host.run(f.options);const grant=f.calls.find(c=>c.command==='authorize').data;
 assert.equal(grant.agent_count,3);assert.equal(grant.policy,'sol-claude');
 const unavailable=fixture({'orchestration.workerPolicy':'sol-claude'});
 await assert.rejects(unavailable.host.run(unavailable.options),/unavailable/);
 assert.equal(unavailable.calls.some(c=>c.command==='authorize'),false);
});
