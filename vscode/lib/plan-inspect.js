'use strict';

const fs = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const { safePath } = require('./local-tools');

const MAX_FILES = 20;
const MAX_FILE_BYTES = 128 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;
const MAX_RESULT_BYTES = 7680;
const SECRET_FILE = /^(?:\.env(?:\.|$)|secrets?\.|credentials?\.|auth\.json$|\.npmrc$|\.netrc$|\.pypirc$|id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx|crt|der)$)/i;
const EXCLUDED_DIRS = new Set(['.git', '.hg', '.svn', '.ssh', '.aws', '.tvijo', 'node_modules', '.venv', 'venv', 'dist', 'build', 'target', '__pycache__', '.pytest_cache']);

function aborted(signal) {
  if (signal && signal.aborted) {
    const error = new Error('Inspection aborted.');
    error.name = 'AbortError';
    throw error;
  }
}

async function checkpoint(signal, guard) {
  aborted(signal);
  await guard();
  aborted(signal);
}

function diffCounts(before, after) {
  const left = before ? before.split(/\r\n|\n|\r/) : [];
  const right = after ? after.split(/\r\n|\n|\r/) : [];
  if (before && /[\r\n]$/.test(before)) left.pop();
  if (after && /[\r\n]$/.test(after)) right.pop();
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix++;
  let suffix = 0;
  while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix++;
  const removedLines = left.length - prefix - suffix;
  const addedLines = right.length - prefix - suffix;
  return { addedLines, removedLines, approximate: true };
}

function fileUriPath(document) {
  const uri = document && document.uri;
  if (!uri || uri.scheme !== 'file' || (uri.authority && uri.authority !== '')) return null;
  if (typeof uri.fsPath === 'string') return uri.fsPath;
  return null;
}

function relativeAllowed(root, filename) {
  const rel = path.relative(root, filename);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  if (parts.some((part) => !part || part.startsWith('.') || EXCLUDED_DIRS.has(part))) return null;
  if (SECRET_FILE.test(path.basename(filename))) return null;
  try {
    return safePath(root, rel);
  } catch (_) {
    return null;
  }
}

function sameFile(a, b) {
  return a.dev === b.dev && a.ino === b.ino;
}

async function readDisk(root, filename, maxBytes, signal, guard, onRead) {
  await checkpoint(signal, guard);
  let before;
  try {
    before = await fs.lstat(filename);
  } catch (error) {
    if (error.code === 'ENOENT') return { missing: true };
    if (['EBUSY', 'EACCES', 'EPERM', 'EIO'].includes(error.code)) return { skipped: 'busy_or_unavailable' };
    throw error;
  }
  await checkpoint(signal, guard);
  if (!before.isFile() || before.nlink !== 1 || before.size > MAX_FILE_BYTES || before.size > maxBytes) {
    const reason = before.size > maxBytes ? 'total_byte_limit' : (before.size > MAX_FILE_BYTES ? 'oversized_disk' : 'unsafe_disk');
    return { skipped: reason };
  }
  let handle;
  try {
    const noFollow = fssync.constants.O_NOFOLLOW || 0;
    safePath(root, path.relative(root, filename));
    handle = await fs.open(filename, fssync.constants.O_RDONLY | noFollow);
    await checkpoint(signal, guard);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || !sameFile(before, opened) || opened.size > MAX_FILE_BYTES || opened.size > maxBytes) {
      const reason = opened.size > maxBytes ? 'total_byte_limit' : (opened.size > MAX_FILE_BYTES ? 'oversized_disk' : 'unstable_disk');
      return { skipped: reason };
    }
    onRead(opened.size);
    const bytes = Buffer.alloc(opened.size);
    let read = 0;
    while (read < bytes.length) {
      await checkpoint(signal, guard);
      const part = await handle.read(bytes, read, bytes.length - read, read);
      if (!part.bytesRead) return { skipped: 'unstable_disk' };
      read += part.bytesRead;
    }
    const after = await handle.stat();
    let pathAfter;
    try { safePath(root, path.relative(root, filename)); pathAfter = await fs.lstat(filename); } catch (_) { return { skipped: 'unstable_disk' }; }
    await checkpoint(signal, guard);
    if (!sameFile(opened, after) || !sameFile(opened, pathAfter) || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs || pathAfter.size !== opened.size || pathAfter.mtimeMs !== opened.mtimeMs || pathAfter.ctimeMs !== opened.ctimeMs || pathAfter.nlink !== 1 || !pathAfter.isFile()) {
      return { skipped: 'unstable_disk' };
    }
    if (bytes.includes(0)) return { skipped: 'binary_disk' };
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (_) { return { skipped: 'binary_disk' }; }
    return { bytes, text };
  } catch (error) {
    if (error.code === 'ENOENT') return { missing: true };
    if (error.code === 'ELOOP') return { skipped: 'unsafe_disk' };
    if (['EBUSY', 'EACCES', 'EPERM', 'EIO'].includes(error.code)) return { skipped: 'busy_or_unavailable' };
    throw error;
  } finally {
    if (handle) await handle.close();
  }
}

function bufferText(document, Position) {
  if (typeof document.getText !== 'function') return null;
  if (typeof document.lineCount === 'number' && typeof document.offsetAt === 'function') {
    const position = typeof Position === 'function' ? new Position(document.lineCount, 0) : { line: document.lineCount, character: 0 };
    const end = document.offsetAt(position);
    if (!Number.isFinite(end) || end > MAX_FILE_BYTES) return null;
  }
  const text = document.getText();
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_FILE_BYTES || text.includes('\0')) return null;
  return text;
}

function resultBytes(result) {
  return Buffer.byteLength(JSON.stringify(result), 'utf8');
}

async function inspect({ vscode, root, operation, guard = async () => {}, signal }) {
  if (!['pwd', 'buffer_status', 'buffer_diff_stat'].includes(operation)) throw new Error('Unsupported plan inspection operation.');
  await checkpoint(signal, guard);
  if (operation === 'pwd') return { operation, scope: 'selected workspace', path: '.' };

  const canonicalRoot = await fs.realpath(root);
  await checkpoint(signal, guard);
  const result = { operation, scope: 'open dirty buffers', files: [], partial: false, skipped: [] };
  const documents = vscode && vscode.workspace && vscode.workspace.textDocuments;
  if (!Array.isArray(documents)) {
    result.partial = true;
    result.skipped.push({ reason: 'documents_unavailable' });
    return result;
  }
  let totalBytes = 0;
  let processed = 0;
  for (const document of documents) {
    if (!document || document.isDirty !== true) continue;
    if (processed >= MAX_FILES) {
      result.partial = true;
      result.skipped.push({ reason: 'file_limit' });
      break;
    }
    processed++;
    await checkpoint(signal, guard);
    const absolute = fileUriPath(document);
    const filename = absolute && relativeAllowed(canonicalRoot, absolute);
    if (!filename) {
      result.partial = true;
      result.skipped.push({ reason: 'unsafe_or_excluded_path' });
      continue;
    }
    const relative = path.relative(canonicalRoot, filename).split(path.sep).join('/');
    const version = document.version;
    if (operation === 'buffer_status') {
      const row = { path: relative, version, dirty: true };
      if (resultBytes({ ...result, files: [...result.files, row] }) > MAX_RESULT_BYTES - 96) {
        result.partial = true; result.skipped.push({ reason: 'result_byte_limit' }); break;
      }
      result.files.push(row); continue;
    }
    const text = bufferText(document, vscode && vscode.Position);
    if (text === null) {
      result.partial = true;
      result.skipped.push({ reason: 'oversized_or_unavailable_buffer' });
      continue;
    }
    const bytes = Buffer.byteLength(text, 'utf8');
    if (totalBytes + bytes > MAX_TOTAL_BYTES) {
      result.partial = true;
      result.skipped.push({ reason: 'total_byte_limit' });
      continue;
    }
    totalBytes += bytes;
    const disk = await readDisk(canonicalRoot, filename, MAX_TOTAL_BYTES - totalBytes, signal, guard, size => { totalBytes += size; });
    if (document.version !== version || document.isDirty !== true || document.getText() !== text) {
      result.partial = true;
      result.skipped.push({ reason: 'stale_buffer' });
      continue;
    }
    if (disk.skipped) {
      result.partial = true;
      result.skipped.push({ reason: disk.skipped });
      continue;
    }
    const diskText = disk.missing ? '' : disk.text;
    const delta = diffCounts(diskText, text);
    const row = {
      path: relative,
      version,
      addedLines: delta.addedLines,
      removedLines: delta.removedLines,
      approximate: true,
      rawBytesChanged: disk.missing || !disk.bytes.equals(Buffer.from(text, 'utf8')),
      diskMissing: !!disk.missing,
    };
    const next = { ...result, files: [...result.files, row] };
    if (resultBytes(next) > MAX_RESULT_BYTES - 96) {
      result.partial = true;
      result.skipped.push({ reason: 'result_byte_limit' });
      break;
    }
    result.files.push(row);
  }
  return result;
}

module.exports = { inspect };
