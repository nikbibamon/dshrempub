'use strict';

// Defects found by running the real agent loop and local tools against a live model on the
// Remote SSH host (no ripgrep on PATH). Each test reproduces one observed failure.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {parseAction, runAgent} = require('../lib/agent');
const {createTools, findRipgrep} = require('../lib/local-tools');

test('0.10.34 a finish answer with real line breaks inside the JSON string is kept, not re-asked', async () => {
  const raw = '{"tool":"finish","status":"done","answer":"В файле `lib/client.js` предел задаётся константой.\n\n**Где проверяется:**\n- `validateMessages`","remaining_operator_steps":[]}';
  assert.throws(() => JSON.parse(raw), /control character/);
  assert.deepEqual(parseAction(raw), {tool:'finish', status:'done', answer:'В файле `lib/client.js` предел задаётся константой.\n\n**Где проверяется:**\n- `validateMessages`', remaining_operator_steps:[]});
  let calls = 0;
  const result = await runAgent({goal:'Где задаётся предел размера запроса?', maxSteps:3, tools:{execute:async () => ({ok:true})},
    ask:async () => { calls++; return {content:raw, cost:{spent_usd:0}}; }});
  assert.equal(calls, 1, 'no second model call');
  assert.equal(result.status, 'done');
  assert.match(result.text, /^В файле/);
});

test('0.10.34 two actions in one turn run the first one; prose, fences and braces in strings still parse', () => {
  assert.deepEqual(parseAction('{"tool":"list_dir","path":".","thought":"a"}\n{"tool":"agent_capabilities"}'), {tool:'list_dir', path:'.', thought:'a'});
  assert.deepEqual(parseAction('Сначала поиск: {"tool":"search","query":"a}b{"} — потом чтение.'), {tool:'search', query:'a}b{'});
  assert.deepEqual(parseAction('```json\n{"tool":"read_file","path":"a.js"}\n```'), {tool:'read_file', path:'a.js'});
  assert.deepEqual(parseAction('{"tool":"finish","answer":"tab\there \\"quoted\\""}'), {tool:'finish', answer:'tab\there "quoted"'});
  assert.equal(parseAction('plain text answer'), null);
  assert.equal(parseAction('{"not_a_tool":true}\n{"also":"no"}'), null);
  assert.equal(parseAction('{"tool":"finish","answer":"unterminated'), null);
});

test('0.10.34 VS Code ripgrep is found in both package layouts and on desktop', () => {
  const at = file => candidate => candidate === file;
  const server = '/srv/vscode/server';
  const universal = path.join(server, 'node_modules', '@vscode', 'ripgrep-universal', 'bin', 'linux-x64', 'rg');
  assert.equal(findRipgrep(server, {platform:'linux', arch:'x64', exists:at(universal)}), universal);
  const classic = path.join(server, 'node_modules', '@vscode', 'ripgrep', 'bin', 'rg');
  assert.equal(findRipgrep(server, {platform:'linux', arch:'x64', exists:at(classic)}), classic);
  const desktop = path.join('/app', 'node_modules.asar.unpacked', '@vscode', 'ripgrep', 'bin', 'rg.exe');
  assert.equal(findRipgrep('/app', {platform:'win32', arch:'x64', exists:at(desktop)}), desktop);
  assert.equal(findRipgrep('/app', {exists:() => false}), null);
  assert.equal(findRipgrep(undefined), null);
});

function project() {
  const root = fs.mkdtempSync(path.join(process.env.TVIJO_TEST_ARTIFACTS || os.tmpdir(), 'tvijo-search-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{\n  "scripts": {\n    "test": "node --test"\n  }\n}\n');
  fs.mkdirSync(path.join(root, 'lib'));
  fs.writeFileSync(path.join(root, 'lib', 'client.js'), 'const MAX_CONTEXT_BYTES = 110 * 1024;\n');
  return root;
}

test('0.10.34 without ripgrep a search inside one file finds its matches and says the query was literal', async () => {
  const root = project();
  const tools = createTools({root, rgPath:path.join(root, 'missing-rg'), confirmRun:async () => true, confirmWrite:async () => false});
  const inFile = await tools.execute({tool:'search', query:'"test"', path:'package.json'});
  assert.equal(inFile.code, 0);
  assert.equal(inFile.output, 'package.json:3:    "test": "node --test"');
  assert.equal(inFile.mode, 'literal');
  const regex = await tools.execute({tool:'search', query:'MAX_.*BYTES|size.*limit', path:'.'});
  assert.equal(regex.code, 1);
  assert.equal(regex.output, '');
  assert.match(regex.note, /literal text, not as a regular expression/);
  const literal = await tools.execute({tool:'search', query:'MAX_CONTEXT_BYTES', path:'.'});
  assert.equal(literal.output, 'lib/client.js:1:const MAX_CONTEXT_BYTES = 110 * 1024;');
});

test('0.10.34 the agent search uses the ripgrep binary it was given', {skip:process.platform === 'win32'}, async () => {
  const root = project();
  const fake = path.join(root, 'fake-rg');
  fs.writeFileSync(fake, '#!/bin/sh\necho "fake-rg:1:$*"\n', {mode:0o755});
  const tools = createTools({root, rgPath:fake, confirmRun:async () => true, confirmWrite:async () => false});
  const result = await tools.execute({tool:'search', query:'MAX_.*BYTES', path:'lib'});
  assert.equal(result.code, 0);
  assert.match(result.output, /^fake-rg:1:.*-e MAX_\.\*BYTES -- .*lib\/client\.js/);
  assert.equal(result.mode, undefined);
});

async function stepLimitRun(finalReplies) {
  const replies = [...finalReplies], seen = [];
  const result = await runAgent({goal:'Найди, где задаётся предел размера запроса', maxSteps:1, budgetUsd:1,
    tools:{execute:async () => ({ok:true, entries:['lib']})},
    ask:async ({messages, finalization}) => {
      seen.push({finalization:!!finalization, last:messages.at(-1).content});
      const content = finalization ? replies.shift() : JSON.stringify({tool:'list_dir', path:'.', thought:'Смотрю проект.'});
      return {content, cost:{spent_usd:0.01}};
    }});
  return {result, seen};
}

test('0.10.34 at the step limit a finish action is the answer; another action keeps one final call and the notice', async () => {
  const finished = await stepLimitRun([JSON.stringify({tool:'finish', status:'done', answer:'Нашёл: lib/client.js.'})]);
  assert.equal(finished.seen.filter(call => call.finalization).length, 1);
  assert.equal(finished.result.text, 'Нашёл: lib/client.js.');
  assert.equal(finished.result.status, 'partial');
  const stray = await stepLimitRun([JSON.stringify({tool:'read_file', path:'lib/client.js'})]);
  assert.equal(stray.seen.filter(call => call.finalization).length, 1, 'no extra paid call');
  assert.match(stray.result.text, /^Достигнут лимит шагов/);
  assert.ok(Math.abs(stray.result.spent - 0.02) < 1e-9);
});
