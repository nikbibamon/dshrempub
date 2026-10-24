'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createActiveWorkspace}=require('../lib/active-workspace');
const {createFullAccess}=require('../lib/full-access');
const {createTools,safePath}=require('../lib/local-tools');
const {fitContext,wireBytes}=require('../lib/context-budget');
const core=require('../lib/client');
class Uri {
 constructor(p,scheme='file',authority=''){this.fsPath=p;this.path=p;this.scheme=scheme;this.authority=authority;}
 static file(p){return new Uri(p)} static from(v){return new Uri(v.path,v.scheme,v.authority)}
 static parse(s){const u=new URL(s);return new Uri(u.pathname,u.protocol.slice(0,-1),u.host)}
 static joinPath(u,...parts){return new Uri(path.join(u.fsPath,...parts),u.scheme,u.authority)}
 with(v){return new Uri(v.path||this.path,this.scheme,this.authority)}
 toString(){return this.scheme+'://'+this.authority+this.path}
}
function fixture(){
 const base=fs.mkdtempSync(path.join(process.env.TVIJO_TEST_ARTIFACTS||require('node:os').tmpdir(),'folder-model-'));
 const parent=path.join(base,'parent'),volume=path.join(base,'volume'),parser=path.join(volume,'parser');
 for(const p of [parent,parser,path.join(parent,'docs','subproject'),path.join(parser,'project'),path.join(parser,'venv')])fs.mkdirSync(p,{recursive:true});
 fs.symlinkSync(parser,path.join(parent,'parser'));fs.writeFileSync(path.join(parser,'project','recent.txt'),'edited recently\n');fs.writeFileSync(path.join(parent,'docs','private.txt'),'DOCS_ONLY');
 const folders=[['parent',parent],['docs',path.join(parent,'docs')],['subproject',path.join(parent,'docs','subproject')],['parser',path.join(parent,'parser')]].map(([name,p])=>({name,uri:Uri.file(p)}));
 const values=new Map(),state={get:k=>values.get(k),update:async(k,v)=>values.set(k,v)};
 let pick='docs',browse=null;const warnings=[];
 const vscode={Uri,FileType:{File:1,Directory:2,SymbolicLink:64},workspace:{isTrusted:true,workspaceFolders:folders,fs:{readDirectory:async u=>fs.readdirSync(u.fsPath,{withFileTypes:true}).map(x=>[x.name,x.isSymbolicLink()?64:x.isDirectory()?2:1]),readFile:async u=>fs.readFileSync(u.fsPath),stat:async u=>{const s=fs.lstatSync(u.fsPath);return {type:s.isDirectory()?2:1,size:s.size}}}},window:{showQuickPick:async rows=>rows.find(r=>pick==='browse'?r.browse:r.folder?.name===pick),showOpenDialog:async()=>[browse],showWarningMessage:async(m,o,l)=>{warnings.push({m,o});return l}}};
 const active=createActiveWorkspace({vscode,state}),access=createFullAccess({vscode,state,scope:f=>crypto.createHash('sha256').update(f.uri.fsPath).digest('hex')});
 return {base,parent,parser,vscode,state,active,access,warnings,choose:async name=>{pick=name;return active.choose()},browse:async uri=>{pick='browse';browse=uri;return active.choose()}};
}
test('folder-model: real symlink parser, overlap parent consent, browsed non-workspace subfolder and reconnect',async()=>{
 const x=fixture();await x.choose('docs');assert.equal(await x.access.enable(x.active.current()),true);
 const parser=await x.choose('parser');assert.equal(parser.uri.fsPath,x.parser);assert.equal(x.access.status(parser).enabled,false);assert.equal(await x.access.enable(parser),true);
 const project=await x.browse(Uri.file(path.join(x.parent,'parser','project')));assert.equal(project.uri.fsPath,path.join(x.parser,'project'));assert.equal(x.access.status(project).enabled,false);assert.equal(await x.access.enable(project),true);
 const again=createActiveWorkspace({vscode:x.vscode,state:x.state});assert.equal(again.current().uri.fsPath,project.uri.fsPath);
 const tools=createTools({root:project.uri.fsPath,guard:async()=>assert.ok(again.current()),confirmRun:async()=>false,confirmWrite:async()=>true});
 const read=await tools.execute({tool:'read_file',path:'recent.txt'},{});assert.match(JSON.stringify(read),/edited recently/);
 assert.throws(()=>safePath(project.uri.fsPath,'../../docs/private.txt'),/escapes/);
 fs.symlinkSync(path.join(x.parent,'docs'),path.join(project.uri.fsPath,'escape'));assert.throws(()=>safePath(project.uri.fsPath,'escape/private.txt'),/Symlinks|escapes/);
 await x.choose('parent');assert.equal(await x.access.enable(x.active.current()),true);assert.match(x.warnings.at(-1).o.detail,/descendants/);
 assert.equal(x.warnings.length,4);
});
test('folder-model: picker refuses outside and remote authority without rebinding current folder',async()=>{
 const x=fixture();await x.choose('docs');const before=x.active.current().uri.fsPath;
 await assert.rejects(x.browse(Uri.file(x.base)),/inside/);
 await assert.rejects(x.browse(new Uri(path.join(x.parent,'docs'),'vscode-remote','ssh-remote+elsewhere')),/inside|remote/);
 assert.equal(x.active.current().uri.fsPath,before);
});
test('folder-model: 60KB Cyrillic log fits UTF8 hard cap for admin; optional context is removed first',()=>{
 const account={preview:{source:'operator_test_allowance',tokens_remaining:null}};
 const explicit='Последние файлы какие правили?\n'+'терминал '.repeat(3500);
 const optional='AUTO_CONTEXT '.repeat(5000),messages=[{role:'user',content:optional+explicit}];
 assert.equal(core.previewFits(messages,account),false);
 assert.equal(core.previewFits([{role:'user',content:explicit}],account),true);
 const result=fitContext([{role:'user',content:explicit}],account);assert.equal(result.messages[0].content,explicit);assert.ok(wireBytes(result.messages)<90000);
 assert.equal(core.previewFits([{role:'user',content:'x'.repeat(91000)}],account),false);
});
test('folder-model: compaction keeps active goal, protocol, latest tool action/result, original transcript',()=>{
 const account={preview:{source:'operator_test_allowance',tokens_remaining:null}};
 const messages=[{role:'system',content:'JSON_TOOL_PROTOCOL'},{role:'user',content:'ACTIVE_GOAL'},{role:'assistant',content:'OLD'.repeat(40000)},{role:'assistant',content:'{"tool":"read_file","path":"recent.txt"}'},{role:'user',content:'TOOL_RESULT {"content":"new"}'}],before=JSON.stringify(messages);
 const result=fitContext(messages,account,{preserveFirstUser:true});assert.equal(result.messages[0].content,'JSON_TOOL_PROTOCOL');assert.ok(result.messages.some(m=>m.content==='ACTIVE_GOAL'));assert.deepEqual(result.messages.slice(-2),messages.slice(-2));assert.equal(JSON.stringify(messages),before);
});
test('folder-model: canonical dialog path within symlink workspace accepted; lexical sublink escape rejected',async()=>{
 const x=fixture();x.vscode.workspace.workspaceFolders=x.vscode.workspace.workspaceFolders.filter(f=>f.name==='parser');
 const selected=await x.browse(Uri.file(path.join(x.parser,'project')));assert.equal(selected.uri.fsPath,path.join(x.parser,'project'));
 fs.symlinkSync(path.join(x.parent,'docs'),path.join(x.parser,'outside'));
 await assert.rejects(x.browse(Uri.file(path.join(x.parent,'parser','outside'))),/escape|inside/);
 assert.equal(x.active.current().uri.fsPath,selected.uri.fsPath);
});

test('0.10.7 Explorer selection consumes clicked URI directly, canonicalizes nested symlink roots and retains schema 2 guards',async()=>{
 const x=fixture();let changes=0,pickers=0;
 x.vscode.window.showQuickPick=x.vscode.window.showOpenDialog=async()=>{pickers++;throw Error('Unexpected picker');};
 const active=createActiveWorkspace({vscode:x.vscode,state:x.state,onChange:()=>changes++});
 const selected=await active.select(Uri.file(path.join(x.parent,'parser','project')));
 assert.equal(selected.uri.fsPath,path.join(x.parser,'project'));assert.equal(pickers,0);assert.equal(changes,1);
 assert.equal(x.state.get(require('../lib/active-workspace').KEY).schema,2);
 assert.equal(createActiveWorkspace({vscode:x.vscode,state:x.state}).current().uri.fsPath,selected.uri.fsPath);
 await active.select(Uri.file(path.join(x.parent,'parser','project')));assert.equal(changes,1);
 await active.select(Uri.file(x.parent));assert.equal(active.hasNested(),true);assert.equal(changes,2);
 fs.symlinkSync(x.parser,path.join(x.parent,'escape'));
 await assert.rejects(active.select(Uri.file(path.join(x.parent,'escape'))),/escape/);
 assert.equal(active.current().uri.fsPath,x.parent);
});

test('0.10.7 visual browser lists only explicit expansions, skips generated folders/files/escapes, bounds results and validates forged URI',async()=>{
 const {listFolders,folderUri}=require('../lib/folder-browser');const x=fixture();
 fs.mkdirSync(path.join(x.parser,'node_modules'));fs.mkdirSync(path.join(x.parser,'.cache'));
 fs.symlinkSync(path.join(x.parent,'docs'),path.join(x.parser,'escape'));
 const original=fs.promises.opendir,reads=[];
 fs.promises.opendir=async p=>{reads.push(p);return original(p);};
 try{
  const roots=await listFolders(x.vscode,null);assert.equal(reads.length,0);assert.ok(roots.folders.some(f=>f.name==='parser'));
  const parser=roots.folders.find(f=>f.name==='parser');assert.equal(parser.path,x.parser);
  const children=await listFolders(x.vscode,parser.uri);assert.deepEqual(reads,[x.parser]);assert.deepEqual(children.folders.map(f=>f.name),['project']);
  await x.active.select(folderUri(x.vscode,children.folders[0].uri));assert.equal(x.active.current().uri.fsPath,path.join(x.parser,'project'));
  for(let n=0;n<120;n++)fs.mkdirSync(path.join(x.parser,'project','dir'+n));
  const bounded=await listFolders(x.vscode,children.folders[0].uri);assert.equal(bounded.folders.length,100);assert.equal(bounded.truncated,true);assert.equal(reads.length,2);
  await assert.rejects(listFolders(x.vscode,{scheme:'file',path:x.base}),/inside/);
  await assert.rejects(listFolders(x.vscode,{scheme:'file',path:path.join(x.parent,'parser','escape')}),/escape/);
  assert.throws(()=>folderUri(x.vscode,{scheme:'vscode-remote',authority:'other',path:x.parser}),/workspace/);
  assert.throws(()=>folderUri(x.vscode,{scheme:'file',path:'../elsewhere'}),/workspace/);
  x.vscode.workspace.isTrusted=false;await assert.rejects(listFolders(x.vscode,null),/Trust/);
 }finally{fs.promises.opendir=original;}
});
