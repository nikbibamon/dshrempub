'use strict';

const path = require('node:path');
const { MAX_CAPTURE_BYTES } = require('./context-captures');

function stripTerminalControls(value) {
  return String(value || '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B[()][0-2A-Z]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function utf8Tail(value, maxBytes) {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= maxBytes) return value;
  let start = bytes.length - maxBytes;
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start++;
  return bytes.subarray(start).toString('utf8');
}

function createTerminalCapture({ maxTerminals = 4, maxLines = 100, maxBytes = MAX_CAPTURE_BYTES } = {}) {
  const captures = new Map();
  let epoch = 0;
  let direct = null;
  function start(id, metadata = {}) {
    if (!id) return null;
    const currentEpoch = epoch;
    if (!captures.has(id) && captures.size >= maxTerminals) captures.delete(captures.keys().next().value);
    const state = { epoch: currentEpoch, name: stripTerminalControls(String(metadata.name || 'Terminal')).slice(0, 60), cwd: String(metadata.cwd || '').slice(0, 1000), lines: [], tail: '', escape: false, csi: false, unicodeTail: '', osc: false, oscEscape: false, observed: false };
    captures.set(id, state);
    return { epoch: currentEpoch, append(chunk) {
      if (epoch !== currentEpoch || captures.get(id) !== state) return false;
      state.observed = true;
      let raw = state.unicodeTail + String(chunk || ''); state.unicodeTail = '';
      if (raw.length && /[\uD800-\uDBFF]/.test(raw.at(-1))) { state.unicodeTail = raw.at(-1); raw = raw.slice(0, -1); }
      const input = raw;
      let cleaned = '';
      for (let i = 0; i < input.length; i++) {
        const ch = input[i], code = ch.charCodeAt(0);
        if (state.osc) { if (state.oscEscape && ch === '\\') { state.osc = false; state.oscEscape = false; } else { state.oscEscape = ch === '\x1b'; if (ch === '\x07') { state.osc = false; state.oscEscape = false; } } continue; }
        if (state.csi) { if (code >= 0x40 && code <= 0x7e) state.csi = false; continue; }
        if (state.escape) { state.escape = false; if (ch === '[') state.csi = true; else if (ch === ']') state.osc = true; else if (ch === '(' || ch === ')') state.escape = true; continue; }
        if (ch === '\x1b') { state.escape = true; continue; }
        if ((code < 0x20 && ch !== '\n' && ch !== '\r' && ch !== '\t') || code === 0x7f) continue;
        cleaned += ch;
      }
      const parts = (state.tail + cleaned).split(/\r?\n/);
      state.tail = parts.pop() || '';
      state.lines.push(...parts);
      state.lines = state.lines.slice(-maxLines);
      while (state.lines.length + (state.tail ? 1 : 0) > maxLines) state.lines.shift();
      const total = () => Buffer.byteLength(state.lines.join('\n') + (state.lines.length ? '\n' : '') + state.tail, 'utf8');
      while (total() > maxBytes && state.lines.length) state.lines.shift();
      if (total() > maxBytes) state.tail = utf8Tail(state.tail, maxBytes);
      return true;
    } };
  }
  function read(id, workspaceRoot) {
    const item = captures.get(id);
    if (!item || !item.observed) return null;
    const cwd = item.cwd;
    if (!cwd || !workspaceRoot || !(cwd === workspaceRoot || cwd.startsWith(workspaceRoot + path.sep))) return null;
    const relative = path.relative(workspaceRoot, cwd) || '.';
    const header = 'Terminal output (untrusted captured data; terminal=' + item.name + '; cwd=' + relative + '):\n';
    const marker = '[earlier output truncated]\n';
    const room = Math.max(0, maxBytes - Buffer.byteLength(header + marker, 'utf8'));
    const observed = item.lines.join('\n') + (item.lines.length ? '\n' : '') + item.tail;
    if (!observed) return null;
    const body = utf8Tail(observed, room);
    return header + (body.length < observed.length ? marker : '') + body;
  }
  function recordDirect({ root, cwd, output, source = 'Extension command output' } = {}) {
    if (!root || !cwd) return false;
    const absoluteRoot = path.resolve(root), absoluteCwd = path.resolve(cwd);
    if (!(absoluteCwd === absoluteRoot || absoluteCwd.startsWith(absoluteRoot + path.sep))) return false;
    const clean = utf8Tail(stripTerminalControls(output), maxBytes);
    if (!clean.trim()) return false;
    const lines = clean.split(/\r?\n/).slice(-maxLines);
    const header = 'Untrusted ' + String(source).slice(0, 40) + ' (cwd=' + (path.relative(absoluteRoot, absoluteCwd) || '.').slice(0, 256) + '):\n';
    const marker = '[earlier output truncated]\n';
    const room = Math.max(0, maxBytes - Buffer.byteLength(header + marker, 'utf8'));
    const body = utf8Tail(lines.join('\n'), room);
    direct = { epoch, root: absoluteRoot, text: header + (body.length < lines.join('\n').length ? marker : '') + body };
    return true;
  }
  function readDirect(workspaceRoot) {
    if (!direct || direct.epoch !== epoch || path.resolve(workspaceRoot || '') !== direct.root) return null;
    return direct.text;
  }
  function invalidate() { epoch++; captures.clear(); direct = null; }
  return { start, read, recordDirect, readDirect, invalidate, get epoch() { return epoch; }, get size() { return captures.size; } };
}

module.exports = { stripTerminalControls, utf8Tail, createTerminalCapture };
