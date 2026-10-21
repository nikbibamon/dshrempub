'use strict';

const { utf8Bound } = require('./context-captures');

const CREDENTIALS = [
  /\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|tvijo_pk_[A-Za-z0-9_-]{15,})\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|project[_-]?key|byok[_-]?(?:key|token)|telegram[_-]?(?:bot[_-]?)?token|password|secret)\s*[:=]\s*[^\s,;]+/gi,
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /https?:\/\/[^\s/@]+:[^\s/@]+@[^\s/]+/gi,
  /[?&](?:access_token|token|api_key|key|secret|password)=[^&#\s]+/gi,
  /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g,
  /(?:file:\/\/\/|\/(?:home|root|tmp|mnt|var)\/)[^\s"'<>]+/gi,
  /\b[A-Z]:\\(?:Users|ProgramData|Windows)\\[^\s"'<>]+/g
];

function redact(text, knownSecrets = []) {
  let result = String(text || '');
  for (const secret of knownSecrets) if (typeof secret === 'string' && secret.length >= 4) result = result.split(secret).join('[redacted]');
  for (const pattern of CREDENTIALS) result = result.replace(pattern, '[redacted credential]');
  return result;
}

function exportConversation(history, { knownSecrets = [], maxBytes = 64 * 1024 } = {}) {
  const rows = [];
  for (const item of Array.isArray(history) ? history : []) {
    if (!['user', 'assistant'].includes(item?.role)) continue;
    // User `content` may contain hidden project context and attachment bytes.
    // Its display field is the exact question shown in chat; assistant content
    // is the visible answer body. Never fall back to a raw user request.
    const body = item.role === 'user'
      ? (typeof item.display === 'string' ? item.display : '')
      : (typeof item.content === 'string' ? item.content : '');
    rows.push('## ' + (item.role === 'user' ? 'You' : 'Tvijo') + '\n\n' + redact(body, knownSecrets));
  }
  return utf8Bound('# Tvijo conversation\n\n' + rows.join('\n\n'), maxBytes);
}

module.exports = { redact, exportConversation };
