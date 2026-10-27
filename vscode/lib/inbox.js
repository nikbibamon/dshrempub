'use strict';

// Local bridge: another tool on this host (Claude Code, Codex) drops JSON files into
// <globalStorage>/inbox, and Copilot reaches the same queue in-process. Each message
// becomes a queued chat message, exactly as if typed, and its progress is written to
// <globalStorage>/outbox/<id>.json: accepted -> running -> completed | failed | cancelled.
// A claimed message stays on disk until it starts, so a window reload cannot lose it;
// a message that was running when its window died is marked failed, never re-run,
// because a second run is a second paid task.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_FILE_BYTES = 32768;
const MAX_TEXT = 20000;
const MAX_ANSWER = 20000;
const MODES = new Set(['agent', 'plan', 'chat']);
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const OUTBOX_TTL = 7 * 24 * 60 * 60 * 1000;

function parseMessage(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data.text !== 'string') return null;
  const text = data.text.trim();
  if (!text || text.length > MAX_TEXT) return null;
  const from = typeof data.from === 'string' && /^[\w .-]{1,40}$/.test(data.from) ? data.from : 'local tool';
  const id = typeof data.id === 'string' && ID.test(data.id) ? data.id : null;
  return { id, text, mode: MODES.has(data.mode) ? data.mode : 'agent', from };
}

function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

function createInbox({ dir, outbox, deliver, uid = process.getuid?.(), pid = process.pid, io = fs, now = Date.now, isAlive = alive }) {
  const claimedDir = dir ? path.join(dir, '.claimed') : null;
  const startedHere = new Set();
  const deliveredHere = new Set();
  const listeners = new Map();

  function writeAtomic(file, value) {
    io.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = file + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
    io.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
    io.renameSync(temporary, file);
  }
  function status(id) {
    if (!outbox || !ID.test(id)) return null;
    try { return JSON.parse(io.readFileSync(path.join(outbox, id + '.json'), 'utf8')); } catch { return null; }
  }
  function mark(id, state, extra = {}) {
    if (!outbox || !ID.test(id)) return null;
    const value = { ...(status(id) || {}), ...extra, id, state, at: new Date(now()).toISOString(), pid };
    writeAtomic(path.join(outbox, id + '.json'), value);
    if (state === 'running') startedHere.add(id);
    for (const listener of listeners.get(id) || []) listener(value);
    return value;
  }
  function release(id) {
    try { io.unlinkSync(path.join(claimedDir, id + '.json')); } catch { /* Already released. */ }
  }
  function finish(id, state, extra = {}) {
    if (!TERMINAL.has(state)) throw new Error('terminal state required');
    const value = mark(id, state, extra.answer ? { ...extra, answer: String(extra.answer).slice(0, MAX_ANSWER) } : extra);
    release(id);
    return value;
  }
  function ensure() {
    for (const target of [dir, claimedDir, outbox]) if (target) io.mkdirSync(target, { recursive: true, mode: 0o700 });
  }
  function prune() {
    if (!outbox) return;
    let names = [];
    try { names = io.readdirSync(outbox); } catch { return; }
    for (const name of names.filter(item => item.endsWith('.json'))) {
      const file = path.join(outbox, name);
      try { if (now() - io.statSync(file).mtimeMs > OUTBOX_TTL) io.unlinkSync(file); } catch { /* Racing writer. */ }
    }
  }
  function hand(message) {
    if (deliveredHere.has(message.id)) return true;
    if (!deliver(message)) return false;
    deliveredHere.add(message.id);
    return true;
  }
  // Claimed messages: deliver the ones nobody started; close the ones whose run died.
  function recover() {
    if (!claimedDir) return;
    let names = [];
    try { names = io.readdirSync(claimedDir); } catch { return; }
    for (const name of names.filter(item => item.endsWith('.json')).sort()) {
      const id = name.slice(0, -5);
      const current = status(id);
      const ownerGone = !current || current.pid !== pid ? !isAlive(current?.pid) : !startedHere.has(id);
      if (current && TERMINAL.has(current.state)) { release(id); continue; }
      if (current?.state === 'running') {
        if (ownerGone) finish(id, 'failed', { error: 'interrupted_by_reload' });
        continue;
      }
      if (current && current.pid !== pid && !ownerGone) continue;
      let message;
      try { message = parseMessage(io.readFileSync(path.join(claimedDir, name), 'utf8')); } catch { message = null; }
      if (!message) { finish(id, 'failed', { error: 'unreadable_message' }); continue; }
      if (current?.pid !== pid) mark(id, 'accepted');
      if (!hand({ ...message, id })) break;
    }
  }
  function poll() {
    if (!dir) return [];
    let names;
    try { names = io.readdirSync(dir); } catch { return []; }
    const claimed = [];
    for (const name of names.filter(item => item.endsWith('.json')).sort()) {
      const file = path.join(dir, name);
      let stat;
      try { stat = io.lstatSync(file); } catch { continue; }
      // Only regular files written by the same account count as the user's own words.
      const foreign = !stat.isFile() || (uid !== undefined && stat.uid !== uid) || stat.size > MAX_FILE_BYTES;
      const message = foreign ? null : parseMessage(io.readFileSync(file, 'utf8'));
      if (!message) { try { io.unlinkSync(file); } catch { /* Another window took it. */ } continue; }
      const id = message.id || name.slice(0, -5).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || crypto.randomUUID();
      if (status(id)) { try { io.unlinkSync(file); } catch { /* Duplicate id. */ } continue; }
      try { io.renameSync(file, path.join(claimedDir, id + '.json')); } catch { continue; }
      mark(id, 'accepted', { from: message.from, mode: message.mode, text: message.text.slice(0, 200) });
      claimed.push({ ...message, id });
      if (!hand({ ...message, id })) break;
    }
    return claimed;
  }
  // In-process senders (Copilot) use the same durable path as files.
  function enqueue({ text, mode = 'agent', from = 'local tool' }) {
    const message = parseMessage(JSON.stringify({ text, mode, from }));
    if (!message) throw new Error('invalid_bridge_message');
    ensure();
    const id = 'm' + crypto.randomUUID().replace(/-/g, '');
    writeAtomic(path.join(claimedDir, id + '.json'), { text: message.text, mode: message.mode, from: message.from, id });
    mark(id, 'accepted', { from: message.from, mode: message.mode, text: message.text.slice(0, 200) });
    hand({ ...message, id });
    return id;
  }
  function wait(id, { onStatus = () => {}, cancellation } = {}) {
    return new Promise(resolve => {
      const done = value => { listeners.get(id)?.delete(listener); resolve(value); };
      const listener = value => { onStatus(value); if (TERMINAL.has(value.state)) done(value); };
      if (!listeners.has(id)) listeners.set(id, new Set());
      listeners.get(id).add(listener);
      const current = status(id);
      if (current) listener(current);
      cancellation?.onCancellationRequested?.(() => done({ ...(status(id) || {}), id, state: 'detached' }));
    });
  }
  // A recreated chat view lost its queue: accepted messages must be handed over again.
  function reset() { deliveredHere.clear(); }
  return { poll, recover, ensure, prune, mark, finish, status, enqueue, wait, reset, dir, outbox };
}

module.exports = { createInbox, parseMessage, MAX_TEXT, TERMINAL };
