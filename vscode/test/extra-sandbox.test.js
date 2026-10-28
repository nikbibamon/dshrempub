'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFullAccess, EXTRA_LIMITS } = require('../lib/full-access');
const { assertExtraSandbox } = require('../lib/extra-sandbox');

test('Extra refuses enablement without a passing launcher and names the reason', async () => {
  const folder = {uri:{scheme:'file',authority:'',fsPath:'/work/project'}};
  const values = new Map(), prompts = [];
  const vscode = {workspace:{isTrusted:true,workspaceFolders:[folder]},window:{showWarningMessage:async message=>prompts.push(message)}};
  const access = createFullAccess({vscode,state:{get:key=>values.get(key),update:async(key,v)=>values.set(key,v)},scope:()=> 'a'.repeat(64)});
  assert.equal(await access.enable(folder,{extra:true}),false);
  assert.equal(access.status(folder).enabled,false);
  assert.equal(values.size,0);
  assert.match(prompts[0],/Extra unavailable.*preflight/);
  assert.throws(()=>assertExtraSandbox(null),/host shell is forbidden at uid 0/);
});

test('Extra consent names the copy, isolation boundaries, disk secrets and outward actions EN/RU', () => {
  assert.match(EXTRA_LIMITS.en,/own repository copy/);
  assert.match(EXTRA_LIMITS.en,/unprivileged.*OS sandbox/);
  assert.match(EXTRA_LIMITS.en,/secrets on disk/);
  assert.match(EXTRA_LIMITS.en,/HOME.*\/root.*\/etc\/aios/);
  assert.match(EXTRA_LIMITS.en,/Apply, push and PR/);
  assert.match(EXTRA_LIMITS.ru,/собственной копии репозитория/);
  assert.match(EXTRA_LIMITS.ru,/секреты на диске/);
  assert.match(EXTRA_LIMITS.ru,/непривилегированного.*песочнице ОС/);
});
