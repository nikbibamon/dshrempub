'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync,spawnSync}=require('node:child_process');
function repository(){
 const base=fs.mkdtempSync(path.join(process.env.TVIJO_TEST_ARTIFACTS,'judgefix-git-')),root=path.join(base,'repo'),remote=path.join(base,'remote.git'),home=path.join(base,'home');fs.mkdirSync(root);fs.mkdirSync(home);
 const env={...process.env,HOME:home,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
 const git=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',stdio:'pipe'}).trim();
 git('init','-b','work');git('config','user.name','Judge Fixture');git('config','user.email','judge@example.test');fs.writeFileSync(path.join(root,'x.txt'),'base');git('add','--','x.txt');git('commit','-m','Base');execFileSync('git',['clone','--bare',root,remote],{env,stdio:'pipe'});git('remote','add','origin',remote);fs.writeFileSync(path.join(root,'x.txt'),'next');git('add','--','x.txt');git('commit','-m','Local ahead');
 const remoteHead=()=>execFileSync('git',['--git-dir='+remote,'rev-parse','HEAD'],{env,encoding:'utf8'}).trim();return {base,root,remote,env,git,remoteHead};
}
test('judgefix counted Git policy merges inherited entries and blocks every push URL form at Git layer',()=>{
 const f=repository(),{blockGitPush}=require('../lib/agent-command-env');const env=blockGitPush({...f.env,GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'tvijo.fixture',GIT_CONFIG_VALUE_0:'kept'});
 assert.equal(execFileSync('git',['config','tvijo.fixture'],{cwd:f.root,env,encoding:'utf8'}).trim(),'kept');assert.equal(env.GIT_CONFIG_COUNT,'3');
 const before=f.remoteHead();
 for(const url of ['https://example.invalid/repo','http://example.invalid/repo','ssh://example.invalid/repo','git://example.invalid/repo','git@example.invalid:repo','file://'+f.remote,f.remote,'../remote.git','custom::opaque']){
  f.git('remote','set-url','origin',url);
  const expanded=spawnSync('git',['remote','get-url','--push','origin'],{cwd:f.root,env,encoding:'utf8'});assert.equal(expanded.status,0);assert.ok(expanded.stdout.startsWith('tvijo-push-blocked:///'),url+' '+expanded.stdout);
  const pushed=spawnSync('git',['push','origin','HEAD'],{cwd:f.root,env,encoding:'utf8'});assert.notEqual(pushed.status,0,url);assert.match(pushed.stderr,/transport .* not allowed/);
 }
 f.git('remote','set-url','origin',f.remote);f.git('config','remote.origin.pushurl',f.remote);
 const explicit=spawnSync('git',['push','origin','HEAD'],{cwd:f.root,env,encoding:'utf8'});assert.notEqual(explicit.status,0);assert.match(explicit.stderr,/transport 'file' not allowed/);assert.equal(f.remoteHead(),before);
});
test('judgefix agent command children inherit the push block through Python and npm scripts',async()=>{
 const f=repository(),{createTools}=require('../lib/local-tools');const before=f.remoteHead();fs.writeFileSync(path.join(f.root,'package.json'),JSON.stringify({scripts:{test:'git push origin HEAD'}}));fs.writeFileSync(path.join(f.root,'.npmrc'),'cache='+path.join(f.base,'npm-cache')+'\n');
 const tools=createTools({root:f.root,confirmRun:async()=>true,confirmWrite:async()=>false});
 for(const command of ['python3 -c "import subprocess,sys; sys.exit(subprocess.run([\'git\',\'push\',\'origin\',\'HEAD\']).returncode)"','npm test']){const result=await tools.execute({tool:'run_command',command});assert.equal(result.ok,false,command);assert.match(result.stderr,/transport .* not allowed/);assert.equal(f.remoteHead(),before);}
 assert.equal(require('../lib/command-policy').analyzeCommand('git push origin HEAD').requiresApproval,true);
});
