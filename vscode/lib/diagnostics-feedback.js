'use strict';

const path = require('node:path');
const { safePath } = require('./local-tools');
const { boundedCapture } = require('./context-captures');

const MAX_BYTES = 8192;
const MAX_PER_FILE = 20;
const WAIT_MS = 250;

function uriKey(uri) {
  return uri?.scheme === 'file' && typeof uri.fsPath === 'string' ? path.resolve(uri.fsPath) : null;
}

function createTracker(vscode) {
  const changes = new Map();
  const waiters = new Set();
  let sequence = 0;
  const subscription = typeof vscode.languages?.onDidChangeDiagnostics === 'function'
    ? vscode.languages.onDidChangeDiagnostics(event => {
      for (const uri of event?.uris || []) {
        const key = uriKey(uri);
        if (key) {
          changes.delete(key); changes.set(key, ++sequence);
          while (changes.size > 128) changes.delete(changes.keys().next().value);
        }
      }
      for (const waiter of waiters) waiter.check();
    }) : null;
  return {
    markApply: () => sequence,
    changedSince: (key, since) => (changes.get(key) || 0) > since,
    waitFor: (files, duration, signal) => new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        waiters.delete(waiter);
        signal?.removeEventListener?.('abort', done);
        resolve();
      };
      const waiter = { finish: done, check: () => { if (signal?.aborted || files.every(file => (changes.get(file.key) || 0) > file.since)) done(); } };
      const timer = setTimeout(done, duration);
      waiters.add(waiter);
      signal?.addEventListener?.('abort', done, { once: true });
      waiter.check();
    }),
    dispose: () => { subscription?.dispose?.(); for (const waiter of [...waiters]) waiter.finish(); changes.clear(); }
  };
}

function severity(vscode, diagnostic) {
  return diagnostic?.severity === vscode.DiagnosticSeverity?.Error || diagnostic?.severity === 0 ? 'Error'
    : diagnostic?.severity === vscode.DiagnosticSeverity?.Warning || diagnostic?.severity === 1 ? 'Warning' : null;
}

function diagnosticRow(vscode, diagnostic) {
  const level = severity(vscode, diagnostic);
  if (!level) return null;
  const start = diagnostic.range?.start;
  return {
    severity: level,
    ...(Number.isInteger(start?.line) ? { line: start.line + 1 } : {}),
    ...(Number.isInteger(start?.character) ? { column: start.character + 1 } : {}),
    ...(diagnostic.source ? { source: String(diagnostic.source).slice(0, 100) } : {}),
    ...(diagnostic.code !== undefined ? { code: String(typeof diagnostic.code === 'object' ? diagnostic.code.value : diagnostic.code).slice(0, 100) } : {}),
    message: String(diagnostic.message || '').slice(0, 700)
  };
}

function fitFeedback(files, initiallyTruncated = false) {
  let truncated = initiallyTruncated;
  const encode = () => boundedCapture('Agent diagnostics feedback', [JSON.stringify({
    note: 'An empty diagnostics list means no errors or warnings were reported in this snapshot; it does not mean compilation or tests passed.',
    truncated
  }), ...files.map(file => JSON.stringify(file))], Number.MAX_SAFE_INTEGER);
  let text = encode();
  while (Buffer.byteLength(JSON.stringify({diagnostics_feedback:text}), 'utf8') > MAX_BYTES) {
    truncated = true;
    const last = [...files].reverse().find(file => file.diagnostics.length);
    if (last) last.diagnostics.pop();
    else if (files.length) files.pop();
    else break;
    text = encode();
  }
  return text;
}

async function collect({ vscode, root, changedFiles, tracker, guard = async () => {}, signal, waitMs = WAIT_MS }) {
  const valid = [];
  for (const changed of changedFiles || []) {
    const uri = changed?.uri;
    const key = uriKey(uri);
    if (!key) continue;
    let target;
    try { target = safePath(root, key); } catch { continue; }
    if (path.resolve(target) !== key || !Number.isInteger(changed.version) || changed.version < 0) continue;
    if (typeof vscode.workspace.getWorkspaceFolder === 'function' && !vscode.workspace.getWorkspaceFolder(uri)) continue;
    valid.push({ uri, key, version: changed.version, startedAt: changed.startedAt ?? tracker.markApply() });
  }
  if (!valid.length) return null;

  await guard();
  if (signal?.aborted) return null;
  const deadline = Date.now() + Math.min(Math.max(Number(waitMs) || 0, 0), WAIT_MS);
  if (valid.some(file => !tracker.changedSince(file.key, file.startedAt)))
    await tracker.waitFor(valid.map(file => ({ key: file.key, since: file.startedAt })), Math.max(0, deadline - Date.now()), signal);
  await guard();
  if (signal?.aborted) return null;

  const files = [];
  let truncated = false;
  for (const file of valid) {
    try { safePath(root, file.key); } catch { continue; }
    const current = (vscode.workspace.textDocuments || []).find(doc => uriKey(doc.uri) === file.key);
    const versionChanged = current && current.version !== file.version;
    let diagnostics = [];
    let snapshotAvailable = !versionChanged;
    if (!versionChanged) try { diagnostics = vscode.languages.getDiagnostics(file.uri) || []; } catch { snapshotAvailable = false; }
    const relevant = diagnostics.filter(item => severity(vscode, item)).map(item => diagnosticRow(vscode, item));
    if (relevant.length > MAX_PER_FILE) truncated = true;
    files.push({
      path: path.relative(root, file.key).split(path.sep).join('/'),
      documentVersion: file.version,
      ...(current ? {currentDocumentVersion:current.version} : {}),
      snapshotAvailable,
      freshness: versionChanged ? 'document changed again; snapshot omitted' : !snapshotAvailable ? 'diagnostics unavailable' : tracker.changedSince(file.key, file.startedAt) ? 'observed after edit; provider document version unknown' : 'current snapshot; provider freshness unknown',
      diagnostics: relevant.slice(0, MAX_PER_FILE)
    });
  }
  return fitFeedback(files, truncated);
}

module.exports = { MAX_BYTES, MAX_PER_FILE, WAIT_MS, createTracker, collect };
