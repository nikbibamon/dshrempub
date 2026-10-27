'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createInbox, parseMessage } = require('../lib/inbox');

const tmp = () => fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'tvijo-inbox-'));

test('inbox parses a bounded message and defaults to agent mode', () => {
  assert.deepEqual(parseMessage('{"text":" hi ","from":"Claude Code"}'), { text: 'hi', mode: 'agent', from: 'Claude Code' });
  assert.equal(parseMessage('{"text":"   "}'), null);
  assert.equal(parseMessage('not json'), null);
  assert.equal(parseMessage(JSON.stringify({ text: 'x'.repeat(20001) })), null);
  assert.equal(parseMessage('{"text":"a","mode":"shell","from":"<b>"}').mode, 'agent');
  assert.equal(parseMessage('{"text":"a","from":"<b>"}').from, 'local tool');
});

test('inbox delivers in name order, deletes claimed files and keeps them while no view can take them', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, '2.json'), '{"text":"second"}');
  fs.writeFileSync(path.join(dir, '1.json'), '{"text":"first","mode":"plan"}');
  fs.writeFileSync(path.join(dir, 'note.txt'), 'ignored');
  const closed = createInbox({ dir, deliver: () => false });
  assert.deepEqual(closed.poll(), []);
  assert.equal(fs.readdirSync(dir).length, 3);
  const got = [];
  const open = createInbox({ dir, deliver: message => { got.push(message); return true; } });
  open.poll();
  assert.deepEqual(got.map(item => [item.text, item.mode]), [['first', 'plan'], ['second', 'agent']]);
  assert.deepEqual(fs.readdirSync(dir), ['note.txt']);
});

test('inbox drops files from another account, oversized files and symlinks without delivering them', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'a.json'), '{"text":"foreign"}');
  fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ text: 'y', pad: 'z'.repeat(40000) }));
  fs.symlinkSync(path.join(dir, 'a.json'), path.join(dir, 'c.json'));
  const got = [];
  const uid = fs.statSync(path.join(dir, 'a.json')).uid + 1;
  createInbox({ dir, uid, deliver: message => { got.push(message); return true; } }).poll();
  assert.deepEqual(got, []);
  assert.deepEqual(fs.readdirSync(dir), []);
});
