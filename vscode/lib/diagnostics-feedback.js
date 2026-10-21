'use strict';

const path = require('node:path');
const { safePath } = require('./local-tools');
const { boundedCapture } = require('./context-captures');
const { snapshotDiagnostics, diffDiagnostics } = require('./diagnostic-delta');

const MAX_BYTES = 8192;
const MAX_ITEMS = 20;
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

function diagnosticRow(diagnostic) {
  return {
    severity: diagnostic.severity,
    ...(diagnostic.line !== undefined ? {line:diagnostic.line} : {}),
    ...(diagnostic.column !== undefined ? {column:diagnostic.column} : {}),
    ...(diagnostic.source ? { source: String(diagnostic.source).slice(0, 100) } : {}),
    ...(diagnostic.code !== undefined ? { code: String(typeof diagnostic.code === 'object' ? diagnostic.code.value : diagnostic.code).slice(0, 100) } : {}),
    message: String(diagnostic.message || '').slice(0, 700),
    ...((diagnostic.message.length > 700 || diagnostic.source?.length > 100 || diagnostic.code?.length > 100) ? {truncated:true} : {})
  };
}

function captureBaseline({vscode,root,uri,version}) {
  const key = uriKey(uri);
  const baseline = {key,documentVersion:version,available:false,diagnostics:[]};
  if (!key || !Number.isInteger(version) || version < 0) return baseline;
  try {
    safePath(root,key);
    if (typeof vscode.workspace.getWorkspaceFolder === 'function' && !vscode.workspace.getWorkspaceFolder(uri)) return baseline;
    const current = (vscode.workspace.textDocuments || []).find(doc => uriKey(doc.uri) === key);
    if (current && current.version !== version) return baseline;
    baseline.diagnostics = snapshotDiagnostics(vscode.languages.getDiagnostics(uri) || []);
    baseline.available = true;
  } catch { /* Missing providers make the delta unavailable, never clean. */ }
  return baseline;
}

function fitFeedback(files, initiallyTruncated = false) {
  let truncated = initiallyTruncated;
  const encode = () => boundedCapture('Agent diagnostics feedback', [JSON.stringify({
    note: 'An empty diagnostics delta does not mean compilation or tests passed.',
    truncated
  }), ...files.map(file => JSON.stringify(file))], Number.MAX_SAFE_INTEGER);
  let text = encode();
  while (Buffer.byteLength(JSON.stringify({diagnostics_feedback:text}), 'utf8') > MAX_BYTES) {
    truncated = true;
    const last = [...files].reverse().find(file => file.resolved.length || file.new.length);
    if (last) (last.resolved.length ? last.resolved : last.new).pop();
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
    valid.push({ uri, key, version: changed.version, stale:!!changed.stale, baseline:changed.baseline, startedAt: changed.startedAt ?? tracker.markApply() });
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
  let remaining = MAX_ITEMS;
  for (const file of valid) {
    try { safePath(root, file.key); } catch { continue; }
    const current = (vscode.workspace.textDocuments || []).find(doc => uriKey(doc.uri) === file.key);
    const versionChanged = file.stale || (current && current.version !== file.version);
    let diagnostics = [];
    let snapshotAvailable = !versionChanged;
    if (!versionChanged) try { diagnostics = vscode.languages.getDiagnostics(file.uri) || []; } catch { snapshotAvailable = false; }
    const baselineAvailable = file.baseline?.available === true && file.baseline.key === file.key;
    const deltaAvailable = baselineAvailable && snapshotAvailable;
    const delta = deltaAvailable ? diffDiagnostics(file.baseline.diagnostics,snapshotDiagnostics(diagnostics)) : null;
    const added = delta ? delta.new.slice(0,remaining).map(diagnosticRow) : [];
    remaining -= added.length;
    const resolved = delta ? delta.resolved.slice(0,remaining).map(diagnosticRow) : [];
    remaining -= resolved.length;
    if (delta && added.length + resolved.length < delta.new.length + delta.resolved.length) truncated = true;
    if ([...added,...resolved].some(row => row.truncated)) truncated = true;
    files.push({
      path: path.relative(root, file.key).split(path.sep).join('/'),
      documentVersion: file.version,
      ...(current ? {currentDocumentVersion:current.version} : {}),
      ...(file.baseline ? {baselineDocumentVersion:file.baseline.documentVersion} : {}),
      baselineAvailable,
      snapshotAvailable,
      deltaAvailable,
      freshness: versionChanged ? 'document changed again; snapshot omitted' : !snapshotAvailable ? 'diagnostics unavailable' : tracker.changedSince(file.key, file.startedAt) ? 'observed after edit; provider document version unknown' : 'current snapshot; provider freshness unknown',
      new: added, resolved,
      newCount:delta ? delta.new.length : null,
      resolvedCount:delta ? delta.resolved.length : null,
      unchangedCount:delta ? delta.unchangedCount : null
    });
  }
  return fitFeedback(files, truncated);
}

module.exports = { MAX_BYTES, MAX_ITEMS, WAIT_MS, createTracker, captureBaseline, collect };
