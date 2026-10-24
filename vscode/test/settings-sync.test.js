'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSettingsSync,createSettingsWriteQueue}=require('../lib/settings-controls');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
test('delayed runtime probes read config last and discard out-of-order completion',async()=>{
 const probes=[],posts=[];let value=false;
 const sync=createSettingsSync({readValues:()=>({'tvijo.orchestration.enabled':value}),readRuntime:()=>{const d=deferred();probes.push(d);return d.promise;},post:m=>posts.push(m)});
 const old=sync.snapshot();value=true;const latest=sync.snapshot();
 probes[1].resolve({tag:'latest'});await latest;
 assert.equal(posts[0].values['tvijo.orchestration.enabled'],true);assert.equal(posts[0].runtime.tag,'latest');
 value=false;probes[0].resolve({tag:'stale'});await old;assert.equal(posts.length,1);
 const last=sync.snapshot();value=true;probes[2].resolve({});await last;
 assert.equal(posts.at(-1).values['tvijo.orchestration.enabled'],true);assert.ok(posts[1].revision>posts[0].revision);
});
test('writes serialize, later requests win, failures return real values and do not poison queue',async()=>{
 const gate=deferred(),calls=[],posts=[];let value=60;
 const sync=createSettingsSync({readValues:()=>({steps:value}),readRuntime:async()=>({}),post:m=>posts.push(m)});
 const first=sync.save('steps',1,async()=>{calls.push('one');await gate.promise;value=90;});
 await Promise.resolve();const second=sync.save('steps',2,async()=>{calls.push('two');value=100;});
 assert.deepEqual(calls,['one']);gate.resolve();await Promise.all([first,second]);
 assert.deepEqual(calls,['one','two']);assert.equal(value,100);assert.equal(posts.at(-1).requestId,2);assert.equal(posts.at(-1).value,100);
 await sync.save('steps',1,()=>{throw Error('stale write');});assert.equal(posts.length,2);
 await sync.save('steps',3,()=>{throw Error('disk read only');});assert.equal(posts.at(-1).error,'disk read only');assert.equal(posts.at(-1).value,100);
 await sync.save('steps',4,()=>{value=110;});assert.equal(value,110);
 for(const id of [NaN,0,-1,1.5,Infinity])await sync.save('steps',id,()=>assert.fail('invalid ID'));
});
test('save invalidates old probes and disposal prevents late posts and queued mutations',async()=>{
 const probe=deferred(),posts=[];let value=1;
 const sync=createSettingsSync({readValues:()=>({value}),readRuntime:()=>probe.promise,post:m=>posts.push(m)});
 const snapshot=sync.snapshot();await sync.save('value',1,()=>{value=2;});probe.resolve({old:true});await snapshot;
 assert.equal(posts.length,1);assert.equal(posts[0].type,'settingsSaved');
 const blocker=deferred(),serialize=createSettingsWriteQueue();const blocked=serialize(()=>blocker.promise);
 const other=createSettingsSync({serialize,readValues:()=>({value}),readRuntime:async()=>({}),post:m=>posts.push(m)});
 const queued=other.save('value',1,()=>{value=3;});other.dispose();blocker.resolve();await Promise.all([blocked,queued]);await other.snapshot();assert.equal(value,2);assert.equal(posts.length,1);
});
