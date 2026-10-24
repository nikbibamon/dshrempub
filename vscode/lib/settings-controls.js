'use strict';
const properties = () => require('../package.json').contributes.configuration.properties;
const OCR_LANGUAGES = {eng:['English','Английский'],rus:['Russian','Русский'],ukr:['Ukrainian','Украинский'],deu:['German','Немецкий'],fra:['French','Французский'],spa:['Spanish','Испанский'],ita:['Italian','Итальянский'],pol:['Polish','Польский'],por:['Portuguese','Португальский'],tur:['Turkish','Турецкий'],ara:['Arabic','Арабский'],chi_sim:['Chinese (simplified)','Китайский (упрощённый)'],chi_tra:['Chinese (traditional)','Китайский (традиционный)'],jpn:['Japanese','Японский'],kor:['Korean','Корейский'],hin:['Hindi','Хинди']};
function validateSetting(key,value) {
 const p=properties()[key]; if(!p || key==='tvijo.telegram.ownerId' || key==='tvijo.orchestration.profile') throw Error('Use the dedicated setup action for this setting.');
 if(p.type==='array') {if(!Array.isArray(value)||value.length>30||value.some(x=>typeof x!=='string'||!/^[-a-zA-Z0-9_@.]+\.service$/.test(x)))throw Error('Use exact service names, for example my-worker.service.');return [...new Set(value)];}
 if(typeof value!==p.type)throw Error('Invalid setting type.');
 if(p.type==='number'&&(!Number.isFinite(value)||value<p.minimum||value>p.maximum||(key!=='tvijo.agentBudgetUsd'&&!Number.isInteger(value))))throw Error(`Use a value from ${p.minimum} to ${p.maximum}.`);
 if(p.enum&&!p.enum.includes(value))throw Error('Choose one of the available values.');
 if(typeof value==='string'&&(value.length>2048||/[\x00-\x1f\x7f]/.test(value)))throw Error('Use a shorter value without control characters.');
 if(key==='tvijo.ocrLanguages'&&!/^[a-zA-Z0-9_]+(?:\+[a-zA-Z0-9_]+)*$/.test(value))throw Error('Choose OCR languages or enter Tesseract codes separated by +.');
 if(key==='tvijo.ocrLanguages'&&value.length>60)throw Error('OCR language selection is too long.');
 if(key==='tvijo.apiBase') {const url=new URL(value);if(url.username||url.password||url.search||url.hash)throw Error('The service URL must not contain credentials, query parameters or fragments.');require('./client').apiBase(value);}
 return value;
}
async function installedOcrLanguages() {
 const {execFile}=require('node:child_process');
 return new Promise(resolve=>execFile('tesseract',['--list-langs'],{timeout:5000,maxBuffer:65536,env:{PATH:process.env.PATH,...(process.env.TESSDATA_PREFIX?{TESSDATA_PREFIX:process.env.TESSDATA_PREFIX}:{})}},(error,stdout)=>resolve(error?{available:false,languages:[]}:{available:true,languages:stdout.split(/\r?\n/).map(s=>s.trim()).filter(s=>/^[a-zA-Z0-9_]+$/.test(s)&&s!=='osd')})));
}
module.exports={validateSetting,OCR_LANGUAGES,installedOcrLanguages};
