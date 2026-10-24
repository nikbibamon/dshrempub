'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {readReport,LIMIT}=require('../lib/orchestration-report');
function fixture(){const state=fs.mkdtempSync(path.join(process.env.TVIJO_TEST_ARTIFACTS||os.tmpdir(),'private-report-')),job='job-'+'a'.repeat(32),dir=path.join(state,'reports',job);fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,'b'.repeat(16)+'-light.html');fs.writeFileSync(file,'<!DOCTYPE html><html><head><style>body{color:blue}</style></head><body>Verified report</body></html>',{mode:0o600});return {state,job,dir,file};}
test('private report preview adds a restrictive policy before report content',()=>{const f=fixture(),html=readReport(f.state,f.job,f.file);assert.match(html,/default-src &#39;none&#39;/);assert.match(html,/form-action &#39;none&#39;/);assert.ok(html.indexOf('Content-Security-Policy')<html.indexOf('<style>'));assert.match(html,/Verified report/);});
test('report references cannot read another task, state file, symlink target or oversized file',()=>{
 const f=fixture(),other=fixture();
 for(const [job,file]of [[f.job,other.file],['host-job',f.file],[f.job,path.join(f.state,'secret.html')]])assert.throws(()=>readReport(f.state,job,file));
 const link=path.join(f.dir,'c'.repeat(16)+'-dark.html');fs.symlinkSync(other.file,link);assert.throws(()=>readReport(f.state,f.job,link));
 const large=path.join(f.dir,'d'.repeat(16)+'-rainbow.html');const fd=fs.openSync(large,'wx',0o600);fs.ftruncateSync(fd,LIMIT+1);fs.closeSync(fd);assert.throws(()=>readReport(f.state,f.job,large),/preview limit/);
});
