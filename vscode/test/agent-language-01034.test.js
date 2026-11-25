'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {runAgent, systemPrompt} = require('../lib/agent');

async function firstSystemPrompt(goal) {
  let step = 0, system = null;
  await runAgent({goal, maxSteps:3,
    tools:{execute:async () => ({ok:true, buffers:[]})},
    ask:async ({messages}) => {
      system ??= messages[0].content;
      return {content:JSON.stringify(++step === 1 ? {tool:'plan_inspect', operation:'buffer_status'} : {tool:'finish', status:'done', answer:'ok'}), cost:{spent_usd:0}};
    }});
  return system;
}

test('0.10.34 a Russian request tells the model to write its progress notes and answer in Russian', async () => {
  const ru = await firstSystemPrompt('ты vsix /root/ai-os-workspaces/ai-os/tvijo-dshrem-0.10.31.vsix — проверь, почему тесты падают');
  assert.match(ru, /The user writes in Russian: write every "thought" and the final answer in Russian/);
  const en = await firstSystemPrompt('Check why the tests fail in vscode/test');
  assert.doesNotMatch(en, /writes in Russian/);
  assert.match(en, /Answer in the user's language/);
});

test('0.10.34 Ask mode carries the same language rule without empty prompt lines', () => {
  assert.match(systemPrompt({askMode:true, replyLanguage:'ru'}), /final answer in Russian/);
  assert.doesNotMatch(systemPrompt({askMode:true}), /\n\n|writes in Russian/);
});

test('0.10.34 the protocol example and every step reminder are in Russian for a Russian request', async () => {
  assert.match(systemPrompt({replyLanguage:'ru'}), /"thought":"Правка сохранена, запускаю тесты, чтобы её проверить\."/);
  assert.doesNotMatch(systemPrompt({replyLanguage:'ru'}), /The edit is saved/);
  assert.match(systemPrompt({}), /"thought":"The edit is saved; running the tests to check it\."/);
  const steps = [];
  let step = 0;
  await runAgent({goal:'Проверь буферы редактора', maxSteps:3,
    tools:{execute:async () => ({ok:true, buffers:[]})},
    ask:async ({messages}) => {
      steps.push(messages.at(-1).content);
      return {content:JSON.stringify(++step === 1 ? {tool:'plan_inspect', operation:'buffer_status', thought:'Смотрю буферы.'} : {tool:'finish', status:'done', answer:'Готово'}), cost:{spent_usd:0}};
    }});
  assert.equal(steps.length, 2);
  for (const message of steps) assert.match(message, /^\[TVIJO STEP\] Step \d of at most 3\..* Write "thought" and the answer in Russian\.$/);
});
