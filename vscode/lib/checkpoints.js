'use strict';

// Local-only recovery data. Never import this module from a transport or export.
// Sync capture deliberately leaves no await between final path checks and writes.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { safePath } = require('./local-tools');
const TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 50 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const absent = null;
function noLinks(target) {
  let cursor = path.parse(path.resolve(target)).root;
  for (const part of path.resolve(target).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try { if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Rewind refuses symlinks.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
function readBytes(target) {
  noLinks(target);
  let fd;
  try {
    fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error('Rewind requires a regular, unlinked file.');
    if (stat.size > MAX_BYTES) throw new Error('File exceeds Rewind storage limit.');
    return fs.readFileSync(fd);
  } catch (error) { if (error.code === 'ENOENT') return absent; throw error; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
const fingerprint = value => value === null ? null : hash(value);
function createCheckpoints(storagePath, { now = Date.now, maxBytes = MAX_BYTES, ttl = TTL } = {}) {
  const directory = storagePath && path.join(storagePath, 'rewind-v1');
  let locked = false;
  let lastCaptureTime = -Infinity;
  function storage() {
    if (!directory) throw new Error('Rewind storage is unavailable; edit refused.');
    noLinks(directory);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    noLinks(directory);
  }
  function records() {
    storage();
    return fs.readdirSync(directory).filter(name => /^[a-f0-9-]+\.json$/.test(name)).map(name => {
      const target = path.join(directory, name), stat = fs.lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe Rewind storage entry.');
      const bytes = readBytes(target), record = JSON.parse(bytes.toString('utf8'));
      if (record.schema !== 1 || !Number.isFinite(record.time) || !Array.isArray(record.files)) throw new Error('Invalid Rewind record.');
      return { name, size: bytes.length, record };
    }).sort((a, b) => a.record.time - b.record.time || a.name.localeCompare(b.name));
  }
  function prune(reserve = 0) {
    const all = records();
    let total = all.reduce((sum, item) => sum + item.size, 0);
    for (const item of all) {
      if (item.record.time <= now() - ttl || total + reserve > maxBytes) {
        noLinks(path.join(directory, item.name));
        fs.unlinkSync(path.join(directory, item.name)); total -= item.size;
      }
    }
  }
  function capture({ root, runId, step, model = '—', title = 'Agent', files }) {
    if (locked) throw new Error('Rewind is restoring files; edit refused.');
    if (!runId || !Number.isInteger(step) || step < 1 || !files?.length) throw new Error('Invalid Rewind checkpoint.');
    root = path.resolve(root);
    if (directory && (directory === root || directory.startsWith(root + path.sep))) throw new Error('Rewind storage must be outside the workspace.');
    const time = Math.max(now(), lastCaptureTime + 0.001);
    lastCaptureTime = time;
    const record = { schema: 1, root, runId, step, model, title: title.slice(0, 120), time, files: files.map(file => {
      const target = safePath(root, file.absolute);
      if (target === root) throw new Error('Rewind requires a workspace file.');
      const before = readBytes(target);
      const buffer = file.document ? file.document.getText() : null;
      return { path: path.relative(root, target), before: before === null ? null : before.toString('base64'), beforeHash: fingerprint(before),
        buffer, afterHash: hash(Buffer.from(file.content, 'utf8')), mode: before === null ? null : fs.statSync(target).mode & 0o777 };
    }) };
    const bytes = Buffer.from(JSON.stringify(record));
    if (bytes.length > maxBytes) throw new Error('Rewind checkpoint exceeds storage limit; edit refused.');
    prune(bytes.length);
    const target = path.join(directory, randomUUID() + '.json');
    const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return record;
  }
  function list(root) {
    prune();
    const runs = new Map();
    for (const { record } of records()) {
      if (record.root !== path.resolve(root)) continue;
      let run = runs.get(record.runId);
      if (!run) runs.set(record.runId, run = { id: record.runId, title: record.title, time: record.time, steps: [] });
      run.steps.push({ step: record.step, time: record.time, model: record.model, files: record.files.map(file => file.path) });
    }
    return [...runs.values()].reverse().map(run => ({ ...run, steps: run.steps.sort((a, b) => a.step - b.step) }));
  }
  async function restore({ root, runId, step, inspect = async () => null, confirm, applyBuffer = async () => {}, guard = async () => {} }) {
    if (locked) throw new Error('A Rewind is already running.');
    locked = true;
    let restored = 0, skipped = 0;
    try {
      prune(); root = path.resolve(root);
      const selected = records().map(item => item.record).filter(record => record.root === root && record.runId === runId && record.step >= step).sort((a, b) => a.step - b.step);
      if (!selected.some(record => record.step === step)) throw new Error('This checkpoint expired. Refresh Rewind.');
      const targets = new Map();
      for (const record of selected) for (const file of record.files) {
        if (!targets.has(file.path)) targets.set(file.path, { ...file });
        targets.get(file.path).afterHash = file.afterHash;
      }
      for (const file of targets.values()) {
        await guard();
        const target = safePath(root, file.path);
        const before = file.before === null ? null : Buffer.from(file.before, 'base64');
        if (fingerprint(before) !== file.beforeHash) throw new Error('Rewind snapshot checksum mismatch.');
        const current = readBytes(target), document = await inspect(target);
        const text = document?.getText(), version = document?.version;
        const diskHash = fingerprint(current), bufferHash = text === undefined ? null : hash(Buffer.from(text));
        const conflict = ![file.beforeHash, file.afterHash].includes(diskHash) || (bufferHash !== null && bufferHash !== file.afterHash);
        if (before === null || conflict) {
          const approved = await confirm({ path: file.path, deletion: before === null, conflict });
          if (approved !== true) { skipped++; continue; }
        }
        await guard();
        const latestDocument = await inspect(target);
        safePath(root, file.path);
        if (latestDocument !== document || fingerprint(readBytes(target)) !== diskHash || (document && (document.getText() !== text || document.version !== version))) throw new Error('File changed during Rewind confirmation. Try again.');
        // Update open buffers first, with VS Code document version checks. Then
        // restore original disk bytes (including BOM, CRLF and non-UTF8 bytes).
        if (document && before !== null && file.buffer === null && !Buffer.from(before.toString('utf8')).equals(before)) throw new Error('Close the binary file editor before Rewind.');
        await applyBuffer(target, before === null ? null : (file.buffer ?? before.toString('utf8')), document, {text,version});
        await guard(); safePath(root, file.path);
        const afterBuffer = fingerprint(readBytes(target));
        if (afterBuffer !== diskHash && !(before === null && afterBuffer === null)) throw new Error('File changed during Rewind.');
        if (before === null) { if (readBytes(target) !== null) fs.unlinkSync(target); }
        else {
          noLinks(path.dirname(target)); fs.mkdirSync(path.dirname(target), { recursive: true }); safePath(root, file.path);
          const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, file.mode ?? 0o600);
          try { if (!fs.fstatSync(fd).isFile() || fs.fstatSync(fd).nlink !== 1) throw new Error('Unsafe Rewind target.'); fs.writeFileSync(fd, before); fs.ftruncateSync(fd, before.length); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
          if (fingerprint(readBytes(target)) !== file.beforeHash) throw new Error('Rewind byte verification failed.');
        }
        restored++;
      }
      return { restored, skipped };
    } catch (error) { error.restored = restored; error.skipped = skipped; throw error; } finally { locked = false; }
  }
  return { capture, list, prune, restore };
}
module.exports = { createCheckpoints, TTL, MAX_BYTES, hash };
