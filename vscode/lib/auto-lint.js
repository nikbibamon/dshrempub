'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn: nodeSpawn } = require('node:child_process');

const MAX_SOURCE_BYTES = 128 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024;
const TIMEOUT_MS = 2000;
const TERM_GRACE_MS = 250;
const KILL_GRACE_MS = 250;
const profiles = require('./lint-profiles');
const PYTHON_SCRIPT = [
  'import ast, json, sys',
  'try:',
  '    source = sys.stdin.buffer.read().decode("utf-8", "strict")',
  '    ast.parse(source)',
  '    result = {"ok": True}',
  'except SyntaxError as error:',
  '    result = {"ok": False, "line": error.lineno, "column": error.offset, "endLine": error.end_lineno, "endColumn": error.end_offset}',
  'except (UnicodeDecodeError, ValueError, TypeError):',
  '    result = {"ok": False, "invalid": True}',
  'sys.stdout.write(json.dumps(result, separators=(",", ":")))',
  'sys.exit(0 if result["ok"] else 1)',
].join('\n');

let active = false;
let quarantined = false;

function buildInvocation({ profileId, executable }) {
  if (typeof executable !== 'string' || !path.isAbsolute(executable)) {
    throw new TypeError('executable must be an absolute path');
  }
  switch (profileId) {
    case 'python-ast':
      return { executable, args: ['-I', '-S', '-B', '-c', PYTHON_SCRIPT] };
    case 'node-cjs':
      return { executable, args: ['--input-type=commonjs', '--check', '-'] };
    case 'node-esm':
      return { executable, args: ['--input-type=module', '--check', '-'] };
    default:
      throw new TypeError('unsupported syntax profile');
  }
}

function safeRelativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/')) return false;
  const parts = value.split('/');
  return !parts.some((part) => !part || part === '.' || part === '..' || part.includes('\0'));
}

function resultBase(profileId, snapshot, status) {
  const validProfile = ['python-ast', 'node-cjs', 'node-esm'].includes(profileId);
  const version = snapshot && Number.isSafeInteger(snapshot.version) && snapshot.version >= 0 ? snapshot.version : null;
  const contentHash = snapshot && typeof snapshot.contentHash === 'string' && /^[a-f0-9]{64}$/i.test(snapshot.contentHash)
    ? snapshot.contentHash.toLowerCase() : '';
  return {
    status,
    profileId: validProfile ? profileId : '',
    path: snapshot && typeof snapshot.path === 'string' ? snapshot.path.slice(0, 500) : '',
    version,
    contentHash,
    exitCode: null,
    diagnostics: [],
    reason: undefined,
  };
}

function diagnostic(line, column, endLine, endColumn) {
  const d = { message: 'Syntax error' };
  const position = (n) => Number.isSafeInteger(n) && n > 0 && n <= MAX_SOURCE_BYTES ? n : null;
  if (position(line)) d.line = position(line);
  if (position(column)) d.column = position(column);
  if (position(endLine)) d.endLine = position(endLine);
  if (position(endColumn)) d.endColumn = position(endColumn);
  return d;
}

function parsePython(output) {
  let parsed;
  try { parsed = JSON.parse(output.toString('utf8')); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (parsed.ok === true && Object.keys(parsed).length === 1) return { ok: true, diagnostics: [] };
  if (parsed.ok === false && parsed.invalid === true) return { ok: false, diagnostics: [diagnostic()] };
  if (parsed.ok === false && Number.isInteger(parsed.line) && parsed.line > 0 &&
      Number.isInteger(parsed.column) && parsed.column > 0) {
    return { ok: false, diagnostics: [diagnostic(parsed.line, parsed.column, parsed.endLine, parsed.endColumn)] };
  }
  return null;
}

function parseNodeSyntax(output) {
  const text = output.toString('utf8');
  const match = text.match(/(?:\[stdin\]|stdin):([1-9][0-9]*)(?::([1-9][0-9]*))?/);
  if (!match || !/SyntaxError\s*:/.test(text)) return null;
  let column = Number(match[2]) || null;
  if (!column) {
    const lines = text.split(/\r?\n/);
    const caret = lines.find((line) => /^\s*\^\s*$/.test(line));
    if (caret) column = caret.indexOf('^') + 1;
  }
  return { ok: false, diagnostics: [diagnostic(Number(match[1]), column)] };
}

function killOwned(child, signal, nativeChild) {
  if (!child) return;
  try {
    if (nativeChild && process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
    else if (typeof child.kill === 'function') child.kill(signal);
  } catch {
    try { if (typeof child.kill === 'function') child.kill(signal); } catch { /* already exited */ }
  }
}

function waitForClose(state, milliseconds) {
  if (state.closed) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(state.closed), milliseconds);
    state.closeWaiters.push(() => { clearTimeout(timer); resolve(true); });
  });
}

function waitForClosed(state) {
  if (state.closed) return Promise.resolve(true);
  return new Promise((resolve) => state.closeWaiters.push(() => resolve(true)));
}

function identityOf(stat) {
  return { dev: stat.dev.toString(), ino: stat.ino.toString(), mode: stat.mode.toString(), nlink: stat.nlink.toString(),
    size: stat.size.toString(), mtimeNs: stat.mtimeNs.toString(), ctimeNs: stat.ctimeNs.toString() };
}

function sameIdentity(a, b) {
  return !!a && !!b && ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].every((key) => a[key] === b[key]);
}

function nativeBinary(bytes) {
  return bytes.length >= 4 && ((bytes[0] === 0x7f && bytes.toString('ascii', 1, 4) === 'ELF') ||
    (bytes[0] === 0x4d && bytes[1] === 0x5a) || bytes.subarray(0, 4).equals(Buffer.from([0xfe, 0xed, 0xfa, 0xce])) ||
    bytes.subarray(0, 4).equals(Buffer.from([0xfe, 0xed, 0xfa, 0xcf])) || bytes.subarray(0, 4).equals(Buffer.from([0xce, 0xfa, 0xed, 0xfe])) ||
    bytes.subarray(0, 4).equals(Buffer.from([0xca, 0xfe, 0xba, 0xbe])));
}

async function pinApprovedExecutable(record, { scopeKey, workspaceRoots }) {
  const expectedKeys = ['v', 'profileId', 'scopeKey', 'executable', 'sha256', 'identity'];
  if (!record || Reflect.ownKeys(record).length !== expectedKeys.length || Reflect.ownKeys(record).some((key) => !expectedKeys.includes(key)) ||
      record.v !== 1 || record.scopeKey !== scopeKey || !/^[a-f0-9]{64}$/.test(scopeKey || '') ||
      typeof record.executable !== 'string' || !path.isAbsolute(record.executable) ||
      !/^[a-f0-9]{64}$/.test(record.sha256 || '') || !Array.isArray(workspaceRoots)) throw new Error('invalid executable approval');
  // Revalidate host supplied roots and reject an executable inside any root.
  const roots = [];
  for (const root of workspaceRoots) {
    if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('invalid workspace root');
    roots.push(await fs.promises.realpath(root));
  }
  const canonical = await fs.promises.realpath(record.executable);
  if (canonical !== record.executable || roots.some((root) => {
    const rel = path.relative(root, canonical);
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
  })) throw new Error('executable path is not approved');
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
  const handle = await fs.promises.open(canonical, flags);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size < 4n || before.size > 256n * 1024n * 1024n || (before.mode & 0o111n) === 0n) throw new Error('invalid executable file');
    const magic = Buffer.alloc(4);
    const readMagic = await handle.read(magic, 0, 4, 0);
    if (readMagic.bytesRead !== 4 || !nativeBinary(magic)) throw new Error('not a native executable');
    const hash = crypto.createHash('sha256');
    const chunk = Buffer.alloc(64 * 1024);
    let offset = 0;
    while (offset < Number(before.size)) {
      const size = Math.min(chunk.length, Number(before.size) - offset);
      const result = await handle.read(chunk, 0, size, offset);
      if (result.bytesRead !== size) throw new Error('executable changed during pin');
      hash.update(chunk.subarray(0, size));
      offset += size;
    }
    const after = await handle.stat({ bigint: true });
    const identity = identityOf(after);
    const pathStat = await fs.promises.lstat(canonical, { bigint: true });
    if (!sameIdentity(identityOf(before), identity) || !sameIdentity(record.identity, identity) ||
        !sameIdentity(identity, identityOf(pathStat)) || pathStat.isSymbolicLink() || hash.digest('hex') !== record.sha256) throw new Error('executable approval changed');
    return handle;
  } catch (error) {
    await handle.close().catch(() => {});
    throw error;
  }
}

function groupStatus(pid, injected) {
  if (injected) return injected(pid);
  try { process.kill(-pid, 0); return 'present'; }
  catch (error) { return error && error.code === 'ESRCH' ? 'absent' : 'unknown'; }
}

function signalGroup(pid, signal, injected) {
  if (injected) return injected(pid, signal);
  try { process.kill(-pid, signal); return true; } catch (error) { return error && error.code === 'ESRCH'; }
}

async function waitGroup(pid, milliseconds, injected) {
  const deadline = Date.now() + milliseconds;
  do {
    const status = groupStatus(pid, injected);
    if (status === 'absent') return status;
    if (Date.now() >= deadline) return status;
    await new Promise((resolve) => setTimeout(resolve, Math.min(25, Math.max(1, deadline - Date.now()))));
  } while (true);
}

async function run({ profile, snapshot, signal, guard, isCurrent, assertLaunchAllowed } = {}, { spawn = nodeSpawn, pinExecutable = profiles.pinExecutable, groupStatus: injectedGroupStatus, signalGroup: injectedSignalGroup } = {}) {
  const profileId = profile && profile.profileId;
  const base = resultBase(profileId, snapshot, 'tool_error');
  if (process.platform !== 'linux') { base.status = 'skipped'; base.reason = 'platform_not_supported'; return base; }
  const extensions = { 'python-ast': ['.py'], 'node-cjs': ['.cjs', '.js'], 'node-esm': ['.mjs', '.js'] };
  const ext = snapshot && typeof snapshot.path === 'string' ? path.posix.extname(snapshot.path) : '';
  if (!extensions[profileId]) { base.reason = 'unsupported_profile'; return base; }
  if (!extensions[profileId].includes(ext)) { base.status = 'skipped'; base.reason = 'unsupported_file'; return base; }
  if (!safeRelativePath(snapshot.path) || !Number.isInteger(snapshot.version) || snapshot.version < 0 ||
      !Number.isSafeInteger(snapshot.version) || snapshot.version > Number.MAX_SAFE_INTEGER ||
      typeof snapshot.text !== 'string' || typeof snapshot.contentHash !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(snapshot.contentHash) || typeof snapshot.scopeKey !== 'string' || !/^[a-f0-9]{64}$/i.test(snapshot.scopeKey) || snapshot.path.length > 500) {
    base.reason = 'invalid_snapshot'; return base;
  }
  if (Buffer.byteLength(snapshot.text, 'utf8') > MAX_SOURCE_BYTES) { base.reason = 'invalid_snapshot'; return base; }
  const source = Buffer.from(snapshot.text, 'utf8');
  if (source.length > MAX_SOURCE_BYTES || source.toString('utf8') !== snapshot.text) { base.reason = 'invalid_snapshot'; return base; }
  const hash = crypto.createHash('sha256').update(source).digest('hex');
  if (hash !== snapshot.contentHash.toLowerCase()) { base.reason = 'snapshot_hash_mismatch'; return base; }
  if (signal && signal.aborted) { base.status = 'cancelled'; base.reason = 'cancelled_before_start'; return base; }
  if (quarantined) { base.reason = 'runner_quarantined'; return base; }
  if (active) { base.reason = 'runner_busy'; return base; }
  if (typeof guard !== 'function' || typeof isCurrent !== 'function' || typeof assertLaunchAllowed !== 'function' || !profile || profile.profileId !== profileId || typeof profile.executable !== 'string' || !path.isAbsolute(profile.executable) || typeof profile.cwd !== 'string' || !path.isAbsolute(profile.cwd) || !Array.isArray(profile.workspaceRoots)) {
    base.reason = 'invalid_host_profile'; return base;
  }
  // Claim before yielding to the host guard so concurrent callers cannot both
  // pass their own async approval and start processes.
  active = true;
  let handle;
  let handleClosed = false;
  try {
  try { if ((await guard()) === false) { base.reason = 'profile_not_approved'; return base; } } catch { base.reason = 'profile_not_approved'; return base; }
  if (signal && signal.aborted) { base.status = 'cancelled'; base.reason = 'cancelled_before_start'; return base; }
  let invocation;
  try { invocation = buildInvocation({ profileId, executable: profile.executable }); } catch { base.reason = 'invalid_host_profile'; return base; }
  const executableRecord = { v: profile.v, profileId: profile.profileId, scopeKey: profile.scopeKey,
    executable: profile.executable, sha256: profile.sha256, identity: profile.identity };
  try { handle = await pinExecutable(executableRecord, { scopeKey: snapshot.scopeKey, workspaceRoots: profile.workspaceRoots }); } catch { base.reason = 'executable_pin_failed'; return base; }
  try { if ((await guard()) === false) { base.reason = 'profile_not_approved'; return base; } } catch { base.reason = 'profile_not_approved'; return base; }
  if (signal && signal.aborted) { base.status = 'cancelled'; base.reason = 'cancelled_before_start'; return base; }
  let current = false;
  try { current = isCurrent(snapshot) === true; } catch { current = false; }
  if (!current) { base.status = 'stale'; base.reason = 'snapshot_stale'; return base; }
  try {
    const decision = assertLaunchAllowed();
    if (decision && typeof decision.then === 'function') { Promise.resolve(decision).catch(() => {}); throw new Error('assertLaunchAllowed must be synchronous'); }
    if (decision === false) { base.reason = 'profile_not_approved'; return base; }
  } catch { base.reason = 'profile_not_approved'; return base; }
  if (signal && signal.aborted) { base.status = 'cancelled'; base.reason = 'cancelled_before_start'; return base; }
  let child;
  const state = { closed: false, closeWaiters: [], output: [], outputBytes: 0, overflow: false, spawnError: null, exitCode: null };
  let timedOut = false;
  let cancelled = false;
  let abortHandler;
  let timer;
  let spawned = false;
  let resolveStop;
  const stopPromise = new Promise((resolve) => { resolveStop = resolve; });
  const nativeChild = spawn === nodeSpawn;
  const statusGroup = (pid) => groupStatus(pid, injectedGroupStatus);
  const sendGroup = (pid, sig) => signalGroup(pid, sig, injectedSignalGroup);
  const signalOwned = (sig) => {
    if ((nativeChild || (injectedGroupStatus && injectedSignalGroup)) && child && Number.isInteger(child.pid) && child.pid > 0) sendGroup(child.pid, sig);
    else killOwned(child, sig, nativeChild);
  };
  const closeHandle = () => {
    if (handleClosed || !handle) return;
    handleClosed = true;
    Promise.resolve(handle.close()).catch(() => {});
  };
  try {
    child = spawn('/proc/self/fd/3', invocation.args, { argv0: invocation.executable, cwd: profile.cwd, env: { PATH: process.env.PATH || '', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' }, shell: false, windowsHide: true, detached: true, stdio: ['pipe', 'pipe', 'pipe', handle.fd] });
    spawned = true;
    if (!child || typeof child.on !== 'function') throw new Error('invalid child');
    child.once('spawn', closeHandle);
    child.once('error', (error) => { closeHandle(); state.spawnError = error; signalOwned('SIGTERM'); resolveStop(); });
    const collect = (chunk) => {
      if (state.closed) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = MAX_OUTPUT_BYTES - state.outputBytes;
      if (buf.length > remaining) {
        if (remaining > 0) state.output.push(buf.subarray(0, remaining));
        state.outputBytes = MAX_OUTPUT_BYTES;
        state.overflow = true;
        signalOwned('SIGTERM');
        resolveStop();
      } else { state.output.push(buf); state.outputBytes += buf.length; }
    };
    if (!child.stdout || !child.stderr || !child.stdin) throw new Error('invalid child');
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('close', (code) => {
      state.exitCode = Number.isInteger(code) ? code : null;
      state.closed = true;
      for (const wake of state.closeWaiters.splice(0)) wake();
    });
    timer = setTimeout(() => { timedOut = true; signalOwned('SIGTERM'); resolveStop(); }, TIMEOUT_MS);
    if (signal) {
      abortHandler = () => { cancelled = true; signalOwned('SIGTERM'); resolveStop(); };
      signal.addEventListener('abort', abortHandler, { once: true });
      if (signal.aborted) abortHandler();
    }
    child.stdin.on('error', (error) => { state.spawnError = error; signalOwned('SIGTERM'); resolveStop(); });
    try { child.stdin.end(snapshot.text, 'utf8'); } catch { state.spawnError = new Error('stdin failure'); signalOwned('SIGTERM'); resolveStop(); }
    await Promise.race([waitForClosed(state), stopPromise]);
    clearTimeout(timer);
    timer = null;
    const groupTracked = nativeChild || (injectedGroupStatus && injectedSignalGroup);
    const pid = child.pid;
    const cleanupDeadline = Date.now() + TERM_GRACE_MS + KILL_GRACE_MS;
    let unexpectedGroup = false;
    if (groupTracked && Number.isInteger(pid) && pid > 0) {
      let group = statusGroup(pid);
      unexpectedGroup = !(timedOut || cancelled || state.overflow || state.spawnError) && group !== 'absent';
      if (unexpectedGroup) sendGroup(pid, 'SIGTERM');
      if (timedOut || cancelled || state.overflow || group !== 'absent') {
        group = await waitGroup(pid, TERM_GRACE_MS, injectedGroupStatus);
        if (group !== 'absent') {
          sendGroup(pid, 'SIGKILL');
          group = await waitGroup(pid, KILL_GRACE_MS, injectedGroupStatus);
        }
      }
      if (group !== 'absent') { quarantined = true; base.reason = 'termination_unconfirmed'; return base; }
      if (!state.closed) await waitForClose(state, Math.max(0, cleanupDeadline-Date.now()));
    } else if (!state.closed) {
      await waitForClose(state, TERM_GRACE_MS);
      if (!state.closed) { killOwned(child,'SIGKILL',nativeChild); await waitForClose(state,KILL_GRACE_MS); }
    }
    if (!state.closed) { quarantined = true; base.reason = 'termination_unconfirmed'; return base; }
    if (unexpectedGroup) { base.reason = 'unexpected_process_group'; return base; }
    if (state.overflow) { base.reason = 'output_limit_exceeded'; return base; }
    if (cancelled || (signal && signal.aborted)) { base.status = 'cancelled'; base.reason = 'cancelled'; return base; }
    if (timedOut) { base.status = 'timed_out'; base.reason = 'timeout'; return base; }
    if (state.spawnError) { base.reason = 'spawn_failed'; return base; }
    base.exitCode = state.exitCode;
    const output = Buffer.concat(state.output, state.outputBytes);
    let parsed;
    if (profileId === 'python-ast') {
      parsed = parsePython(output);
      if (!parsed) { base.reason = 'unrecognized_python_output'; return base; }
      if (parsed.ok && state.exitCode === 0) base.status = 'passed';
      else if (!parsed.ok && state.exitCode !== 0) base.status = 'failed';
      else { base.reason = 'inconsistent_python_result'; return base; }
      base.diagnostics = parsed.diagnostics;
    } else if (state.exitCode === 0) {
      if (output.length !== 0) { base.reason = 'unexpected_node_output'; return base; }
      base.status = 'passed';
    } else {
      parsed = parseNodeSyntax(output);
      if (!parsed) { base.reason = 'unrecognized_node_error'; return base; }
      base.status = 'failed';
      base.diagnostics = parsed.diagnostics;
    }
    try { current = isCurrent(snapshot); } catch { current = false; }
    if (current !== true) { base.status = 'stale'; base.diagnostics = []; base.reason = 'snapshot_stale'; }
    return base;
  } catch {
    if (spawned && child) {
      const deadline=Date.now()+TERM_GRACE_MS+KILL_GRACE_MS;
      const tracked=nativeChild||(injectedGroupStatus&&injectedSignalGroup);
      if(tracked&&Number.isInteger(child.pid)&&child.pid>0){
        sendGroup(child.pid,'SIGTERM');
        let group=await waitGroup(child.pid,TERM_GRACE_MS,injectedGroupStatus);
        if(group!=='absent'){sendGroup(child.pid,'SIGKILL');group=await waitGroup(child.pid,KILL_GRACE_MS,injectedGroupStatus);}
        if(group!=='absent')quarantined=true;
      }else{
        killOwned(child,'SIGTERM',nativeChild);await waitForClose(state,TERM_GRACE_MS);
        if(!state.closed){killOwned(child,'SIGKILL',nativeChild);await waitForClose(state,KILL_GRACE_MS);}
      }
      if(!state.closed)await waitForClose(state,Math.max(0,deadline-Date.now()));
      if(!state.closed)quarantined=true;
    }
    base.reason = 'runner_error';
    return base;
  } finally {
    closeHandle();
    if (timer) clearTimeout(timer);
    if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
  }
  } finally {
    if (handle && !handleClosed) { handleClosed = true; try { await handle.close(); } catch { /* preserve the launch result */ } }
    active = false;
  }
}

module.exports = { buildInvocation, run };
