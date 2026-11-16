const test=require('node:test'),assert=require('node:assert/strict');
const {derive,controlPassed,SCALE}=require('../lib/learn-scorer');
const {validateEvent}=require('../lib/learn-schema');
const golden=require('./fixtures/learn-golden-vectors.json');
for(const v of golden.vectors)test(v.id,()=>{
 const r=derive(v.events,SCALE,{truth:v.truth,...v.derive_opts});
 for(const k of ['total','checkPoints','independentTotal','streak'])assert.equal(r[k],v.expect[k],k);
 const lab=c=>Object.entries(v.labels).find(([,id])=>id===c)?.[0]||c;
 assert.deepEqual(r.rows.map(x=>[lab(x.candidate_id),x.decision,x.source,x.terminal,x.outcome,x.points,x.flags,x.assistance]),v.expect.rows.map(x=>[x.candidate,x.decision,x.source,x.terminal,x.outcome,x.points,x.flags,x.assistance]));
 assert.deepEqual(r.ignored.map(x=>x.why),v.expect.ignored);
 for(const e of v.events){const errors=validateEvent(e);assert.ok(!errors.length||/schema_invalid|inconsistent_bound|inconsistent_result|kind_initiator_mismatch|unknown_field|invalid_value:(client|candidate_id)/.test(errors[0]));}
});
test('control requires independent justified terminal human decisions',()=>{
 assert.equal(controlPassed({rows:[]}),false);
 const rows=Array.from({length:3},()=>({terminal:true,source:'human',outcome:'justified',assistance:'independent',flags:[]}));
 assert.equal(controlPassed({rows}),true);rows[0].flags=['x'];assert.equal(controlPassed({rows}),false);
 assert.throws(()=>derive(null),TypeError);
});
