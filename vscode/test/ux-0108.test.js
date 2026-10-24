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
