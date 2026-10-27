'use strict';

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

// This lexer accepts one executable and literal arguments. Quotes group text;
// backslash escapes one character outside single quotes. It never expands it.
function parseCommand(raw, { vetted = false } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok:false, reason:'A command is required.' };
  if ((vetted ? /[\r\n\u0000]/ : /[\r\n\u0000$`]/).test(raw)) return { ok:false, reason:'Newlines, substitutions, and NUL are not supported.' };
  const argv = [];
  let value = '', quote = null, started = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (!quote && /[;&|<>]/.test(ch)) return { ok:false, reason:'Shell operators and redirections are not supported.' };
    if (quote) {
      if (ch === quote) { quote = null; started = true; continue; }
      if (ch === '\\' && quote === '"') {
        if (i + 1 >= raw.length) return { ok:false, reason:'Unsupported escape.' };
        value += raw[++i]; started = true; continue;
      }
      value += ch; started = true; continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; started = true; continue; }
    if (ch === '\\') {
      if (i + 1 >= raw.length) return { ok:false, reason:'Unsupported escape.' };
      value += raw[++i]; started = true; continue;
    }
    if (/\s/.test(ch)) {
      if (started) { argv.push(value); value = ''; started = false; }
      continue;
    }
    value += ch; started = true;
  }
  if (quote) return { ok:false, reason:'Unmatched quote.' };
  if (started) argv.push(value);
  if (!argv.length || !argv[0]) return { ok:false, reason:'A command is required.' };
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0])) return { ok:false, reason:'Environment assignments are not supported.' };
  return { ok:true, executable:argv[0], args:argv.slice(1) };
}

const WRAPPERS = new Set(['sh','bash','dash','zsh','fish','cmd','powershell','pwsh','env','busybox','command','exec','xargs','nice','nohup','time','timeout','stdbuf','chroot','nsenter','unshare','setsid']);
const DANGEROUS = new Set(['sudo','su','doas','mkfs','fdisk','parted','shutdown','reboot','poweroff','halt']);
const basename = value => value.split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/i, '');

function gitDanger(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    const option = args[i++];
    if (option === '-C') {
      if (!args[i] || args[i].startsWith('-')) return true;
      i++;
    } else if (/^(--git-dir|--work-tree|--namespace|--config-env|--exec-path)=/.test(option)) return true;
    else if (!['--no-pager','--paginate','-p','-P','--literal-pathspecs','--no-optional-locks','--no-replace-objects'].includes(option)) return true;
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (sub === 'push' && rest.some(x => {
    const option = x.split('=')[0];
    return x.startsWith('--force') || (option !== '--' && option.startsWith('--') && ['--force','--force-with-lease','--force-if-includes','--mirror'].some(name=>name.startsWith(option))) || /^-[^-]*f/.test(x) || x.startsWith('+');
  })) return true;
  if (sub === 'reset' && rest.some(x => x === '--hard' || /^-[a-z]*h[a-z]*$/i.test(x))) return true;
  if (sub === 'clean' && rest.some(x => /^-[a-z]*f[a-z]*$/i.test(x) || x.startsWith('--force'))) return true;
  if (sub === 'checkout' && rest.some(x => x === '--' || x === '-f' || x === '--force')) return true;
  if (sub === 'restore' && rest.some(x => x === '--worktree' || x === '--staged')) return true;
  return false;
}

function tokenDenied(executable, args) {
  const base = basename(executable);
  if (DANGEROUS.has(base) || base.startsWith('mkfs.') || WRAPPERS.has(base)) return true;
  if (base === 'rm') {
    const options = args.filter(arg => /^-[^-]/.test(arg) && arg !== '--');
    const recursiveForce = options.some(arg => arg.includes('r')) && options.some(arg => arg.includes('f'));
    if ((recursiveForce || args.some(arg=>['--recursive','--force'].includes(arg))) && args.some(arg => arg === '/' || arg === '~' || arg === '$HOME' || /^\/[.\/]*$/.test(arg) || arg.startsWith('/dev/'))) return true;
  }
  if (base === 'dd' && args.some(arg => /^if=/i.test(arg))) return true;
  if (base === 'chmod' && args.some(arg => arg === '777') && args.some(arg => arg.startsWith('/'))) return true;
  if (base === 'git' && gitDanger(args)) return true;
  if (args.some((arg, index) => arg === '>' && /^\/dev\/sd[a-z]/i.test(args[index + 1] || ''))) return true;
  return false;
}

const AUTO = Object.freeze([
  Object.freeze(['npm','test']), Object.freeze(['pnpm','test']), Object.freeze(['yarn','test']),
  Object.freeze(['go','test','./...']), Object.freeze(['cargo','test'])
]);
const AUTO_RAW = new Set(['npm test', 'pnpm test', 'yarn test', 'go test ./...', 'cargo test']);
const DECISIONS = new WeakSet();

function immutableDecision(fields) {
  const decision = Object.freeze(fields);
  DECISIONS.add(decision);
  return decision;
}

// Full access only. A chain (&&, ||, ;, |) with redirections runs through one
// shell, but only after every simple command in it passes the same literal
// denials as a single command. Anything the lexer cannot prove literal
// (substitutions, subshells, heredocs, background jobs, keywords) is refused
// instead of guessed, so the hard limits keep meaning the same thing.
const SHELLS = new Set(['sh','bash','dash','zsh']);
const TRANSPARENT = new Set(['timeout','nice','nohup','time','env']);
const RESERVED = new Set(['{','}','!','if','then','elif','else','fi','for','while','until','do','done','case','esac','function','select','[[','coproc']);
const BAD_ENV = /^(PATH|LD_[A-Z_]*|BASH_ENV|ENV|IFS|NODE_OPTIONS|PYTHONPATH|PYTHONSTARTUP|GIT_[A-Z_]*|SHELLOPTS|PROMPT_COMMAND)$/;
const READ_ONLY_GIT = ['status','diff','log','show','ls-files','ls-tree','rev-parse','grep','blame','describe','shortlog'];
const fail = reason => ({ ok:false, reason });

function readWord(raw, from) {
  let i = from, word = '', quote = null;
  while (i < raw.length && (raw[i] === ' ' || raw[i] === '\t')) i++;
  for (; i < raw.length; i++) {
    const ch = raw[i];
    if (quote) { if (ch === quote) quote = null; else if (ch === '\\' && quote === '"') word += raw[++i] ?? ''; else word += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '\\') { word += raw[++i] ?? ''; continue; }
    if (/[\s;&|<>()]/.test(ch)) break;
    word += ch;
  }
  return quote ? null : { word, end:i };
}

function splitShell(raw) {
  const segments = [];
  let text = '', quote = null, redirects = [];
  const push = () => { segments.push({ text, redirects }); text = ''; redirects = []; };
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '\u0000' || ch === '\r') return fail('Unsupported control character.');
    if (quote) {
      if ((ch === '$' && quote === '"') || ch === '`') return fail('Substitutions are not supported.');
      if (ch === '\n') return fail('Multi-line quoted text is not supported.');
      if (ch === '\\' && quote === '"') { text += ch + (raw[++i] ?? ''); continue; }
      if (ch === quote) quote = null;
      text += ch; continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; text += ch; continue; }
    if (ch === '$' || ch === '`') return fail('Substitutions are not supported.');
    if (ch === '\\') { if (i + 1 >= raw.length || raw[i + 1] === '\n') return fail('Unsupported escape.'); text += ch + raw[++i]; continue; }
    if (ch === '(' || ch === ')') return fail('Subshells are not supported.');
    if (ch === '\n' || ch === ';') { push(); continue; }
    if (ch === '|') { if (raw[i + 1] === '&') return fail('Unsupported operator.'); if (raw[i + 1] === '|') i++; push(); continue; }
    if (ch === '&') { if (raw[i + 1] === '&') { i++; push(); continue; } return fail('Background jobs are not supported.'); }
    if (ch === '<' || ch === '>') {
      if (raw[i + 1] === '(' || raw[i + 1] === '<' || (ch === '<' && raw[i + 1] === '&')) return fail('Heredocs and process substitution are not supported.');
      // "2>file": the descriptor digits belong to the redirection, not the command.
      if (/(^|\s)\d+$/.test(text)) text = text.replace(/\d+$/, '');
      let at = i + 1;
      if (ch === '>' && raw[at] === '>') at++;
      if (ch === '>' && raw[at] === '&') { const m = /^&(\d+|-)/.exec(raw.slice(at)); if (!m) return fail('Unsupported redirection.'); i = at + m[0].length - 1; continue; }
      const read = readWord(raw, at);
      if (!read || !read.word || /[*?[\]{}~]/.test(read.word)) return fail('Unsupported redirection target.');
      redirects.push(read.word); i = read.end - 1; continue;
    }
    text += ch;
  }
  if (quote) return fail('Unmatched quote.');
  push();
  return { ok:true, segments:segments.filter(row => row.text.trim() || row.redirects.length) };
}

// Wrappers that only adjust how one program runs are peeled off so the real
// program meets the denials. Interpreters that execute strings stay denied.
function unwrap(argv) {
  const a = argv.slice();
  for (let depth = 0; depth < 6; depth++) {
    while (a.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(a[0])) { if (BAD_ENV.test(a[0].split('=')[0])) return null; a.shift(); }
    const base = a.length ? basename(a[0]) : '';
    if (!TRANSPARENT.has(base)) return a.length ? a : null;
    a.shift();
    if (base === 'nice') { if (a[0] === '-n') a.splice(0, 2); else if (/^-\d+$/.test(a[0] || '')) a.shift(); else if (a[0]?.startsWith('-')) return null; }
    else if (base === 'timeout') {
      while (a[0]?.startsWith('-')) { const option = a.shift(); if (option === '-s' || option === '-k') a.shift(); else if (!/^(-[vf]|--(foreground|preserve-status|verbose)|--(signal|kill-after)=.+)$/.test(option)) return null; }
      if (!/^\d+(\.\d+)?[smhd]?$/.test(a.shift() || '')) return null;
    }
    else if (base === 'env') { if (a[0]?.startsWith('-')) return null; }
    else if (base === 'time' && a[0] === '-p') a.shift();
  }
  return null;
}

function inspectShell(raw, depth) {
  if (typeof raw !== 'string' || !raw.trim()) return fail('A command is required.');
  if (depth > 2) return fail('Shell nesting is too deep.');
  if (BLOCKED_COMMAND.some(pattern => pattern.test(raw))) return { denied:true };
  const split = splitShell(raw);
  if (!split.ok) return split;
  if (!split.segments.length) return fail('A command is required.');
  const out = [];
  for (const piece of split.segments) {
    if (!piece.text.trim()) return fail('A redirection needs a command.');
    if (BLOCKED_COMMAND.some(pattern => pattern.test(piece.text))) return { denied:true };
    const parsed = parseCommand(piece.text, { vetted:true });
    if (!parsed.ok && /^Environment assignments/.test(parsed.reason)) { /* handled by unwrap below */ }
    else if (!parsed.ok) return fail(parsed.reason);
    const words = parsed.ok ? [parsed.executable, ...parsed.args] : parseWords(piece.text);
    if (!words) return fail('Unsupported command text.');
    const argv = unwrap(words);
    if (!argv) return { denied:true };
    const [executable, ...args] = argv, base = basename(executable);
    if (RESERVED.has(base)) return fail('Shell keywords are not supported; run separate commands.');
    if (SHELLS.has(base)) {
      let i = 0, script = null;
      while (args[i]?.startsWith('-')) {
        const option = args[i++];
        if (/^-[a-z]*c[a-z]*$/.test(option)) { script = args[i++]; break; }
        if (!/^-[a-z]+$/.test(option) || /[si]/.test(option)) return { denied:true };
      }
      if (script !== null) { const inner = inspectShell(script ?? '', depth + 1); if (!inner.ok) return inner; out.push(...inner.segments); continue; }
      if (!args[i]) return { denied:true };
    } else if (tokenDenied(executable, args)) return { denied:true };
    out.push({ executable:base, args, redirects:piece.redirects });
  }
  return { ok:true, segments:out };
}

function parseWords(text) {
  // parseCommand refuses a leading VAR=value; lex the same text without that rule.
  const parsed = parseCommand('_ ' + text, { vetted:true });
  return parsed.ok ? parsed.args : null;
}

const shellPath = () => require('node:fs').existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';

function analyzeShell(raw) {
  if (process.platform === 'win32') return immutableDecision({ ok:false, denied:false, reason:'Shell chains are not available on Windows hosts; run one command per step.', raw });
  const collected = inspectShell(raw, 0);
  if (collected.denied) return immutableDecision({ ok:false, denied:true, reason:'This command is blocked by the local safety rules.', raw });
  if (!collected.ok) return immutableDecision({ ok:false, denied:false, reason:collected.reason, raw });
  const segments = Object.freeze(collected.segments.map(row => Object.freeze({ executable:row.executable, args:Object.freeze(row.args.slice()), redirects:Object.freeze(row.redirects.slice()) })));
  const requiresApproval = segments.some(row => row.executable === 'git' && (row.args[0]?.startsWith('-') || !READ_ONLY_GIT.includes(row.args[0])));
  const outward = segments.some(row => row.executable === 'git' && row.args[0] === 'push');
  return immutableDecision({ ok:true, shell:true, raw, executable:shellPath(), args:Object.freeze(['-c', raw]), segments, operands:Object.freeze(segments.flatMap(row => [...row.args, ...row.redirects])), auto:false, requiresApproval, outward });
}

function isCommandDecision(value, raw) {
  return !!value && DECISIONS.has(value) && value.raw === raw;
}

function analyzeCommand(raw, { shell = false } = {}) {
  const command = typeof raw === 'string' ? raw : '';
  if (shell) { const plain = analyzeCommand(command); return plain.ok ? plain : analyzeShell(command); }
  // Preserve legacy raw-text restrictions as an additional compatibility layer.
  if (BLOCKED_COMMAND.some(pattern => pattern.test(command))) return immutableDecision({ ok:false, denied:true, reason:'This command is blocked by the local safety rules.', raw:command });
  const parsed = parseCommand(command);
  if (!parsed.ok) return immutableDecision({ ok:false, denied:false, reason:parsed.reason, raw:command });
  if (tokenDenied(parsed.executable, parsed.args)) return immutableDecision({ ok:false, denied:true, reason:'This command is blocked by the local safety rules.', raw:command });
  const auto = AUTO_RAW.has(command) && !parsed.executable.includes('/') && !parsed.executable.includes('\\') && AUTO.some(vector => vector.length === parsed.args.length + 1 && vector[0] === parsed.executable && vector.slice(1).every((x,i) => x === parsed.args[i]));
  const requiresApproval = basename(parsed.executable)==='git' && (parsed.args[0]?.startsWith('-') || !['status','diff','log','show','ls-files','ls-tree','rev-parse','grep','blame','describe','shortlog'].includes(parsed.args[0]));
  // Push leaves the machine; Full access still asks for it.
  const outward = basename(parsed.executable)==='git' && parsed.args[0]==='push';
  return immutableDecision({ ok:true, raw:command, executable:parsed.executable, args:Object.freeze(parsed.args.slice()), auto, requiresApproval, outward });
}

module.exports = { analyzeShell, parseCommand, analyzeCommand, isCommandDecision, tokenDenied, BLOCKED_COMMAND };
