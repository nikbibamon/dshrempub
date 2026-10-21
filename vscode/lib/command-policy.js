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
function parseCommand(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok:false, reason:'A command is required.' };
  if (/[\r\n\u0000$`]/.test(raw)) return { ok:false, reason:'Newlines, substitutions, and NUL are not supported.' };
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

function isCommandDecision(value, raw) {
  return !!value && DECISIONS.has(value) && value.raw === raw;
}

function analyzeCommand(raw) {
  const command = typeof raw === 'string' ? raw : '';
  // Preserve legacy raw-text restrictions as an additional compatibility layer.
  if (BLOCKED_COMMAND.some(pattern => pattern.test(command))) return immutableDecision({ ok:false, denied:true, reason:'This command is blocked by the local safety rules.', raw:command });
  const parsed = parseCommand(command);
  if (!parsed.ok) return immutableDecision({ ok:false, denied:false, reason:parsed.reason, raw:command });
  if (tokenDenied(parsed.executable, parsed.args)) return immutableDecision({ ok:false, denied:true, reason:'This command is blocked by the local safety rules.', raw:command });
  const auto = AUTO_RAW.has(command) && !parsed.executable.includes('/') && !parsed.executable.includes('\\') && AUTO.some(vector => vector.length === parsed.args.length + 1 && vector[0] === parsed.executable && vector.slice(1).every((x,i) => x === parsed.args[i]));
  return immutableDecision({ ok:true, raw:command, executable:parsed.executable, args:Object.freeze(parsed.args.slice()), auto });
}

module.exports = { parseCommand, analyzeCommand, isCommandDecision, tokenDenied, BLOCKED_COMMAND };
