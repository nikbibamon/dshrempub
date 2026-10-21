'use strict';

// Local, bounded tools for the editor agent. Every path is resolved inside the
// opened workspace, every command is explicit, and destructive commands are
// refused before a shell is started. The model never gets the host's secrets.

const fs = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const MAX_READ = 64 * 1024;
const MAX_OUTPUT = 8 * 1024;
const MAX_MATCHES = 50;
const MAX_LIST = 200;
const DEFAULT_TIMEOUT = 60_000;

const BLOCKED_COMMAND = [
  /(^|[\s;&|])(sudo|su|doas)\b/i,
  /(^|[\s;&|])(mkfs|fdisk|parted|shutdown|reboot|poweroff|halt)\b/i,
  /(^|[\s;&|])rm\s+(-[a-z]*[rf][a-z]*\s+)+(\/|~|\$HOME)(\s|$)/i,
  /(^|[\s;&|])git\s+(reset\s+--hard|clean\s+-[a-z]*f|checkout\s+--\s+\.)/i,
  /(^|[\s;&|])dd\s+if=/i,
  /:\s*\(\s*\)\s*\{/,
  /(curl|wget)[^|]*\|\s*(sh|bash)\b/i,
  />\s*\/dev\/sd[a-z]/i,
  /chmod\s+(-R\s+)?777\s+\//i
];

const SECRET_FILE = /^(?:\.env(?:\.|$)|secrets?\.|credentials?\.|auth\.json$|\.npmrc$|\.netrc$|\.pypirc$|id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx|crt|der)$)/i;
const EXCLUDED_DIRS = new Set(['.git', '.hg', '.svn', '.ssh', '.aws', 'node_modules', '.venv', 'venv', 'dist', 'build', 'target', '__pycache__', '.pytest_cache']);

function inside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function safePath(root, value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\u0000')) throw new Error('A file path is required.');
  const target = path.resolve(root, value);
  if (!inside(root, target)) throw new Error('Path escapes the workspace: ' + value);
  const parts = path.relative(root, target).split(path.sep);
  if (parts.some((part) => EXCLUDED_DIRS.has(part))) throw new Error('Path is in an excluded directory: ' + value);
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

function cleanEnv() {
  const env = {};
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'SYSTEMROOT', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP']) {
    if (typeof process.env[key] === 'string') env[key] = process.env[key];
  }
  return env;
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
  const allowed = ['npm test', 'pnpm test', 'yarn test', 'go test ./...', 'cargo test'];
  return allowed.includes(command) ? command.split(' ') : null;
}

async function runCommand(root, action, confirm) {
  const command = typeof action.command === 'string' ? action.command.trim() : '';
  if (!command) throw new Error('A command is required.');
  if (BLOCKED_COMMAND.some((pattern) => pattern.test(command))) throw new Error('This command is blocked by the local safety rules.');
  const cwd = action.cwd ? safePath(root, action.cwd) : root;
  const approved = await confirm({ command, cwd });
  if (!approved) return { ok: false, refused: true, command, cwd };
  const timeout = Math.min(Math.max(Number(action.timeout_ms) || DEFAULT_TIMEOUT, 1000), 180000);
  return await new Promise((resolve) => {
    const exact = autoCommand(command);
    const child = exact ? spawn(exact[0], exact.slice(1), { shell: false, cwd, env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] }) : spawn(command, { shell: true, cwd, env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 2000).unref?.(); }, timeout);
    child.stdout.on('data', (chunk) => { if (stdout.length < MAX_OUTPUT * 3) stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { if (stderr.length < MAX_OUTPUT * 3) stderr += chunk.toString('utf8'); });
    child.on('error', (error) => { clearTimeout(timer); resolve({ ok: false, command, cwd, error: error.message }); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && !timedOut, command, cwd, exitCode: code, signal, timedOut, stdout: truncate(stdout), stderr: truncate(stderr) });
    });
  });
}

async function writeFile(root, action, confirm, applyWrite, beforeWrite, operation = 'write_file') {
  const target = safePath(root, action.path);
  const content = typeof action.content === 'string' ? action.content : '';
  if (Buffer.byteLength(content, 'utf8') > MAX_READ * 2) throw new Error('Refusing to write more than 128 KiB in one step.');
  let previous = null;
  try { previous = await fs.readFile(target, 'utf8'); } catch { /* new file */ }
  if (previous === content) return { ok: true, unchanged: true, path: action.path };
  const approved = await confirm({ path: action.path, absolute: target, previous, content, operation });
  if (!approved) return { ok: false, refused: true, path: action.path };
  safePath(root, action.path);
  if (applyWrite) await applyWrite({ absolute: target, previous, content });
  else {
    let current = null;
    try { current = await fs.readFile(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (current !== previous) throw new Error('File changed during confirmation.');
    await fs.mkdir(path.dirname(target), { recursive: true });
    safePath(root, action.path);
    const checkpoint = beforeWrite({ absolute: target, content });
    if (checkpoint && typeof checkpoint.then === 'function') await checkpoint;
    safePath(root, action.path);
    let latest = null;
    try { latest = await fs.readFile(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (latest !== previous) throw new Error('File changed before write.');
    safePath(root, action.path);
    await fs.writeFile(target, content, 'utf8');
  }
  return { ok: true, path: action.path, bytes: Buffer.byteLength(content, 'utf8'), created: previous === null };
}

async function replaceInFile(root, action, confirm, applyWrite, beforeWrite) {
  const target = safePath(root, action.path);
  if (typeof action.old !== 'string' || !action.old) throw new Error('The old text is required.');
  if (typeof action.new !== 'string') throw new Error('The replacement text is required.');
  const previous = await fs.readFile(target, 'utf8');
  const count = previous.split(action.old).length - 1;
  if (count === 0) throw new Error('The old text was not found. Read the file and copy the exact text.');
  if (count > 1) throw new Error('The old text appears ' + count + ' times; include more surrounding context.');
  const content = previous.replace(action.old, () => action.new);
  if (Buffer.byteLength(content, 'utf8') > MAX_READ * 2) throw new Error('Refusing to write more than 128 KiB in one step.');
  const approved = await confirm({ path: action.path, absolute: target, previous, content, operation: 'replace_in_file' });
  if (!approved) return { ok: false, refused: true, path: action.path };
  safePath(root, action.path);
  if (applyWrite) await applyWrite({ absolute: target, previous, content });
  else {
    if (await fs.readFile(target, 'utf8') !== previous) throw new Error('File changed during confirmation.');
    const checkpoint = beforeWrite({ absolute: target, content });
    if (checkpoint && typeof checkpoint.then === 'function') await checkpoint;
    safePath(root, action.path);
    let latest = null;
    try { latest = await fs.readFile(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (latest !== previous) throw new Error('File changed before write.');
    safePath(root, action.path);
    await fs.writeFile(target, content, 'utf8');
  }
  return { ok: true, path: action.path, bytes: Buffer.byteLength(content, 'utf8') };
}

function createTools({ root, confirmRun, confirmWrite, applyWrite, beforeWrite = () => {}, guard = async () => {} }) {
  return {
    root,
    async execute(action, context = {}) {
      await guard();
      if (!action || typeof action.tool !== 'string') throw new Error('A tool name is required.');
      if (context.planMode && ['write_file', 'replace_in_file', 'run_command'].includes(action.tool)) return { ok: false, refused: true, reason: 'plan_mode' };
      switch (action.tool) {
        case 'list_dir': return { ok: true, entries: await listDirectory(root, action.path) };
        case 'read_file': return { ok: true, ...(await readFile(root, action.path, action.start, action.end)) };
        case 'search': return { ok: true, ...(await search(root, action.query, action.path, action.max)) };
        case 'write_file': return await writeFile(root, action, confirmWrite, applyWrite, beforeWrite, 'write_file');
        case 'replace_in_file': return await replaceInFile(root, action, confirmWrite, applyWrite, beforeWrite);
        case 'run_command': return await runCommand(root, action, confirmRun);
        default: throw new Error('Unknown tool: ' + action.tool);
      }
    }
  };
}

module.exports = { createTools, inside, safePath, cleanEnv, autoCommand, BLOCKED_COMMAND, SECRET_FILE, EXCLUDED_DIRS };
