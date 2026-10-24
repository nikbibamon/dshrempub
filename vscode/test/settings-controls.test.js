'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {validateSetting}=require('../lib/settings-controls');
test('settings host rejects unknown, legacy, invalid numeric and credential-bearing values',()=>{
 for(const [key,value] of [['__proto__',true],['tvijo.telegram.ownerId','123456'],['tvijo.agentBudgetUsd',NaN],['tvijo.agentBudgetUsd',101],['tvijo.agentMaxSteps',2.5],['tvijo.orchestration.agentCount',2],['tvijo.orchestration.agentCount',3.5],['tvijo.orchestration.agentCount',7],['tvijo.orchestration.reportFormat','auto'],['tvijo.autoApply','true'],['tvijo.apiBase','https://user:pass@host.test/'],['tvijo.ocrLanguages','eng;whoami'],['tvijo.telegram.allowedServices',['ssh.service;echo secret']]])assert.throws(()=>validateSetting(key,value),key);
 assert.equal(validateSetting('tvijo.agentBudgetUsd',12),12);assert.equal(validateSetting('tvijo.ocrLanguages','eng+rus+ukr'),'eng+rus+ukr');
 assert.deepEqual(validateSetting('tvijo.telegram.allowedServices',['worker.service']),['worker.service']);
});
test('manifest localization and packaged default settings match runtime help',()=>{
 const p=require('../package.json'),en=require('../package.nls.json'),ru=require('../package.nls.ru.json');
 for(const [key,prop] of Object.entries(p.contributes.configuration.properties)){const token=prop.markdownDescription.slice(1,-1);assert.ok(en[token],key);assert.match(ru[token],/[а-я]/i);}
 assert.equal(p.contributes.configuration.properties['tvijo.agentMaxSteps'].default,60);
 assert.equal(p.contributes.configuration.properties['tvijo.autoApply'].default,true);
});

test('every native enum has localized friendly descriptions and worker IDs stay exact',()=>{
 const props=require('../package.json').contributes.configuration.properties,en=require('../package.nls.json'),ru=require('../package.nls.ru.json');
 for(const [key,prop]of Object.entries(props))if(prop.enum){assert.equal(prop.enumDescriptions.length,prop.enum.length,key);for(const token of prop.enumDescriptions){assert.ok(en[token.slice(1,-1)]);assert.match(ru[token.slice(1,-1)],/[а-я]/i,key);}}
 assert.deepEqual(props['tvijo.orchestration.workerPolicy'].enum,['sol','sol-astra','sol-astra-claude']);assert.equal(props['tvijo.orchestration.agentCount'].default,3);assert.equal(props['tvijo.orchestration.reportFormat'].default,'both');
});
