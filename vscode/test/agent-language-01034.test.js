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
