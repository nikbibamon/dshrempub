'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { snapshotDiagnostics, diffDiagnostics } = require('../lib/diagnostic-delta');

function diagnostic(overrides = {}) {
  return {
    severity: 0, source: 'lint', code: { value: 'E1', target: {} }, message: 'problem',
    range: { start: { line: 2, character: 3 }, end: { line: 2, character: 8 } },
    ...overrides
  };
}

test('snapshot is detached and immutable, with positions and normalized code', () => {
  const raw = diagnostic();
  const snap = snapshotDiagnostics([raw]);
  raw.message = 'changed'; raw.range.start.line = 90; raw.code.value = 'changed';
  assert.equal(snap[0].message, 'problem');
  assert.equal(snap[0].start.line, 2);
  assert.equal(snap[0].code, 'E1');
  assert.equal(snap[0].line, 3);
  assert.equal(snap[0].column, 4);
  assert.ok(Object.isFrozen(snap) && Object.isFrozen(snap[0]) && Object.isFrozen(snap[0].start));
});

test('keeps errors and warnings and ignores info and hint', () => {
  const result = snapshotDiagnostics([diagnostic(), diagnostic({ severity: 1 }), diagnostic({ severity: 2 }), diagnostic({ severity: 3 })]);
  assert.deepEqual(result.map(x => x.severity), ['Error', 'Warning']);
});

test('reports additions, resolutions, and unchanged count independent of order', () => {
  const [a, b, c] = snapshotDiagnostics([diagnostic(), diagnostic({ message: 'b' }), diagnostic({ message: 'c' })]);
  const d = snapshotDiagnostics([diagnostic({ message: 'd' })])[0];
  const delta = diffDiagnostics([a, b], [b, a, d]);
  assert.deepEqual(delta, { new: [d], resolved: [], unchangedCount: 2 });
  assert.deepEqual(diffDiagnostics([a, b, c], [b, a]), { new: [], resolved: [c], unchangedCount: 2 });
});

test('matches duplicate multiplicities', () => {
  const [a, b, c] = snapshotDiagnostics([diagnostic(), diagnostic(), diagnostic()]);
  assert.deepEqual(diffDiagnostics([a, b], [c]), { new: [], resolved: [a], unchangedCount: 1 });
  assert.deepEqual(diffDiagnostics([a], [b, c]), { new: [c], resolved: [], unchangedCount: 1 });
});

test('every identity field participates in matching', () => {
  const base = diagnostic();
  const variants = [
    { severity: 1 }, { source: 'other' }, { code: { value: 'E2' } }, { message: 'different' },
    { range: { start: { line: 9, character: 3 }, end: { line: 2, character: 8 } } },
    { range: { start: { line: 2, character: 3 }, end: { line: 2, character: 9 } } }
  ];
  for (const change of variants) {
    const before = snapshotDiagnostics([base]);
    const after = snapshotDiagnostics([{ ...base, ...change }]);
    const delta = diffDiagnostics(before, after);
    assert.equal(delta.new.length, 1);
    assert.equal(delta.resolved.length, 1);
    assert.equal(delta.unchangedCount, 0);
  }
});

test('full long and multibyte messages remain distinct identities', () => {
  const prefix = 'x'.repeat(700);
  const before = snapshotDiagnostics([diagnostic({ message: prefix + 'é' }), diagnostic({ message: prefix + '中' })]);
  const after = snapshotDiagnostics([diagnostic({ message: prefix + '中' }), diagnostic({ message: prefix + '🙂' })]);
  const delta = diffDiagnostics(before, after);
  assert.equal(delta.unchangedCount, 1);
  assert.equal(delta.new[0].message, prefix + '🙂');
  assert.equal(delta.resolved[0].message, prefix + 'é');
});

test('handles empty sets', () => {
  assert.deepEqual(diffDiagnostics([], []), { new: [], resolved: [], unchangedCount: 0 });
  assert.deepEqual(diffDiagnostics([], snapshotDiagnostics([diagnostic()])), { new: snapshotDiagnostics([diagnostic()]), resolved: [], unchangedCount: 0 });
});


test('numeric diagnostic codes and code.value participate in full identity',()=>{
  const before=snapshotDiagnostics([diagnostic({code:23}),diagnostic({code:{value:24}})]);
  assert.deepEqual(before.map(row=>row.code),['23','24']);
  const delta=diffDiagnostics(before,snapshotDiagnostics([diagnostic({code:24}),diagnostic({code:25})]));
  assert.equal(delta.unchangedCount,1);assert.equal(delta.new[0].code,'25');assert.equal(delta.resolved[0].code,'23');
});

test('invalid positions are omitted rather than emitting fractional or negative locations',()=>{
  const [row]=snapshotDiagnostics([diagnostic({range:{start:{line:-1,character:1.5},end:{line:NaN,character:Infinity}}})]);
  assert.deepEqual(row.start,{});assert.deepEqual(row.end,{});assert.equal(row.line,undefined);assert.equal(row.column,undefined);
});
