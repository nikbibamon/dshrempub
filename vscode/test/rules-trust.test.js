'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { scopeKey, rulesHash, makeRecord, decide } = require('../lib/rules-trust');

const hash = value => crypto.createHash('sha256').update(value).digest('hex');

test('scope keys bind the full canonical root, not a folder name', () => {
  const key = root => scopeKey({ scheme: 'file', authority: '', canonicalRoot: root });
  assert.equal(key('/work/alpha'), key('/work/alpha'));
  assert.notEqual(key('/work/alpha'), key('/other/alpha'));
  assert.notEqual(key('/work/alpha'), key('/work/alpha/nested'));
  assert.notEqual(key('/Work/alpha'), key('/work/alpha'));
  assert.match(key('C:\\Work\\alpha'), /^[a-f0-9]{64}$/);
  assert.notEqual(key('C:\\Work\\alpha'), key('D:\\Work\\alpha'));
});

test('unsupported, relative, noncanonical, UNC, and malformed roots have no key', () => {
  const key = (scheme, authority, canonicalRoot) => scopeKey({ scheme, authority, canonicalRoot });
  assert.equal(key('ssh', '', '/work/alpha'), null);
  assert.equal(key('file', 'host', '/work/alpha'), null);
  assert.equal(key('file', '', 'work/alpha'), null);
  assert.equal(key('file', '', '/work/../alpha'), null);
  assert.match(key('file', '', '/'), /^[a-f0-9]{64}$/);
  assert.equal(key('file', '', '/work/./alpha'), null);
  assert.equal(key('file', '', '/work//alpha'), null);
  assert.equal(key('file', '', '/work/alpha/'), null);
  assert.equal(key('file', '', '//server/share'), null);
  assert.equal(key('file', '', '\\\\server\\share'), null);
  assert.equal(key('file', '', '/work/alpha\u0000'), null);
  assert.equal(key('file', '', '/work/\ud800'), null);
  assert.equal(key('file', '', 'C:\\work\\..\\alpha'), null);
});

test('rules hashes use exact bytes, including newline convention', () => {
  const lf = Buffer.from('line one\nline two\n', 'utf8');
  const crlf = Uint8Array.from(Buffer.from('line one\r\nline two\r\n', 'utf8'));
  assert.equal(rulesHash(lf), hash(lf));
  assert.equal(rulesHash(crlf), hash(crlf));
  assert.notEqual(rulesHash(lf), rulesHash(crlf));
  assert.throws(() => rulesHash('line one\n'), TypeError);
  assert.throws(() => rulesHash({ 0: 1, length: 1 }), TypeError);
});

test('record factory and decision require exact, matching values', () => {
  const key = scopeKey({ scheme: 'file', authority: '', canonicalRoot: '/work/alpha' });
  const contentHash = rulesHash(Buffer.from('rules\n'));
  const record = makeRecord({ scopeKey: key, hash: contentHash, approvedAt: 1234567890 });
  assert.deepEqual(record, { v: 1, scopeKey: key, hash: contentHash, approvedAt: 1234567890 });
  assert.deepEqual(decide({ workspaceTrusted: true, scopeKey: key, hash: contentHash, record }), { allowed: true, status: 'trusted' });
  assert.deepEqual(decide({ workspaceTrusted: true, scopeKey: key, hash: rulesHash(Buffer.from('changed')), record }), { allowed: false, status: 'changed' });
  assert.deepEqual(decide({ workspaceTrusted: true, scopeKey: '0'.repeat(64), hash: contentHash, record }), { allowed: false, status: 'unapproved' });
  assert.throws(() => makeRecord({ scopeKey: key, hash: contentHash, approvedAt: '1234567890' }), TypeError);
  assert.throws(() => makeRecord({ scopeKey: key, hash: contentHash, approvedAt: true }), TypeError);
  assert.throws(() => makeRecord({ scopeKey: key, hash: contentHash.toUpperCase(), approvedAt: 1 }), TypeError);
  assert.throws(() => makeRecord({ scopeKey: key, hash: contentHash, approvedAt: 1, forged: true }), TypeError);
});

test('malformed or extended records fail closed without coercion', () => {
  const key = scopeKey({ scheme: 'file', authority: '', canonicalRoot: '/work/alpha' });
  const contentHash = rulesHash(Buffer.from('rules'));
  const valid = makeRecord({ scopeKey: key, hash: contentHash, approvedAt: 1 });
  const decideWith = record => decide({ workspaceTrusted: true, scopeKey: key, hash: contentHash, record });
  for (const record of [
    null,
    { ...valid, v: '1' },
    { ...valid, hash: contentHash.toUpperCase() },
    { ...valid, approvedAt: '1' },
    { ...valid, forged: true },
    { ...valid, scopeKey: 'bad' },
    Object.assign({ ...valid }, { [Symbol('extra')]: true }),
    Object.assign(Object.create({ forged: true }), valid)
  ]) {
    assert.deepEqual(decideWith(record), { allowed: false, status: 'unapproved' });
  }
  assert.deepEqual(decide({ workspaceTrusted: 'true', scopeKey: key, hash: contentHash, record: valid }), { allowed: false, status: 'workspace-untrusted' });
  assert.deepEqual(decide({ workspaceTrusted: true, scopeKey: key, hash: { toString: () => contentHash }, record: valid }), { allowed: false, status: 'unsupported' });
});

test('Restricted Mode always prevents rules trust', () => {
  const key = scopeKey({ scheme: 'file', authority: '', canonicalRoot: '/work/alpha' });
  const contentHash = rulesHash(Buffer.from('rules'));
  const record = makeRecord({ scopeKey: key, hash: contentHash, approvedAt: 1 });
  assert.deepEqual(decide({ workspaceTrusted: false, scopeKey: key, hash: contentHash, record }), { allowed: false, status: 'workspace-untrusted' });
  assert.deepEqual(decide({ workspaceTrusted: false, scopeKey: null, hash: null, record }), { allowed: false, status: 'workspace-untrusted' });
});
