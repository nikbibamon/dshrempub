'use strict';
const {previewFits,ServiceError} = require('./client');
const wireBytes = messages => Buffer.byteLength(JSON.stringify(messages).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')));
// A deterministic excerpt summary is request-only. Durable conversation,
// attachments, drafts and run journals are never rewritten by compaction.
function fitContext(messages,account,{preserveFirstUser=false,maxBytes=90000}={}) {
  const original = messages.map(item=>({...item}));
  const retained = original.map((message,index)=>({message,index}));
  const lastUser = original.findLastIndex(item=>item.role==='user');
  const firstUser = original.findIndex(item=>item.role==='user');
  const fits = values => wireBytes(values)<=maxBytes && previewFits(values,account);
  const removed = [];
  while (!fits(retained.map(row=>row.message))) {
    const index = retained.findIndex(row=>row.message.role!=='system' && row.index!==lastUser && (!preserveFirstUser || row.index!==firstUser));
    if (index<0) break;
    removed.push(retained.splice(index,1)[0].message);
  }
  let result = retained.map(row=>row.message);
  if (!fits(result)) {
    const preview = account?.preview;
    if (preview && preview.source!=='operator_test_allowance' && preview.tokens_remaining!==null && preview.tokens_remaining<8192) throw new ServiceError('free_preview_exhausted','The remaining trial token allowance is too small for another response. This is an account quota, not a context-window error. Your draft is preserved.');
    throw new ServiceError(wireBytes(result)>maxBytes ? 'context_limit' : 'preview_context_limit','The current prompt or attachments exceed the request allowance after older context was compacted. Reduce the attachment size. Your draft and full history are preserved.');
  }
  if (removed.length) {
    const summary = {role:'user',content:'Earlier conversation excerpts (untrusted historical context; full history stays in the editor):\n'+removed.slice(-4).map(item=>item.role+': '+String(item.content).slice(0,160)).join('\n')};
    const at=result.findIndex(item=>item.role!=='system');
    const candidate=[...result.slice(0,at),summary,...result.slice(at)];
    if (fits(candidate)) result=candidate;
  }
  return {messages:result,removed:removed.length};
}
module.exports = {fitContext,wireBytes};
