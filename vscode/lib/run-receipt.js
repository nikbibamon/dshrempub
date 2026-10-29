'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {snapshot}=require('./extra-sandbox');
const SCHEMA='tvijo.extra-receipt/v1';
function priceOf(answer) {
 const value=answer?.cost?.spent_usd??answer?.cost?.budget?.spent_usd??answer?.cost?.spent;
 if(value==null||value===''||typeof value==='boolean')return null;
 const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;
}
function count(value) {return value!=null&&value!==''&&typeof value!=='boolean'&&Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;}
function usageOf(answer) {const u=answer?.usage||{};return {input_tokens:count(u.prompt_tokens??u.input_tokens),output_tokens:count(u.completion_tokens??u.output_tokens),total_tokens:count(u.total_tokens)};}
function projectChecks(root,configured=[]) {
 if(Array.isArray(configured)&&configured.length)return Object.freeze(configured.map(command=>{
  if(typeof command!=='string'||!command.trim()||command.length>4096||command.includes('\0'))throw Error('Invalid project check command');return command;
 }));
 const file=path.join(root,'package.json');
 try {const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>131072)return Object.freeze([]);const p=JSON.parse(fs.readFileSync(file,'utf8'));return Object.freeze(typeof p.scripts?.test==='string'&&p.scripts.test.trim()?['npm test']:[]);}catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)return Object.freeze([]);throw e;}
}
function createRunReceipt({taskId,baseCommit=null,root,sandboxMode=null,network=true,hostConfirmed=false,checks=[],now=Date.now,tree=()=>snapshot(root,{includePrivate:true})}={}) {
 const started=now(),initial=tree(),writes=[],runs=[],checkRuns=[],apiCalls=[],subscriptions=[],verdicts=[];
 const pinned=Object.freeze([...checks]);let seq=0,lastWrite=0,last=initial;
 const timestamp=()=>new Date(now()).toISOString();
 function capture(){return tree();}
 function recordAction(action,result,before) {
  const after=capture();seq++;
  const files=[...new Set([...before.files.keys(),...after.files.keys()])].filter(name=>before.files.get(name)?.hash!==after.files.get(name)?.hash||before.files.get(name)?.mode!==after.files.get(name)?.mode);
  if(files.length||(['write_file','replace_in_file'].includes(action.tool)&&result?.ok&&!result.unchanged)) {lastWrite=seq;writes.push({timestamp:timestamp(),sequence:seq,tool:action.tool,tree_hash:after.hash,files});}
  if(action.tool==='run_command') {
   const run={timestamp:timestamp(),sequence:++seq,command:action.command,exit_code:Number.isInteger(result?.exitCode)?result.exitCode:null,ok:result?.ok===true,before_tree_hash:before.hash,tree_hash:after.hash,after_last_write:seq>lastWrite};runs.push(run);
   if(pinned.includes(action.command))checkRuns.push({...run});
  }
  last=after;return after;
 }
 function recordGateway(answer) {const cost=priceOf(answer);apiCalls.push({task_id:answer?.taskId??null,cost_usd:cost,usage:usageOf(answer)});return cost;}
 function recordReview(r) {
  subscriptions.push({agent:r.agent,requested_model:r.requested_model??null,served_model:r.served_model??null,duration_ms:Number.isFinite(Date.parse(r.ended_at)-Date.parse(r.started_at))?Date.parse(r.ended_at)-Date.parse(r.started_at):null,outcome:r.ok?'completed':r.reason||'failed',receipt_id:r.id??null});
  verdicts.push({agent:r.agent,ok:r.ok===true,verdict:typeof r.output==='string'?r.output:null,trust:'untrusted_advisory'});
 }
 function verify() {
  const current=capture();
  const bad=reason=>({status:'unverified',reason,tree_hash:current.hash});
  if(!pinned.length)return bad('no_checks_defined');
  for(const command of pinned) {
   const check=checkRuns.findLast(r=>r.command===command);
   if(!check)return bad('no_checks_run');
   if(check.sequence<=lastWrite)return bad('check_before_last_write');
   if(!check.ok||check.exit_code!==0)return bad('check_failed');
   if(check.tree_hash!==current.hash||check.before_tree_hash!==check.tree_hash)return bad('tree_changed');
  }
  return {status:'verified',reason:null,tree_hash:current.hash};
 }
 function finish(status='unverified',reason=null) {
  let current,treeUnavailable=false;try{current=capture();}catch{current=last;treeUnavailable=true;status='unverified';reason='tree_unavailable';}
  const files=[...new Set([...initial.files.keys(),...current.files.keys()])].filter(name=>initial.files.get(name)?.hash!==current.files.get(name)?.hash||initial.files.get(name)?.mode!==current.files.get(name)?.mode);
  const allPriced=apiCalls.length>0&&apiCalls.every(r=>r.cost_usd!==null),tokenTotal=field=>apiCalls.length&&apiCalls.every(r=>r.usage[field]!==null)?apiCalls.reduce((a,r)=>a+r.usage[field],0):null;
  return {schema:SCHEMA,task_id:taskId,base_commit:baseCommit,started_at:new Date(started).toISOString(),ended_at:timestamp(),duration_ms:now()-started,base_tree_hash:initial.hash,last_write_tree_hash:writes.at(-1)?.tree_hash??initial.hash,final_tree_hash:treeUnavailable?null:current.hash,tree_hash_unavailable:treeUnavailable,files_changed:files,writes,runs,checks:checkRuns.map(r=>({...r,after_last_write:r.sequence>lastWrite})),checks_defined:pinned,final_status:status,verification_reason:reason,metered_api_cost_usd:allPriced?apiCalls.reduce((a,r)=>a+r.cost_usd,0):null,tokens:{input_tokens:tokenTotal('input_tokens'),output_tokens:tokenTotal('output_tokens'),total_tokens:tokenTotal('total_tokens')},api_calls:apiCalls,subscription_calls:subscriptions,reviewer_verdicts:verdicts,sandbox_mode:sandboxMode,network,explicit_host_confirmation:hostConfirmed};
 }
 function wrap(tools) {
  const execute=tools.execute.bind(tools);
  const run=async(action,context)=>{const before=capture();let result;try{result=await execute(action,context);return result;}finally{recordAction(action,result,before);}};
  tools.execute=async(action,context={})=>{
   if(action?.tool==='run_checks') {
    if(context.planMode)return {ok:false,refused:true,reason:'plan_mode'};
    if(!pinned.length)return {ok:false,reason:'no_checks_defined'};
    const results=[];for(const command of pinned){if(context.signal?.aborted)break;results.push(await run({tool:'run_command',command,timeout_ms:180000},context));}
    return {ok:results.length===pinned.length&&results.every(r=>r.ok),checks:results};
   }
   return run(action,context);
  };
  return tools;
 }
 return {capture,recordAction,recordGateway,recordReview,verify,finish,wrap,checks:pinned};
}
function compactReceipt(receipt) {
 return {task_id:receipt.task_id,final_status:receipt.final_status,verification_reason:receipt.verification_reason,metered_api_cost_usd:receipt.metered_api_cost_usd,tokens:receipt.tokens,files_changed:receipt.files_changed.length,checks:receipt.checks.length,subscription_calls:receipt.subscription_calls.length,sandbox_mode:receipt.sandbox_mode,network:receipt.network,duration_ms:receipt.duration_ms};
}
function receiptText(r,locale='en') {
 const ru=locale==='ru',cost=r.metered_api_cost_usd==null?(ru?'неизвестно':'unknown'):'$'+Number(r.metered_api_cost_usd).toFixed(6);
 return (ru?'Квитанция':'Receipt')+' · '+r.final_status+(r.verification_reason?' ('+r.verification_reason+')':'')+' · '+(ru?'проверки ':'checks ')+r.checks+' · '+(ru?'файлы ':'files ')+r.files_changed+' · API '+cost+' · '+(ru?'токены ':'tokens ')+(r.tokens?.input_tokens??'—')+'/'+(r.tokens?.output_tokens??'—')+' · '+r.sandbox_mode+' · '+(ru?'сеть ':'network ')+(r.network?'on':'off')+' · '+Math.round(r.duration_ms/1000)+'s';
}
module.exports={SCHEMA,createRunReceipt,projectChecks,priceOf,usageOf,compactReceipt,receiptText};
