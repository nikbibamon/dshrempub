'use strict';
const {taskStateOf}=require('./client');
const {measuredCost}=require('./task-receipt');
function assessment(snapshot){
 const state=taskStateOf(snapshot),reason=snapshot?.reason;
 const cost=measuredCost({cost:snapshot?.budget || snapshot});
 const uncertain=snapshot?.uncertain===true||snapshot?.charge_pending===true||(snapshot?.usage?.completeness!==undefined&&snapshot.usage.completeness!=='complete')||!state.costKnown;
 const r=snapshot?.receipt;
 const financialReceipt=r&&['reserved_micro_tvijo','debited_micro_tvijo','held_micro_tvijo','released_micro_tvijo'].every(k=>Number.isSafeInteger(r[k])&&r[k]>=0)
   &&r.held_micro_tvijo===0&&Number.isSafeInteger(r.debited_micro_tvijo+r.released_micro_tvijo)
   &&r.reserved_micro_tvijo===r.debited_micro_tvijo+r.released_micro_tvijo&&snapshot?.usage?.completeness==='complete';
 const stamp=snapshot?.settled_at ?? snapshot?.settled;
 const explicit=stamp===true||(typeof stamp==='number'&&Number.isFinite(stamp)&&stamp>0)||(typeof stamp==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(stamp)&&Number.isFinite(Date.parse(stamp)));
 const settled=!!(state.status==='failed'&&state.terminal&&state.held===0&&!uncertain&&cost!==null&&(explicit||financialReceipt));
 const confirmedReason=reason==='model_output_unavailable'||reason==='provider_rejected'||/^provider_http_(?:400|401|402|403|404|422|429|5\d\d|5xx)$/.test(reason||'');
 return {settled,cost:settled?cost:null,eligible:settled&&confirmedReason,reason:reason||'unknown',settlement_evidence:explicit?'explicit_final_settlement':financialReceipt?'conserved_service_receipt_and_complete_usage':'missing'};
}
async function askWithRetry({invoke,lookup,beforeRetry=async()=>{},onAttempt=()=>{},step,signal}){
 let retryOf=null,knownFailedCost=0;
 for(let attempt=0;attempt<2;attempt++){
  if(signal?.aborted)throw Object.assign(Error('Agent stopped'),{code:'agent_stopped'});
  try{
   const answer=await invoke({attempt,retry_of:retryOf});
   const cost=measuredCost(answer);
   // Let the ordinary host unknown-cost guard retain its billing recovery
   // marker. An answer without a cost receipt is never retried here.
   return {...answer,...(cost===null?{}:{stepSpentUsd:knownFailedCost+cost}),stepAttempt:{step,attempt:attempt+1,taskId:answer.taskId,retry_of:retryOf,status:cost===null?'unknown':'completed',spent_usd:cost}};
  }catch(error){
   let snapshot=null;
   if(error?.taskId)try{snapshot=await lookup(error.taskId);}catch{/* Missing authoritative evidence refuses retry. */}
   if(snapshot?.id!==error?.taskId)snapshot=null;
   const checked=assessment(snapshot);
   const hit=snapshot?.usage?.prompt_cache_hit_tokens,miss=snapshot?.usage?.prompt_cache_miss_tokens;
   await onAttempt({step,attempt:attempt+1,taskId:error?.taskId||null,retry_of:retryOf,status:'failed',spent_usd:checked.cost,settled:checked.settled,reason:checked.reason,settlement_evidence:checked.settlement_evidence,prompt_cache_hit_tokens:Number.isSafeInteger(hit)&&hit>=0?hit:'unknown',prompt_cache_miss_tokens:Number.isSafeInteger(miss)&&miss>=0?miss:'unknown'});
   if(!checked.eligible||attempt===1||signal?.aborted){
    error.retryAllowed=checked.eligible&&!signal?.aborted;
    error.retryDisposition=checked.settled?(checked.eligible&&attempt===1?'confirmed_failure':'retry_unavailable'):'reconciliation_required';
    throw error;
   }
   knownFailedCost+=checked.cost;
   await beforeRetry({failedTaskId:error.taskId,spent_usd:checked.cost});
   retryOf=error.taskId;
  }
 }
}
function retryNotice(error,locale='en'){
 const ru=locale==='ru';
 if(error?.retryDisposition==='retry_unavailable')return ru?'Шаг не завершён. Стоимость подтверждена, но квитанция не разрешает повтор. Правки и журнал сохранены.':'The step failed. Its cost is confirmed, but the receipt does not permit retry. Saved edits and the journal are preserved.';
 return error?.retryDisposition==='reconciliation_required'
  ? (ru?'Стоимость шага ещё не подтверждена. Ожидается сверка; повтор недоступен. Сделанные правки сохранены.':'The step cost is not confirmed. Reconciliation is pending; retry is unavailable. Saved edits are preserved.')
  : (ru?'Шаг не завершён после одного повтора. Обе задачи и их стоимость сохранены. Можно повторить шаг в пределах оставшегося бюджета.':'The step failed after one retry. Both tasks and their costs are recorded. You can retry the step within the remaining budget.');
}
module.exports={assessment,askWithRetry,retryNotice};
