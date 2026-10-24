'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path');
test('0.10.8 Auto and step fallbacks match manifest defaults',()=>{
 const props=require('../package.json').contributes.configuration.properties;
 const source=fs.readFileSync(path.join(__dirname,'../extension.js'),'utf8');
 for(const key of ['agentAutoApply','agentAutoRun','agentMaxSteps']){
  assert.equal(props['tvijo.'+key].default,key==='agentMaxSteps'?30:true);
  const matches=[...source.matchAll(new RegExp("get\\('"+key+"', ([^)]+)\\)",'g'))];
  assert.ok(matches.length);for(const match of matches)assert.equal(JSON.parse(match[1]),props['tvijo.'+key].default);
 }
 assert.match(require('../lib/agent').systemPrompt({}),/at most 30/);
});

test('0.10.8 webview literal IDs exist and header rows are removed',()=>{
 const {chatHtml}=require('../lib/chat-view');const html=chatHtml({cspSource:'test:'});const markup=html.split('<script nonce=')[0];
 const source=fs.readFileSync(path.join(__dirname,'../lib/chat-view.js'),'utf8');
 for(const match of source.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g))assert.ok(markup.includes('id="'+match[1]+'"'),'missing '+match[1]);
 assert.doesNotMatch(markup,/<header|id="identity-bar"|id="brand"|id="new"|id="history"/);
 const c=require('../package.json').contributes;assert.equal(c.views.tvijo[0].name,'Tvijo');assert.equal(c.menus['view/title'].length,3);
 assert.equal(c.commands.find(c=>c.command==='tvijo.newConversation').enablement,'!tvijo.busy');
});

test('0.10.8 composer owns folder chip and settings owns account and version',()=>{
 const html=require('../lib/chat-view').chatHtml({cspSource:'test:'}).split('<script nonce=')[0];
 assert.match(html,/<div class="composer-actions"><button id="workspace-choice"/);
 const drawer=html.match(/<aside id="settings-drawer"[\s\S]*?<\/aside>/)[0];
 for(const id of ['account-identity','account-verification','runtime-version','auto-commit','loaded-rules','signout'])assert.ok(drawer.includes('id="'+id+'"'));
 assert.doesNotMatch(html,/id="full-access-warning"/);
});

test('0.10.8 every scope refusal has localized text and a resolving action',()=>{
 const {NOTICES,notice}=require('../lib/scope-notices');assert.ok(Object.keys(NOTICES).length>=6);
 for(const code of Object.keys(NOTICES))for(const lang of ['en','ru']){const n=notice(code,lang);assert.ok(n.text.length>20);assert.ok(['chooseFolder','addWorkspaceFolder'].includes(n.action),code);}
 assert.equal(notice('scope_outside').action,'addWorkspaceFolder');
});

test('0.10.8 default folder is nearest repository, sticky, persisted on send without picker',async()=>{
 const os=require('node:os');const root=fs.mkdtempSync(path.join(process.env.TVIJO_TEST_ARTIFACTS||os.tmpdir(),'scope108-'));
 const project=path.join(root,'repo');fs.mkdirSync(path.join(project,'src'),{recursive:true});fs.mkdirSync(path.join(project,'.git'));const file=path.join(project,'src','x.js');fs.writeFileSync(file,'x');
 const uri=p=>({scheme:'file',fsPath:p});let editor={document:{uri:uri(file)}},picks=0,busy=false;
 const values=new Map();const vscode={Uri:{file:uri,from:v=>uri(v.path)},workspace:{workspaceFolders:[{uri:uri(root)}]},window:{get activeTextEditor(){return editor;},showQuickPick:()=>{picks++;}}};
 const {createActiveWorkspace,KEY}=require('../lib/active-workspace');const active=createActiveWorkspace({vscode,state:{get:k=>values.get(k),update:async(k,v)=>values.set(k,v)},isBusy:()=>busy});
 assert.equal(active.current().uri.fsPath,project);editor=null;busy=true;assert.equal(active.current().uri.fsPath,project);busy=false;
 await active.ensure();assert.equal(values.get(KEY).canonicalRoot,project);assert.equal(picks,0);
 await active.resetGuess();assert.equal(active.current().uri.fsPath,root);
});

test('0.10.8 rule writes always require approval, including Full access',()=>{
 const {isRulesPath}=require('../lib/project-rules');for(const file of ['AGENTS.md','CLAUDE.md','.clinerules','a/.clinerules/style.md','.cursorrules','.windsurfrules','.github/copilot-instructions.md','.tvijo/rules.md'])assert.equal(isRulesPath(file),true,file);
 assert.equal(isRulesPath('src/app.js'),false);
 const source=fs.readFileSync(path.join(__dirname,'../extension.js'),'utf8');assert.match(source,/rulesWrite \? await confirmAgentWrite\(info\) : fullGrant/);
});
test('0.10.8 optional rules are dropped after old conversation when a request cannot fit',()=>{
 const {fitContext}=require('../lib/context-budget');const system={role:'system',content:'Policy\n[TVIJO OPTIONAL RULES]\n'+'rules '.repeat(1000)+'[END TVIJO OPTIONAL RULES]\n'};
 const fit=fitContext([system,{role:'user',content:'old'.repeat(2000)},{role:'assistant',content:'earlier'},{role:'user',content:'do task'}],null,{maxBytes:1000});
 assert.equal(fit.rulesOmitted,true);assert.equal(fit.messages[0].content,'Policy');assert.equal(fit.messages.at(-1).content,'do task');
});

test('0.10.8 Chat explains Agent handoff in English and Russian',()=>{
 const {CHAT_SYSTEM_PROMPT,offersAgent}=require('../lib/chat-mode');assert.match(CHAT_SYSTEM_PROMPT,/Chat mode/);assert.ok(offersAgent('I will do it in Agent mode.'));assert.ok(offersAgent('Сделаю это в режиме Агент.'));assert.equal(offersAgent('The function returns a number.'),false);
 const view=require('./helpers/sidebar').sidebar({}, {messages:[{role:'assistant',content:'Agent mode',agentRequest:'Edit file'}]});
 const button=view.created.find(b=>b.textContent==='Make it an agent');assert.ok(button);button.click();assert.equal(view.outgoing.at(-1).type,'makeAgent');
});
