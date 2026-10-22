'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { approveDevice } = require('../lib/device-login');

const device = { verification_uri: 'https://dsh.tvijo.com/dshrem/device', user_code: 'TEST1234' };
function host(choices) {
  const prompts = [], copied = [], opened = [];
  return { prompts, copied, opened, vscode: {
    Uri: { parse: value => value },
    window: { showInformationMessage: async (...args) => { prompts.push(args); return choices.shift(); } },
    env: { clipboard: { writeText: async text => copied.push(text) }, openExternal: async url => { opened.push(url); return true; } }
  } };
}
test('copy keeps the same challenge available until browser approval is selected', async () => {
  const h = host(['Copy code', 'Copy code', 'Open browser']);
  await approveDevice(h.vscode, device);
  assert.equal(h.prompts.length, 3);
  assert.ok(h.prompts.every(args => args[0] === 'Tvijo: TEST1234' && args[1].modal === true));
  assert.deepEqual(h.copied, ['TEST1234', 'TEST1234']);
  assert.deepEqual(h.opened, ['https://dsh.tvijo.com/dshrem/device?code=TEST1234']);
});
test('cancel does not open a browser or silently continue login', async () => {
  const h = host([undefined]);
  await assert.rejects(approveDevice(h.vscode, device), e => e.code === 'interrupted');
  assert.deepEqual(h.opened, []); assert.deepEqual(h.copied, []);
});
test('new account attempt fences the old approval action', async () => {
  const h = host(['Open browser']); let checks = 0;
  await assert.rejects(approveDevice(h.vscode, device, { check: () => { if (++checks === 2) throw new Error('account changed'); } }), /account changed/);
  assert.deepEqual(h.opened, []);
});
test('browser refusal is explicit instead of polling a page that did not open', async () => {
  const h = host(['Open browser']); h.vscode.env.openExternal = async () => false;
  await assert.rejects(approveDevice(h.vscode, device), e => e.code === 'browser_unavailable');
});
test('Russian actions preserve copy then open behavior', async () => {
  const h = host(['Скопировать код', 'Открыть браузер']);
  await approveDevice(h.vscode, device, { L: (_en, ru) => ru });
  assert.equal(h.opened.length, 1); assert.equal(h.copied.length, 1);
});
