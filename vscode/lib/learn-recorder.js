'use strict';
function createRecorder({journal,diagnostics=()=>{},timeoutMs=2000,timers={setTimeout,clearTimeout}}){
 let degraded=!journal,tail=Promise.resolve();
 const diagnostic=()=>{try{diagnostics('learn_internal_error');}catch{}};
 async function bounded(event){let timer;try{return await Promise.race([Promise.resolve().then(()=>journal.append(event)),new Promise((_,reject)=>{timer=timers.setTimeout(()=>reject(Object.assign(new Error('append_timeout'),{code:'append_timeout'})),timeoutMs);})]);}finally{timers.clearTimeout(timer);}}
 return {ready:()=>!degraded,submit(event){if(degraded)return;tail=tail.then(async()=>{if(degraded)return;try{await bounded(event);}catch(e){degraded=true;diagnostic();try{await bounded({schema:'tvijo.learn.event/1',type:'observation_gap',candidate_id:null,reason:e.code==='append_timeout'?'append_timeout':'append_failed'});}catch{diagnostic();}}}).catch(()=>{degraded=true;diagnostic();});},flush:()=>tail};
}
module.exports={createRecorder};
