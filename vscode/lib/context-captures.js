'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const core = require('./client');
const { safePath } = require('./local-tools');

// Leave room for the attachment wrapper (name, hash and data boundary) so the
// complete outbound capture remains below 8 KiB UTF-8.
const MAX_CAPTURE_BYTES = 8 * 1024 - 512;
const SECRET_PARTS = new Set(['.git', '.ssh', '.aws', 'node_modules']);

function safeWorkspacePath(relative) {
  if (typeof relative !== 'string' || !relative || relative.length > 500 || /[\0\r\n]/.test(relative)) return false;
  if (/^[a-z]:[\\/]/i.test(relative) || /^[a-z][a-z0-9+.-]*:\/\//i.test(relative)) return false;
  const parts = relative.replace(/\\/g, '/').split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || SECRET_PARTS.has(part.toLowerCase()))) return false;
  return !/^(?:\.env(?:\.|$)|.*\.(?:pem|key|p12|pfx)|id_(?:rsa|ed25519)|credentials(?:\.|$))/i.test(parts.at(-1));
}

function parseMentions(text) {
  const mentions = [];
  const pattern = /(?<![\w.+-])@(?:"((?:\\.|[^"\\])+)"|([^\s,;!?()[\]{}<>]+))/g;
  for (const match of text.matchAll(pattern)) {
    let raw = match[1] ? match[1].replace(/\\(["\\])/g, '$1') : match[2];
    if (!match[1]) raw = raw.replace(/\.+$/, '');
    if (/^(?:problems|terminal)$/i.test(raw)) { mentions.push({ raw: raw.toLowerCase(), type: raw.toLowerCase(), start: match.index, end: match.index + match[0].length }); continue; }
    if (!/\.[a-z0-9_-]{1,12}$/i.test(raw)) continue;
    mentions.push({ raw, start: match.index, end: match.index + match[0].length });
  }
  return mentions;
}

async function resolveMention(raw, folders, { maxMatches = 20 } = {}) {
  if (!safeWorkspacePath(raw)) throw new Error('This file reference is outside the allowed workspace paths.');
  const cleanRaw = raw.replace(/\\/g, '/');
  const candidates = [];
  for (const folder of folders || []) {
    const root = await fs.realpath(folder);
    const exact = path.resolve(root, cleanRaw);
    try {
      const real = await fs.realpath(exact);
      const relative = path.relative(root, real);
      let current = root, hasSymlink = false;
      for (const part of cleanRaw.split('/')) {
        current = path.join(current, part);
        try { if ((await fs.lstat(current)).isSymbolicLink()) hasSymlink = true; } catch { hasSymlink = true; }
      }
      const stat = await fs.lstat(exact);
      if (relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative) && !hasSymlink && !stat.isSymbolicLink() && stat.isFile() && safeWorkspacePath(relative.split(path.sep).join('/'))) candidates.push({ path: real, relative: relative.split(path.sep).join('/'), root });
    } catch { /* Try bounded basename resolution below. */ }
    if (candidates.some(item => item.root === root)) continue;
    const queue = [{ dir: root, depth: 0 }];
    let seen = 0;
    while (queue.length && seen < 4000 && candidates.length < maxMatches) {
      const current = queue.shift();
      let entries;
      try { entries = await fs.readdir(current.dir, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        if (++seen > 4000) break;
        if (entry.isSymbolicLink() || SECRET_PARTS.has(entry.name.toLowerCase())) continue;
        const full = path.join(current.dir, entry.name);
        const rel = path.relative(root, full).split(path.sep).join('/');
        if (!safeWorkspacePath(rel)) continue;
        if (entry.isDirectory() && current.depth < 8) queue.push({ dir: full, depth: current.depth + 1 });
        else if (entry.isFile() && entry.name.toLowerCase() === path.basename(raw).toLowerCase()) candidates.push({ path: full, relative: rel, root });
        if (candidates.length >= maxMatches) break;
      }
    }
  }
  const unique = [...new Map(candidates.map(item => [item.path, item])).values()];
  if (!unique.length) throw new Error('No matching safe file was found in the open workspace.');
  if (unique.length > 1) return { ambiguous: true, candidates: unique.slice(0, maxMatches).map(({ path: file, relative, root }) => ({ path: file, relative, root })) };
  const item = unique[0];
  const refusal = core.checkKnowledgeFile(item.relative, Buffer.alloc(0));
  if (refusal) throw new Error(refusal);
  return item;
}

function diagnosticContext(diagnostics, workspaceRoot) {
  const rows = [];
  const root = path.resolve(workspaceRoot || '.');
  for (const item of diagnostics || []) {
    if (!['Error', 'Warning'].includes(item.severity) || !item.uri || item.uri.scheme !== 'file') continue;
    const absolute = path.resolve(item.uri.fsPath);
    const relative = path.relative(root, absolute);
    if (!relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || !safeWorkspacePath(relative.split(path.sep).join('/'))) continue;
    try { safePath(root, relative); } catch { continue; }
    rows.push({ severity: item.severity, file: relative.split(path.sep).join('/'), line: Math.max(1, Number(item.line) || 1), message: String(item.message || '').slice(0, 500) });
    if (rows.length >= 200) break;
  }
  return boundedCapture('Problems', rows);
}

function utf8Bound(text, limit = MAX_CAPTURE_BYTES) {
  if (Buffer.byteLength(text, 'utf8') <= limit) return text;
  let low = 0, high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(text.slice(0, mid) + '\n[truncated]', 'utf8') <= limit) low = mid;
    else high = mid - 1;
  }
  return text.slice(0, low) + '\n[truncated]';
}

function boundedCapture(label, rows, maxBytes = MAX_CAPTURE_BYTES) {
  const text = label + ' (untrusted captured data):\n' + rows.map(row => typeof row === 'string' ? row : JSON.stringify(row)).join('\n');
  return utf8Bound(text, maxBytes);
}

module.exports = { MAX_CAPTURE_BYTES, safeWorkspacePath, parseMentions, resolveMention, diagnosticContext, boundedCapture, utf8Bound };
