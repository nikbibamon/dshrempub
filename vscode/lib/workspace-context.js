'use strict';

// Bounded, local project context. The model never scans the workspace by
// itself: this module produces one explicit block that the user can preview,
// disable, or send with a question. Secrets and binaries are excluded before
// any bytes reach the service.

const path = require('node:path');
const projectRules = require('./project-rules');

const MAX_DEPTH = 3;
const MAX_ENTRIES = 2500;
const MAX_TREE_LINES = 400;
const DEFAULT_MAX_BYTES = 48000;
const MAX_FILE_BYTES = 12000;

const EXCLUDED_DIRS = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'var', '.venv', 'venv', 'env',
  'dist', 'build', 'out', 'target', 'coverage', '__pycache__', '.pytest_cache',
  '.mypy_cache', '.ruff_cache', '.next', '.nuxt', '.cache', '.idea', '.vscode',
  'vendor', 'obj', 'artifacts', 'tmp'
]);

const EXCLUDED_FILE = /^(?:\.env(?:\.|$)|secrets?\.|credentials?\.|auth\.json$|id_rsa|id_ed25519|.*\.(?:db|sqlite|sqlite3|log|vsix|zip|tar|gz|tgz|png|jpe?g|gif|webp|ico|pdf|pem|key|p12|pfx|crt|der|bin|exe|dll|so|dylib|woff2?|ttf|mp4|mov|webm)$)/i;

const PRIORITY = [
  'README.md', 'README_RU.md', 'readme.md', 'AGENTS.md', 'CLAUDE.md',
  'package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'requirements.txt',
  'Makefile', 'docker-compose.yml', 'compose.yml'
];

function excluded(name, isDirectory) {
  if (isDirectory) return EXCLUDED_DIRS.has(name) || name.startsWith('.');
  return EXCLUDED_FILE.test(name);
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

async function collect(vscode, { document = null, selectionText = '', maxBytes = DEFAULT_MAX_BYTES, knownPaths = [], knownSecrets = [], contextMode = 'on', folder: requestedFolder = null, allowRules } = {}) {
  const folders = vscode.workspace.workspaceFolders || [];
  if (!folders.length) return { text: '', summary: { root: '', files: 0, bytes: 0, truncated: false, activePath: '', rules: { status: 'unavailable' } } };
  const requested = requestedFolder && folders.find(candidate => sameFolder(candidate, requestedFolder));
  const activeCandidate = document ? vscode.workspace.getWorkspaceFolder(document.uri) : null;
  const activeFolder = activeCandidate && folders.find(candidate => sameFolder(candidate, activeCandidate));
  if (requestedFolder && !requested) throw new Error('The selected workspace folder is no longer available.');
  const folder = requested || activeFolder || folders[0];
  const root = folder.uri;
  const rootName = path.basename(folder.uri.fsPath);
  const limit = Math.min(Math.max(Number(maxBytes) || DEFAULT_MAX_BYTES, 4096), 200000);
  const tree = [];
  const seen = new Set();
  let entries = 0;
  let truncated = false;

  const queue = [{ uri: root, depth: 0, prefix: '' }];
  while (queue.length && entries < MAX_ENTRIES && tree.length < MAX_TREE_LINES) {
    const current = queue.shift();
    let listing = [];
    try { listing = await vscode.workspace.fs.readDirectory(current.uri); } catch { continue; }
    listing.sort((a, b) => (a[1] === b[1] ? a[0].localeCompare(b[0]) : a[1] === vscode.FileType.Directory ? -1 : 1));
    for (const [name, type] of listing) {
      if (entries >= MAX_ENTRIES || tree.length >= MAX_TREE_LINES) { truncated = true; break; }
      const isDir = type === vscode.FileType.Directory;
      if (excluded(name, isDir)) continue;
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

  for (const name of PRIORITY) {
    const uri = vscode.Uri.joinPath(root, name);
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type === vscode.FileType.Directory || stat.type === vscode.FileType.SymbolicLink) continue;
      const bytes = await vscode.workspace.fs.readFile(uri);
      seen.add(name);
      const text = decode(bytes.subarray(0, MAX_FILE_BYTES));
      if (!text || !printable(text)) continue;
      if (!push('\n--- ' + name + ' ---\n' + text + '\n')) break;
    } catch { /* A missing manifest is normal. */ }
  }

  if (document && activePath && activePath !== '.tvijo' && !activePath.startsWith('.tvijo/') && !seen.has(activePath) && !EXCLUDED_FILE.test(path.basename(activePath)) && !activePath.split('/').some((part) => EXCLUDED_DIRS.has(part) || part.startsWith('.'))) {
    seen.add(activePath);
    const body = selectionText && !document.isDirty ? selectionText : document.getText();
    const clipped = body.slice(0, MAX_FILE_BYTES);
    const label = selectionText ? 'active selection' : 'active file';
    const start = selectionText ? document.selection.start.line + 1 : 1;
    push('\n--- ' + label + ': ' + activePath + (selectionText ? ' (lines ' + start + '-' + (document.selection.end.line + 1) + ')' : '') + ' ---\n' + clipped + '\n');
  }

  const supportedRoot = root.scheme === 'file' && (root.authority || '') === '';
  const rules = contextMode === 'off'
    ? { text: '', status: 'disabled', paths: [] }
    : !supportedRoot
      ? { text: '', status: 'unsupported', paths: [] }
      : projectRules.collect({
        root: folder.uri.fsPath,
        knownPaths: [...(Array.isArray(knownPaths) ? knownPaths : []), (activePath && activePath !== '.tvijo' && !activePath.startsWith('.tvijo/')) ? activePath : ''].filter(Boolean),
        knownSecrets,
        contextMode,
        allowRules: (rulesRoot, hash) => vscode.workspace.isTrusted === true && typeof allowRules === 'function' && allowRules(rulesRoot, hash) === true
      });
  let rulesStatus = { status: rules.status, paths: rules.paths || [] };
  if (rules.text) {
    const end = '[END WORKSPACE CONTEXT]\n';
    const rulesBytes = Buffer.byteLength('\n' + rules.text, 'utf8');
    if (used + rulesBytes + Buffer.byteLength(end, 'utf8') <= limit) {
      parts.push('\n' + rules.text); used += rulesBytes;
    } else {
      truncated = true;
      rulesStatus = { status: 'omitted-limit', paths: rules.paths || [] };
    }
  }
  push('[END WORKSPACE CONTEXT]\n');
  const text = parts.join('');
  return { text, summary: { root: rootName, files: tree.length, bytes: Buffer.byteLength(text, 'utf8'), truncated, activePath, rules: rulesStatus } };
}

module.exports = { collect, DEFAULT_MAX_BYTES, EXCLUDED_DIRS, EXCLUDED_FILE };
