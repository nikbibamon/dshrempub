'use strict';

const crypto = require('node:crypto');

const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;

function hasMalformedUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function isCanonicalRoot(root) {
  if (typeof root !== 'string' || root.length === 0 || CONTROL_RE.test(root) || hasMalformedUnicode(root)) {
    return false;
  }

  // Windows drive roots are accepted in their canonical backslash form. UNC,
  // device paths, mixed separators, and non-normalized segments are rejected.
  if (/^[A-Za-z]:\\/.test(root)) {
    if (root.includes('/') || root.endsWith('\\') && root.length > 3) return false;
    const rest = root.slice(3);
    if (rest && rest.split('\\').some(part => part === '' || part === '.' || part === '..')) return false;
    return true;
  }

  // POSIX roots are absolute. Repeated separators and trailing separators are
  // not canonical (except for the filesystem root itself).
  if (root === '/') return true;
  if (!root.startsWith('/') || root.startsWith('//') || (root.length > 1 && root.endsWith('/'))) return false;
  const segments = root.slice(1).split('/');
  return segments.every(part => part !== '' && part !== '.' && part !== '..');
}

function scopeKey(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const { scheme, authority, canonicalRoot } = input;
  if (scheme !== 'file' || authority !== '' || !isCanonicalRoot(canonicalRoot)) return null;
  return crypto.createHash('sha256')
    .update(JSON.stringify(['tvijo-rules-scope-v1', scheme, authority, canonicalRoot]), 'utf8')
    .digest('hex');
}

function rulesHash(bytes) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    throw new TypeError('rulesHash requires Buffer or Uint8Array bytes');
  }
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

// Workspace Trust authorizes rules; hashes identify snapshots, never permissions.
module.exports = { scopeKey, rulesHash };
