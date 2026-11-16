const {test}=require('node:test'); const assert=require('node:assert/strict');
const fs=require('node:fs'); const h=require('../lib/learn-candidate');
const bytes=fs.readFileSync(__dirname+'/fixtures/learn-golden-vectors.json');
assert.equal(h.sha256(bytes),'1c795585bd88d55c50b1e0fe05e9f88b44a9b042aa622c07439e7209eff1eea8');
const g=JSON.parse(bytes);
for(const v of g.hash_vectors) test(v.id,()=>{
 const i=v.input; const actual=i.edits?h.candidateId(i):i.files?h.treeSha256(i.files):i.event?h.eventId(i.event):i.template?h.artifactSha256(h.instantiateProposal(i.template,i.fields)):i.artifact?h.artifactSha256(i.artifact):i.instance?h.threadIdFor(i.instance):i.manifest_sha256?h.exerciseInstance(i):h.requestKey(i);
 assert.equal(actual,v.expect);
});
test('S1 is fact and S3 is a suspicion kept in memory',()=>{
 const r=h.testIntegrity({snapshot:{files:[{path:'tests/test_edge.py',content:'assert x\nassert y'}]},artifact:{edits:[{path:'tests/test_edge.py',content:'@skip\n'}]}});
 assert.equal(r.integrity,'candidate_modified');assert.deepEqual(r.signals.map(x=>x.id),['S1','S3']);
 assert.equal(h.testIntegrity({snapshot:{files:[]},artifact:{edits:[{path:'planner.py',content:''}]}}).integrity,'trusted');
});
