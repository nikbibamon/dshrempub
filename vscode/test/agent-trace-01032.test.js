'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {textLocale, actionView, resultView, eventRow, boundTrace, shrinkJson} = require('../lib/agent-trace');
const {runAgent, systemPrompt} = require('../lib/agent');
const {fitContext, wireBytes} = require('../lib/context-budget');
const {compactRules} = require('../lib/agent-context');
const {sidebar} = require('./helpers/sidebar');

test('0.10.32 run language follows the words of the request, not paths or commands', () => {
  assert.equal(textLocale('ты vsix /root/ai-os-workspaces/ai-os/tvijo-dshrem-0.10.31.vsix - можешь сделать новую версию'), 'ru');
  assert.equal(textLocale('Prepare and deploy the release notes'), 'en');
  assert.equal(textLocale('/root/a.js'), null);
  assert.equal(textLocale('npm test'), null);
});

test('0.10.32 tool steps read as plain actions in the request language', () => {
  assert.deepEqual(actionView({tool:'read_file', path:'vscode/lib/chat-view.js', start:1, end:120}, 'ru'), {icon:'📄', title:'Читаю', target:'vscode/lib/chat-view.js · строки 1–120'});
  assert.equal(actionView({tool:'search', query:'reasoning', path:'vscode/lib'}, 'ru').target, '«reasoning» в vscode/lib');
  assert.equal(actionView({tool:'run_command', command:'grep -n x a.js | head -40'}, 'en').title, 'Run');
  const ok = resultView({tool:'run_command'}, {ok:true, exitCode:0, stdout:'a\nb\nc\n'}, 'ru');
  assert.equal(ok.text, 'код 0 · 3 строки вывода'); assert.equal(ok.output, 'a\nb\nc');
  const bad = resultView({tool:'run_command'}, {ok:false, exitCode:2, stderr:'boom'}, 'ru');
  assert.equal(bad.ok, false); assert.match(bad.text, /код 2/);
  assert.match(resultView({tool:'read_file'}, {ok:false, refused:true, error:'secret path'}, 'ru').text, /^отклонено: secret path/);
  const row = eventRow({type:'result', step:3, action:{tool:'search', query:'x', thought:'Ищу обработчик событий.'}, result:{ok:true, output:'a.js:1:x\nb.js:2:x\n'}}, 'ru');
  assert.equal(row.thought, 'Ищу обработчик событий.'); assert.equal(row.result, '2 совпадения'); assert.equal(row.status, 'ok');
});

test('0.10.32 the visible thought reaches the trace but never the tool executor', async () => {
  const executed = [], events = [];
  let step = 0;
  const result = await runAgent({goal:'Проверь буферы редактора', maxSteps:3,
    tools:{execute:async action => { executed.push(action); return {ok:true, buffers:[]}; }},
    onEvent:event => events.push(event),
    ask:async () => ({content:JSON.stringify(++step === 1 ? {tool:'plan_inspect', operation:'buffer_status', thought:'Сначала смотрю открытые буферы.'} : {tool:'finish', status:'done', answer:'Готово', thought:'Всё проверено.'}), cost:{spent_usd:0}})});
  assert.equal(result.status, 'done');
  assert.deepEqual(executed[0], {tool:'plan_inspect', operation:'buffer_status'}, 'tools validate exact keys, so thought is removed');
  assert.equal(events.find(e => e.type === 'action').action.thought, 'Сначала смотрю открытые буферы.');
  assert.match(systemPrompt({fullAccess:true}), /"thought"/);
});

test('0.10.32 large Cyrillic tool output is bounded by bytes and stays valid JSON', async () => {
  const seen = [];
  let step = 0;
  await runAgent({goal:'Покажи вывод', maxSteps:3,
    tools:{execute:async () => ({ok:true, exitCode:0, stdout:'строка вывода с кириллицей\n'.repeat(3000), stderr:''})},
    ask:async ({messages}) => { seen.push(messages); return {content:JSON.stringify(++step === 1 ? {tool:'run_command', command:'cat big.txt'} : {tool:'finish', status:'done', answer:'ok'}), cost:{spent_usd:0}}; }});
  const tool = seen[1].findLast(m => m.role === 'user' && m.content.startsWith('TOOL_RESULT ')).content;
  assert.ok(Buffer.byteLength(tool, 'utf8') <= 16000 + 12, 'bounded by UTF-8 bytes');
  const value = JSON.parse(tool.slice(12));
  assert.equal(value.exitCode, 0); assert.match(value.stdout, /chars omitted to fit the request/); assert.ok(value.tvijo_truncated.original_bytes > 100000);
});

test('0.10.32 the 0.10.31 overflow shape now fits: tool outputs shrink, rules and goal stay byte-exact', () => {
  const rules = compactRules('Правило проекта: не трогать денежный путь.\n'.repeat(900), 24000);
  const system = {role:'system', content:systemPrompt({fullAccess:true}) + '\n[TVIJO OPTIONAL RULES]\n' + rules + '[END TVIJO OPTIONAL RULES]\n'};
  const goal = {role:'user', content:'ты vsix — можешь сделать новую версию 32, где будет видно ход размышления?'};
  const long = 'const x = "длинная строка кода";'.repeat(1400); // ~24 000 chars, ~50 KB on the wire
  const messages = [system, goal];
  for (let i = 0; i < 3; i++) {
    messages.push({role:'assistant', content:JSON.stringify({tool:'run_command', command:'sed -n 1,120p vscode/lib/chat-view.js'})});
    messages.push({role:'user', content:'TOOL_RESULT ' + JSON.stringify({ok:true, exitCode:0, stdout:long.slice(0, 7900), stderr:''}).slice(0, 24000)});
  }
  messages.push({role:'assistant', content:JSON.stringify({tool:'read_file', path:'vscode/extension.js', start:1, end:400})});
  messages.push({role:'user', content:'TOOL_RESULT ' + JSON.stringify({ok:true, path:'vscode/extension.js', content:long})});
  messages.push({role:'system', content:'[TVIJO STEP] Step 5 of at most 60.'});
  const fit = fitContext(messages, null, {preserveFirstUser:true});
  assert.ok(wireBytes(fit.messages) <= 90000);
  assert.ok(fit.toolOutputsShortened > 0);
  assert.equal(fit.messages[0].content, system.content, 'rules and protocol are never shortened');
  assert.ok(fit.messages.some(m => m.content === goal.content), 'the goal is never shortened');
  const latest = fit.messages.findLast(m => m.role === 'user' && m.content.startsWith('TOOL_RESULT '));
  const value = JSON.parse(latest.content.slice(12));
  assert.equal(value.path, 'vscode/extension.js'); assert.ok(value.tvijo_truncated);
});

test('0.10.32 Russian numerals agree with the noun', () => {
  const {count} = require('../lib/agent-trace');
  assert.deepEqual([1, 2, 5, 11, 21, 22, 112].map(n => count(n, 'lines', 'ru')), ['1 строка', '2 строки', '5 строк', '11 строк', '21 строка', '22 строки', '112 строк']);
  assert.equal(count(1, 'matches', 'en'), '1 match'); assert.equal(count(3, 'matches', 'en'), '3 matches');
});

test('0.10.32 shrinkJson keeps valid JSON at every size and falls back to a marker', () => {
  const value = {ok:true, entries:Array.from({length:500}, (_, i) => 'file-' + i + '.js'), content:'x'.repeat(50000)};
  for (const size of [20000, 5000, 1000, 200]) {
    const text = shrinkJson(value, size);
    assert.ok(Buffer.byteLength(text) <= size, size + ' bytes');
    assert.equal(JSON.parse(text).ok, true);
  }
  assert.equal(shrinkJson({ok:true}, 100), '{"ok":true}');
});

test('0.10.32 saved work log is bounded and never shows a step as still running', () => {
  const rows = Array.from({length:200}, (_, i) => ({step:i, status:i === 199 ? 'running' : 'ok', title:'Читаю', target:'a.js', output:'y'.repeat(2000)}));
  const bounded = boundTrace(rows);
  assert.ok(bounded.length <= 80); assert.ok(Buffer.byteLength(JSON.stringify(bounded)) <= 48000);
  assert.equal(bounded.at(-1).status, 'stopped');
});

test('0.10.32 webview shows the live work log in the transcript and hands over to a collapsed log and receipt', () => {
  const view = sidebar();
  const send = event => view.emit('window:message', {data:{type:'agent', scopeKey:'tenant-a', event}});
  view.emit('window:message', {data:{type:'state', busy:true, messages:[{role:'user', content:'Сделай версию 32'}]}});
  send({type:'start', goal:'Сделай версию 32', maxSteps:60, budgetUsd:2, locale:'ru'});
  send({type:'step', step:1, maxSteps:60, spent:0});
  const action = {tool:'read_file', path:'vscode/lib/chat-view.js', start:1, end:120, thought:'Смотрю, как чат рисует шаги.'};
  send({type:'action', step:1, action, view:eventRow({type:'action', step:1, action}, 'ru')});
  let live = view.element('messages').children.at(-1);
  assert.match(live.className, /live-run/);
  const text = node => [node.textContent || '', ...(node.children || []).map(text)].join(' ');
  assert.match(text(live), /Смотрю, как чат рисует шаги\./); assert.match(text(live), /Читаю/); assert.match(text(live), /строки 1–120/);
  send({type:'result', step:1, action, result:{ok:true, content:'a\nb\n'}, view:eventRow({type:'result', step:1, action, result:{ok:true, content:'a\nb\n'}}, 'ru')});
  live = view.element('messages').children.at(-1);
  assert.match(text(live), /2 строки/); assert.doesNotMatch(text(live), /◌ .*Читаю/);
  const trace = boundTrace([eventRow({type:'result', step:1, action, result:{ok:true, content:'a\nb\n'}}, 'ru')]);
  view.emit('window:message', {data:{type:'state', busy:false, locale:'ru', messages:[{role:'user', content:'Сделай версию 32'}, {role:'assistant', content:'Готово.', trace, receipt:'Квитанция задачи `r1` · выполнение завершено'}]}});
  const blocks = view.element('messages').children;
  assert.ok(!blocks.some(node => /live-run/.test(node.className || '')), 'live block is replaced by the saved answer');
  const answer = blocks.at(-1);
  const log = answer.children.find(node => node.className === 'run-trace');
  assert.equal(log.tag, 'details'); assert.match(text(log), /Ход работы · 1 шаг(?![а-я])/);
  const receipt = answer.children.find(node => node.className === 'task-receipt');
  assert.equal(receipt.tag, 'details'); assert.match(text(receipt), /Квитанция задачи `r1`/);
  assert.doesNotMatch(text(answer.children.find(node => node.className === 'role') ? answer : answer), /Model completion is not independent/);
});
