'use strict';

// Read-only metadata from the user's installed language extensions. This adapter
// does not install a language server, invoke a model or sandbox other extensions.
const fs = require('node:fs');
const path = require('node:path');
const { safePath } = require('./local-tools');

const MAX_RESULTS = 80;
const MAX_VISITED = 400;
const MAX_DEPTH = 8;
const MAX_RESULT_BYTES = 12000;
const MAX_FILE_BYTES = 1024 * 1024;
const PROVIDERS = Object.freeze({
  symbols: 'vscode.executeDocumentSymbolProvider',
  definition: 'vscode.executeDefinitionProvider',
  references: 'vscode.executeReferenceProvider'
});

function failure(reason) { return { ok: false, refused: true, reason }; }
function stopped(signal) {
  if (signal?.aborted) throw Object.assign(new Error('Code intelligence cancelled.'), { code: 'code_intelligence_cancelled' });
}
function fileIdentity(root, relative) {
  const absolute = safePath(root, relative);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_FILE_BYTES ||
      path.relative(fs.realpathSync(absolute), absolute) !== '') throw new Error('Unavailable source file.');
  return { absolute, stamp: [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':') };
}
function uriPath(uri) {
  return uri && uri.scheme === 'file' && !uri.authority && typeof uri.fsPath === 'string' ? uri.fsPath : null;
}
function position(value) {
  return value && Number.isSafeInteger(value.line) && value.line >= 0 && value.line < 10000000 &&
    Number.isSafeInteger(value.character) && value.character >= 0 && value.character < 10000000;
}
function range(value) {
  if (!value || !position(value.start) || !position(value.end) || value.end.line < value.start.line ||
      (value.end.line === value.start.line && value.end.character < value.start.character)) return null;
  return { line: value.start.line + 1, column: value.start.character + 1,
    endLine: value.end.line + 1, endColumn: value.end.character + 1 };
}
function name(value) {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  let result = '';
  for (const char of value) { if (Buffer.byteLength(result + char) > 160) break; result += char; }
  return result;
}

// VS Code provider commands have no cancellable command API. Bound waiting and
// discard late fulfillment/rejection; never promote it to a later task result.
function bounded(operation, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(value);
    };
    const abort = () => finish(reject, Object.assign(new Error('Code intelligence cancelled.'), { code: 'code_intelligence_cancelled' }));
    const timer = setTimeout(() => finish(reject, Object.assign(new Error('Language provider timed out.'), { code: 'code_intelligence_timeout' })), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    const active = () => { if (settled) throw Object.assign(new Error('Language provider wait ended.'), { code: 'code_intelligence_timeout' }); };
    Promise.resolve().then(() => operation(active)).then(value => finish(resolve, value), error => finish(reject, error));
  });
}

async function inspect({ vscode, root, action, guard = async () => {}, signal, timeoutMs = 5000 }) {
  const allowed = ['tool', 'operation', 'path', 'line', 'column'];
  if (!action || Object.keys(action).some(key => !allowed.includes(key)) || action.tool !== 'code_intelligence' ||
      !Object.hasOwn(PROVIDERS, action.operation) || typeof action.path !== 'string' || !action.path.trim() ||
      action.path.length > 2048 || path.isAbsolute(action.path)) return failure('invalid_code_intelligence_request');
  if (action.operation === 'symbols' ? action.line !== undefined || action.column !== undefined :
      !Number.isSafeInteger(action.line) || action.line < 1 || !Number.isSafeInteger(action.column) || action.column < 1) return failure('invalid_code_intelligence_position');
  let guardError;
  const check = async () => {
    stopped(signal);
    try { await guard(); } catch (error) { guardError = error; throw error; }
    stopped(signal);
    if (vscode?.workspace?.isTrusted !== true) throw Object.assign(new Error('Workspace trust required.'), { code: 'workspace_untrusted' });
  };
  await check();
  if (typeof vscode?.commands?.executeCommand !== 'function' || typeof vscode?.workspace?.openTextDocument !== 'function') return failure('code_intelligence_unavailable');
  let original;
  try { original = fileIdentity(root, action.path); } catch (_) { return failure('code_intelligence_path_refused'); }
  const result = { ok: true, source: 'editor_language_provider', operation: action.operation,
    path: path.relative(root, original.absolute).split(path.sep).join('/'), documentVersion: null,
    status: 'complete', results: [], partial: false, omitted: 0, reasons: [] };
  const omit = reason => { result.partial = true; result.omitted++; if (!result.reasons.includes(reason)) result.reasons.push(reason); };
  let document, version, raw;
  try {
    raw = await bounded(async active => {
      active(); await check(); active();
      document = await vscode.workspace.openTextDocument(vscode.Uri.file(original.absolute));
      active(); await check(); active();
      if (!uriPath(document?.uri) || path.relative(original.absolute, uriPath(document.uri)) !== '' || !Number.isSafeInteger(document.version) ||
          fileIdentity(root, action.path).stamp !== original.stamp) throw Object.assign(new Error('Source changed.'), { code: 'code_intelligence_stale' });
      if (!Number.isSafeInteger(document.lineCount) || document.lineCount < 1 ||
          document.offsetAt(new vscode.Position(document.lineCount, 0)) > MAX_FILE_BYTES) throw Object.assign(new Error('Document exceeds bound.'), { code: 'code_intelligence_document_limit' });
      version = document.version; result.documentVersion = version;
      const args = [document.uri];
      if (action.operation !== 'symbols') {
        if (action.line > document.lineCount || action.column - 1 > document.lineAt(action.line - 1).text.length) throw Object.assign(new Error('Position outside document.'), { code: 'invalid_code_intelligence_position' });
        args.push(new vscode.Position(action.line - 1, action.column - 1));
      }
      active(); stopped(signal);
      return vscode.commands.executeCommand(PROVIDERS[action.operation], ...args);
    }, signal, Math.max(1, Math.min(Number(timeoutMs) || 5000, 5000)));
    await check();
    if (document.isClosed || document.version !== version || fileIdentity(root, action.path).stamp !== original.stamp) return failure('code_intelligence_stale');
  } catch (error) {
    if (guardError && error === guardError) throw error;
    if (signal?.aborted || error?.code === 'code_intelligence_cancelled') return failure('code_intelligence_cancelled');
    return failure(['code_intelligence_timeout','code_intelligence_stale','workspace_untrusted','invalid_code_intelligence_position','code_intelligence_document_limit'].includes(error?.code) ? error.code : 'code_intelligence_provider_failed');
  }
  if (raw == null) { result.status = 'unavailable'; return result; }
  if (!Array.isArray(raw)) return failure('code_intelligence_invalid_result');
  const pending = [{ items: raw, index: 0, depth: 0 }];
  const seen = new Set();
  let visited = 0;
  while (pending.length) {
    const frame = pending[pending.length - 1];
    if (frame.index >= frame.items.length) { pending.pop(); continue; }
    if (visited++ >= MAX_VISITED || result.results.length >= MAX_RESULTS) { omit('result_limit'); break; }
    const item = frame.items[frame.index++];
    if (!item || typeof item !== 'object' || seen.has(item)) { omit('invalid_result'); continue; }
    seen.add(item);
    let location;
    if (action.operation === 'symbols') location = item.location || { uri: document.uri, range: item.selectionRange || item.range };
    else location = item.targetUri ? { uri: item.targetUri, range: item.targetSelectionRange || item.targetRange } : item;
    const absolute = uriPath(location?.uri);
    const span = range(location?.range);
    let target;
    try {
      if (!absolute || !span) throw new Error('Invalid location.');
      target = fileIdentity(root, path.relative(root, absolute)).absolute;
      if (path.relative(target, absolute) !== '') throw new Error('Noncanonical location.');
    } catch (_) { omit('filtered_location'); continue; }
    const row = { path: path.relative(root, target).split(path.sep).join('/'), ...span };
    if (action.operation === 'symbols') {
      const label = name(item.name);
      if (!label || !Number.isInteger(item.kind) || item.kind < 0 || item.kind > 25) { omit('invalid_symbol'); continue; }
      row.name = label; row.kind = item.kind; row.depth = frame.depth;
      if (item.name !== label) omit('symbol_name_truncated');
    }
    result.results.push(row);
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_RESULT_BYTES - 256) { result.results.pop(); omit('byte_limit'); break; }
    if (action.operation === 'symbols' && Array.isArray(item.children) && item.children.length) {
      if (frame.depth >= MAX_DEPTH) omit('depth_limit');
      else pending.push({ items: item.children, index: 0, depth: frame.depth + 1 });
    }
  }
  await check();
  try {
    if (document.isClosed || document.version !== version || fileIdentity(root, action.path).stamp !== original.stamp) return failure('code_intelligence_stale');
    for (const row of result.results) fileIdentity(root, row.path);
  } catch (_) { return failure('code_intelligence_stale'); }
  if (!result.results.length) result.status = result.partial ? 'filtered' : 'empty';
  return result;
}

module.exports = { inspect, MAX_RESULTS, MAX_VISITED, MAX_DEPTH, MAX_RESULT_BYTES };
