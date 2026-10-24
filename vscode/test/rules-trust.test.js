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

test('0.10.8 rules trust exposes no hash approval or decision API',()=>{const api=require('../lib/rules-trust');assert.equal(api.makeRecord,undefined);assert.equal(api.decide,undefined);});
