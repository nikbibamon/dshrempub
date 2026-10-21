'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAgentMap, renderAgentMap } = require('../lib/agent-map');
const fixture = require('./fixtures/agent-map.json');
const { dom, text } = require('./dom-fixture');

test('map fixture expands real council calls and coding execution records only', () => {
  const model = buildAgentMap(fixture);
  assert.equal(model.children.length, 3);
  assert.equal(model.status, 'done'); assert.equal(model.elapsed, '4.0s');
  const [council,coding,cancelled] = model.children;
  assert.equal(council.children[0].model, 'synthetic-a');
  assert.equal(council.children[0].tokens, '30');
  assert.equal(council.children[0].elapsed, '1.3s');
  assert.equal(council.children[1].status, 'failed');
  assert.equal(council.children[1].tokens, '—');
  assert.equal(council.spend, '$0.012');
  assert.equal(coding.spend, '0.012 TT');
  assert.equal(coding.children[0].detail.request_hash, 'synthetic-hash');
  assert.equal(coding.children[0].taskId, 'coding-task');
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.tokens, '—'); assert.equal(cancelled.spend, '—');
  assert.equal(model.spend, '—'); assert.equal(model.tokens, '—');
  assert.doesNotMatch(JSON.stringify(model), /never-executed/);
});

test('map expands all three executed swarm branches and local tools', () => {
  const task = structuredClone(fixture.tasks[1]);
  task.workflow = 'swarm';
  task.agent_tree.splice(1,0,{id:'proposal-2',parent_id:task.id,role:'proposer',status:'completed'});
  task.local_steps = [{id:'tool-1',title:'read_file',status:'completed'}];
  const map = buildAgentMap({tasks:[task]});
  assert.equal(map.children[0].children.length,4);
  assert.ok(map.children[0].children.every(child => child.taskId === task.id));
  assert.equal(map.children[0].children[3].model,'—');
  assert.equal(map.children[0].children[3].spend,'—');
});

test('map missing metrics never become zero; explicit zero remains known', () => {
  for (const value of [null,undefined,false,'',-1,'n/a',' ',Infinity]) {
    const root = buildAgentMap({tasks:[{id:'t', tokens:value, spent_usd:value, duration_ms:value}]});
    assert.equal(root.children[0].tokens,'—'); assert.equal(root.children[0].spend,'—'); assert.equal(root.children[0].elapsed,'—');
  }
  const root = buildAgentMap({tasks:[{tokens:0,spent_usd:'0',duration_ms:0}]});
  assert.equal(root.tokens,'0'); assert.equal(root.spend,'$0'); assert.equal(root.children[0].elapsed,'0.0s');
});

test('map live elapsed changes only for a running record', () => {
  const model = buildAgentMap({tasks:[{id:'t', status:'running', started_at:'2026-10-21T10:00:00Z'}]}, Date.parse('2026-10-21T10:00:02Z'));
  assert.equal(model.children[0].elapsed,'2.0s');
  assert.equal(buildAgentMap({tasks:[{status:'completed',started_at:'2026-10-21T10:00:00Z'}]}).children[0].elapsed,'—');
});

test('map view has safe DOM, receipts, details, EN/RU and keyboard navigation without inline scripts', () => {
  const view = dom(), details = view.document.createElement('section');
  const model = buildAgentMap({...fixture,title:'<script>evil()</script>'});
  const selection = renderAgentMap(view.document,view.root,details,model,'ru');
  assert.match(text(view.root), /Готово|Отменено/);
  const buttons = view.created.filter(node => node.tag === 'button');
  buttons[1].listeners.click();
  assert.equal(selection(),buttons[1].attributes['data-map-id']);
  assert.match(text(details), /council-task/);
  buttons[0].listeners.keydown({key:'ArrowRight',preventDefault(){}});
  assert.equal(view.document.activeElement,buttons[1]);
  buttons[1].listeners.keydown({key:'ArrowLeft',preventDefault(){}});
  assert.equal(view.document.activeElement,buttons[0]);
  assert.ok(!view.created.some(node => ['script','iframe','img','svg'].includes(node.tag)));
  assert.ok(view.created.every(node => Object.keys(node.attributes).every(key => !key.startsWith('on'))));
});

test('map bounds wide, deep execution input and omits arbitrary receipt fields', () => {
  const child = {id:'node',status:'completed',receipt:{instructions:'DO_NOT_EXPOSE',tariff_version:'test'}};
  for (let depth=0;depth<8;depth++) child.calls = [structuredClone(child)];
  const model = buildAgentMap({tasks:Array.from({length:1000},(_,id) => ({...child,id}))});
  const count = node => 1 + node.children.reduce((sum,child) => sum + count(child),0);
  assert.ok(count(model) <= 201);
  assert.doesNotMatch(JSON.stringify(model), /DO_NOT_EXPOSE/);
});

test('map lists bounded background command lifecycle separately without argv or output', () => {
  const startedAt = Date.parse('2026-10-21T10:00:00Z');
  const map = buildAgentMap({commands:[
    {id:'owned-1',title:'secret=never-show',command:'echo secret=never-show',status:'running',startedAt,stdout:'secret=never-show'}
  ]});
  assert.deepEqual(map.commands, [{id:'owned-1',title:'run_command',status:'running',descendantsUnknown:false,startedAt,endedAt:null}]);
  assert.doesNotMatch(JSON.stringify(map), /secret=never-show/);
  const view = dom(), details = view.document.createElement('section');
  renderAgentMap(view.document,view.root,details,map,'en');
  assert.match(text(view.root), /Background commands/);
  assert.match(text(view.root), /run_command/);
  assert.doesNotMatch(text(view.root), /secret=never-show/);
});
