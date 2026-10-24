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
function readSnapshot(target) {
  noLinks(target);
  let fd;
  try {
    fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error('Rewind requires a regular, unlinked file.');
    if (stat.size > MAX_BYTES) throw new Error('File exceeds Rewind storage limit.');
    return { bytes: fs.readFileSync(fd), stat };
  } catch (error) { if (error.code === 'ENOENT') return { bytes: absent, stat: null }; throw error; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
function readBytes(target) { return readSnapshot(target).bytes; }
const fingerprint = value => value === null ? null : hash(value);
function createCheckpoints(storagePath, { now = Date.now, maxBytes = MAX_BYTES, ttl = TTL, io = {}, beforeRestoreOpen = async () => {} } = {}) {
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
      const target = safePath(root, file.absolute,true);
      if (target === root) throw new Error('Rewind requires a workspace file.');
      const before = readBytes(target);
      const buffer = file.document ? file.document.getText() : null;
      return { path: path.relative(root, target), before: before === null ? null : before.toString('base64'), beforeHash: fingerprint(before),
        buffer, afterHash: hash(Buffer.from(file.content, 'utf8')), mode: before === null ? null : fs.statSync(target).mode & 0o777 };
    }) };
    const bytes = Buffer.from(JSON.stringify(record));
    if (bytes.length > maxBytes) throw new Error('Rewind checkpoint exceeds storage limit; edit refused.');
    storage();
    // Keep the staging name outside records()' JSON filename filter. A failed
    // write/fsync therefore cannot make enumeration parse a partial record.
    // During staging, old valid records plus this one bounded record may use
    // up to twice maxBytes; stable published records are pruned back to maxBytes.
    const id = randomUUID(), staging = path.join(directory, `.${id}.tmp`), target = path.join(directory, id + '.json');
    const open = io.openSync || fs.openSync, write = io.writeFileSync || fs.writeFileSync;
    const sync = io.fsyncSync || fs.fsyncSync, rename = io.renameSync || fs.renameSync;
    const fd = open(staging, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { write(fd, bytes); sync(fd); }
    catch (error) { fs.closeSync(fd); try { fs.unlinkSync(staging); } catch {} throw error; }
    fs.closeSync(fd);
    rename(staging, target);
    let dirFd;
    try { dirFd = fs.openSync(directory, fs.constants.O_RDONLY); fs.fsyncSync(dirFd); }
    catch (error) {
      // Some supported platforms/filesystems cannot fsync a directory. The
      // record file itself was fsynced before the atomic rename.
      if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM'].includes(error.code)) throw error;
    }
    finally { if (dirFd !== undefined) fs.closeSync(dirFd); }
    prune();
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
        const target = safePath(root, file.path,true);
        const before = file.before === null ? null : Buffer.from(file.before, 'base64');
        if (fingerprint(before) !== file.beforeHash) throw new Error('Rewind snapshot checksum mismatch.');
        const current = readSnapshot(target), document = await inspect(target);
        const text = document?.getText(), version = document?.version;
        const diskHash = fingerprint(current.bytes), bufferHash = text === undefined ? null : hash(Buffer.from(text));
        const conflict = ![file.beforeHash, file.afterHash].includes(diskHash) || (bufferHash !== null && bufferHash !== file.afterHash);
        if (before === null || conflict) {
          const approved = await confirm({ path: file.path, deletion: before === null, conflict });
          if (approved !== true) { skipped++; continue; }
        }
        await guard();
        const latestDocument = await inspect(target);
        safePath(root, file.path,true);
        const latest = readSnapshot(target);
        if (latestDocument !== document || fingerprint(latest.bytes) !== diskHash || (document && (document.getText() !== text || document.version !== version))) throw new Error('File changed during Rewind confirmation. Try again.');
        // Update open buffers first, with VS Code document version checks. Then
        // restore original disk bytes (including BOM, CRLF and non-UTF8 bytes).
        if (document && before !== null && file.buffer === null && !Buffer.from(before.toString('utf8')).equals(before)) throw new Error('Close the binary file editor before Rewind.');
        await applyBuffer(target, before === null ? null : (file.buffer ?? before.toString('utf8')), document, {text,version});
        await guard(); safePath(root, file.path,true);
        const afterBuffer = fingerprint(readBytes(target));
        if (afterBuffer !== diskHash && !(before === null && afterBuffer === null)) throw new Error('File changed during Rewind.');
        if (before === null) { if (readBytes(target) !== null) fs.unlinkSync(target); }
        else {
          // Never recreate an existing-at-check target. Open without create or
          // truncate, then bind the write to the identity and bytes we checked.
          await beforeRestoreOpen(target);
          safePath(root, file.path,true);
          const recreating = latest.stat === null;
          if (recreating) { noLinks(path.dirname(target)); fs.mkdirSync(path.dirname(target), { recursive:true }); safePath(root,file.path,true); }
          const flags = fs.constants.O_RDWR | fs.constants.O_NOFOLLOW | (recreating ? fs.constants.O_CREAT | fs.constants.O_EXCL : 0);
          const fd = fs.openSync(target, flags, file.mode ?? 0o600);
          try {
            const opened = fs.fstatSync(fd);
            if (!opened.isFile() || opened.nlink !== 1) throw new Error('Unsafe Rewind target.');
            if (!recreating && (opened.dev !== latest.stat.dev || opened.ino !== latest.stat.ino)) throw new Error('File was replaced during Rewind. Try again.');
            const openedBytes = fs.readFileSync(fd);
            if (recreating ? openedBytes.length !== 0 : fingerprint(openedBytes) !== diskHash) throw new Error('File content changed during Rewind. Try again.');
            for (let offset=0;offset<before.length;) {
              const written=fs.writeSync(fd,before,offset,before.length-offset,offset);
              if (written<=0) throw new Error('Rewind write did not make progress.');
              offset+=written;
            }
            fs.ftruncateSync(fd, before.length); fs.fsyncSync(fd);
          } finally { fs.closeSync(fd); }
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
