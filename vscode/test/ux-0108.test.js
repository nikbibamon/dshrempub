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
