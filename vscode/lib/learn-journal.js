'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{constants}=require('node:fs');
const {eventId,canonicalJson}=require('./learn-candidate');
const {validateEvent}=require('./learn-schema');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const content=e=>{const {event_id,seq,ts,client,...rest}=e;return canonicalJson(rest);};
async function open({root,scope,ctx,client={name:'tvijo-vsix',version:'0.10.28'}}){
 if(!scope||!/^[a-f0-9]{64}$/.test(scope))fail('scope_missing');
 if(!ctx||!['tasks','exercises','criteria'].every(k=>ctx[k] instanceof Set))fail('ctx_required');
 if(!root||!path.isAbsolute(root))fail('storage_missing');
 const dir=path.join(root,'learn',scope),file=path.join(dir,'journal.jsonl');
 await fs.mkdir(dir,{recursive:true,mode:0o700});
 if((await fs.lstat(dir)).isSymbolicLink())fail('journal_link');
 const init=await fs.open(file,constants.O_CREAT|constants.O_APPEND|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);await init.chmod(0o600);await init.close();
 let tail=Promise.resolve();
 async function read(){
  let text;try{text=await fs.readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return [];throw e;}
  const lines=text.split('\n');if(lines.at(-1)==='')lines.pop();
  return lines.map(line=>{try{return JSON.parse(line);}catch{return null;}});
 }
 async function appendOne(input){
  input={schema:'tvijo.learn.event/1',...input};
  const rows=await read(),id=eventId(input),given=input.event_id;
  const same=rows.find(e=>e&&e.type!=='observation_gap'&&e.event_id===(given||id));
  if(same){if(content(same)!==content(input))fail('event_conflict');return same;}
  if(given&&given!==id)fail('event_id_mismatch');
  const last=rows.reduce((n,e)=>Number.isSafeInteger(e?.seq)?Math.max(n,e.seq):n,0);
  const e={...input,schema:input.schema||'tvijo.learn.event/1',event_id:id,seq:last+1,ts:input.ts||new Date().toISOString(),client:input.client||client};
  // schema is part of the content hash: callers may omit only service metadata.
  e.event_id=eventId(e);
  const errors=validateEvent(e,ctx);if(errors.length)fail(errors[0]);
  const handle=await fs.open(file,constants.O_APPEND|constants.O_WRONLY|constants.O_NOFOLLOW);
  try{if((await handle.stat()).nlink!==1)fail('journal_link');await handle.writeFile(JSON.stringify(e)+'\n');await handle.sync();}finally{await handle.close();}
  return e;
 }
 return {append(input){const next=tail.then(()=>appendOne(input));tail=next.catch(()=>{});return next;},read,
  async exportAll(){await tail;return read();},async purge(){await tail;await fs.unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});},
  async stats(){const r=await read();let last=null,gaps=0;for(const e of r)if(Number.isSafeInteger(e?.seq)){if(last!==null&&e.seq!==last+1)gaps++;last=e.seq;}return {lines:r.length,unreadable:r.filter(x=>x===null).length,seq_gaps:gaps};}
 };
}
module.exports={open};
