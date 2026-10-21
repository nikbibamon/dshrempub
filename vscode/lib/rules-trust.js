'use strict';

const crypto = require('node:crypto');

const HASH_RE = /^[a-f0-9]{64}$/;
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

function validScopeKey(value) {
  return typeof value === 'string' && HASH_RE.test(value);
}

function validHash(value) {
  return typeof value === 'string' && HASH_RE.test(value);
}

function validTimestamp(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function hasExactOwnDataFields(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length || keys.some(key => typeof key !== 'string' || !expected.includes(key))) return false;
  return keys.every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
}

function makeRecord(input) {
  if (!hasExactOwnDataFields(input, ['scopeKey', 'hash', 'approvedAt'])) throw new TypeError('makeRecord requires exact data fields');
  const { scopeKey: key, hash, approvedAt } = input;
  if (!validScopeKey(key) || !validHash(hash) || !validTimestamp(approvedAt)) {
    throw new TypeError('Invalid rules trust record fields');
  }
  return { v: 1, scopeKey: key, hash, approvedAt };
}

function hasExactRecordShape(record) {
  if (!hasExactOwnDataFields(record, ['approvedAt', 'hash', 'scopeKey', 'v'])) return false;
  return record.v === 1 && validScopeKey(record.scopeKey) && validHash(record.hash) && validTimestamp(record.approvedAt);
}

function decide(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { allowed: false, status: 'unsupported' };
  }
  const { workspaceTrusted, scopeKey: key, hash, record } = input;
  if (workspaceTrusted !== true) return { allowed: false, status: 'workspace-untrusted' };
  if (!validScopeKey(key) || !validHash(hash)) return { allowed: false, status: 'unsupported' };
  if (!hasExactRecordShape(record)) return { allowed: false, status: 'unapproved' };
  if (record.scopeKey !== key) return { allowed: false, status: 'unapproved' };
  if (record.hash !== hash) return { allowed: false, status: 'changed' };
  return { allowed: true, status: 'trusted' };
}

module.exports = { scopeKey, rulesHash, makeRecord, decide };
