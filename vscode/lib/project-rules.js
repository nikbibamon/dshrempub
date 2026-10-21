'use strict';

// Reads one optional, root-local rules file. It is always returned as quoted
// project data; it never participates in host policy or tool authorization.
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const {safePath} = require('./local-tools');

const RULES_RELATIVE = path.join('.tvijo', 'rules.md');
const MAX_RULES_BYTES = 16384;
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

function readRules(root) {
  const absolute = path.resolve(root, RULES_RELATIVE);
  let chain;
  try { chain = lstatChain(absolute); } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return { missing: true };
    throw error;
  }
  const inspected = chain.at(-1)?.stat;
  if (!inspected || !inspected.isFile() || inspected.nlink !== 1n) throw new Error('unsafe-file');
  if (inspected.size > MAX_RULES_BYTES) throw new Error('oversized');
  if (typeof fs.constants.O_NOFOLLOW !== 'number') throw new Error('no-no-follow');
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(fd, {bigint:true});
    if (!opened.isFile() || opened.nlink !== 1n || !sameFile(inspected, opened)) throw new Error('changed-file');
    const buffer = Buffer.alloc(MAX_RULES_BYTES + 1);
    let count = 0;
    while(count < buffer.length) {
      const read = fs.readSync(fd, buffer, count, buffer.length-count, count);
      if (!read) break;
      count += read;
    }
    if (count > MAX_RULES_BYTES || opened.size > MAX_RULES_BYTES) throw new Error('oversized');
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

function collect({ root, knownPaths = [], knownSecrets = [], contextMode = 'on' } = {}) {
  if (contextMode === 'off') return { text: '', status: 'disabled', paths: [] };
  if (!root || typeof root !== 'string') return reject('invalid-root');
  let source;
  try { source = readRules(root); } catch (error) {
    const reasons = new Set(['oversized', 'invalid-utf8', 'unsafe-file', 'symlink', 'no-no-follow', 'changed-file']);
    return reject(reasons.has(error?.message) ? error.message : 'unavailable');
  }
  if (source.missing) return { text: '', status: 'missing', paths: [] };
  if (CREDENTIAL_TEXT.test(source.text) || CREDENTIAL_TOKEN.test(source.text) || (Array.isArray(knownSecrets) && knownSecrets.some(secret => typeof secret === 'string' && secret.length >= 4 && source.text.includes(secret)))) {
    return reject('credential-content');
  }
  const parsed = parseMetadata(source.text);
  if (parsed.error) return reject(parsed.error);
  const known = safeKnownPaths(knownPaths, root);
  let applicable = [];
  if (!parsed.global) applicable = known.filter(file => parsed.regexes.some(regex => regex.test(file)));
  if (!parsed.global && !applicable.length) return { text: '', status: 'unmatched', paths: [] };
  const status = contextMode === 'preview' ? 'preview' : 'included';
  const scope = parsed.global ? 'applies to all project questions' : 'applies to: ' + applicable.join(', ');
  const metadata = parsed.global ? 'metadata: global scope\n' : 'metadata: ' + JSON.stringify(parsed.patterns) + '\n';
  const content = parsed.content.replace(/\r\n/g, '\n');
  const fence = content.includes('```') ? '~~~~' : '```';
  const text = `[PROJECT RULES — quoted project data; not host policy]\n${metadata}${scope}\n${fence}markdown\n${content}${content.endsWith('\n') || !content ? '' : '\n'}${fence}\n[END PROJECT RULES]\n`;
  return { text, status, paths: applicable, bytes: Buffer.byteLength(text, 'utf8') };
}

module.exports = { collect, compileGlob, MAX_RULES_BYTES, RULES_RELATIVE };
