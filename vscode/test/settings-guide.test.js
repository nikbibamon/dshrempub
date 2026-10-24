'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { settingsHtml, SETTINGS_HELP, GUIDE_ACTIONS } = require('../lib/settings-guide');
const properties = require('../package.json').contributes.configuration.properties;
test('guide covers every public configuration key in both languages', () => {
  assert.equal(Object.keys(SETTINGS_HELP).length, Object.keys(properties).length);
  assert.deepEqual(Object.keys(SETTINGS_HELP).sort(), Object.keys(properties).sort());
  for (const help of Object.values(SETTINGS_HELP)) { assert.ok(help.en.length > 60); assert.match(help.ru, /[а-я]/i); }
});
test('only fixed commands and HTTPS destinations are exposed', () => {
  for (const value of Object.values(GUIDE_ACTIONS)) assert.match(value, /^(tvijo\.[A-Za-z]+|workbench\.action\.openSettings|https:\/\/(tvijo\.com|dsh\.tvijo\.com|platform\.tvijo\.com)(?:\/knowledge\/(?:settings-explained|agentroy-teams-and-costs|durable-work-and-recovery)#article-top|\/orchestration\/setup)?)$/);
  assert.equal(GUIDE_ACTIONS.terminal, 'tvijo.terminal');
  assert.equal(GUIDE_ACTIONS.dataPrivacy, 'tvijo.dataPrivacy');
  assert.equal(GUIDE_ACTIONS.resources, 'tvijo.resources');
});
test('nonce CSP, injection resistance and endpoint credential redaction', () => {
  const attack = '</script><img src=x onerror=alert(1)>';
  const html = settingsHtml({}, { properties, values: { 'tvijo.model': attack, 'tvijo.apiBase': 'https://user:secret@example.com/api?token=secret#secret', access_token: 'PRIVATE_TOKEN' } });
  assert.match(html, /default-src 'none'/);
  assert.doesNotMatch(html, /unsafe-inline|PRIVATE_TOKEN|user:secret|token=secret|#secret/);
  assert.ok(!html.includes(attack));
  const nonce = html.match(/script-src 'nonce-([^']+)'/)[1];
  assert.ok(html.includes('<script nonce="' + nonce + '">'));
  assert.ok(html.includes('<style nonce="' + nonce + '">'));
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new vm.Script(script));
});
test('script renders configuration with textContent and emits narrow host messages', () => {
  const html = settingsHtml({}, { locale: 'ru', properties, values: {} });
  assert.match(html, /<html lang="ru">/);
  assert.doesNotMatch(html, /innerHTML|sendText|executeCommand|fetch\(/);
  assert.match(html, /type:'openSetting',key:row.key/);
  assert.match(html, /type:'guideAction',id/);
  assert.doesNotMatch(html, /Refresh values|Save languages|id="refresh"/);
  assert.match(html, /textContent=text/);
});
// A small DOM harness runs the actual webview script, including timers/messages.
function guide(options={}) {
 class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.handlers={};this.attrs={};this.value='';this.hidden=false;}
  appendChild(child){this.children.push(child);return child;}
  replaceChildren(){this.children=[];}
  addEventListener(name,fn){this.handlers[name]=fn;}
  setAttribute(key,value){this.attrs[key]=value;}
  getAttribute(key){return this.attrs[key];}
  checkValidity(){return true;}
 }
 const elements=new Map(),messages=[],timers=new Map();let timer=0,receive;
 const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 const document={body:new Element(),documentElement:{},activeElement:null,getElementById:get,createElement:tag=>new Element(tag)};
 const html=settingsHtml({}, {properties,...options}),script=html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
 vm.runInNewContext(script,{document,URL,setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),acquireVsCodeApi:()=>({postMessage:m=>messages.push(m)}),window:{addEventListener:(_,fn)=>{receive=fn;}}});
 const cards=()=>[...get('cards').children,...get('advanced-cards').children];
 const card=key=>cards().find(c=>c.attrs['data-key']===key);
 const input=key=>card(key).children.find(c=>c.attrs['data-setting']===key);
 const flush=()=>{for(const [id,fn]of [...timers]){timers.delete(id);fn();}};
 return {get,document,messages,cards,card,input,flush,receive:m=>receive({data:m})};
}
test('search, bilingual controls, contextual actions and native snapshots work without refresh',()=>{
 const app=guide();assert.equal(app.cards().length,Object.keys(properties).length);
 assert.equal(app.get('advanced').open,undefined);
 app.get('search').value='ocrLanguages';app.get('search').handlers.input();
 assert.equal(app.cards().filter(c=>!c.hidden).length,1);
 app.get('language').handlers.click();assert.equal(app.document.documentElement.lang,'ru');
 const native=app.card('tvijo.model').children.find(c=>c.tagName==='DETAILS').children.find(c=>c.tagName==='BUTTON');native.handlers.click();assert.equal(app.messages.at(-1).key,'tvijo.model');
 app.receive({type:'settingsValues',revision:1,values:{'tvijo.orchestration.enabled':true,'tvijo.agentMaxSteps':90,'tvijo.apiBase':'https://name:secret@host.test/path?token=secret'}});
 assert.equal(app.input('tvijo.orchestration.enabled').checked,true);
 assert.equal(app.input('tvijo.agentMaxSteps').value,'90');assert.doesNotMatch(app.input('tvijo.apiBase').value,/secret|name:/);
 assert.equal(app.card('tvijo.agentModel').attrs['data-inactive'],'true');
});
test('autosave preserves typing, focused node and selection during pending/native updates; stale replies ignored',()=>{
 const app=guide(),input=app.input('tvijo.agentMaxSteps');app.document.activeElement=input;
 input.value='9';input.selectionStart=1;input.handlers.input();
 app.receive({type:'settingsValues',revision:1,values:{'tvijo.agentMaxSteps':60}});
 assert.equal(app.input('tvijo.agentMaxSteps'),input);assert.equal(input.value,'9');assert.equal(input.selectionStart,1);
 input.value='90';input.handlers.input();app.flush();const first=app.messages.at(-1);assert.equal(first.value,90);assert.equal(first.requestId,1);
 input.value='100';input.handlers.input();
 app.receive({type:'settingsSaved',key:first.key,requestId:1,revision:2,value:90});assert.equal(input.value,'100');app.flush();const second=app.messages.at(-1);assert.equal(second.requestId,2);
 app.receive({type:'settingsSaved',key:first.key,requestId:1,revision:3,value:90,error:'old failure'});assert.equal(input.value,'100');assert.doesNotMatch(app.get('save-status').textContent,/old failure/);
 app.receive({type:'settingsValues',revision:4,values:{'tvijo.agentMaxSteps':90}});assert.equal(input.value,'100');
 app.receive({type:'settingsSaved',key:second.key,requestId:2,revision:5,value:100});assert.equal(input.value,'100');assert.equal(app.document.activeElement,input);
 app.receive({type:'settingsValues',revision:3,values:{'tvijo.agentMaxSteps':1}});assert.equal(input.value,'100');
});
test('save error is visible and reverts to real value; later native snapshots update unfocused controls',()=>{
 const app=guide(),input=app.input('tvijo.agentMaxSteps');input.value='99';input.handlers.input();app.flush();
 app.receive({type:'settingsSaved',key:'tvijo.agentMaxSteps',requestId:1,revision:1,value:60,error:'Disk is read only'});
 assert.equal(input.value,'60');assert.match(app.get('save-status').textContent,/Disk is read only/);
 input.value='100';input.handlers.input();app.flush();app.receive({type:'settingsSaved',key:'tvijo.agentMaxSteps',requestId:2,revision:2,value:100});
 app.receive({type:'settingsValues',revision:3,values:{'tvijo.agentMaxSteps':80}});assert.equal(input.value,'80');
});
test('real pack catalog, unknown current IDs, six palettes and OCR checkbox autosave remain usable',()=>{
 const attack='</script><img onerror=evil()>',app=guide({values:{'tvijo.pack':'missing'},runtime:{packs:[{id:'actual-pack',title:{en:'Actual',ru:'Реальный'},category:{en:'Code',ru:'Код'},summary:{en:attack,ru:attack}}],ocr:{available:true,languages:['eng','rus']}}});
 const select=app.input('tvijo.pack');assert.deepEqual(select.children.map(c=>c.value),['','none','actual-pack','missing']);assert.match(select.children.at(-1).textContent,/unavailable/);
 select.value='actual-pack';select.handlers.change();const save=app.messages.at(-1);assert.equal(save.value,'actual-pack');
 app.receive({type:'settingsSaved',key:'tvijo.pack',requestId:save.requestId,revision:1,value:'actual-pack'});
 assert.ok(app.card('tvijo.pack').children.some(c=>c.textContent==='Code · '+attack));assert.equal(app.get('palettes').children.length,6);
 const group=app.card('tvijo.ocrLanguages').children.find(c=>c.className==='language-options'),rus=group.children.find(c=>c.children[0].attrs['aria-label']==='rus');rus.children[0].checked=false;rus.children[0].handlers.change();assert.equal(app.messages.at(-1).value,'eng');
});
test('server address waits for its contextual confirmation action and a failed older save keeps the newer draft',()=>{
 const app=guide(),endpoint=app.input('tvijo.apiBase');endpoint.value='https://trusted.example/api';endpoint.handlers.input();app.flush();assert.equal(app.messages.length,0);
 const confirm=app.card('tvijo.apiBase').children.find(c=>c.tagName==='BUTTON');confirm.handlers.click();assert.equal(app.messages.at(-1).key,'tvijo.apiBase');
 const input=app.input('tvijo.agentMaxSteps');input.value='90';input.handlers.input();app.flush();input.value='100';input.handlers.input();
 app.receive({type:'settingsSaved',key:'tvijo.agentMaxSteps',requestId:1,revision:1,value:60,error:'Old failed write'});assert.equal(input.value,'100');app.flush();assert.equal(app.messages.at(-1).value,100);
});
test('background catalog and native changes update controls in place and keep hostile labels as text',()=>{
 const app=guide(),select=app.input('tvijo.pack'),input=app.input('tvijo.agentMaxSteps');app.document.activeElement=input;
 app.receive({type:'settingsValues',revision:1,values:{'tvijo.pack':'available','tvijo.agentMaxSteps':80},runtime:{packs:[{id:'available',title:{en:'<img src=x>',ru:'<img src=x>'},summary:{en:'actual catalog',ru:'из каталога'}}]}});
 assert.equal(app.input('tvijo.pack'),select);assert.equal(select.value,'available');assert.ok(select.children.some(option=>option.textContent==='<img src=x> · available'));
 assert.equal(input.value,'80');assert.equal(app.document.activeElement,input);
});

test('worker readiness updates choices without claiming quota or changing saved policy',()=>{
 const app=guide(),select=app.input('tvijo.orchestration.workerPolicy');
 app.receive({type:'settingsValues',revision:1,values:{'tvijo.orchestration.workerPolicy':'sol-astra'},runtime:{orchestration:{checkedAt:'2026-10-24T00:00:00Z',quotaChecked:false,policies:[{id:'sol',available:true},{id:'sol-astra',available:false}]}}});
 assert.equal(select.value,'sol-astra');assert.equal(select.children.find(option=>option.value==='sol-astra').disabled,true);
 assert.ok(app.card('tvijo.orchestration.workerPolicy').children.some(c=>c.textContent.includes('unavailable on this host')));
 app.receive({type:'settingsValues',revision:2,values:{'tvijo.orchestration.workerPolicy':'sol'},runtime:{orchestration:{quotaChecked:false,policies:[{id:'sol',available:true}]}}});
 assert.ok(app.card('tvijo.orchestration.workerPolicy').children.some(c=>c.textContent.includes('not a quota guarantee')));
});

test('shared service controls lead to a project first and only then to its workflow',()=>{
 const app=guide({runtime:{services:[{id:'standard',name:'Standard'}]}}),select=app.input('tvijo.service');
 assert.equal(select.disabled,true);const button=app.card('tvijo.service').children.find(c=>c.textContent==='Choose a shared project first');button.handlers.click();assert.equal(app.messages.at(-1).id,'chooseProject');
 app.receive({type:'settingsValues',revision:1,values:{},runtime:{sharedProject:true,services:[{id:'standard',name:'Standard'}]}});assert.equal(select.disabled,false);assert.equal(button.textContent,'Choose shared workflow');button.handlers.click();assert.equal(app.messages.at(-1).id,'chooseWorkflow');
});
