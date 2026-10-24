'use strict';
const {previewFits,ServiceError,gatewayMessageBytes} = require('./client');
const wireBytes = gatewayMessageBytes;
// A deterministic excerpt summary is request-only. Durable conversation,
// attachments, drafts and run journals are never rewritten by compaction.
function fitContext(messages,account,{preserveFirstUser=false,maxBytes=90000}={}) {
  const original = messages.map(item=>({...item}));
  const retained = original.map((message,index)=>({message,index}));
  const lastUser = original.findLastIndex(item=>item.role==='user');
  const firstUser = original.findIndex(item=>item.role==='user');
  const latestAction = preserveFirstUser && original[lastUser]?.content?.startsWith('TOOL_RESULT ') && original[lastUser-1]?.role==='assistant' && require('./agent').parseAction(original[lastUser-1].content) ? lastUser-1 : -1;
  const fits = values => wireBytes(values)<=maxBytes && previewFits(values,account);
  const removed = [];
  while (!fits(retained.map(row=>row.message))) {
    const index = retained.findIndex(row=>row.message.role!=='system' && row.index!==lastUser && row.index!==latestAction && (!preserveFirstUser || row.index!==firstUser));
    if (index<0) break;
    removed.push(retained.splice(index,1)[0].message);
  }
  let result = retained.map(row=>row.message);
  let rulesOmitted=false;
  if(!fits(result))result=result.map(message=>{if(message.role!=='system')return message;const content=message.content.replace(/\n?\[TVIJO OPTIONAL RULES\][\s\S]*?\[END TVIJO OPTIONAL RULES\]\n?/g,'');if(content!==message.content)rulesOmitted=true;return {...message,content};});
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
  return {messages:result,removed:removed.length,rulesOmitted};
}
module.exports = {fitContext,wireBytes};
