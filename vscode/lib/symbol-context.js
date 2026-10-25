'use strict';

// Active-document outline only. No index, source edits, or language-server setup.
const path = require('node:path');
const fs = require('node:fs/promises');

const MAX_SYMBOLS = 64;
const MAX_DEPTH = 4;
const MAX_BYTES = 4096;
const MAX_VISITS = 256;
const PROVIDER_TIMEOUT_MS = 200;
const KINDS = ['File', 'Module', 'Namespace', 'Package', 'Class', 'Method',
  'Property', 'Field', 'Constructor', 'Enum', 'Interface', 'Function',
  'Variable', 'Constant', 'String', 'Number', 'Boolean', 'Array', 'Object',
  'Key', 'Null', 'EnumMember', 'Struct', 'Event', 'Operator', 'TypeParameter'];
// Also catch credential tokens embedded in identifiers (underscore is a word
// character, so the collector's word-boundary token check alone is insufficient).
const EMBEDDED_TOKEN = /tvijo_pk_[A-Za-z0-9_-]{15,}|sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/;
const UNSAFE_NAME = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
const containsCredentialToken = text => EMBEDDED_TOKEN.test(text);

function uriKey(uri) {
  if (!uri || uri.scheme !== 'file' || uri.authority || uri.query || uri.fragment ||
      typeof uri.fsPath !== 'string' || !path.isAbsolute(uri.fsPath)) return null;
  return path.normalize(uri.fsPath);
}

// Keep the original URI spelling as well as canonical scope identity: a changed
// document URI invalidates an awaited result even when it normalizes identically.
const uriIdentity = uri => JSON.stringify([uri?.scheme, uri?.authority || '', uri?.fsPath,
  uri?.path || '', uri?.query || '', uri?.fragment || '']);

// Check every component: provider metadata may omit symbolic-link flags. Fail
// closed for missing/virtual files, links in parent directories, and root aliases.
async function authorizedFile(rootUri, documentUri) {
  const root = uriKey(rootUri), file = uriKey(documentUri);
  if (!root || !file) return false;
  const relative = path.relative(root, file);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return false;
  if (await fs.realpath(root) !== root || !(await fs.lstat(root)).isDirectory()) return false;
  let current = root;
  const parts = relative.split(path.sep);
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || (i === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) return false;
  }
  return await fs.realpath(file) === file;
}

function rangeLines(range, lineCount) {
  const start = range?.start, end = range?.end;
  if (!start || !end || !Number.isSafeInteger(start.line) || !Number.isSafeInteger(end.line) ||
      !Number.isSafeInteger(start.character) || !Number.isSafeInteger(end.character) ||
      start.line < 0 || start.character < 0 || end.character < 0 || end.line < start.line ||
      end.line >= lineCount || (start.line === end.line && end.character < start.character)) return null;
  return [start.line + 1, end.line + 1];
}

function formatOutline(symbols, {documentKey, activePath, lineCount, sensitive, maxBytes}) {
  if (!Array.isArray(symbols)) return null;
  const limit = Math.min(MAX_BYTES, Math.max(0, Math.floor(maxBytes)));
  const header = '\n--- active symbol outline: ' + activePath + ' (bounded data) ---\n';
  let bytes = Buffer.byteLength(header), count = 0, visits = 0;
  if (bytes >= limit) return null;
  const lines = [header], seen = new WeakSet();
  const stack = [{items:symbols, index:0, depth:0}];
  while (stack.length && visits < MAX_VISITS && count < MAX_SYMBOLS) {
    const frame = stack[stack.length - 1];
    if (frame.index >= frame.items.length) { stack.pop(); continue; }
    const item = frame.items[frame.index++];
    visits++;
    if (!item || typeof item !== 'object' || Array.isArray(item) || seen.has(item)) continue;
    seen.add(item);
    if (typeof item.name !== 'string' || !item.name.length || item.name.length > 512 ||
        Buffer.byteLength(item.name) > 512 || !item.name.trim() ||
        UNSAFE_NAME.test(item.name) || containsCredentialToken(item.name) || sensitive(activePath, Buffer.from(item.name)) ||
        !Number.isInteger(item.kind) || !KINDS[item.kind]) continue;
    // SymbolInformation has a location URI; never accept another file, remote
    // authority, query/fragment alias, or a malformed location as DocumentSymbol.
    const information = 'location' in item;
    if (information && uriKey(item.location?.uri) !== documentKey) continue;
    const range = rangeLines(information ? item.location?.range : item.range, lineCount);
    if (!range) continue;
    const line = '  '.repeat(frame.depth) + KINDS[item.kind] + ' L' + range[0] + '-' + range[1] + ': ' + item.name + '\n';
    const size = Buffer.byteLength(line);
    if (bytes + size > limit) break; // Keep complete UTF-8 lines only.
    lines.push(line); bytes += size; count++;
    if (!information && frame.depth + 1 < MAX_DEPTH && Array.isArray(item.children)) {
      stack.push({items:item.children, index:0, depth:frame.depth + 1});
    }
  }
  return count ? lines.join('') : null;
}

async function collectOutline(vscode, {document, root, activePath, sensitive, allowed, maxBytes}) {
  try {
    if (!allowed() || typeof vscode.commands?.executeCommand !== 'function') return null;
    const key = uriKey(document.uri), identity = uriIdentity(document.uri);
    const version = document.version, lineCount = document.lineCount;
    if (!key || !Number.isSafeInteger(version) || !Number.isSafeInteger(lineCount) || lineCount <= 0 ||
        !await authorizedFile(root, document.uri)) return null;
    const current = () => allowed() && !document.isClosed && document.version === version &&
      uriKey(document.uri) === key && uriIdentity(document.uri) === identity;
    if (!current()) return null;
    let timer;
    let symbols;
    try {
      symbols = await Promise.race([
        Promise.resolve().then(() => current() ? vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri) : null),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), PROVIDER_TIMEOUT_MS); })
      ]);
    } finally { clearTimeout(timer); }
    if (!current() || !symbols || !await authorizedFile(root, document.uri) || !current()) return null;
    const text = formatOutline(symbols, {documentKey:key, activePath, lineCount, sensitive, maxBytes});
    return current() ? text : null;
  } catch { return null; } // Missing provider, malformed objects, filesystem errors.
}

module.exports = {collectOutline, authorizedFile, uriIdentity, containsCredentialToken, MAX_SYMBOLS, MAX_DEPTH, MAX_BYTES, MAX_VISITS, PROVIDER_TIMEOUT_MS};
