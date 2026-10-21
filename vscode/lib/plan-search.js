'use strict';

const fs = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const MAX_QUERY_BYTES = 256;
const MAX_ENTRIES = 2500;
const MAX_FILES = 1000;
const MAX_DEPTH = 8;
const MAX_FILE_BYTES = 128 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;
const MAX_RESULT_BYTES = 7680;
const MAX_SNIPPET_BYTES = 300;
const EXCLUDED = new Set([
  '.git', '.hg', '.svn', '.ssh', '.aws', '.tvijo', 'node_modules', '.venv',
  'venv', 'dist', 'build', 'target', '__pycache__', '.pytest_cache',
]);
const SECRET = /^(?:\.env(?:\.|$)|secrets?\.|credentials?\.|auth\.json$|\.npmrc$|\.netrc$|\.pypirc$|id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx|crt|der)$)/i;
const NOFOLLOW = fssync.constants.O_NOFOLLOW || 0;

function identity(stat) {
  return ['dev', 'ino', 'size', 'mode', 'nlink', 'mtimeNs', 'ctimeNs']
    .map((key) => String(stat[key])).join(':');
}

function pathParts(relative) {
  return relative.split(path.sep).filter(Boolean);
}

function excluded(relative, name, secretFile) {
  const parts = pathParts(relative);
  return parts.some((part) => part.startsWith('.') || EXCLUDED.has(part) || secretFile.test(part)) ||
    name.startsWith('.') || EXCLUDED.has(name) || secretFile.test(name);
}

function utf8Prefix(value, maxBytes) {
  let out = '';
  let bytes = 0;
  for (const char of value) {
    const size = Buffer.byteLength(char, 'utf8');
    if (bytes + size > maxBytes) break;
    out += char;
    bytes += size;
  }
  return out;
}

function snippet(line, index) {
  const chars = Array.from(line);
  let left = 0, bytesBefore = 0;
  while (left < chars.length && bytesBefore < index) bytesBefore += Buffer.byteLength(chars[left++], 'utf8');
  let start = Math.max(0, left - 80);
  let end = start;
  while (end < chars.length && Buffer.byteLength(chars.slice(start, end + 1).join(''), 'utf8') <= MAX_SNIPPET_BYTES - 6) end++;
  if (left > end) {
    start = left;
    end = start;
    while (end < chars.length && Buffer.byteLength(chars.slice(start, end + 1).join(''), 'utf8') <= MAX_SNIPPET_BYTES - 6) end++;
  }
  const prefix = start > 0 ? '…' : '';
  const suffix = end < chars.length ? '…' : '';
  return utf8Prefix(prefix + chars.slice(start, end).join('') + suffix, MAX_SNIPPET_BYTES);
}

function resultSize(result) {
  return Buffer.byteLength(JSON.stringify(result), 'utf8');
}

function cancelled(signal) {
  return Boolean(signal && signal.aborted);
}

async function search({ root, query, relative = '.', max = 20, guard = async () => {}, signal, safePath, secretFile = SECRET, excludedDirs = EXCLUDED } = {}) {
  if (typeof safePath !== 'function') throw new Error('A workspace path guard is required.');
  if (typeof query !== 'string' || Buffer.byteLength(query, 'utf8') < 1 || Buffer.byteLength(query, 'utf8') > MAX_QUERY_BYTES) {
    throw new Error('The literal query must be 1 to 256 UTF-8 bytes.');
  }
  if (!Number.isInteger(max) || max < 1 || max > 50) throw new Error('The result limit must be from 1 to 50.');

  const output = { mode: 'literal', matches: [], truncated: false, partial: false, skipped: {} };
  const countSkip = (reason) => {
    output.skipped[reason] = (output.skipped[reason] || 0) + 1;
    output.partial = true;
  };
  const guardFailures = new Set();
  const check = async () => {
    if (cancelled(signal)) return false;
    try { await guard(); } catch (error) { guardFailures.add(error); throw error; }
    return !cancelled(signal);
  };
  if (!(await check())) return { ...output, cancelled: true };

  const absoluteRoot = path.resolve(root);
  const requested = safePath(root, relative || '.');
  const scopeRelative = path.relative(absoluteRoot, requested) || '.';
  if (scopeRelative !== '.' && excluded(scopeRelative, path.basename(requested), secretFile)) {
    countSkip('excluded');
    return output;
  }
  const cwdStat = await fs.lstat(requested);
  if (cwdStat.isSymbolicLink()) throw new Error('The search scope is unsafe.');
  if (!cwdStat.isDirectory() && !cwdStat.isFile()) throw new Error('The search scope is not a regular file or directory.');

  const stack = [{ target: requested, rel: path.relative(absoluteRoot, requested) || '.', depth: 0, directory: cwdStat.isDirectory() }];
  let entriesSeen = 0;
  let filesSeen = 0;
  let bytesSeen = 0;

  while (stack.length && output.matches.length < max) {
    if (!(await check())) return { ...output, cancelled: true };
    const item = stack.pop();
    if (item.directory) {
      if (item.depth > MAX_DEPTH) { countSkip('depth_limit'); continue; }
      let dir;
      try {
        if (!(await check())) return { ...output, cancelled: true };
        safePath(root, item.rel);
        dir = await fs.opendir(item.target);
      } catch (error) {
        if (guardFailures.has(error)) throw error;
        if (cancelled(signal)) return { ...output, cancelled: true };
        countSkip(error.code === 'EACCES' ? 'unreadable' : 'changed');
        continue;
      }
      try {
        for await (const entry of dir) {
          if (!(await check())) return { ...output, cancelled: true };
          entriesSeen++;
          if (entriesSeen > MAX_ENTRIES) {
            output.truncated = true;
            countSkip('entry_limit');
            stack.length = 0;
            break;
          }
          const rel = item.rel === '.' ? entry.name : path.join(item.rel, entry.name);
          if (excluded(rel, entry.name, secretFile) || excludedDirs.has(entry.name) || entry.isSymbolicLink()) {
            countSkip(entry.isSymbolicLink() ? 'symlink' : 'excluded');
            continue;
          }
          if (!entry.isDirectory() && !entry.isFile()) { countSkip('unsupported'); continue; }
          let target;
          try { target = safePath(root, rel); }
          catch { countSkip('unsafe_path'); continue; }
          if (entry.isDirectory()) {
            if (item.depth < MAX_DEPTH) stack.push({ target, rel, depth: item.depth + 1, directory: true });
            else countSkip('depth_limit');
          } else if (filesSeen < MAX_FILES) {
            stack.push({ target, rel, depth: item.depth + 1, directory: false });
            filesSeen++;
          } else {
            output.truncated = true;
            countSkip('file_limit');
          }
        }
      } catch (error) {
        if (guardFailures.has(error)) throw error;
        if (cancelled(signal)) return { ...output, cancelled: true };
        countSkip(error.code === 'EACCES' ? 'unreadable' : 'changed');
      }
      continue;
    }

    if (!(await check())) return { ...output, cancelled: true };
    let handle;
    try {
      safePath(root, item.rel);
      handle = await fs.open(item.target, fssync.constants.O_RDONLY | NOFOLLOW);
      const before = await handle.stat({ bigint: true });
      if (!before.isFile() || before.nlink !== 1n) { countSkip('unsafe_file'); continue; }
      if (before.size > BigInt(MAX_FILE_BYTES)) { countSkip('oversized'); continue; }
      if (bytesSeen + Number(before.size) > MAX_TOTAL_BYTES) {
        output.truncated = true;
        countSkip('byte_limit');
        break;
      }
      const expected = Number(before.size);
      bytesSeen += expected; // Charge attempted reads even when the snapshot later changes.
      const buffer = Buffer.alloc(expected);
      let offset = 0;
      while (offset < expected) {
        if (!(await check())) return { ...output, cancelled: true };
        const { bytesRead } = await handle.read(buffer, offset, expected - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (!(await check())) return { ...output, cancelled: true };
      const after = await handle.stat({ bigint: true });
      safePath(root, item.rel);
      const pathStat = await fs.lstat(item.target, { bigint: true });
      if (offset !== expected || identity(before) !== identity(after) || identity(after) !== identity(pathStat) || !pathStat.isFile() || pathStat.nlink !== 1n) {
        countSkip('changed');
        continue;
      }
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch { countSkip('invalid_utf8'); continue; }
      if (text.includes('\0')) { countSkip('binary'); continue; }

      const lines = text.split(/\r?\n/);
      for (let index = 0; index < lines.length && output.matches.length < max; index++) {
        const line = lines[index];
        const found = line.indexOf(query);
        if (found < 0) continue;
        const byteIndex = Buffer.byteLength(line.slice(0, found), 'utf8');
        const row = { path: item.rel === '.' ? path.basename(item.target) : item.rel, line: index + 1, text: snippet(line, byteIndex) };
        const candidate = { ...output, matches: [...output.matches, row] };
        if (resultSize(candidate) > MAX_RESULT_BYTES) {
          output.truncated = true;
          countSkip('result_limit');
          break;
        }
        output.matches.push(row);
        if (output.matches.length >= max) { output.truncated = true; output.partial = true; }
      }
    } catch (error) {
      if (guardFailures.has(error)) throw error;
      if (cancelled(signal)) return { ...output, cancelled: true };
      if (error.code === 'ENOENT' || error.code === 'ELOOP' || error.code === 'ESTALE') countSkip('changed');
      else if (error.code === 'EACCES') countSkip('unreadable');
      else countSkip('unsafe_file');
    } finally {
      if (handle) await handle.close().catch(() => {});
    }
  }
  if (stack.length && output.matches.length >= max) output.truncated = true;
  if (resultSize(output) > MAX_RESULT_BYTES) return { mode: 'literal', matches: [], truncated: true, partial: true, skipped: { result_limit: 1 } };
  return output;
}

module.exports = { search };
