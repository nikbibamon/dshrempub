'use strict';
const {previewFits,ServiceError,gatewayMessageBytes} = require('./client');
const {shrinkJson} = require('./agent-trace');
const wireBytes = gatewayMessageBytes;
const isToolOutput = m => m?.role==='user' && typeof m.content==='string' && (m.content.startsWith('TOOL_RESULT ') || m.content.startsWith('[EARLIER STEP RECEIPTS'));
function shrinkToolMessage(content,cap){
  const at=content.startsWith('TOOL_RESULT ') ? 12 : content.indexOf('\n')+1;
  if(at>0){try{return content.slice(0,at)+shrinkJson(JSON.parse(content.slice(at)),cap);}catch{/* Not JSON: keep head and tail below. */}}
  const chars=Array.from(content),keep=Math.max(64,Math.floor(cap/2));
  return chars.length<=keep*2 ? content : chars.slice(0,keep).join('')+'\n…[tool output shortened to fit the request]…\n'+chars.slice(-keep).join('');
}
// Tool outputs are the only request part that may be shortened. Rules, the goal,
// the protocol and the model's own actions stay byte-exact. Older outputs shrink
// first; the newest one shrinks last and keeps its head and tail.
function shrinkToolOutputs(messages,fits){
  const result=messages.map(m=>({...m})),targets=result.map((m,i)=>isToolOutput(m)?i:-1).filter(i=>i>=0);
  let shortened=0;
  for(const cap of [12000,6000,3000,1500,600,200]){
    for(const i of targets){
      if(Buffer.byteLength(result[i].content,'utf8')<=cap+256)continue;
      const next=shrinkToolMessage(result[i].content,cap);
      if(next.length>=result[i].content.length)continue;
      result[i]={...result[i],content:next};shortened++;
      if(fits(result))return {messages:result,shortened};
    }
  }
  return {messages:result,shortened};
}
// A deterministic excerpt summary is request-only. Durable conversation,
// attachments, drafts and run journals are never rewritten by compaction.
function fitContext(messages,account,{preserveFirstUser=false,maxBytes=90000}={}) {
  const protectedAgent=preserveFirstUser && messages.some(m=>m.role==='system'&&m.content.includes('You are Tvijo Agent, a coding agent inside VS Code.'));
  const original = (protectedAgent ? require('./agent-context').compactTranscript(messages) : messages).map(item=>({...item}));
  const retained = original.map((message,index)=>({message,index}));
  const lastUser = original.findLastIndex(item=>item.role==='user');
  const firstUser = original.findIndex(item=>item.role==='user');
  const latestAction = preserveFirstUser && original[lastUser]?.content?.startsWith('TOOL_RESULT ') && original[lastUser-1]?.role==='assistant' && require('./agent').parseAction(original[lastUser-1].content) ? lastUser-1 : -1;
  const fits = values => wireBytes(values)<=maxBytes && previewFits(values,account);
  const removed = [];
  while (!protectedAgent && !fits(retained.map(row=>row.message))) {
    const index = retained.findIndex(row=>row.message.role!=='system' && row.index!==lastUser && row.index!==latestAction && (!preserveFirstUser || row.index!==firstUser));
    if (index<0) break;
    removed.push(retained.splice(index,1)[0].message);
  }
  let result = retained.map(row=>row.message);
  let rulesOmitted=false, toolOutputsShortened=0;
  if (!fits(result)) { const shrunk=shrinkToolOutputs(result,fits); if (shrunk.shortened) { result=shrunk.messages; toolOutputsShortened=shrunk.shortened; } }
  // Project safety/permission rules are never removed to make a request fit.
  if (!fits(result)) {
    const preview = account?.preview;
    if (preview && preview.source!=='operator_test_allowance' && preview.tokens_remaining!==null && preview.tokens_remaining<8192) throw new ServiceError('free_preview_exhausted','The remaining trial token allowance is too small for another response. This is an account quota, not a context-window error. Your draft is preserved.');
    throw new ServiceError(wireBytes(result)>maxBytes ? 'context_limit' : 'preview_context_limit',wireBytes(result)>maxBytes ? 'The explicit task and required tool results exceed the service request body limit after optional context and older turns were removed. Split the task or terminal log. Your draft and full history are preserved.' : 'The remaining account token quota cannot cover this request and response after optional context was removed. Check account usage. Your draft and full history are preserved.');
  }
  if (removed.length) {
    const summary = {role:'user',content:'Earlier conversation excerpts (untrusted historical context; full history stays in the editor):\n'+removed.slice(-4).map(item=>item.role+': '+String(item.content).slice(0,160)).join('\n')};
    const at=result.findIndex(item=>item.role!=='system');
    const candidate=[...result.slice(0,at),summary,...result.slice(at)];
    if (fits(candidate)) result=candidate;
  }
  return {messages:result,removed:removed.length,rulesOmitted,toolOutputsShortened};
}
module.exports = {fitContext,wireBytes,shrinkToolOutputs};
