'use strict';
const fs=require('node:fs'),path=require('node:path');
const LIMIT=2*1024*1024;
// The controller supplies immutable private HTML reports, never webview file paths.
function readReport(state,jobId,file){
 if(typeof state!=='string'||typeof file!=='string'||!path.isAbsolute(state)||!path.isAbsolute(file)||!/^job-[a-f0-9]{32}$/.test(jobId||''))throw Error('Invalid private report reference.');
 const root=path.join(fs.realpathSync(state),'reports',jobId),canonical=fs.realpathSync(file);
 if(path.dirname(canonical)!==root||!(/^[a-f0-9]{16}-(light|dark|rainbow)\.html$/).test(path.basename(canonical)))throw Error('Report is outside this task’s private report directory.');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{
  const info=fs.fstatSync(fd);if(!info.isFile()||info.size>LIMIT)throw Error('Report is unavailable or exceeds the 2 MB preview limit.');
  const buffer=Buffer.alloc(LIMIT+1),bytes=fs.readSync(fd,buffer,0,buffer.length,0);if(bytes>LIMIT)throw Error('Report exceeds the 2 MB preview limit.');
  const html=buffer.subarray(0,bytes).toString('utf8');
  const policy='<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; form-action &#39;none&#39;; base-uri &#39;none&#39;">';
  return /<head(?:\s[^>]*)?>/i.test(html)?html.replace(/<head(?:\s[^>]*)?>/i,match=>match+policy):policy+html;
 }finally{fs.closeSync(fd);}
}
module.exports={readReport,LIMIT};
