'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parse, same, instruction, MAX_FILE_BYTES } = require('../lib/quick-edit');

test('quick edit parses the exact full-file envelope', () => {
  const answer = 'Here you go\n<<<FILE>>>\nconst value = 1;\n<<<END>>>\ntrailing';
  assert.equal(parse(answer), 'const value = 1;');
});

test('quick edit accepts a fenced envelope but rejects missing or empty content', () => {
  assert.equal(parse('<<<FILE>>>\n```js\nconst a = 1;\n```\n<<<END>>>'), 'const a = 1;');
  assert.equal(parse('no envelope'), null);
  assert.equal(parse('<<<FILE>>>\n   \n<<<END>>>'), null);
  assert.equal(parse('<<<FILE>>>\n\u0000\n<<<END>>>'), null);
});

test('quick edit rejects oversized files', () => {
  const huge = 'x'.repeat(MAX_FILE_BYTES + 1);
  assert.equal(parse('<<<FILE>>>\n' + huge + '\n<<<END>>>'), null);
});

test('quick edit treats CRLF and LF as the same content', () => {
  assert.equal(same('a\r\nb\r\n', 'a\nb\n'), true);
  assert.equal(same('a\n', 'b\n'), false);
});

test('quick edit instruction demands one complete file and no diff', () => {
  const value = instruction('src/app.js', 'javascript');
  assert.match(value, /exactly one file/);
  assert.match(value, /COMPLETE revised file/);
  assert.match(value, /<<<FILE>>>/);
});
