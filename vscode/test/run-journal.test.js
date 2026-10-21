'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const { createRunJournal, MAX_BYTES, MAX_EVENTS, TTL } = require('../lib/run-journal');

const scopeA = 'a'.repeat(64), scopeB = 'b'.repeat(64);
function fixture() { const root = fs.mkdtempSync(path.join(process.env.TVIJO_TEST_ARTIFACTS || os.tmpdir(), 'run-journal-')); return { root, journal: createRunJournal(root) }; }
function begin(j, scope = scopeA, id = 'run_1', prompt = 'full prompt') { return j.begin(scope, { id, kind: 'chat', prompt, historyScope: scopeB }); }

test('full prompt and run survive a new journal instance', () => {
  const { root, journal } = fixture(); begin(journal, scopeA, 'saved', 'a'.repeat(12000));
  const restored = createRunJournal(root).get(scopeA, 'saved');
  assert.equal(restored.prompt, 'a'.repeat(12000));
});

test('events survive an abrupt child process exit', () => {
  const { root } = fixture();
  const script = `const {createRunJournal}=require(${JSON.stringify(path.resolve(__dirname, '../lib/run-journal.js'))}); const j=createRunJournal(process.argv[1]);j.begin(${JSON.stringify(scopeA)},{id:'child',kind:'agent',prompt:'kill-safe goal',historyScope:${JSON.stringify(scopeB)}}); for(let i=0;i<7;i++)j.append(${JSON.stringify(scopeA)},'child',{type:'step',step:i}); process.kill(process.pid,'SIGKILL');`;
  const child = spawnSync(process.execPath, ['-e', script, root]);
  assert.equal(child.signal, 'SIGKILL');
  assert.deepEqual(createRunJournal(root).get(scopeA, 'child').events.map(e => e.step), [0, 1, 2, 3, 4, 5, 6]);
});

test('keeps last 60 events and bounds multibyte event serialization', () => {
  const { journal } = fixture(); begin(journal, scopeA, 'many');
  for (let i = 0; i < MAX_EVENTS + 4; i++) journal.append(scopeA, 'many', { type: 'step', step: i, text: '猫'.repeat(i === MAX_EVENTS + 3 ? 40000 : 1) });
  const run = journal.get(scopeA, 'many');
  assert.ok(run.events.length <= MAX_EVENTS);
  assert.equal(run.events.at(-1).truncated, true);
  assert.equal(run.eventsTruncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(run)) <= MAX_BYTES);
});

test('rejects an oversized full prompt before creating a record', () => {
  const { journal } = fixture();
  assert.throws(() => begin(journal, scopeA, 'huge', 'x'.repeat(MAX_BYTES)), /limit/);
  assert.equal(journal.get(scopeA, 'huge'), null);
});

test('corrupt and partial records are ignored with generic notes', () => {
  const { root, journal } = fixture(); begin(journal, scopeA, 'broken');
  const file = path.join(root, 'run-journal-v1', scopeA, 'broken.json'); fs.writeFileSync(file, '{"prompt":');
  const result = journal.list(scopeA);
  assert.deepEqual(result.runs, []); assert.equal(result.notes.length, 1); assert.ok(result.notes[0].length < 100);
});

test('run and draft TTL uses creation and update times', () => {
  const { root } = fixture(); let clock = 1000;
  const j = createRunJournal(root, { now: () => clock }); begin(j, scopeA, 'old'); j.saveDraft(scopeA, 'draft', 'chat');
  clock += TTL + 1;
  assert.equal(createRunJournal(root, { now: () => clock }).get(scopeA, 'old'), null);
  assert.equal(createRunJournal(root, { now: () => clock }).draft(scopeA), null);
});

test('scope listing and draft restoration stay isolated; empty draft persists', () => {
  const { journal } = fixture(); begin(journal, scopeA, 'a'); begin(journal, scopeB, 'b');
  journal.saveDraft(scopeA, 'restore me', 'agent');
  assert.deepEqual(journal.list(scopeB).runs.map(r => r.id), ['b']);
  assert.equal(journal.draft(scopeB), null); assert.equal(journal.draft(scopeA).text, 'restore me');
  journal.saveDraft(scopeA, '', 'chat'); assert.deepEqual(journal.draft(scopeA).text, '');
});

test('atomic rename failure leaves the previous record valid', () => {
  const { root } = fixture(); const j = createRunJournal(root); begin(j, scopeA, 'atomic', 'old');
  const failing = createRunJournal(root, { io: { renameSync() { throw new Error('rename failed'); } } });
  assert.throws(() => failing.append(scopeA, 'atomic', { type: 'step', text: 'new' }), /rename failed/);
  assert.equal(createRunJournal(root).get(scopeA, 'atomic').prompt, 'old');
});

test('refuses symlinked scope directories and run files', t => {
  if (process.platform === 'win32') return t.skip('symlink creation requires elevated Windows privileges');
  const { root, journal } = fixture(); begin(journal, scopeA, 'safe');
  const base = path.join(root, 'run-journal-v1'), original = path.join(base, scopeA), outside = path.join(root, 'outside');
  fs.mkdirSync(outside); fs.renameSync(original, path.join(base, 'saved')); fs.symlinkSync(outside, original);
  assert.throws(() => journal.list(scopeA), /Unsafe/);
  fs.unlinkSync(original); fs.renameSync(path.join(base, 'saved'), original);
  const file = path.join(original, 'linked.json'); fs.symlinkSync(path.join(original, 'safe.json'), file);
  assert.throws(() => journal.get(scopeA, 'linked'), /Unsafe/);
});


test('draft records do not appear as corrupt runs and partial temp files are noted',()=>{
  const {root,journal}=fixture();journal.saveDraft(scopeA,'saved','plan');
  assert.deepEqual(journal.list(scopeA),{runs:[],notes:[]});
  fs.writeFileSync(path.join(root,'run-journal-v1',scopeA,'.tmp-interrupted'),'{');
  assert.equal(journal.list(scopeA).notes.length,1);
});

test('missing or corrupt journals stop subsequent appends and task updates',()=>{
  const {root,journal}=fixture();
  assert.throws(()=>journal.append(scopeA,'missing',{type:'step'}),/unavailable/);
  begin(journal,scopeA,'corrupt');
  fs.writeFileSync(path.join(root,'run-journal-v1',scopeA,'corrupt.json'),'null');
  assert.equal(journal.list(scopeA).notes.length,1);
  assert.throws(()=>journal.task(scopeA,'corrupt','known-task'),/unavailable/);
});

test('event count keeps exactly the newest sixty and task/finish preserve caps and privacy modes',()=>{
  const {root,journal}=fixture();begin(journal,scopeA,'events');
  for(let step=1;step<=65;step++)journal.append(scopeA,'events',{type:'step',step});
  const run=journal.get(scopeA,'events');assert.equal(run.events.length,60);assert.equal(run.events[0].step,6);
  journal.task(scopeA,'events','known-task');journal.finish(scopeA,'events');
  assert.equal(journal.get(scopeA,'events').status,'completed');assert.deepEqual(journal.list(scopeA).runs,[]);
  const file=path.join(root,'run-journal-v1',scopeA,'events.json');
  assert.ok(fs.statSync(file).size<=MAX_BYTES);
  if(process.platform!=='win32')assert.equal(fs.statSync(file).mode&0o777,0o600);
  assert.throws(()=>begin(journal,scopeA,'events','overwrite'),/already exists/);
});


test('exact-limit appends can still receive a task id and complete within the byte cap',()=>{
  const {root}=fixture(),j=createRunJournal(root,{now:()=>1000});
  for(const id of ['task-boundary','finish-boundary']){
    begin(j,scopeA,id);
    const run=j.get(scopeA,id),event={type:'result',text:''};
    const size=Buffer.byteLength(JSON.stringify({...run,events:[event]}));
    event.text='x'.repeat(MAX_BYTES-size);j.append(scopeA,id,event);
    assert.equal(Buffer.byteLength(JSON.stringify(j.get(scopeA,id))),MAX_BYTES);
    if(id==='task-boundary')j.task(scopeA,id,'t'.repeat(256));
    j.finish(scopeA,id);
    const saved=j.get(scopeA,id);assert.equal(saved.status,'completed');
    assert.ok(Buffer.byteLength(JSON.stringify(saved))<=MAX_BYTES);assert.equal(saved.eventsTruncated,true);
  }
});

test('new scope parent entries are synced before publication, then the leaf is synced after rename',()=>{
  const {root}=fixture(),events=[];
  const j=createRunJournal(root,{io:{
    fsyncSync:fd=>{events.push(fs.fstatSync(fd).isDirectory()?'dir-fsync':'file-fsync');fs.fsyncSync(fd);},
    onDirectorySynced:dir=>events.push(dir),
    renameSync:(from,to)=>{events.push('rename');fs.renameSync(from,to);}
  }});
  begin(j,scopeA,'power-loss');
  const parent=path.join(root,'run-journal-v1'),scope=path.join(parent,scopeA),rename=events.indexOf('rename');
  assert.ok(events.indexOf(root)<rename);assert.ok(events.indexOf(parent)<rename);
  assert.ok(events.indexOf('file-fsync')<rename);assert.ok(events.lastIndexOf(scope)>rename);
});

test('a failed parent-directory sync refuses persistence and a retry establishes the directories',()=>{
  const {root}=fixture();let fail=true;
  const j=createRunJournal(root,{io:{fsyncSync:fd=>{
    if(fail&&fs.fstatSync(fd).isDirectory()){fail=false;const error=new Error('synthetic sync failure');error.code='EIO';throw error;}
    fs.fsyncSync(fd);
  }}});
  assert.throws(()=>begin(j,scopeA,'refused'),/sync failure/);assert.equal(j.get(scopeA,'refused'),null);
  begin(j,scopeA,'retry');assert.equal(j.get(scopeA,'retry').prompt,'full prompt');
});


test('expired valid run/draft files are pruned while corrupt draft data is preserved with a note',()=>{
  const {root}=fixture();let now=1000;const j=createRunJournal(root,{now:()=>now});
  begin(j,scopeA,'expired');j.saveDraft(scopeA,'old draft','chat');
  const directory=path.join(root,'run-journal-v1',scopeA);
  now+=TTL+1;assert.deepEqual(j.list(scopeA),{runs:[],notes:[]});
  assert.equal(fs.existsSync(path.join(directory,'expired.json')),false);
  assert.equal(fs.existsSync(path.join(directory,'draft.json')),false);
  fs.writeFileSync(path.join(directory,'draft.json'),'{"partial":');
  assert.equal(j.list(scopeA).notes.length,1);assert.equal(j.draft(scopeA),null);
  assert.equal(fs.existsSync(path.join(directory,'draft.json')),true);
});

test('a live foreign extension host owns its journal until it terminates',async()=>{
  const {root,journal}=fixture();
  const script=`const {createRunJournal}=require(${JSON.stringify(path.resolve(__dirname,'../lib/run-journal.js'))});const j=createRunJournal(process.argv[1]);j.begin(${JSON.stringify(scopeA)},{id:'foreign-live',kind:'agent',prompt:'active',historyScope:${JSON.stringify(scopeB)}});process.stdout.write('ready');setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['-e',script,root],{stdio:['ignore','pipe','pipe']});
  const closed=new Promise(resolve=>child.once('close',resolve));
  try{
    await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);});
    const run=journal.get(scopeA,'foreign-live');assert.equal(journal.liveElsewhere(run),true);
    assert.throws(()=>journal.finish(scopeA,'foreign-live'),/another extension host/);
    assert.throws(()=>journal.append(scopeA,'foreign-live',{type:'step'}),/another extension host/);
  }finally{child.kill('SIGTERM');await closed;}
  assert.equal(journal.liveElsewhere(journal.get(scopeA,'foreign-live')),false);
  journal.finish(scopeA,'foreign-live');assert.equal(journal.get(scopeA,'foreign-live').status,'completed');
});
