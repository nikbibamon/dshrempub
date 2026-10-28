'use strict';

// Local, bounded tools for the editor agent. Every path is resolved inside the
// opened workspace, every command is explicit, and destructive commands are
// refused before a shell is started. The model never gets the host's secrets.

const fs = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { analyzeCommand, isCommandDecision, BLOCKED_COMMAND } = require('./command-policy');
const planSearch = require('./plan-search');
const { findTrailingWhitespaceMatch, indentationHint } = require('./replacement-match');

const MAX_READ = 64 * 1024;
const MAX_OUTPUT = 8 * 1024;
const MAX_MATCHES = 50;
const MAX_LIST = 200;
const DEFAULT_TIMEOUT = 60_000;

const SECRET_FILE = /^(?:\.env(?:\.|$)|secrets?\.|credentials?\.|auth\.json$|\.npmrc$|\.netrc$|\.pypirc$|id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx|crt|der)$)/i;
const EXCLUDED_DIRS = new Set(['.git', '.hg', '.svn', '.ssh', '.aws', '.tvijo', 'node_modules', '.venv', 'venv', 'dist', 'build', 'target', '__pycache__', '.pytest_cache']);

function inside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function safePath(root, value, allowRulesFile = false) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\u0000')) throw new Error('A file path is required.');
  const target = path.resolve(root, value);
  if (!inside(root, target)) throw new Error('Path escapes the workspace: ' + value);
  const parts = path.relative(root, target).split(path.sep);
  if (parts.some((part) => EXCLUDED_DIRS.has(part) && !(allowRulesFile && part==='.tvijo' && parts.length===2 && parts[0]==='.tvijo' && parts[1]==='rules.md'))) throw new Error('Path is in an excluded directory: ' + value);
  if (SECRET_FILE.test(path.basename(target))) throw new Error('Secret-like files are not available to tools: ' + value);
  const absoluteRoot = path.resolve(root);
  const rootParts = absoluteRoot.split(path.sep).filter(Boolean);
  let cursor = path.parse(absoluteRoot).root;
  for (const part of [...rootParts, ...parts.filter(Boolean)]) {
    cursor = path.join(cursor, part);
    try {
      if (fssync.lstatSync(cursor).isSymbolicLink()) throw new Error('Symlinks are not available to tools: ' + value);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const canonicalRoot = fssync.realpathSync(root);
  try {
    if (!inside(canonicalRoot, fssync.realpathSync(target))) throw new Error('Canonical path escapes the workspace: ' + value);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return target;
}

function truncate(text, limit = MAX_OUTPUT) {
  if (typeof text !== 'string') return '';
  return text.length > limit ? text.slice(0, limit) + '\n… [truncated]' : text;
}

function cleanEnv(source = process.env, extra = false) {
  const env = {};
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'SYSTEMROOT', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP']) {
    if (typeof source[key] === 'string') env[key] = source[key];
  }
  if (extra) {
    for (const key of ['HOME','USERPROFILE','APPDATA','LOCALAPPDATA','CODEX_HOME','CLAUDE_CONFIG_DIR','XDG_CONFIG_HOME','XDG_CACHE_HOME']) if (typeof source[key] === 'string') env[key] = source[key];
    return env; // Host shell grant includes normal network/Git access, never provider keys.
  }
  // Preserve the complete counted config before adding the host transport policy.
  for(const [key,value] of Object.entries(source))if(/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/.test(key))env[key]=value;
  return require('./agent-command-env').blockGitPush(env);
}

async function listDirectory(root, relative) {
  const target = safePath(root, relative || '.');
  const entries = await fs.readdir(target, { withFileTypes: true });
  return entries
    .filter((entry) => !entry.name.startsWith('.'))
    .slice(0, MAX_LIST)
    .map((entry) => entry.name + (entry.isDirectory() ? '/' : ''))
    .sort();
}

async function readFile(root, relative, start, end) {
  const target = safePath(root, relative);
  const stat = await fs.lstat(target);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Only regular files can be read.');
  const from = Math.max(1, Math.floor(Number(start)) || 1);
  const to = start || end ? Math.max(from, Math.floor(Number(end)) || from + 400) : Infinity;
  const handle = await fs.open(target, 'r'), buffer = Buffer.alloc(MAX_READ), selected = [];
  let line = 1, position = 0, stopped = false, count = 0;
  try {
    while (!stopped) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (!bytesRead) break;
      position += bytesRead;
      for (let i = 0; i < bytesRead; i++) {
        if (line >= from) {
          if (count === MAX_READ || line > to) { stopped = true; break; }
          selected.push(buffer[i]); count++;
        }
        if (buffer[i] === 10) line++;
      }
    }
  } finally { await handle.close(); }
  const truncated = stopped || position < stat.size;
  const content = new TextDecoder('utf-8').decode(Uint8Array.from(selected), { stream: truncated });
  return { path: relative, start: from, end: Math.min(line, to), total: truncated ? null : line, content,
    bytes: stat.size, truncated, ...(truncated ? { note: 'File truncated, ' + stat.size + ' bytes; use start/end to read another line range.' } : {}) };
}

async function search(root, query, relative, max) {
  if (typeof query !== 'string' || !query.trim()) throw new Error('A search query is required.');
  const cwd = safePath(root, relative || '.');
  const limit = Math.min(Math.max(Number(max) || 20, 1), MAX_MATCHES);
  const files = [];
  async function collect(dir, depth = 0) {
    if (depth > 8 || files.length >= 1000) return;
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || EXCLUDED_DIRS.has(entry.name) || SECRET_FILE.test(entry.name) || entry.isSymbolicLink()) continue;
      const target = safePath(root, path.relative(root, path.join(dir, entry.name)));
      if (entry.isDirectory()) await collect(target, depth + 1);
      else if (entry.isFile() && files.length < 1000) files.push(target);
    }
  }
  if ((await fs.lstat(cwd)).isDirectory()) await collect(cwd); else files.push(cwd);
  if (!files.length) return { code: 1, output: '', error: '' };
  return await new Promise((resolve) => {
    const child = spawn('rg', ['--no-config', '--no-ignore', '-n', '--no-heading', '--color', 'never', '-m', String(limit), '-e', query, '--', ...files], { cwd: root, env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
    let out = ''; let err = '';
    child.stdout.on('data', (chunk) => { if (out.length < MAX_READ) out += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { if (err.length < 2000) err += chunk.toString('utf8'); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, output: truncate(out), error: truncate(err, 1000) }); });
  }) || await fallbackSearch(root, cwd, query, limit);
}

async function fallbackSearch(root, cwd, query, limit) {
  const matches = [];
  async function walk(dir, depth) {
    if (depth > 4 || matches.length >= limit) return;
    let entries = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (matches.length >= limit) break;
      if (entry.name.startsWith('.') || EXCLUDED_DIRS.has(entry.name)) continue;
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(target, depth + 1); continue; }
      if (!entry.isFile() || SECRET_FILE.test(entry.name)) continue;
      let stat; try { stat = await fs.stat(target); } catch { continue; }
      if (stat.size > 256 * 1024) continue;
      let text; try { text = await fs.readFile(target, 'utf8'); } catch { continue; }
      text.split(/\r?\n/).forEach((line, index) => {
        if (matches.length < limit && line.includes(query)) matches.push(path.relative(root, target) + ':' + (index + 1) + ':' + line.slice(0, 300));
      });
    }
  }
  await walk(cwd, 0);
  return { code: 0, output: matches.join('\n'), error: '' };
}

function autoCommand(command) {
  const vectors = { 'npm test':['npm','test'], 'pnpm test':['pnpm','test'], 'yarn test':['yarn','test'], 'go test ./...':['go','test','./...'], 'cargo test':['cargo','test'] };
  return Object.hasOwn(vectors, command) ? vectors[command].slice() : null;
}

// A Full access chain may change directory before it removes or redirects.
// Follow literal `cd` steps; once the location is unknown or outside the
// workspace, later removals and output files are refused.
function assertShellPaths(root, cwd, decision) {
  const blocked = () => { throw new Error('This command is blocked by the local safety rules.'); };
  let here = cwd, known = true;
  const target = value => { if (!known || value.startsWith('~')) blocked(); const absolute = path.resolve(here, value); try { safePath(root, absolute); } catch { blocked(); } return absolute; };
  for (const segment of decision.segments) {
    for (const file of segment.redirects) if (file !== '/dev/null') target(file);
    if (segment.executable === 'cd' || segment.executable === 'pushd') {
      const next = segment.args.filter(arg => arg !== '--')[0];
      if (!next || next === '-' || next.startsWith('~') || next.startsWith('-')) { known = false; continue; }
      here = path.resolve(here, next);
      try { safePath(root, here); } catch { known = false; }
    } else if (segment.executable === 'popd') known = false;
    else if (segment.executable === 'rm') {
      let operandsOnly = false;
      for (const arg of segment.args) {
        if (!operandsOnly && arg === '--') { operandsOnly = true; continue; }
        if (!operandsOnly && arg.startsWith('-') && arg !== '-') continue;
        if (target(arg) === path.resolve(root)) blocked();
      }
    }
  }
}

async function runCommand(root, action, confirm, { signal, onLifecycle = () => {}, guard = async()=>{}, allowShell = false, extraAccess = false } = {}) {
  const shell = typeof allowShell === 'function' ? !!allowShell() : !!allowShell;
  const extra = typeof extraAccess === 'function' ? !!extraAccess() : !!extraAccess;
  const decision = isCommandDecision(action.commandDecision, action.command) && (!action.commandDecision.shell || shell) && (!action.commandDecision.extra || extra) ? action.commandDecision : analyzeCommand(action.command, { shell, extra });
  const command = typeof action.command === 'string' ? action.command : '';
  if (!decision.ok) throw new Error(decision.reason);
  const cwd = action.cwd ? safePath(root, action.cwd) : root;
  const executable = path.basename(decision.executable).toLowerCase().replace(/\.exe$/,'');
  const assertRemovalPaths = () => { if (decision.extra && extra) return; if (decision.shell) assertShellPaths(root, cwd, decision); else if (executable === 'rm') {
    // Bound every removal operand, including those before an option terminator.
    // This also covers GNU option abbreviations without guessing their effect.
    let operandsOnly = false;
    for (const target of decision.args) {
        if (!operandsOnly && target === '--') { operandsOnly = true; continue; }
        if (!operandsOnly && target.startsWith('-') && target !== '-') continue;
        const absolute = path.resolve(cwd,target);
        if (absolute === path.resolve(root)) throw new Error('This command is blocked by the local safety rules.');
        try { safePath(root,absolute); } catch { throw new Error('This command is blocked by the local safety rules.'); }
    }
  } };
  assertRemovalPaths();
  const approved = await confirm(Object.freeze({ command, cwd, signal, decision }));
  if (!approved) return { ok: false, refused: true, command, cwd };
  await guard();
  safePath(root, action.cwd || '.');
  assertRemovalPaths();
  if (signal?.aborted) return { ok:false, cancelled:true, command, cwd, termination:'not_started' };
  const timeout = Math.min(Math.max(Number(action.timeout_ms) || DEFAULT_TIMEOUT, 1000), 180000);
  return await new Promise((resolve) => {
    const id = randomUUID();
    let child;
    try {
      child = spawn(decision.executable, decision.args, { shell: false, cwd, env: cleanEnv(process.env, extra), stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    } catch (error) {
      onLifecycle({ type:'error', id, status:'failed', startedAt:null, endedAt:Date.now(), error:error.message });
      resolve({ ok:false, command, cwd, error:error.message }); return;
    }
    let stdout = ''; let stderr = ''; let timedOut = false; let cancelled = false; let startedAt = null; let finished = false;
    const emit = (type, data = {}) => { try { onLifecycle({ type, id, command:'run_command', ...data }); } catch { /* Telemetry must not break command execution. */ } };
    const signalOwned = name => {
      if (process.platform !== 'win32' && Number.isInteger(child.pid)) {
        try { process.kill(-child.pid, name); return true; } catch { /* The process group may already have exited. */ }
      }
      try { return child.kill(name); } catch { return false; }
    };
    let killTimer = null;
    const requestStop = () => {
      signalOwned('SIGTERM');
      if (killTimer) clearTimeout(killTimer);
      killTimer = setTimeout(() => signalOwned('SIGKILL'), 2000);
      killTimer.unref?.();
    };
    const onAbort = () => { if (!finished && !cancelled) { cancelled = true; emit('cancel_requested', { status:'running', startedAt }); requestStop(); } };
    const timer = setTimeout(() => { timedOut = true; emit('timeout', { status:'running', startedAt }); requestStop(); }, timeout);
    child.stdout.on('data', (chunk) => { if (stdout.length < MAX_OUTPUT * 3) stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { if (stderr.length < MAX_OUTPUT * 3) stderr += chunk.toString('utf8'); });
    child.once('spawn', () => {
      startedAt = Date.now();
      emit('start', { status:'running', startedAt });
      if (signal?.aborted) onAbort();
    });
    signal?.addEventListener('abort', onAbort, { once:true });
    child.on('error', (error) => {
      if (finished) return;
      finished = true; clearTimeout(timer); if (killTimer) clearTimeout(killTimer); signal?.removeEventListener('abort', onAbort);
      const endedAt = Date.now(); emit('error', { status:'failed', startedAt, endedAt });
      resolve({ ok:false, command, cwd, error:error.message, timedOut, cancelled, termination:'error' });
    });
    child.on('close', (code, exitSignal) => {
      if (finished) return;
      finished = true; clearTimeout(timer); if (killTimer) clearTimeout(killTimer); signal?.removeEventListener('abort', onAbort);
      const endedAt = Date.now(), status = timedOut ? 'timed_out' : cancelled ? 'cancelled' : code === 0 ? 'completed' : 'failed';
      emit('exit', { status, startedAt, endedAt, exitCode:code, signal:exitSignal });
      resolve({ ok: code === 0 && !timedOut && !cancelled, command, cwd, exitCode: code, signal:exitSignal, timedOut, cancelled, termination:'observed_exit', stdout: truncate(stdout), stderr: truncate(stderr) });
    });
  });
}

function snapshotIdentity(stat) {
  return Object.freeze(Object.fromEntries(['dev','ino','size','mode','nlink','mtimeNs','ctimeNs'].map(key=>[key,String(stat[key])])));
}

const safeWritePath=(root,value)=>safePath(root,value,true);

function writeSnapshot(root, target, allowMissing = false) {
  safeWritePath(root,target);
  let fd;
  try { fd = fssync.openSync(target, fssync.constants.O_RDONLY | (fssync.constants.O_NOFOLLOW || 0)); }
  catch(error) { if(allowMissing && error.code==='ENOENT') return {content:null,identity:null}; throw error; }
  try {
    const before=fssync.fstatSync(fd,{bigint:true});
    if(!before.isFile() || before.nlink!==1n || before.size>MAX_READ*2) throw new Error('Refusing an unsafe or oversized write target.');
    const bytes=Buffer.alloc(MAX_READ*2+1);let length=0;
    while(length<bytes.length){const read=fssync.readSync(fd,bytes,length,bytes.length-length,length);if(!read)break;length+=read;}
    const identity=snapshotIdentity(before);
    safeWritePath(root,target);
    if(BigInt(length)!==before.size || JSON.stringify(identity)!==JSON.stringify(snapshotIdentity(fssync.fstatSync(fd,{bigint:true}))) || JSON.stringify(identity)!==JSON.stringify(snapshotIdentity(fssync.lstatSync(target,{bigint:true})))) throw new Error('File changed while reading the write target.');
    const raw=bytes.subarray(0,length),content=raw.toString('utf8');
    if(!Buffer.from(content,'utf8').equals(raw) || content.includes('\0')) throw new Error('Refusing to edit binary or invalid UTF-8 content.');
    return {content,identity};
  } finally {fssync.closeSync(fd);}
}

function assertWriteSnapshot(root,target,previous,identity) {
  const current=writeSnapshot(root,target,previous===null);
  if(current.content!==previous || JSON.stringify(current.identity)!==JSON.stringify(identity)) throw new Error('File changed after the write proposal.');
}

async function writeFile(root, action, confirm, applyWrite, beforeWrite, operation = 'write_file') {
  const target = safeWritePath(root, action.path);
  const content = typeof action.content === 'string' ? action.content : '';
  if (Buffer.byteLength(content, 'utf8') > MAX_READ * 2) throw new Error('Refusing to write more than 128 KiB in one step.');
  const {content:previous,identity:diskIdentity}=writeSnapshot(root,target,true);
  if (previous === content) return { ok: true, unchanged: true, path: action.path };
  const approved = await confirm({ path: action.path, absolute: target, previous, content, operation });
  if (!approved) return { ok: false, refused: true, path: action.path };
  safeWritePath(root, action.path);
  assertWriteSnapshot(root,target,previous,diskIdentity);
  if (applyWrite) await applyWrite({ absolute: target, previous, content, diskIdentity });
  else {
    let current = null;
    try { current = await fs.readFile(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (current !== previous) throw new Error('File changed during confirmation.');
    await fs.mkdir(path.dirname(target), { recursive: true });
    safeWritePath(root, action.path);
    const checkpoint = beforeWrite({ absolute: target, content });
    if (checkpoint && typeof checkpoint.then === 'function') await checkpoint;
    safeWritePath(root, action.path);
    let latest = null;
    try { latest = await fs.readFile(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (latest !== previous) throw new Error('File changed before write.');
    safeWritePath(root, action.path);
    assertWriteSnapshot(root,target,previous,diskIdentity);
    await fs.writeFile(target, content, {encoding:'utf8',flag:previous===null?'wx':'w'});
  }
  return { ok: true, path: action.path, bytes: Buffer.byteLength(content, 'utf8'), created: previous === null };
}

function normalizeEolWithOffsets(text) {
  let normalized = '';
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\r' && text[i + 1] === '\n') i++;
    normalized += text[i];
    offsets.push(i + 1);
  }
  return { text:normalized, offsets };
}

function findEolMatch(previous, old) {
  if (/\r(?!\n)/.test(old)) return { match:null };
  const oldEols = old.match(/\r\n|\n/g) || [];
  if (oldEols.some(eol => eol !== oldEols[0])) return { match:null };
  const normalizedOld = old.replace(/\r\n/g, '\n');
  const lines = (normalizedOld.endsWith('\n') ? normalizedOld.slice(0,-1) : normalizedOld).split('\n');
  if (lines.length < 2 || !lines[0].trim() || !lines.at(-1).trim() || lines.filter(line => line.trim()).length < 2) return { match:null };
  const source = normalizeEolWithOffsets(previous), needle = old.replace(/\r\n/g, '\n');
  const matches = [];
  let at = 0;
  while ((at = source.text.indexOf(needle, at)) !== -1) {
    const after = at + needle.length;
    if ((at === 0 || source.text[at - 1] === '\n') && (needle.endsWith('\n') || after === source.text.length || source.text[after] === '\n')) {
      const start = source.offsets[at], end = source.offsets[after];
      const raw = previous.slice(start, end);
      const eols = raw.match(/\r\n|\n/g) || [];
      const valid = (!raw.includes('\r') || (raw.match(/\r/g) || []).length === eols.filter(eol => eol === '\r\n').length) && (!eols.length || eols.every(eol => eol === eols[0]));
      matches.push({start,end,valid});
    }
    at++;
  }
  if (matches.length > 1) return { ambiguous:true };
  if (matches.length === 1 && matches[0].valid) return { match:matches[0] };
  return { match:null };
}

async function replaceInFile(root, action, confirm, applyWrite, beforeWrite) {
  const target = safeWritePath(root, action.path);
  if (typeof action.old !== 'string' || !action.old) throw new Error('The old text is required.');
  if (typeof action.new !== 'string') throw new Error('The replacement text is required.');
  const {content:previous,identity:diskIdentity}=writeSnapshot(root,target);
  let count = 0, cursor = 0;
  while ((cursor = previous.indexOf(action.old, cursor)) !== -1) { count++; cursor++; }
  if (count > 1) throw new Error('The old text appears ' + count + ' times; include more surrounding context.');
  let matchKind = 'exact', start = -1, end = -1;
  if (count === 1) { start = previous.indexOf(action.old); end = start + action.old.length; }
  else {
    const fallback = findEolMatch(previous, action.old);
    if (fallback.ambiguous) throw new Error('The EOL-normalized text appears more than once; include more surrounding context.');
    if (fallback.match) { ({ start, end } = fallback.match); matchKind = 'eol'; }
    else {
      const trailing = findTrailingWhitespaceMatch(previous, action.old);
      if (trailing.ambiguous) throw new Error('The trailing-whitespace match appears more than once; include more surrounding context.');
      if (trailing.match) { ({ start, end } = trailing.match); matchKind = 'trailing_whitespace'; }
      else {
        const hint = indentationHint(previous, action.old);
        if (hint) return { ok:false, path:action.path, reason:'indentation_mismatch',
          error:'The old text was not found. Indentation differs; no edit was made. Retry with the exact current block in hint.text.', hint };
        throw new Error('The old text was not found. Read the file and copy the exact text.');
      }
    }
  }
  const content = previous.slice(0, start) + action.new + previous.slice(end);
  if(content===previous) return {ok:true,unchanged:true,path:action.path};
  if (Buffer.byteLength(content, 'utf8') > MAX_READ * 2) throw new Error('Refusing to write more than 128 KiB in one step.');
  const approved = await confirm({ path: action.path, absolute: target, previous, content, operation: 'replace_in_file', matchKind });
  if (!approved) return { ok: false, refused: true, path: action.path };
  safeWritePath(root, action.path);
  assertWriteSnapshot(root,target,previous,diskIdentity);
  if (applyWrite) await applyWrite({ absolute: target, previous, content, diskIdentity });
  else {
    if (await fs.readFile(target, 'utf8') !== previous) throw new Error('File changed during confirmation.');
    const checkpoint = beforeWrite({ absolute: target, content });
    if (checkpoint && typeof checkpoint.then === 'function') await checkpoint;
    safeWritePath(root, action.path);
    let latest = null;
    try { latest = await fs.readFile(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (latest !== previous) throw new Error('File changed before write.');
    safeWritePath(root, action.path);
    assertWriteSnapshot(root,target,previous,diskIdentity);
    await fs.writeFile(target, content, 'utf8');
  }
  return { ok: true, path: action.path, bytes: Buffer.byteLength(content, 'utf8') };
}

function createTools({ root, confirmRun, confirmWrite, applyWrite, beforeWrite = () => {}, guard = async () => {}, signal, onCommandLifecycle = () => {}, planInspect = null, codeIntelligence = null, allowShell = false, extraAccess = false, agentReview = null, extraSandbox = null }) {
  return {
    root,
    async execute(action, context = {}) {
      await guard();
      if (!action || typeof action.tool !== 'string') throw new Error('A tool name is required.');
      if (context.planMode && ['write_file', 'replace_in_file', 'run_command', 'agent_review'].includes(action.tool)) return { ok: false, refused: true, reason: 'plan_mode' };
      const extraEnabled = !context.planMode && (typeof extraAccess === 'function' ? !!extraAccess() : !!extraAccess);
      if (extraEnabled && action.tool !== 'agent_capabilities') require('./extra-sandbox').assertExtraSandbox(extraSandbox);
      switch (action.tool) {
        case 'agent_capabilities': {
          const extra = !context.planMode && (typeof extraAccess === 'function' ? !!extraAccess() : !!extraAccess);
          const value = {ok:true, mode:context.planMode ? 'plan' : extra ? 'extra' : allowShell ? 'full' : 'agent', run_command:!context.planMode && (!extra || extraSandbox?.ready === true), sandbox_reason:extra && !extraSandbox?.ready ? require('./extra-sandbox').unavailable().reason : null, host_shell:false, shell_syntax:extra && process.platform !== 'win32' ? 'posix' : 'literal', editor_file_scope:root, review:extra && !!agentReview, copilot:'Use @tvijo or #tvijo from Copilot Chat; outbound Copilot review is not implemented.'};
          if (extra && agentReview) value.agents = await agentReview.status();
          await guard(); return value;
        }
        case 'agent_review': {
          const extra = typeof extraAccess === 'function' ? !!extraAccess() : !!extraAccess;
          if (!extra || !agentReview) return {ok:false,refused:true,reason:'extra_access_required'};
          const value = await agentReview.review(action); await guard(); return value;
        }
        case 'list_dir': return { ok: true, entries: await listDirectory(root, action.path) };
        case 'read_file': return { ok: true, ...(await readFile(root, action.path, action.start, action.end)) };
        case 'search': return { ok: true, ...(context.planMode
          ? await planSearch.search({root,query:action.query,relative:action.path || '.',max:action.max,guard,signal:context.signal || signal,safePath,secretFile:SECRET_FILE,excludedDirs:EXCLUDED_DIRS})
          : await search(root, action.query, action.path, action.max)) };
        case 'plan_inspect': {
          if(Object.keys(action).some(key=>!['tool','operation'].includes(key)) || !['pwd','buffer_status','buffer_diff_stat'].includes(action.operation))throw new Error('Unknown Plan inspection operation or parameters.');
          if(typeof planInspect!=='function')return {ok:false,refused:true,reason:'plan_inspection_unavailable'};
          const value=await planInspect(action.operation,{signal:context.signal || signal});await guard();return {ok:true,...value};
        }
        case 'code_intelligence': {
          if(Object.keys(action).some(key=>!['tool','operation','path','line','column'].includes(key)) || !['symbols','definition','references'].includes(action.operation))throw new Error('Unknown code intelligence operation or parameters.');
          if(typeof codeIntelligence!=='function')return {ok:false,refused:true,reason:'code_intelligence_unavailable'};
          const value=await codeIntelligence(action,{signal:context.signal || signal});await guard();return value;
        }
        case 'write_file': return await writeFile(root, action, confirmWrite, applyWrite, beforeWrite, 'write_file');
        case 'replace_in_file': return await replaceInFile(root, action, confirmWrite, applyWrite, beforeWrite);
        case 'run_command': await guard(); if (extraEnabled) return extraSandbox.execute(action, {signal:context.signal || signal, onLifecycle:onCommandLifecycle}); return await runCommand(root, action, confirmRun, { signal:context.signal || signal, onLifecycle:onCommandLifecycle, guard, allowShell, extraAccess });
        default: throw new Error('Unknown tool: ' + action.tool);
      }
    }
  };
}

module.exports = { createTools, inside, safePath, cleanEnv, autoCommand, analyzeCommand, writeSnapshot, assertWriteSnapshot, BLOCKED_COMMAND, SECRET_FILE, EXCLUDED_DIRS };
