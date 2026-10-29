'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_BYTES = 65536;
const MAX_EVENTS = 60;
const TTL = 7 * 24 * 60 * 60 * 1000;
const SCOPE = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const KINDS = new Set(['chat', 'agent', 'plan', 'edit']);
const MODES = new Set(['chat', 'agent', 'plan']);
const note = 'Local run journal data was unavailable or ignored.';

function processStart(pid) {
  if (process.platform !== 'linux') return null;
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`,'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] || null;
  } catch { return null; }
}
function liveElsewhere(run) {
  const pid = run?.ownerPid;
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) return false;
  try { process.kill(pid,0); }
  catch (error) { return error.code !== 'ESRCH'; }
  if (run.ownerStart && process.platform === 'linux') {
    const current = processStart(pid);
    return current === null || current === run.ownerStart;
  }
  return true;
}

function createRunJournal(storageRoot, { now = Date.now, io = {} } = {}) {
  const base = typeof storageRoot === 'string' && storageRoot ? path.resolve(storageRoot) : null;
  const renameSync = io.renameSync || fs.renameSync.bind(fs);
  const establishedDirectories = new Map();
  function syncDirectory(directory) {
    let fd;
    try {
      fd = fs.openSync(directory, fs.constants.O_RDONLY);
      (io.fsyncSync || fs.fsyncSync)(fd);
      io.onDirectorySynced?.(directory);
    } catch (error) {
      if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM', 'EACCES'].includes(error.code)) throw error;
    } finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  function validateScope(scope) { if (typeof scope !== 'string' || !SCOPE.test(scope)) throw new Error('Invalid scope'); }
  function validateId(id) { if (typeof id !== 'string' || !ID.test(id)) throw new Error('Invalid run id'); }
  function ensureDir(dir) {
    const rel = path.relative(path.parse(dir).root, dir).split(path.sep).filter(Boolean);
    let cur = path.parse(dir).root;
    for (const part of rel) {
      cur = path.join(cur, part);
      try { fs.mkdirSync(cur, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
      const st = fs.lstatSync(cur);
      if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('Unsafe journal path');
      const prior = establishedDirectories.get(cur);
      if (!prior || prior.ino !== st.ino || prior.dev !== st.dev) {
        // Sync the entry linking each component, including entries left by an earlier crash.
        syncDirectory(path.dirname(cur));
        establishedDirectories.set(cur,{ino:st.ino,dev:st.dev});
      }
    }
  }
  function dir(scope, create = false) {
    validateScope(scope);
    if (!base) throw new Error('Local recovery storage is unavailable.');
    const d = path.join(base, 'run-journal-v1', scope);
    if (create) ensureDir(d);
    else {
      // Inspect every existing path component; a symlink anywhere is refused.
      let cur = path.parse(d).root;
      for (const part of path.relative(path.parse(d).root, d).split(path.sep).filter(Boolean)) {
        cur = path.join(cur, part);
        try { const st = fs.lstatSync(cur); if (st.isSymbolicLink()) throw new Error('Unsafe journal path'); if (!st.isDirectory()) return null; }
        catch (e) { if (e.code === 'ENOENT') return null; throw e; }
      }
    }
    return d;
  }
  function safeFile(file) {
    try { const st = fs.lstatSync(file); if (st.isSymbolicLink() || !st.isFile() || st.nlink !== 1) throw new Error('Unsafe journal file'); return st; }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
  function read(file, max = MAX_BYTES) {
    const st = safeFile(file); if (!st) return { value: null, bad: false, missing:true };
    if (st.size > max) return { value: null, bad: true };
    let fd;
    try {
      fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      const held = fs.fstatSync(fd);
      if (!held.isFile() || held.nlink !== 1 || held.ino !== st.ino || held.dev !== st.dev) return {value:null,bad:true};
      const bytes = Buffer.alloc(max + 1);
      let size = 0, count;
      while (size < bytes.length && (count = fs.readSync(fd, bytes, size, bytes.length - size, null)) > 0) size += count;
      if (size > max) return {value:null,bad:true};
      const after = fs.fstatSync(fd);
      if (after.size !== held.size || after.mtimeMs !== held.mtimeMs || after.ctimeMs !== held.ctimeMs) return {value:null,bad:true};
      return { value: JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,size))), bad: false, identity:after };
    }
    catch { return { value: null, bad: true }; }
    finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  function atomic(file, value, cap) {
    const bytes = Buffer.from(JSON.stringify(value), 'utf8');
    if (bytes.length > cap) throw new Error('Journal record exceeds storage limit');
    const d = path.dirname(file); ensureDir(d);
    safeFile(file);
    const tmp = path.join(d, `.tmp-${crypto.randomBytes(16).toString('hex')}`);
    let fd;
    try {
      fd = fs.openSync(tmp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      fs.writeFileSync(fd, bytes); (io.fsyncSync || fs.fsyncSync)(fd); fs.closeSync(fd); fd = undefined;
      renameSync(tmp, file);
      syncDirectory(d);
    } finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  function runFile(scope, id, create = false) { const d = dir(scope, create); return d && path.join(d, `${id}.json`); }
  function validRun(r, scope, id) {
    return r && r.schema === 1 && r.scope === scope && r.id === id && KINDS.has(r.kind) &&
      typeof r.prompt === 'string' && SCOPE.test(r.historyScope || '') && Number.isFinite(r.createdAt) &&
      Number.isFinite(r.updatedAt) && (r.status === 'running' || r.status === 'completed') && Array.isArray(r.events) && r.events.length <= MAX_EVENTS &&
      (r.taskId === undefined || (typeof r.taskId === 'string' && r.taskId.length > 0 && r.taskId.length <= 256)) &&
      (r.ownerPid === undefined || (Number.isSafeInteger(r.ownerPid) && r.ownerPid > 0)) &&
      (r.ownerStart == null || (typeof r.ownerStart === 'string' && /^\d{1,32}$/.test(r.ownerStart))) &&
      r.events.every(event => event && typeof event === 'object' && !Array.isArray(event) && typeof event.type === 'string');
  }
  function expire(file, identity) {
    const current = safeFile(file);
    if (current && identity && current.dev === identity.dev && current.ino === identity.ino && current.size === identity.size && current.mtimeMs === identity.mtimeMs && current.ctimeMs === identity.ctimeMs) {
      fs.unlinkSync(file);
      syncDirectory(path.dirname(file));
    }
  }
  function load(scope, id) {
    const file = runFile(scope, id); if (!file) return { run: null, bad: false };
    const result = read(file); const r = result.value;
    if (!validRun(r, scope, id)) return { run: null, bad: !result.missing };
    if (now() - r.createdAt >= TTL) { expire(file,result.identity); return {run:null,bad:false}; }
    return { run: r, bad: result.bad };
  }
  function writeRun(run) {
    // Task identifiers and completion status can grow after the last event append.
    while (run.events.length && Buffer.byteLength(JSON.stringify(run)) > MAX_BYTES) {
      run.events.shift(); run.eventsTruncated = true;
    }
    const file = runFile(run.scope, run.id, true);
    atomic(file, run, MAX_BYTES);
  }
  function begin(scope, { id, kind, prompt, historyScope } = {}) {
    validateScope(scope); validateId(id); validateScope(historyScope);
    if (!KINDS.has(kind)) throw new Error('Invalid run kind');
    if (typeof prompt !== 'string') throw new Error('Prompt must be text');
    const t = now();
    const run = { schema: 1, scope, id, kind, prompt, historyScope, ownerPid:process.pid, ownerStart:processStart(process.pid), createdAt: t, updatedAt: t, status: 'running', events: [] };
    if (Buffer.byteLength(JSON.stringify(run)) > MAX_BYTES - 2048) throw new Error('Run prompt exceeds the local recovery limit. Shorten it before sending.');
    if (safeFile(runFile(scope,id,true))) throw new Error('A run journal with this identifier already exists.');
    // Atomic writer checks the full serialized size before touching the destination.
    writeRun(run); return run;
  }
  function append(scope, id, event) {
    validateScope(scope); validateId(id);
    const { run } = load(scope, id); if (!run) throw new Error('Local run journal is unavailable.');
    if (liveElsewhere(run)) throw new Error('This run is active in another extension host.');
    let copied = JSON.parse(JSON.stringify(event));
    if (!copied || typeof copied !== 'object' || typeof copied.type !== 'string') throw new Error('Invalid journal event.');
    if (Buffer.byteLength(JSON.stringify({...run,events:[copied]})) > MAX_BYTES) {
      const originalBytes = Buffer.byteLength(JSON.stringify(copied));
      const action = copied && copied.action || {};
      copied = { type: typeof copied?.type === 'string' ? copied.type.slice(0,80) : 'event', step: Number.isFinite(copied?.step) ? copied.step : 0,
        action: { tool: typeof action.tool === 'string' ? action.tool.slice(0, 80) : '', path: typeof action.path === 'string' ? action.path.slice(0, 160) : '' },
        truncated: true, originalBytes, text: 'Event truncated for local recovery.' };
      run.eventsTruncated = true;
    }
    run.events.push(copied);
    if (run.events.length > MAX_EVENTS) { run.events = run.events.slice(-MAX_EVENTS); run.eventsTruncated = true; }
    run.updatedAt = now();
    while (run.events.length && Buffer.byteLength(JSON.stringify(run)) > MAX_BYTES) { run.events.shift(); run.eventsTruncated = true; }
    writeRun(run); return run;
  }
  function task(scope, id, taskId) {
    validateScope(scope); validateId(id);
    if (typeof taskId !== 'string' || !taskId || taskId.length > 256) throw new Error('Invalid task id');
    const { run } = load(scope, id); if (!run) throw new Error('Local run journal is unavailable.');
    if (liveElsewhere(run)) throw new Error('This run is active in another extension host.');
    run.taskId = taskId; run.updatedAt = now(); writeRun(run); return run;
  }
  function receipt(scope, id, value) {
    validateScope(scope); validateId(id);
    const {run} = load(scope,id);
    if (!run || liveElsewhere(run)) throw new Error('Local run journal is unavailable or active elsewhere.');
    if (!value || value.schema !== 1 || value.id !== id || !['done','blocked','partial','cancelled','failed','unknown'].includes(value.execution?.outcome)) throw new Error('Invalid task receipt');
    atomic(path.join(dir(scope,true),id+'.receipt.json'),value,MAX_BYTES);
    run.outcome = value.execution.outcome;
    run.updatedAt = now(); writeRun(run);
    return value;
  }
  function getReceipt(scope,id) {
    validateScope(scope); validateId(id);
    const d = dir(scope); if (!d) return null;
    const result = read(path.join(d,id+'.receipt.json'));
    return !result.bad && result.value?.schema === 1 && result.value.id === id ? result.value : null;
  }
  function finish(scope, id, outcome) {
    validateScope(scope); validateId(id);
    const { run } = load(scope, id); if (!run) throw new Error('Local run journal is unavailable.');
    if (liveElsewhere(run)) throw new Error('This run is active in another extension host.');
    if (outcome !== undefined && !['done','blocked','partial','cancelled','failed','unknown'].includes(outcome)) throw new Error('Invalid task outcome');
    run.status = 'completed'; run.outcome = outcome || run.outcome || 'unknown'; run.updatedAt = now(); writeRun(run); return run;
  }
  function get(scope, id) { validateScope(scope); validateId(id); return load(scope, id).run; }
  function list(scope) {
    validateScope(scope); const d = dir(scope); if (!d) return { runs: [], notes: [] };
    const runs = [], notes = [];
    for (const name of fs.readdirSync(d)) {
      if (name.startsWith('.tmp-')) { notes.push(note); continue; }
      if (name === 'draft.json') {
        try { if (loadDraft(scope).bad) notes.push(note); } catch { notes.push(note); }
        continue;
      }
      if (!ID.test(name.replace(/\.json$/, '')) || !name.endsWith('.json')) continue;
      try { const { run, bad } = load(scope, name.slice(0, -5)); if (bad) notes.push(note); if (run?.status === 'running') runs.push(run); }
      catch { notes.push(note); }
    }
    return { runs: runs.sort((a, b) => a.createdAt - b.createdAt), notes: notes.length ? [note] : [] };
  }
  function saveDraft(scope, text, mode) {
    validateScope(scope);
    if (typeof text !== 'string' || text.length > 20000 || !MODES.has(mode)) throw new Error('Invalid draft');
    const d = dir(scope, true), value = { text, mode, updatedAt: now() };
    if (Buffer.byteLength(JSON.stringify(value)) > 128 * 1024) throw new Error('Draft exceeds storage limit');
    atomic(path.join(d, 'draft.json'), value, 128 * 1024); return value;
  }
  function loadDraft(scope) {
    validateScope(scope); const d = dir(scope); if (!d) return {draft:null,bad:false};
    const file = path.join(d,'draft.json'), result = read(file,128 * 1024), v = result.value;
    if (result.missing) return {draft:null,bad:false};
    if (!v || typeof v.text !== 'string' || v.text.length > 20000 || !MODES.has(v.mode) || !Number.isFinite(v.updatedAt)) return {draft:null,bad:true};
    if (now() - v.updatedAt >= TTL) { expire(file,result.identity); return {draft:null,bad:false}; }
    return {draft:{text:v.text,mode:v.mode,updatedAt:v.updatedAt},bad:false};
  }
  function draft(scope) {
    try { return loadDraft(scope).draft; } catch { return null; }
  }
  return { begin, append, task, finish, receipt, getReceipt, get, list, saveDraft, draft, liveElsewhere };
}

module.exports = { createRunJournal, MAX_BYTES, MAX_EVENTS, TTL };
