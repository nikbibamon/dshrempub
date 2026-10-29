'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createTools,cleanEnv,analyzeCommand}=require('../lib/local-tools');
const {systemPrompt,runAgent}=require('../lib/agent');
const {presetFor,PRESETS}=require('../lib/modes');
const {sidebar}=require('./helpers/sidebar');
async function root(){return fs.mkdtemp(path.join(process.env.TVIJO_TEST_ARTIFACTS||os.tmpdir(),'extra-access-'));}
test('Extra accepts script syntax only behind an attested sandbox; no root host fallback',async()=>{
 const dir=await root(),command='value=ready; printf "%s" "$value"';
 assert.equal(analyzeCommand(command,{extra:true}).ok,true);
 const extra=createTools({root:dir,allowShell:true,extraAccess:true,confirmRun:async()=>true});
 await assert.rejects(extra.execute({tool:'run_command',command}),/preflight/);
 const full=createTools({root:dir,allowShell:true,confirmRun:async()=>true});
 await assert.rejects(full.execute({tool:'run_command',command,commandDecision:analyzeCommand(command,{extra:true})}));
 assert.equal(analyzeCommand('sudo echo fail',{extra:true}).denied,true);
});
test('Plan wins over Extra for commands and review and capability discovery starts no reviewer',async()=>{
 const dir=await root();let calls=0;
 const tools=createTools({root:dir,allowShell:true,extraAccess:true,agentReview:{status:async()=>{calls++;},review:async()=>{calls++;}},confirmRun:async()=>true});
 const caps=await tools.execute({tool:'agent_capabilities'},{planMode:true});assert.equal(caps.run_command,false);assert.equal(caps.review,false);assert.equal(calls,0);
 for(const tool of ['run_command','agent_review','write_file'])assert.equal((await tools.execute({tool},{planMode:true})).reason,'plan_mode');
 assert.equal(calls,0);
});
test('capability receipt and model prompt distinguish Full, Extra and unproven unavailable claims',async()=>{
 const dir=await root(),tools=createTools({root:dir,allowShell:true,extraAccess:true,agentReview:{status:async()=>({codex:{installed:true}}),review:async()=>({ok:true,output:'advice only'})}});
 const capabilities=await tools.execute({tool:'agent_capabilities'});assert.equal(capabilities.mode,'extra');assert.equal(capabilities.run_command,false);assert.match(capabilities.sandbox_reason,/preflight/);
 let prompt;await runAgent({goal:'inspect',extraAccess:true,capabilities,tools,maxSteps:1,ask:async({messages})=>{prompt=messages[0].content;return {content:'{"tool":"finish","status":"done","answer":"ok"}'};}});
 assert.match(prompt,/HOST CAPABILITIES/);assert.match(prompt,/MODE: EXTRA FULL ACCESS/);assert.match(prompt,/actual refusal/);assert.doesNotMatch(systemPrompt({planMode:true,extraAccess:true}),/MODE: EXTRA FULL ACCESS/);
 assert.equal((await createTools({root:dir}).execute({tool:'agent_review'})).reason,'extra_access_required');
});
test('Extra project commands do not inherit account discovery, billing keys or injection variables',()=>{
 const env=cleanEnv({PATH:'/bin',HOME:'/home/agent',CODEX_HOME:'/config/codex',OPENAI_API_KEY:'secret',ANTHROPIC_API_KEY:'secret',ANTHROPIC_BASE_URL:'http://wrong',NODE_OPTIONS:'--eval bad',BASH_ENV:'/bad'},true);
 assert.equal(env.HOME,undefined);assert.equal(env.CODEX_HOME,undefined);
 for(const key of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','ANTHROPIC_BASE_URL','NODE_OPTIONS','BASH_ENV'])assert.equal(env[key],undefined);
 assert.equal(cleanEnv({HOME:'/home/agent'}).HOME,undefined);
});
test('Extra preset is named separately and sidebar renders it in both languages',()=>{
 assert.ok(PRESETS.extra);assert.equal(presetFor(true,true,true,true),'extra');assert.equal(presetFor(true,true,true,false),'full');
 const view=sidebar();view.emit('window:message',{data:{type:'state',signedIn:true,scopeKey:'scope',workspaceSelected:true,fullAccess:{available:true,enabled:true,extra:true,scopeKey:'scope'},options:{agentPreset:'extra',agentModel:'ds41f',models:[{id:'ds41f',name:'DeepSeek'}]},composerMode:'agent',messages:[]}});
 assert.equal(view.element('mode').textContent,'ExtraFullAccess');
 view.emit('lang:click',{});assert.equal(view.element('mode').textContent,'ExtraFullAccess');
});

test('Extra uses local model selector despite global DSH and hides ineffective apply toggle',()=>{
 const view=sidebar({}, {composerMode:'agent',orchestration:{enabled:true,policy:'sol'},fullAccess:{available:true,enabled:true,extra:true},options:{agentPreset:'extra',agentModel:'ds41f',models:[{id:'ds41f',name:'DeepSeek'}]}});
 assert.doesNotMatch(view.element('workflow-label').textContent,/DSH/);
 assert.match(view.element('workflow-label').textContent,/DeepSeek/);
 assert.equal(view.created.some(n=>n.textContent==='Review before applying'),false);
});
