const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..'),BASE='fb853db1dd12a1a4db7abfe40a6becc11eea9b86';
const git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8'}),source=p=>fs.readFileSync(path.join(ROOT,p),'utf8'),old=p=>git('show',BASE+':'+p);
function range(text,a,b){const lines=text.split('\n'),start=lines.findIndex(x=>x.includes(a));assert.ok(start>=0,a);const end=lines.findIndex((x,i)=>i>start&&x.includes(b));assert.ok(end>start,b);return [start+1,end];}
const inside=(line,r)=>line>=r[0]&&line<=r[1];
test('extension additions and removals stay in the three allowed areas and carry review markers',()=>{
 const file='vscode/extension.js',before=old(file),after=source(file),lines=after.split('\n');
 const baseRanges=[range(before,'async function previewCoding(','async function codingChecked('),range(before,"command('tvijo.applyCoding'","command('tvijo.ask'")];
 const allowed=[range(after,'async function previewCoding(','async function codingChecked('),range(after,"command('tvijo.applyCoding'","command('tvijo.ask'")];
 const commandsStart=lines.findIndex(x=>x.trim()==='// learn:begin commands')+1,applyStart=allowed[1][0];assert.ok(commandsStart>0);allowed.push([commandsStart,applyStart-1]);assert.equal(lines[applyStart-2].trim(),'// learn:end');
 const marked=new Set();let depth=0;for(let i=0;i<lines.length;i++){if(/\/\/ learn:begin /.test(lines[i]))depth++;if(depth||/\/\/ learn:edit\s*$/.test(lines[i]))marked.add(i+1);if(/\/\/ learn:end\s*$/.test(lines[i]))depth--;assert.ok(depth>=0);}
 assert.equal(depth,0);let o=0,n=0,removed=0;
 for(const line of git('diff','--no-ext-diff','--unified=0',BASE,'--',file).split('\n')){
  const h=/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);if(h){o=+h[1];n=+h[2];continue;}
  if(line.startsWith('+++')||line.startsWith('---'))continue;
  if(line.startsWith('+')){assert.ok(marked.has(n),'unmarked addition at '+n);assert.ok(allowed.some(r=>inside(n,r)),'addition outside area '+n);n++;}
  else if(line.startsWith('-')){assert.ok(baseRanges.some(r=>inside(o,r)),'deletion outside base function '+o);o++;removed++;}
  else if(line.startsWith(' ')){o++;n++;}
 }
 assert.ok(removed<=lines.filter(x=>/\/\/ learn:edit\s*$/.test(x)).length);
});
test('package and translations are additive, version and every forbidden base module are unchanged',()=>{
 const file='vscode/package.json',b=JSON.parse(old(file)),a=JSON.parse(source(file));assert.equal(a.version,b.version);assert.equal(a.contributes.configuration.properties['tvijo.learn.enabled'].default,false);
 assert.deepEqual(a.contributes.commands.slice(0,b.contributes.commands.length),b.contributes.commands);a.contributes.commands=a.contributes.commands.slice(0,b.contributes.commands.length);
 for(const key of Object.keys(a.contributes.configuration.properties))if(key.startsWith('tvijo.learn.'))delete a.contributes.configuration.properties[key];assert.deepEqual(a,b);
 for(const file of ['vscode/package.nls.json','vscode/package.nls.ru.json']){const b=JSON.parse(old(file)),a=JSON.parse(source(file));for(const key of Object.keys(a))if(!(key in b)){assert.ok(key.startsWith('tvijo.learn.'));delete a[key];}assert.deepEqual(a,b);}
 assert.equal(git('diff','--exit-code',BASE,'--','vscode/lib/coding.js','vscode/lib/local-tools.js','vscode/lib/command-policy.js','vscode/lib/task-receipt.js','vscode/lib/agent-review.js','vscode/lib/orchestration*.js','vscode/media/learning-guide.html'),'');
 const paths=[...git('diff','--name-only',BASE).trim().split('\n'),...git('ls-files','--others','--exclude-standard').trim().split('\n')].filter(Boolean);
 for(const file of paths)assert.ok(file==='.agent-owner'||/^vscode\/(lib\/learn-[^/]+\.js|learn\/|test\/learn-[^/]+\.test\.js|test\/fixtures\/learn-|extension\.js$|package(?:\.nls(?:\.ru)?)?\.json$|CHANGELOG\.md$)/.test(file),file);
});
test('disabled Learn and ordinary project keep base confirmation values and write no learning journal',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'learn-disabled-')),vscode={window:{},workspace:{}},host=require('../lib/learn-host').createHost({vscode,storageRoot:root,enabled:()=>false,scope:()=>null,folder:()=>root});
 await assert.rejects(host.start('day-planner/1',null),{code:'learn_disabled'});
 const ordinary={artifact:{task_id:'ordinary'}};host.present(ordinary);for(const approved of [true,false])assert.equal(await host.confirm(ordinary,async()=>approved),approved);assert.equal(fs.existsSync(path.join(root,'learn')),false);
});
