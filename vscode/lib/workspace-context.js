'use strict';

// Bounded, local project context. The model never scans the workspace by
// itself: this module produces one explicit block that the user can preview,
// disable, or send with a question. Secrets and binaries are excluded before
// any bytes reach the service.

const path = require('node:path');
const localFs = require('node:fs/promises');
const {constants:fsConstants} = require('node:fs');
const projectRules = require('./project-rules');
const {checkKnowledgeFile} = require('./client');
const CREDENTIAL_TOKEN = /\b(?:tvijo_pk_[A-Za-z0-9_-]{15,}|sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/;

const MAX_DEPTH = 3;
const MAX_ENTRIES = 2500;
const MAX_TREE_LINES = 400;
const DEFAULT_MAX_BYTES = 200000;
const MAX_FILE_BYTES = 12000;

const EXCLUDED_DIRS = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'var', '.venv', 'venv', 'env',
  'dist', 'build', 'out', 'target', 'coverage', '__pycache__', '.pytest_cache',
  '.mypy_cache', '.ruff_cache', '.next', '.nuxt', '.cache', '.idea', '.vscode',
  'vendor', 'obj', 'artifacts', 'tmp'
]);

const EXCLUDED_FILE = /^(?:\.env(?:\.|$)|\.npmrc$|\.netrc$|secrets?\.|credentials?\.|auth\.json$|id_rsa|id_ed25519|.*\.(?:db|sqlite|sqlite3|log|vsix|zip|tar|gz|tgz|png|jpe?g|gif|webp|ico|pdf|pem|key|p12|pfx|crt|der|bin|exe|dll|so|dylib|woff2?|ttf|mp4|mov|webm)$)/i;

const PRIORITY = [
  'README.md', 'README_RU.md', 'readme.md',
  'package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'requirements.txt',
  'Makefile', 'docker-compose.yml', 'compose.yml'
];

function excluded(name, isDirectory) {
  if (isDirectory) return EXCLUDED_DIRS.has(name) || name.startsWith('.');
  return EXCLUDED_FILE.test(name);
}

// A fixed-size read remains bounded even if a file grows after provider stat.
async function readBoundedLocal(absolute) {
  const before = await localFs.lstat(absolute);
  if (!before.isFile() || before.isSymbolicLink()) return null;
  const handle = await localFs.open(absolute, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0) | (fsConstants.O_NONBLOCK || 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.ino !== before.ino || stat.dev !== before.dev) return null;
    if (stat.size > MAX_FILE_BYTES) return {tooLarge:true};
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
    let used = 0;
    while (used < buffer.length) {
      const {bytesRead} = await handle.read(buffer,used,buffer.length-used,used);
      if (!bytesRead) break;
      used += bytesRead;
    }
    return used > MAX_FILE_BYTES ? {tooLarge:true} : {bytes:buffer.subarray(0,used)};
  } finally { await handle.close(); }
}

function decode(bytes) {
  try { return Buffer.from(bytes).toString('utf8'); } catch { return ''; }
}

function printable(text) {
  const bad = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
  return bad <= Math.max(1, text.length * 0.01);
}

function sameFolder(a, b) {
  return !!a?.uri && !!b?.uri && a.uri.scheme === b.uri.scheme &&
    (a.uri.authority || '') === (b.uri.authority || '') && a.uri.fsPath === b.uri.fsPath;
}

async function collect(vscode, { document = null, selectionText = '', maxBytes = DEFAULT_MAX_BYTES, knownPaths = [], knownSecrets = [], contextMode = 'on', folder: requestedFolder = null, selectedPaths = null, selectionForFolder, allowRules } = {}) {
  const folders = vscode.workspace.workspaceFolders || [];
  if (!folders.length) return { text: '', summary: { root: '', files: 0, bytes: 0, truncated: false, activePath: '', rules: { status: 'unavailable' } } };
  const requested = requestedFolder && require('./active-workspace').validFolder(vscode,requestedFolder) ? requestedFolder : null;
  const activeCandidate = document ? vscode.workspace.getWorkspaceFolder(document.uri) : null;
  const activeFolder = activeCandidate && folders.find(candidate => sameFolder(candidate, activeCandidate));
  if (requestedFolder && !requested) throw new Error('The selected workspace folder is no longer available.');
  const folder = requested || activeFolder || folders[0];
  if (typeof selectionForFolder === 'function') selectedPaths = selectionForFolder(folder);
  const selected = Array.isArray(selectedPaths) ? new Set(selectedPaths.filter(name => typeof name === 'string' && name && !name.includes('/') && !name.includes('\\') && name !== '..')) : null;
  const included = relative => !selected || selected.has(relative.split('/')[0]);
  const root = folder.uri;
  const rootName = path.basename(folder.uri.fsPath);
  const limit = Math.min(Math.max(Number(maxBytes) || DEFAULT_MAX_BYTES, 4096), 1000000);
  const tree = [];
  const seen = new Set();
  let entries = 0;
  let truncated = false;
  let skippedLarge = 0, skippedSensitive = 0, skippedUnsupported = 0;
  const sensitive = (name,bytes) => checkKnowledgeFile(name,bytes) || CREDENTIAL_TOKEN.test(decode(bytes)) || (Array.isArray(knownSecrets) && knownSecrets.some(secret => typeof secret === 'string' && secret.length >= 4 && decode(bytes).includes(secret)));

  const queue = [{ uri: root, depth: 0, prefix: '' }];
  while (queue.length && entries < MAX_ENTRIES && tree.length < MAX_TREE_LINES) {
    const current = queue.shift();
    let listing = [];
    try { listing = await vscode.workspace.fs.readDirectory(current.uri); } catch { continue; }
    listing.sort((a, b) => (a[1] === b[1] ? a[0].localeCompare(b[0]) : a[1] === vscode.FileType.Directory ? -1 : 1));
    for (const [name, type] of listing) {
      if (entries >= MAX_ENTRIES || tree.length >= MAX_TREE_LINES) { truncated = true; break; }
      const isDir = type === vscode.FileType.Directory;
      if ((type & vscode.FileType.SymbolicLink) || excluded(name, isDir)) continue;
      if (!current.prefix && !included(name)) continue;
      entries += 1;
      const relative = current.prefix ? current.prefix + '/' + name : name;
      tree.push(relative + (isDir ? '/' : ''));
      if (isDir && current.depth + 1 < MAX_DEPTH) queue.push({ uri: vscode.Uri.joinPath(current.uri, name), depth: current.depth + 1, prefix: relative });
    }
  }

  const parts = [];
  let used = 0;
  const push = (text) => {
    const bytes = Buffer.byteLength(text, 'utf8');
    if (used + bytes > limit) { truncated = true; return false; }
    parts.push(text); used += bytes; return true;
  };

  const absoluteToRelative = (uri) => {
    if (!uri || uri.scheme !== 'file' || (uri.authority || '') !== '' || root.scheme !== 'file' || (root.authority || '') !== '') return '';
    const rel = path.relative(folder.uri.fsPath, uri.fsPath);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return '';
    return rel.split(path.sep).join('/');
  };

  const activePath = document ? absoluteToRelative(document.uri) : '';
  push('[WORKSPACE CONTEXT]\n');
  push('root: ' + rootName + '\n');
  push('files: ' + tree.length + (truncated ? ' (bounded; more files not shown)' : '') + '\n');
  push('secrets and binaries are excluded locally\n');
  push('tree:\n' + tree.map((item) => '  ' + item).join('\n') + '\n');

  for (const name of new Set([...PRIORITY, ...(selected || [])])) {
    if (!included(name) || EXCLUDED_FILE.test(name)) continue;
    const uri = vscode.Uri.joinPath(root, name);
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if ((stat.type & vscode.FileType.Directory) || (stat.type & vscode.FileType.SymbolicLink)) continue;
      const customFile = selected !== null && !PRIORITY.includes(name);
      if ((Number.isFinite(stat.size) && stat.size > MAX_FILE_BYTES) || (customFile && (!Number.isSafeInteger(stat.size) || stat.size < 0))) { skippedLarge++; continue; }
      let bytes;
      if (customFile) {
        if (uri.scheme !== 'file' || uri.authority) { skippedUnsupported++; continue; }
        const result = await readBoundedLocal(uri.fsPath);
        if (!result) continue;
        if (result.tooLarge) { skippedLarge++; continue; }
        bytes = result.bytes;
      } else bytes = await vscode.workspace.fs.readFile(uri);
      if (selected !== null && sensitive(name,bytes)) { skippedSensitive++; continue; }
      seen.add(name);
      const text = decode(bytes.subarray(0, MAX_FILE_BYTES));
      if (!text || !printable(text)) continue;
      if (!push('\n--- ' + name + ' ---\n' + text + '\n')) break;
    } catch { /* A missing manifest is normal. */ }
  }

  if (document && activePath && !projectRules.isRulesPath(activePath) && included(activePath) && activePath !== '.tvijo' && !activePath.startsWith('.tvijo/') && !seen.has(activePath) && !EXCLUDED_FILE.test(path.basename(activePath)) && !activePath.split('/').some((part) => EXCLUDED_DIRS.has(part) || part.startsWith('.'))) {
    seen.add(activePath);
    const body = selectionText && !document.isDirty ? selectionText : document.getText();
    const clipped = body.slice(0, MAX_FILE_BYTES);
    const label = selectionText ? 'active selection' : 'active file';
    const start = selectionText ? document.selection.start.line + 1 : 1;
    if (selected !== null && sensitive(activePath,Buffer.from(clipped))) skippedSensitive++;
    else {
      // Existing callers already authorize collection. Read the opt-in here so
      // chat, agent and preview share one policy without host/call-site changes.
      const semanticConfigured = () => vscode.workspace.getConfiguration?.('tvijo', document.uri)?.get('semanticContext', false) === true;
      const sourcePermitted = () => {
        const config = vscode.workspace.getConfiguration?.('tvijo', document.uri);
        const selection = typeof selectionForFolder === 'function' ? selectionForFolder(folder) : selectedPaths;
        return config?.get('workspaceContext', 'ask') !== 'off' &&
          contextMode !== 'off' && vscode.workspace.isTrusted === true && !document.isClosed &&
          absoluteToRelative(document.uri) === activePath && require('./active-workspace').validFolder(vscode, folder) &&
          (!Array.isArray(selection) || selection.includes(activePath.split('/')[0])) &&
          !activePath.split('/').some(part => excluded(part, false) || /^(?:secrets?|credentials?)(?:$|[._-])/i.test(part)) &&
          !require('./symbol-context').containsCredentialToken(activePath) &&
          !sensitive(activePath, Buffer.from(activePath));
      };
      const semanticAllowed = () => semanticConfigured() && sourcePermitted() && !selectionText;
      let outline = null;
      let sourceAllowed = true;
      let sourceCurrent = true;
      let sourceClipped = clipped;
      try {
        // Scan the whole active source, before provider dispatch; clipping or a
        // selection must never hide a secret from this gate. The existing file
        // filter also refuses >512 KiB, invalid UTF-8 and binary text.
        if (semanticConfigured()) {
          // An authorized excerpt must stay an excerpt, including dirty buffers.
          if (selectionText) sourceClipped = selectionText.slice(0, MAX_FILE_BYTES);
          // Provider eligibility is narrower than source permission (e.g. a
          // selected excerpt). Reject forbidden/sensitive source even when no
          // provider call will be made, rather than falling back around policy.
          sourceCurrent = sourcePermitted();
          const symbols = require('./symbol-context');
          if (sourceCurrent) sourceAllowed = body.length <= 512 * 1024 && printable(body) &&
            !sensitive(activePath, Buffer.from(body)) && !symbols.containsCredentialToken(body);
          if (sourceCurrent && sourceAllowed && !selectionText) {
            const version = document.version;
            const identity = symbols.uriIdentity(document.uri);
            outline = await symbols.collectOutline(vscode, {
              document, root, activePath, sensitive, allowed:semanticAllowed,
              maxBytes:Math.max(0, limit - used - Buffer.byteLength('[END WORKSPACE CONTEXT]\n'))
            });
            // Revoked access or a changed document must not re-enter through
            // the source fallback after its symbol result was rejected.
            const current = () => semanticAllowed() && document.version === version &&
              symbols.uriIdentity(document.uri) === identity;
            sourceCurrent = current() && await symbols.authorizedFile(root, document.uri) && current();
          }
        }
      } catch { sourceCurrent = false; }
      if (!sourceAllowed) skippedSensitive++;
      else if (sourceCurrent) push(outline || '\n--- ' + label + ': ' + activePath + (selectionText ? ' (lines ' + start + '-' + (document.selection.end.line + 1) + ')' : '') + ' ---\n' + sourceClipped + '\n');
    }
  }

  const rulesStatus={status:'separate'};
  push('[END WORKSPACE CONTEXT]\n');
  const text = parts.join('');
  return { text, summary: { root: rootName, files: tree.length, bytes: Buffer.byteLength(text, 'utf8'), truncated, skippedLarge, skippedSensitive, skippedUnsupported, activePath, rules: rulesStatus } };
}

module.exports = { collect, DEFAULT_MAX_BYTES, EXCLUDED_DIRS, EXCLUDED_FILE };
