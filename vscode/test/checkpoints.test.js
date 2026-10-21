'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCheckpoints, TTL, MAX_BYTES, hash } = require('../lib/checkpoints');
const { createTools } = require('../lib/local-tools');
const quickEdit = require('../lib/quick-edit');
function fixture(options = {}) {
  const base = fs.mkdtempSync(path.join(process.env.TVIJO_TEST_ARTIFACTS || require('node:os').tmpdir(), 'rewind-'));
  const root = path.join(base, 'workspace'), storage = path.join(base, 'state'); fs.mkdirSync(root);
  const store = createCheckpoints(storage, options), file = path.join(root,'file.txt');
  return { root, storage, file, store, capture: (step,content,extra = {}) => store.capture({root,runId:'run',step,model:'synthetic',title:'Test run',files:[{absolute:file,content,...extra}]}) };
}
const restore = (f,options = {}) => f.store.restore({root:f.root,runId:'run',step:1,confirm:async()=>true,...options});

test('checkpoint disk recovery is SHA256 exact for BOM, CRLF, Unicode and binary bytes', async () => {
  const f = fixture(), bytes = Buffer.from([0xef,0xbb,0xbf,65,13,10,0,255,0xc3,0xa9]);
  fs.writeFileSync(f.file,bytes); f.capture(1,'after'); fs.writeFileSync(f.file,'after');
  const result = await restore(f,{confirm:async()=>assert.fail('Unchanged agent result needs no prompt')});
  assert.equal(result.restored,1); assert.equal(hash(fs.readFileSync(f.file)),hash(bytes));
  const file = fs.readdirSync(path.join(f.storage,'rewind-v1'))[0];
  assert.equal(fs.statSync(path.join(f.storage,'rewind-v1',file)).mode & 0o777,0o600);
  assert.equal(MAX_BYTES,50 * 1024 * 1024); assert.equal(TTL,7 * 86400000);
});
test('selecting a step undoes it and later steps across files, not earlier steps', async () => {
  const f=fixture(), second=path.join(f.root,'second.txt');
  fs.writeFileSync(f.file,'zero'); f.capture(1,'one');fs.writeFileSync(f.file,'one');
  f.capture(2,'two');fs.writeFileSync(f.file,'two');
  f.store.capture({root:f.root,runId:'run',step:3,files:[{absolute:second,content:'new'}]});fs.writeFileSync(second,'new');
  const result=await restore(f,{step:2});assert.equal(result.restored,2);
  assert.equal(fs.readFileSync(f.file,'utf8'),'one');assert.equal(fs.existsSync(second),false);
  assert.deepEqual(f.store.list(f.root)[0].steps.map(step=>step.step),[1,2,3]);
});
test('both direct tool write paths save before bytes before their mutation', async () => {
  const f=fixture();fs.writeFileSync(f.file,'old');let step=1;
  const tools=createTools({root:f.root,confirmWrite:async()=>true,beforeWrite:info=>f.capture(step++,info.content)});
  assert.equal((await tools.execute({tool:'write_file',path:'file.txt',content:'new'})).ok,true);
  assert.equal((await tools.execute({tool:'replace_in_file',path:'file.txt',old:'new',new:'next'})).ok,true);
  await restore(f,{step:2});assert.equal(fs.readFileSync(f.file,'utf8'),'new');
  await restore(f);assert.equal(fs.readFileSync(f.file,'utf8'),'old');
});
test('refused and plan tool writes create no checkpoint',async()=>{
  const f=fixture();const tools=createTools({root:f.root,confirmWrite:async()=>false,beforeWrite:()=>assert.fail('No rejected capture')});
  await tools.execute({tool:'write_file',path:'file.txt',content:'new'});
  await tools.execute({tool:'write_file',path:'file.txt',content:'new'},{planMode:true});
  assert.deepEqual(f.store.list(f.root),[]);assert.equal(fs.existsSync(f.file),false);
});
test('Quick Edit checkpoints are persisted before buffer Apply; disk and dirty buffer recover separately',async()=>{
  const f=fixture();fs.writeFileSync(f.file,'disk\r\n');let text='unsaved\r\n';
  const doc={uri:{fsPath:f.file},version:1,getText:()=>text,positionAt:n=>n};
  const vscode={Position:class{},Range:class{},WorkspaceEdit:class{replace(){}},workspace:{applyEdit:async()=>{
    assert.equal(f.store.list(f.root).length,1);text='agent';return true;
  }}};
  await quickEdit.apply(vscode,doc,'agent',()=>f.capture(1,'agent',{document:doc}));
  await restore(f,{inspect:async()=>doc,applyBuffer:async(_target,before)=>{text=before;},confirm:async()=>assert.fail('No conflict')});
  assert.equal(text,'unsaved\r\n');assert.equal(fs.readFileSync(f.file,'utf8'),'disk\r\n');
});
test('checkpoint failure blocks buffer Apply and direct tool writes',async()=>{
  const f=fixture();fs.writeFileSync(f.file,'old');
  const fail=()=>{throw new Error('Storage full');};
  const doc={uri:{fsPath:f.file},version:1,getText:()=> 'old',positionAt:n=>n};
  await assert.rejects(quickEdit.apply({Position:class{},Range:class{},WorkspaceEdit:class{replace(){}},workspace:{applyEdit:()=>assert.fail('No write')}},doc,'new',fail),/Storage full/);
  const tools=createTools({root:f.root,confirmWrite:async()=>true,beforeWrite:fail});
  await assert.rejects(tools.execute({tool:'write_file',path:'file.txt',content:'new'}),/Storage full/);
  assert.equal(fs.readFileSync(f.file,'utf8'),'old');
});
test('outside, file symlink, parent symlink, root symlink and hard links refuse capture',async()=>{
  const f=fixture();fs.writeFileSync(f.file,'old');
  fs.symlinkSync(f.file,path.join(f.root,'link'));fs.symlinkSync(f.root,path.join(f.root,'parent'));fs.linkSync(f.file,path.join(f.root,'hard'));
  for(const target of ['../outside','link','parent/file.txt','hard']) assert.throws(()=>f.store.capture({root:f.root,runId:'r',step:1,files:[{absolute:path.resolve(f.root,target),content:'new'}]}));
  fs.mkdirSync(f.storage);fs.symlinkSync(f.root,path.join(f.storage,'root-link'));
  assert.throws(()=>f.store.capture({root:path.join(f.storage,'root-link'),runId:'r',step:1,files:[{absolute:'file.txt',content:'new'}]}));
});
test('restore refuses a replaced symlink and an outside path in local metadata',async()=>{
  const f=fixture();fs.writeFileSync(f.file,'old');f.capture(1,'agent');
  fs.renameSync(f.file,path.join(f.root,'preserved'));fs.symlinkSync(path.join(f.root,'preserved'),f.file);
  await assert.rejects(restore(f),/Symlinks|symlink/);assert.equal(fs.readFileSync(path.join(f.root,'preserved'),'utf8'),'old');
  const folder=path.join(f.storage,'rewind-v1'),name=fs.readdirSync(folder)[0],record=JSON.parse(fs.readFileSync(path.join(folder,name)));
  record.files[0].path='../outside';fs.writeFileSync(path.join(folder,name),JSON.stringify(record));
  await assert.rejects(restore(f),/escapes/);
});
test('storage symlinks refuse without reading or pruning through them',()=>{
  const f=fixture();fs.mkdirSync(f.storage);fs.symlinkSync(f.root,path.join(f.storage,'rewind-v1'));
  assert.throws(()=>f.store.list(f.root),/symlinks/);
});
test('TTL expires at seven days and capacity prunes oldest records first',()=>{
  let clock=100;const f=fixture({now:()=>clock,maxBytes:2000});fs.writeFileSync(f.file,'old');
  f.capture(1,'one');clock++;f.capture(2,'two');clock++;f.capture(3,'three');
  const steps=f.store.list(f.root)[0].steps.map(item=>item.step);assert.ok(steps.includes(3));
  const size=()=>fs.readdirSync(path.join(f.storage,'rewind-v1')).reduce((sum,name)=>sum+fs.statSync(path.join(f.storage,'rewind-v1',name)).size,0);
  assert.ok(size()<=2000);
  clock+=TTL;assert.deepEqual(f.store.list(f.root),[]);assert.equal(size(),0);
  const g=fixture({maxBytes:800});fs.writeFileSync(g.file,'x'.repeat(600));assert.throws(()=>g.capture(1,'x'),/storage limit/);assert.deepEqual(g.store.list(g.root),[]);
});
test('size pruning removes oldest even when under TTL, while oversized capture preserves existing records',()=>{
  let clock=10;const f=fixture({now:()=>clock,maxBytes:850});fs.writeFileSync(f.file,'a'.repeat(100));
  f.capture(1,'one');clock++;f.capture(2,'two');clock++;f.capture(3,'three');
  assert.deepEqual(f.store.list(f.root)[0].steps.map(item=>item.step),[3]);
  fs.writeFileSync(f.file,'a'.repeat(2000));assert.throws(()=>f.capture(4,'four'),/storage limit/);
  assert.deepEqual(f.store.list(f.root)[0].steps.map(item=>item.step),[3]);
});
test('user disk edits prompt with skip per file; affirmative restores exact previous bytes',async()=>{
  const f=fixture();fs.writeFileSync(f.file,'old');f.capture(1,'agent');fs.writeFileSync(f.file,'user');let prompts=0;
  const confirm=async info=>{prompts++;assert.equal(info.conflict,true);assert.equal(info.deletion,false);return false;};
  assert.deepEqual(await restore(f,{confirm}),{restored:0,skipped:1});assert.equal(fs.readFileSync(f.file,'utf8'),'user');assert.equal(prompts,1);
  await restore(f);assert.equal(fs.readFileSync(f.file,'utf8'),'old');
});
test('user dirty buffer prompts even when disk still matches; skip preserves it',async()=>{
  const f=fixture();fs.writeFileSync(f.file,'old');f.capture(1,'agent');let asked=false;
  const result=await restore(f,{inspect:async()=>({getText:()=> 'user buffer'}),confirm:async info=>{asked=info.conflict;return false;},applyBuffer:()=>assert.fail('No mutation')});
  assert.equal(asked,true);assert.equal(result.skipped,1);assert.equal(fs.readFileSync(f.file,'utf8'),'old');
});
test('new files always require deletion confirmation and skip keeps file',async()=>{
  const f=fixture();f.capture(1,'agent');fs.writeFileSync(f.file,'agent');let asked=false;
  await restore(f,{confirm:async info=>{asked=info.deletion;assert.equal(info.conflict,false);return false;}});assert.equal(asked,true);assert.equal(fs.existsSync(f.file),true);
  await restore(f);assert.equal(fs.existsSync(f.file),false);
});
test('changes during conflict prompt or editor Apply refuse to overwrite new user bytes',async()=>{
  const f=fixture();fs.writeFileSync(f.file,'old');f.capture(1,'agent');fs.writeFileSync(f.file,'user');
  await assert.rejects(restore(f,{confirm:async()=>{fs.writeFileSync(f.file,'newer user');return true;}}),/changed during/);
  assert.equal(fs.readFileSync(f.file,'utf8'),'newer user');
});
test('snapshot checksum corruption blocks restore before any workspace mutation',async()=>{
  const f=fixture();fs.writeFileSync(f.file,'old');f.capture(1,'agent');fs.writeFileSync(f.file,'agent');
  const dir=path.join(f.storage,'rewind-v1'),name=fs.readdirSync(dir)[0],record=JSON.parse(fs.readFileSync(path.join(dir,name)));record.files[0].before=Buffer.from('corrupt').toString('base64');fs.writeFileSync(path.join(dir,name),JSON.stringify(record));
  await assert.rejects(restore(f),/checksum/);assert.equal(fs.readFileSync(f.file,'utf8'),'agent');
});
test('listing is workspace-scoped metadata only and survives creating a new store',()=>{
  const f=fixture();fs.writeFileSync(f.file,'LOCAL_SNAPSHOT_SENTINEL');f.capture(1,'agent');
  const fresh=createCheckpoints(f.storage),listed=fresh.list(f.root);
  assert.equal(listed[0].steps[0].model,'synthetic');assert.doesNotMatch(JSON.stringify(listed),/LOCAL_SNAPSHOT|beforeHash|afterHash|before|buffer/);
  assert.deepEqual(fresh.list(path.dirname(f.root)),[]);
});

test('storage inside workspace is refused so automatic context can never scan checkpoint bytes',()=>{
  const f=fixture();fs.writeFileSync(f.file,'old');const store=createCheckpoints(path.join(f.root,'local-state'));
  assert.throws(()=>store.capture({root:f.root,runId:'r',step:1,files:[{absolute:f.file,content:'new'}]}),/outside the workspace/);
});
test('same-clock checkpoints prune in capture order',()=>{
  const f=fixture({now:()=>100,maxBytes:850});fs.writeFileSync(f.file,'a'.repeat(100));
  f.capture(1,'one');f.capture(2,'two');f.capture(3,'three');
  assert.deepEqual(f.store.list(f.root)[0].steps.map(item=>item.step),[3]);
});

test('an editor opened or edited during a prompt blocks restore before mutation',async()=>{
  const f=fixture();fs.writeFileSync(f.file,'old');f.capture(1,'agent');fs.writeFileSync(f.file,'user');
  let document=null;const userDoc={version:1,getText:()=> 'new unsaved user bytes'};
  await assert.rejects(restore(f,{inspect:async()=>document,confirm:async()=>{document=userDoc;return true;},applyBuffer:()=>assert.fail('No overwrite')}),/changed during/);
  assert.equal(fs.readFileSync(f.file,'utf8'),'user');
});
test('partial failure reports the exact number already restored',async()=>{
  const f=fixture(),other=path.join(f.root,'other.txt');fs.writeFileSync(f.file,'old');fs.writeFileSync(other,'other old');
  f.store.capture({root:f.root,runId:'run',step:1,files:[{absolute:f.file,content:'agent'},{absolute:other,content:'other agent'}]});
  fs.writeFileSync(f.file,'agent');fs.writeFileSync(other,'other agent');let inspections=0;
  await assert.rejects(restore(f,{inspect:async()=>{if(++inspections===3)throw Error('Editor failed');return null;}}),error=>error.restored===1);
  assert.equal(fs.readFileSync(f.file,'utf8'),'old');assert.equal(fs.readFileSync(other,'utf8'),'other agent');
});
test('three-file recovery matches every original SHA256',async()=>{
  const f=fixture(),files=['one.txt','two.txt','three.txt'].map((name,index)=>({absolute:path.join(f.root,name),before:Buffer.from(['first\r\n','\ufeffsecond\n','третий\r\n'][index]),content:'agent-'+index}));
  for(const file of files)fs.writeFileSync(file.absolute,file.before);
  f.store.capture({root:f.root,runId:'run',step:1,files});for(const file of files)fs.writeFileSync(file.absolute,file.content);
  assert.equal((await restore(f)).restored,3);for(const file of files)assert.equal(hash(fs.readFileSync(file.absolute)),hash(file.before));
});
