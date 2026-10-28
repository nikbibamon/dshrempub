'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const branch = require('../lib/conversation-branch');
const { sidebar } = require('./helpers/sidebar');

const history = [
  { role: 'user', content: 'ctx\n---\nq1', display: 'q1' },
  { role: 'assistant', content: 'a1' },
  { role: 'user', content: 'q2' },
  { role: 'assistant', content: 'a2', localRecovery: true },
  { role: 'assistant', content: 'a3' }
];

test('pointAt: a question is the state before it was sent and returns its clean text', () => {
  const point = branch.pointAt(history, 0);
  assert.deepEqual(point.keep, []);
  assert.equal(point.draft, 'q1', 'display text, not the context-wrapped content');
  assert.equal(point.removed, 5);
  assert.equal(branch.pointAt(history, 2).keep.length, 2);
});

test('pointAt: an answer is the state right after it and returns no question', () => {
  const point = branch.pointAt(history, 1);
  assert.deepEqual(point.keep.map(item => item.content), ['ctx\n---\nq1', 'a1']);
  assert.equal(point.draft, '');
  assert.equal(point.removed, 3);
  assert.equal(branch.pointAt(history, 4).removed, 0);
});

test('pointAt refuses what is not a real history row', () => {
  for (const index of [-1, 5, 1.5, NaN, '1', null, undefined, {}]) assert.equal(branch.pointAt(history, index), null, String(index));
  assert.equal(branch.pointAt(history, 3), null, 'a local-recovery marker is not a point');
  assert.equal(branch.pointAt(null, 0), null);
  assert.equal(branch.pointAt([{ role: 'system', content: 'x' }], 0), null);
  assert.equal(branch.pointAt([null], 0), null);
});

test('pointAt never mutates the history it was given', () => {
  const copy = JSON.stringify(history);
  branch.pointAt(history, 2);
  assert.equal(JSON.stringify(history), copy);
});

test('mergeDraft puts the restored question in front of the typed text and stays bounded', () => {
  assert.equal(branch.mergeDraft('q', 'typed'), 'q\n\ntyped');
  assert.equal(branch.mergeDraft('q', ''), 'q');
  assert.equal(branch.mergeDraft('', 'typed'), 'typed');
  assert.equal(branch.mergeDraft('', ''), '');
  assert.equal(branch.mergeDraft('q'.repeat(30000), 'x').length, 20000);
});

test('titleOf uses the first real question, collapsed and bounded', () => {
  assert.equal(branch.titleOf([{ role: 'assistant', content: 'hi' }, { role: 'user', content: '  how\n   do I   deploy?  ' }]), 'how do I deploy?');
  assert.equal(branch.titleOf([{ role: 'user', content: 'x'.repeat(100) }]).length, 60);
  assert.ok(branch.titleOf([{ role: 'user', content: 'x'.repeat(100) }]).endsWith('…'));
  assert.equal(branch.titleOf([]), '');
  assert.equal(branch.titleOf(undefined), '');
});

test('normalizeArchive reads both the old bare-array format and the 0.10.22 object', () => {
  const rows = [{ role: 'user', content: 'q' }];
  assert.deepEqual(branch.normalizeArchive('a', rows), { id: 'a', at: null, reason: null, history: rows });
  assert.deepEqual(branch.normalizeArchive('b', { schema: 1, at: 5, reason: 'fork', history: rows }), { id: 'b', at: 5, reason: 'fork', history: rows });
  assert.equal(branch.normalizeArchive('c', { at: 5, reason: 'invented', history: rows }).reason, null);
  for (const bad of [[], {}, { history: [] }, null, 'text', 7]) assert.equal(branch.normalizeArchive('d', bad), null);
  assert.equal(branch.normalizeArchive('', rows), null);
});

test('sortArchives is newest first with undated legacy archives last; overflow names the oldest', () => {
  const rows = [{ id: 'old', at: 1 }, { id: 'legacy', at: null }, { id: 'new', at: 9 }, { id: 'mid', at: 5 }];
  assert.deepEqual(branch.sortArchives(rows).map(row => row.id), ['new', 'mid', 'old', 'legacy']);
  assert.deepEqual(branch.overflow(rows, 2), ['old', 'legacy']);
  assert.deepEqual(branch.overflow(rows, 4), []);
  assert.deepEqual(rows.map(row => row.id), ['old', 'legacy', 'new', 'mid'], 'the input order is not changed');
});

const rows = [
  { role: 'user', content: 'q1' },
  { role: 'assistant', content: 'a1' },
  { role: 'user', content: 'asking now', live: true },
  { role: 'assistant', content: 'Rewound to step 2', note: true }
];
const labels = block => (block.children || []).find(node => node.className === 'branch-actions')?.children.map(node => node.textContent) || [];
const blocks = view => view.element('messages').children.filter(node => String(node.className).includes('message'));

test('webview: each real message offers Restore and Fork, and they post the history index', () => {
  const view = sidebar({}, { conversationEditable: true, messages: rows });
  const [first, second] = blocks(view);
  assert.deepEqual(labels(first), ['Restore conversation here', 'Fork conversation here']);
  assert.deepEqual(labels(second), ['Restore conversation here', 'Fork conversation here']);
  const actions = second.children.find(node => node.className === 'branch-actions').children;
  actions[0].handlers.click();
  actions[1].handlers.click();
  assert.deepEqual(view.outgoing.slice(-2).map(({ type, index }) => ({ type, index })), [{ type: 'conversationRestore', index: 1 }, { type: 'conversationFork', index: 1 }]);
  assert.equal(view.outgoing.at(-1).scopeKey, 'tenant-a');
});

test('webview: the live question and host notes are not points to return to', () => {
  const view = sidebar({}, { conversationEditable: true, messages: rows });
  const [, , live, note] = blocks(view);
  assert.deepEqual(labels(live), []);
  assert.deepEqual(labels(note), []);
});

test('webview: nothing is offered for a shared server thread', () => {
  const view = sidebar({}, { conversationEditable: false, messages: rows });
  for (const block of blocks(view)) assert.deepEqual(labels(block), []);
  const missing = sidebar({}, { messages: rows });
  for (const block of blocks(missing)) assert.deepEqual(labels(block), []);
});

test('webview: the buttons are disabled while an answer is running, and come back enabled with the same messages', () => {
  const view = sidebar({}, { conversationEditable: true, messages: rows.slice(0, 2) });
  const buttons = () => blocks(view)[0].children.find(node => node.className === 'branch-actions').children;
  assert.deepEqual(buttons().map(node => node.disabled), [false, false]);
  view.emit('window:message', { data: { type: 'state', conversationEditable: true, busy: true, messages: rows.slice(0, 2) } });
  assert.deepEqual(buttons().map(node => node.disabled), [true, true]);
  view.emit('window:message', { data: { type: 'state', conversationEditable: true, busy: false, messages: rows.slice(0, 2) } });
  assert.deepEqual(buttons().map(node => node.disabled), [false, false]);
});

test('webview: Russian labels', () => {
  const view = sidebar({}, { conversationEditable: true, messages: rows.slice(0, 1), locale: 'ru' });
  assert.deepEqual(labels(blocks(view)[0]), ['Восстановить диалог отсюда', 'Ответвить диалог отсюда']);
});
