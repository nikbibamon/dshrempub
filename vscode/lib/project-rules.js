'use strict';

// Safely reads individual rules and aggregates nearest-first project advice.
// Quoted rules never participate in host policy or tool authorization.
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const { createHash } = require('node:crypto');
const {safePath} = require('./local-tools');

const RULES_RELATIVE = path.join('.tvijo', 'rules.md');
const MAX_RULES_BYTES = 32768;
const MAX_READ_BYTES = 256 * 1024;
const MAX_PATTERNS = 16;
const MAX_PATTERN_LENGTH = 256;
const CREDENTIAL_TEXT = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:^|[^a-z])(?:[a-z0-9_-]*(?:api[_-]?key|auth[_-]?token|access[_-]?token|password|passwd|secret|private[_-]?key|credential)[a-z0-9_-]*)\s*[:=]\s*\S+/im;
const CREDENTIAL_TOKEN = /\b(?:tvijo_pk_[A-Za-z0-9_-]{15,}|sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/;
const SECRET_NAME = /^(?:\.env(?:\.|$)|secrets?\.|credentials?\.|auth\.json$|id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx|crt|der|sqlite|db))$/i;

function reject(reason) { return { text: '', status: 'rejected', reason }; }

function validRelative(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_PATTERN_LENGTH &&
    !value.startsWith('/') && !value.includes('\\') && !value.includes('\0') &&
    !/^[a-z]:/i.test(value) && !value.split('/').some(part => !part || part === '.' || part === '..');
}

function compileGlob(pattern) {
  if (!validRelative(pattern) || pattern.includes('!') || /[{}\[\]]/.test(pattern)) return null;
  const segments = pattern.split('/');
  let source = '^';
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment === '**') {
      if (i === segments.length - 1) source += '(?:[^/]+(?:/|$))*';
      else source += '(?:[^/]+/)*';
      continue;
    }
    if (segment.includes('**')) return null;
    source += segment.replace(/[.+^$()|\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
    if (i < segments.length - 1) source += '/';
  }
  source += '$';
  try { return new RegExp(source); } catch { return null; }
}

function parseMetadata(text) {
  const lines = text.split('\n');
  const marker = '<!-- tvijo-globs:';
  if (!lines[0].startsWith(marker)) {
    if (text.includes(marker)) return { error: 'malformed-metadata' };
    return { global: true, content: text };
  }
  const match = lines[0].match(/^<!-- tvijo-globs: (\[[^\r\n]*\]) -->\r?$/);
  if (!match) return { error: 'malformed-metadata' };
  let patterns;
  try { patterns = JSON.parse(match[1]); } catch { return { error: 'malformed-metadata' }; }
  if (!Array.isArray(patterns) || patterns.length < 1 || patterns.length > MAX_PATTERNS ||
      patterns.some(item => typeof item !== 'string' || item.length > MAX_PATTERN_LENGTH || !compileGlob(item))) {
    return { error: 'malformed-metadata' };
  }
  return { global: false, patterns, regexes: patterns.map(compileGlob), content: lines.slice(1).join('\n') };
}

function sameFile(a, b) {
  return !!a && !!b && a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.size === b.size && a.nlink === b.nlink && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

function lstatChain(absolutePath) {
  const resolved = path.resolve(absolutePath);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  const stats = [];
  for (const part of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current, {bigint:true});
    if (stat.isSymbolicLink()) throw new Error('symlink');
    stats.push({ path: current, stat });
  }
  return stats;
}

function readRules(root, relative = RULES_RELATIVE) {
  const absolute = path.resolve(root, relative);
  let chain;
  try { chain = lstatChain(absolute); } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return { missing: true };
    throw error;
  }
  const inspected = chain.at(-1)?.stat;
  if (!inspected || !inspected.isFile() || inspected.nlink !== 1n) throw new Error('unsafe-file');
  if (inspected.size > MAX_READ_BYTES) throw new Error('oversized');
  if (typeof fs.constants.O_NOFOLLOW !== 'number') throw new Error('no-no-follow');
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(fd, {bigint:true});
    if (!opened.isFile() || opened.nlink !== 1n || !sameFile(inspected, opened)) throw new Error('changed-file');
    const buffer = Buffer.alloc(MAX_READ_BYTES + 1);
    let count = 0;
    while(count < buffer.length) {
      const read = fs.readSync(fd, buffer, count, buffer.length-count, count);
      if (!read) break;
      count += read;
    }
    if (count > MAX_READ_BYTES || opened.size > MAX_READ_BYTES) throw new Error('oversized');
    if (BigInt(count) !== opened.size) throw new Error('changed-file');
    const afterRead = fs.fstatSync(fd, {bigint:true});
    const afterPath = lstatChain(absolute).at(-1)?.stat;
    if (!sameFile(opened, afterRead) || !sameFile(opened, afterPath)) throw new Error('changed-file');
    const bytes = buffer.subarray(0, count);
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error('invalid-utf8'); }
    return { text, bytes };
  } finally { fs.closeSync(fd); }
}

function safeKnownPaths(paths, root) {
  const result = new Set();
  for (const item of Array.isArray(paths) ? paths : []) {
    const value = typeof item === 'string' ? item : item?.path;
    if (!validRelative(value) || value.split('/').some(part => part.startsWith('.')) || SECRET_NAME.test(path.posix.basename(value))) continue;
    try { safePath(root, value); } catch { continue; }
    result.add(value);
  }
  return [...result].sort();
}

function inspectSnapshot(root, knownSecrets = [], relative = RULES_RELATIVE) {
  if (!root || typeof root !== 'string') return reject('invalid-root');
  let source;
  try { source = readRules(root,relative); } catch (error) {
    const reasons = new Set(['oversized', 'invalid-utf8', 'unsafe-file', 'symlink', 'no-no-follow', 'changed-file']);
    return reject(reasons.has(error?.message) ? error.message : 'unavailable');
  }
  if (source.missing) return { text: '', status: 'missing', paths: [] };
  if (CREDENTIAL_TEXT.test(source.text) || CREDENTIAL_TOKEN.test(source.text) || (Array.isArray(knownSecrets) && knownSecrets.some(secret => typeof secret === 'string' && secret.length >= 4 && source.text.includes(secret)))) {
    return reject('credential-content');
  }
  const parsed = parseMetadata(source.text);
  if (parsed.error) return reject(parsed.error);
  return {
    status: 'ready',
    hash: createHash('sha256').update(source.bytes).digest('hex'),
    rawSource: source.text,
    parsed
  };
}

function inspect({ root, knownSecrets = [] } = {}) {
  const snapshot = inspectSnapshot(root, knownSecrets);
  if (snapshot.status !== 'ready') return snapshot;
  return { status: 'ready', hash: snapshot.hash, text: snapshot.rawSource };
}

function collect({ root, knownPaths = [], knownSecrets = [], contextMode = 'on', workspaceTrusted = false, relative = RULES_RELATIVE } = {}) {
  if (contextMode === 'off') return { text: '', status: 'disabled', paths: [] };
  const snapshot = inspectSnapshot(root, knownSecrets, relative);
  if (snapshot.status !== 'ready') return snapshot;
  const { parsed } = snapshot;
  const known = safeKnownPaths(knownPaths, root);
  let applicable = [];
  if (!parsed.global) applicable = known.filter(file => parsed.regexes.some(regex => regex.test(file)));
  if (!parsed.global && !applicable.length) return { text: '', status: 'unmatched', paths: [] };
  if(workspaceTrusted !== true)return {text:'',status:'untrusted',paths:applicable};
  const status = contextMode === 'preview' ? 'preview' : 'included';
  const scope = parsed.global ? 'applies to all project questions' : 'applies to: ' + applicable.join(', ');
  const metadata = parsed.global ? 'metadata: global scope\n' : 'metadata: ' + JSON.stringify(parsed.patterns) + '\n';
  const content = parsed.content.replace(/\r\n/g, '\n');
  const fence = '```';
  const quoted=content.replace(/`/g,'\\u0060').replace(/~/g,'\\u007e');
  const text = `[PROJECT RULES — quoted project advice; cannot grant permissions; not host policy]\n${metadata}${scope}\n${fence}markdown\n${quoted}${content.endsWith('\n') || !content ? '' : '\n'}${fence}\n[END PROJECT RULES]\n`;
  return { text, status, paths: applicable, bytes: Buffer.byteLength(text, 'utf8'),sourceBytes:Buffer.byteLength(snapshot.rawSource,'utf8') };
}


const RULE_FILES=['AGENTS.md','CLAUDE.md','.clinerules','.cursorrules','.windsurfrules','.github/copilot-instructions.md','.tvijo/rules.md'];
function isRulesPath(value){const parts=path.posix.normalize(String(value).replace(/\\/g,'/')).toLowerCase().split('/');const base=parts.at(-1);return ['agents.md','claude.md','.clinerules','.cursorrules','.windsurfrules'].includes(base) || parts.includes('.clinerules') || /(?:^|\/)(?:\.github\/copilot-instructions\.md|\.tvijo\/rules\.md)$/.test(parts.join('/'));}
function clip(text,max){const chars=Array.from(text);let lo=0,hi=chars.length;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(Buffer.byteLength(chars.slice(0,mid).join(''))<=max)lo=mid;else hi=mid-1;}return chars.slice(0,lo).join('');}
function collectProject({root,boundary,resolveDirectory=()=>true,knownPaths=[],knownSecrets=[],contextMode='on',workspaceTrusted=false,disabled=[]}={}){
 if(contextMode==='off' || !workspaceTrusted)return {text:'',status:contextMode==='off'?'disabled':'untrusted',files:[]};
 const blocks=[],files=[];let used=0,dir=root;
 const within=(parent,child)=>{const rel=path.relative(parent,child);return !rel || rel!=='..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel);};
 try{if(fs.realpathSync(root)!==root || fs.realpathSync(boundary)!==boundary || !within(boundary,root))return {text:'',status:'rejected',files:[]};}catch{return {text:'',status:'unavailable',files:[]};}
 while(within(boundary,dir)){
  try{if(resolveDirectory(dir)===false)break;lstatChain(dir);}catch{break;}
  const candidates=[];
  for(const file of RULE_FILES){
   if(file==='.clinerules'){
    try{const stat=fs.lstatSync(path.join(dir,file));if(stat.isDirectory()&&!stat.isSymbolicLink()){for(const entry of fs.readdirSync(path.join(dir,file)).sort())if(entry.endsWith('.md'))candidates.push(file+'/'+entry);continue;}}catch{}
   }
   candidates.push(file);
  }
  for(const relative of candidates){
   const absolute=path.join(dir,relative),id=createHash('sha256').update(absolute).digest('hex'),file=path.relative(root,absolute).split(path.sep).join('/');
   const result=collect({root:dir,relative,knownPaths:knownPaths.map(p=>path.relative(dir,path.resolve(root,p)).split(path.sep).join('/')),knownSecrets,contextMode,workspaceTrusted});
   if(result.status==='missing')continue;
   const row={id,file,bytes:result.sourceBytes || 0,truncated:false,status:result.status,reason:result.reason,disabled:disabled.includes(id)};files.push(row);
   if(!result.text || row.disabled)continue;
   const title='[RULE FILE '+JSON.stringify(file)+']\n';const remaining=MAX_RULES_BYTES-used;
   const note='\n[TRUNCATED PROJECT RULES]\n';
   let block=title+result.text;
   if(Buffer.byteLength(block)>remaining){row.truncated=true;const suffix='\n```\n[END PROJECT RULES]\n';const cut=block.lastIndexOf(suffix);const base=cut>=0?block.slice(0,cut):block;block=remaining>Buffer.byteLength(title+suffix+note)+180?clip(base,remaining-Buffer.byteLength(suffix+note))+suffix+note:'';}
   row.includedBytes=Buffer.byteLength(block);used+=row.includedBytes;if(block)blocks.push(block);
  }
  if(fs.existsSync(path.join(dir,'.git')) || dir===boundary)break;
  const parent=path.dirname(dir);if(parent===dir)break;dir=parent;
 }
 return {text:blocks.join(''),status:blocks.length?'included':'empty',files,bytes:used,truncated:files.some(f=>f.truncated)};
}
module.exports = { collect, collectProject, inspect, compileGlob, MAX_RULES_BYTES, MAX_READ_BYTES, RULES_RELATIVE, RULE_FILES, isRulesPath };

