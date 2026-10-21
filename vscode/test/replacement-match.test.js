'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { findTrailingWhitespaceMatch, indentationHint } = require('../lib/replacement-match');

test('matches trailing spaces or tabs while preserving indentation', () => {
  const previous = '  café  \r\nnext\t\r\n';
  assert.deepEqual(findTrailingWhitespaceMatch(previous, '  café\r\nnext\r\n'), { match: { start: 0, end: 17 } });
  assert.deepEqual(findTrailingWhitespaceMatch('  word\t\n', ' word\n'), { match: null });
});

test('requires matching EOLs and rejects mixed or bare CR anchors and candidates', () => {
  assert.deepEqual(findTrailingWhitespaceMatch('x  \r\ny\n', 'x\r\ny\n'), { match: null });
  assert.deepEqual(findTrailingWhitespaceMatch('x  \r\ny  \r\n', 'x\ny\n'), { match: null });
  assert.deepEqual(findTrailingWhitespaceMatch('x  \ry  ', 'x\ry'), { match: null });
  assert.deepEqual(findTrailingWhitespaceMatch('x  \n', 'x\r'), { match: null });
});

test('reports ambiguity across normalized candidate blocks', () => {
  assert.deepEqual(findTrailingWhitespaceMatch('same  \nmid\nsame \nmid\n', 'same\nmid\n'), { ambiguous: true });
});

test('supports nonblank single lines and preserves source newline when old omits it', () => {
  assert.deepEqual(findTrailingWhitespaceMatch('a  \nb\n', 'a'), { match: { start: 0, end: 3 } });
  assert.deepEqual(findTrailingWhitespaceMatch('a  \n', 'a\n'), { match: { start: 0, end: 4 } });
  assert.deepEqual(findTrailingWhitespaceMatch('   \n', ' \n'), { match: null });
});

test('returns an exact unique indentation hint with line numbers', () => {
  const source = 'before\r\n    α \r\n  beta\r\nafter\r\n';
  assert.deepEqual(indentationHint(source, '  α\n beta\n'), {
    text: '    α \r\n  beta\r\n', startLine: 2, endLine: 3
  });
});

test('refuses hint ambiguity, blank anchors, and equal indentation', () => {
  assert.equal(indentationHint('  x\n x\n  x\n x\n', 'x\nx\n'), null);
  assert.equal(indentationHint(' x\n', ' \n'), null);
  assert.equal(indentationHint(' x\n', ' x\n'), null);
});

test('enforces 40 line and 4096 UTF8 byte hint limits without truncation', () => {
  const forty = Array(40).fill(' x').join('\n') + '\n';
  assert.ok(indentationHint(forty, Array(40).fill('x').join('\n') + '\n'));
  assert.equal(indentationHint(forty + ' x\n', Array(41).fill('x').join('\n') + '\n'), null);
  const large = ' ' + 'é'.repeat(2048) + '\n';
  assert.equal(Buffer.byteLength(large), 4098);
  assert.equal(indentationHint(large, 'é'.repeat(2048) + '\n'), null);
  const multibyte = '  ' + 'é'.repeat(2046) + '\n';
  assert.equal(indentationHint(multibyte, ' ' + 'é'.repeat(2046) + '\n').text, multibyte);
});


test('single-line fallback never changes or invents a consumed newline',()=>{
  for(const [source,old] of [['x \r\n','x\n'],['x \n','x\r\n'],['x ','x\n'],['x \n','x\r\n']])
    assert.deepEqual(findTrailingWhitespaceMatch(source,old),{match:null});
});

test('last line without newline is valid and blank interior lines retain mapped offsets',()=>{
  assert.deepEqual(findTrailingWhitespaceMatch('é\n  one \n\t\n  two\t','  one\n\n  two'),{match:{start:2,end:17}});
});

test('indentation hint requires an actual leading-indent mismatch',()=>{
  assert.equal(indentationHint('a \r\nb\r\n','a\nb\n'),null);
  assert.equal(indentationHint('same \n','same\n'),null);
  assert.equal(indentationHint('  same \r\n same\r\n','  same\n'),null);
});

test('hint permits blank interior lines and preserves mixed source newline bytes',()=>{
  const text='    if ok:\r\n\n        act()\n';
  assert.deepEqual(indentationHint('head\n'+text+'tail','  if ok:\n\n    act()\n'),{text,startLine:2,endLine:4});
});

test('repetitive long anchors are bounded and do not report a partial match',()=>{
  const source='x \n'.repeat(30000)+'last\n',old='x\n'.repeat(15000)+'other\n';
  assert.deepEqual(findTrailingWhitespaceMatch(source,old),{match:null});
});
