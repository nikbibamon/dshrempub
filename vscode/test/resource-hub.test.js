'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { RESOURCES, choices, isResourceUrl } = require('../lib/resource-hub');

test('resource hub contains only the verified fixed HTTPS links in EN and RU', () => {
  assert.deepEqual(RESOURCES.map(item=>item.url), [
    'https://tvijo.com/en/learn','https://tvijo.com/en/kb','https://tvijo.com/en/agent-skills/axes',
    'https://tvijo.com/en/privacy','https://tvijo.com/en/terms','https://tvijo.com/en/changelog'
  ]);
  assert.ok(RESOURCES.every(item=>item.url.startsWith('https://tvijo.com/')));
  assert.ok(choices('ru').every(item=>/[А-Яа-я]/.test(item.label)));
  assert.equal(choices('en').length, choices('ru').length);
  assert.deepEqual(choices('ru').map(item=>item.url), [
    'https://tvijo.com/ru/learn','https://tvijo.com/ru/kb','https://tvijo.com/ru/agent-skills/axes',
    'https://tvijo.com/ru/privacy','https://tvijo.com/ru/terms','https://tvijo.com/ru/changelog'
  ]);
  assert.ok(choices('en').every(item=>item.url.startsWith('https://tvijo.com/en/')));
  assert.ok([...choices('en'), ...choices('ru')].every(item=>isResourceUrl(item.url)));
  assert.equal(isResourceUrl('https://tvijo.com/ru/unlisted'), false);
});
