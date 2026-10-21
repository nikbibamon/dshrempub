'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MAX_EXECUTABLE_BYTES = 256 * 1024 * 1024;
const HASH_CHUNK_BYTES = 64 * 1024;
const PROFILES = new Set(['python-ast', 'node-cjs', 'node-esm']);
const EMPTY_CWD_NAME = '.tvijo-auto-lint-cwd';

function fail(message) {
  throw new Error(message);
}

function validateScopeKey(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('Invalid scope key');
}

function validateExecutableInput(value) {
  if (typeof value !== 'string' || value.length === 0 || !path.isAbsolute(value) || /[\u0000-\u001f\u007f]/.test(value)) {
    fail('Invalid executable path');
  }
}

function hasExactKeys(value, expected) {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length && keys.every(key => typeof key === 'string' && expected.includes(key));
}

function isWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function canonicalWorkspaceRoots(workspaceRoots) {
  if (!Array.isArray(workspaceRoots)) fail('Invalid workspace roots');
  const canonical = [];
  for (const root of workspaceRoots) {
    if (typeof root !== 'string' || !path.isAbsolute(root) || root.includes('\0')) fail('Invalid workspace root');
    const resolved = await fs.promises.realpath(root);
    const stat = await fs.promises.stat(resolved, { bigint: true });
    if (!stat.isDirectory()) fail('Workspace root is not a directory');
    canonical.push(resolved);
  }
  return canonical;
}

function assertOutside(candidate, roots, label) {
  if (roots.some(root => isWithin(candidate, root))) fail(`${label} is inside a workspace`);
}

function identityFrom(stat) {
  return {
    dev: stat.dev.toString(),
    ino: stat.ino.toString(),
    mode: stat.mode.toString(),
    nlink: stat.nlink.toString(),
    size: stat.size.toString(),
    mtimeNs: stat.mtimeNs.toString(),
    ctimeNs: stat.ctimeNs.toString()
  };
}

function sameIdentity(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.nlink === b.nlink &&
    a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

function isNativeExecutable(magic) {
  if (magic.length < 4) return false;
  const b = magic;
  // ELF, PE/COFF, and Mach-O (including universal/fat binaries).
  return (b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) ||
    (b[0] === 0x4d && b[1] === 0x5a) ||
    (b[0] === 0xfe && b[1] === 0xed && [0xfa, 0xfb].includes(b[2]) && [0xce, 0xcf].includes(b[3])) ||
    (b[0] === 0xce && b[1] === 0xfa && b[2] === 0xed && [0xfe, 0xcf].includes(b[3])) ||
    (b[0] === 0xca && b[1] === 0xfe && b[2] === 0xba && b[3] === 0xbe) ||
    (b[0] === 0xbe && b[1] === 0xba && b[2] === 0xfe && b[3] === 0xca) ||
    (b[0] === 0xca && b[1] === 0xfe && b[2] === 0xba && b[3] === 0xbf) ||
    (b[0] === 0xbf && b[1] === 0xba && b[2] === 0xfe && b[3] === 0xca);
}

async function inspectFile(canonicalExecutable, { keepOpen = false } = {}) {
  const noFollow = fs.constants.O_NOFOLLOW;
  if (noFollow === undefined) fail('Executable pinning requires O_NOFOLLOW');
  const flags = fs.constants.O_RDONLY | noFollow;
  const handle = await fs.promises.open(canonicalExecutable, flags);
  let keep = false;
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size < 4n || before.size > BigInt(MAX_EXECUTABLE_BYTES)) {
      fail('Executable must be a bounded, single-link regular file');
    }
    if (process.platform !== 'win32' && (before.mode & 0o111n) === 0n) fail('Executable is not executable');

    const magic = Buffer.alloc(4);
    const first = await handle.read(magic, 0, 4, 0);
    if (first.bytesRead !== 4 || !isNativeExecutable(magic)) fail('Executable is not a native binary');

    const hash = crypto.createHash('sha256');
    const chunk = Buffer.alloc(HASH_CHUNK_BYTES);
    let offset = 0n;
    while (offset < before.size) {
      const length = Number((before.size - offset) > BigInt(chunk.length) ? BigInt(chunk.length) : before.size - offset);
      const { bytesRead } = await handle.read(chunk, 0, length, Number(offset));
      if (bytesRead !== length) fail('Executable changed during hashing');
      hash.update(chunk.subarray(0, bytesRead));
      offset += BigInt(bytesRead);
    }
    const after = await handle.stat({ bigint: true });
    if (!sameIdentity(identityFrom(before), identityFrom(after))) fail('Executable changed during hashing');
    const canonicalPath = await fs.promises.realpath(canonicalExecutable);
    const pathIdentity = await fs.promises.lstat(canonicalExecutable, { bigint: true });
    if (!pathIdentity.isFile() || pathIdentity.isSymbolicLink() || canonicalPath !== canonicalExecutable ||
        !sameIdentity(identityFrom(before), identityFrom(pathIdentity))) {
      fail('Executable path changed during hashing');
    }
    const result = { sha256: hash.digest('hex'), identity: identityFrom(after) };
    if (keepOpen) {
      result.handle = handle;
      keep = true;
    }
    return result;
  } finally {
    if (!keep) await handle.close();
  }
}

async function inspectExecutable({ profileId, executable, scopeKey, workspaceRoots } = {}) {
  if (!PROFILES.has(profileId)) fail('Unknown syntax profile');
  validateScopeKey(scopeKey);
  validateExecutableInput(executable);
  const roots = await canonicalWorkspaceRoots(workspaceRoots);
  const canonicalExecutable = await fs.promises.realpath(executable);
  if (!path.isAbsolute(canonicalExecutable)) fail('Executable path is not absolute');
  assertOutside(canonicalExecutable, roots, 'Executable');
  const { sha256, identity } = await inspectFile(canonicalExecutable);
  return Object.freeze({
    v: 1,
    profileId,
    scopeKey,
    executable: canonicalExecutable,
    sha256,
    identity: Object.freeze(identity)
  });
}

async function verifyExecutable(record, { scopeKey, workspaceRoots } = {}) {
  try {
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        !hasExactKeys(record, ['executable', 'identity', 'profileId', 'scopeKey', 'sha256', 'v']) ||
        record.v !== 1 || !PROFILES.has(record.profileId) ||
        typeof record.executable !== 'string' || typeof record.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(record.sha256) || !record.identity || typeof record.identity !== 'object') return false;
    validateScopeKey(scopeKey);
    if (Array.isArray(record.identity) || !hasExactKeys(record.identity, ['ctimeNs', 'dev', 'ino', 'mode', 'mtimeNs', 'nlink', 'size'])) return false;
    if (record.scopeKey !== scopeKey) return false;
    validateExecutableInput(record.executable);
    const roots = await canonicalWorkspaceRoots(workspaceRoots);
    const canonicalExecutable = await fs.promises.realpath(record.executable);
    if (canonicalExecutable !== record.executable) return false;
    assertOutside(canonicalExecutable, roots, 'Executable');
    const current = await inspectFile(canonicalExecutable);
    return current.sha256 === record.sha256 && sameIdentity(record.identity, current.identity);
  } catch {
    return false;
  }
}

async function pinExecutable(record, { scopeKey, workspaceRoots } = {}) {
  if (process.platform !== 'linux') fail('Executable pinning is supported only on Linux');
  if (fs.constants.O_NOFOLLOW === undefined) fail('Executable pinning requires O_NOFOLLOW');
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      !hasExactKeys(record, ['executable', 'identity', 'profileId', 'scopeKey', 'sha256', 'v']) ||
      record.v !== 1 || !PROFILES.has(record.profileId) || typeof record.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(record.sha256) || !record.identity || typeof record.identity !== 'object' ||
      Array.isArray(record.identity) || !hasExactKeys(record.identity,
        ['ctimeNs', 'dev', 'ino', 'mode', 'mtimeNs', 'nlink', 'size'])) {
    fail('Invalid executable approval record');
  }
  validateScopeKey(scopeKey);
  if (record.scopeKey !== scopeKey) fail('Executable approval scope changed');
  validateExecutableInput(record.executable);
  const roots = await canonicalWorkspaceRoots(workspaceRoots);
  const canonicalExecutable = await fs.promises.realpath(record.executable);
  if (canonicalExecutable !== record.executable) fail('Executable path is not canonical');
  assertOutside(canonicalExecutable, roots, 'Executable');
  const pinned = await inspectFile(canonicalExecutable, { keepOpen: true });
  try {
    if (pinned.sha256 !== record.sha256 || !sameIdentity(record.identity, pinned.identity)) {
      fail('Executable does not match its approval record');
    }
    return pinned.handle;
  } catch (error) {
    await pinned.handle.close();
    throw error;
  }
}

async function emptyCwd(storageRoot, workspaceRoots) {
  if (typeof storageRoot !== 'string' || !path.isAbsolute(storageRoot) || storageRoot.includes('\0')) fail('Invalid storage root');
  const roots = await canonicalWorkspaceRoots(workspaceRoots);
  const canonicalStorage = await fs.promises.realpath(storageRoot);
  const storageStat = await fs.promises.stat(canonicalStorage, { bigint: true });
  if (!storageStat.isDirectory()) fail('Storage root is not a directory');
  assertOutside(canonicalStorage, roots, 'Storage root');
  const target = path.join(canonicalStorage, EMPTY_CWD_NAME);
  try {
    await fs.promises.mkdir(target, { mode: 0o700 });
  } catch (error) {
    if (!error || error.code !== 'EEXIST') throw error;
  }

  const lstat = await fs.promises.lstat(target, { bigint: true });
  if (!lstat.isDirectory() || lstat.isSymbolicLink()) fail('Lint cwd must be a real directory');
  const canonicalTarget = await fs.promises.realpath(target);
  if (canonicalTarget !== target) fail('Lint cwd must not resolve through a link');
  assertOutside(canonicalTarget, roots, 'Lint cwd');
  if (typeof process.getuid === 'function' && lstat.uid !== BigInt(process.getuid())) fail('Lint cwd is not privately owned');
  if ((lstat.mode & 0o077n) !== 0n) fail('Lint cwd permissions are not private');
  const entries = await fs.promises.readdir(canonicalTarget);
  if (entries.length !== 0) fail('Lint cwd is not empty');
  return canonicalTarget;
}

module.exports = { inspectExecutable, verifyExecutable, pinExecutable, emptyCwd };
