'use strict';
// This extension ships JavaScript; compile validates every runtime source offline.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
for(const file of ['extension.js','workspace.js',...fs.readdirSync(path.join(root,'lib')).filter(n=>n.endsWith('.js')).map(n=>'lib/'+n)])execFileSync(process.execPath,['--check',path.join(root,file)],{stdio:'inherit'});
for(const file of ['package.json','package.nls.json','package.nls.ru.json'])JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
console.log('Runtime JavaScript and locale JSON validated; no generated build needed.');
