'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { timestamp, elapsedMs, countRunningAgents, viewState, formatElapsed } = require('../lib/session-chips');

test('run elapsed time anchors to host timestamps and freezes at completion', () => {
  const startedAt = Date.parse('2026-10-21T10:00:00Z');
  const running = {status:'running', startedAt};
  assert.equal(elapsedMs(running, startedAt + 42_900), 42_900);
  const finished = {...running, status:'completed', endedAt:startedAt + 42_900};
  assert.equal(elapsedMs(finished, startedAt + 90_000), 42_900);
  assert.equal(formatElapsed(elapsedMs(finished)), '00:42');
});

test('unknown and invalid times stay unknown, known finished runs have zero agents', () => {
  assert.equal(timestamp('not a timestamp'), null);
  assert.equal(viewState(null).elapsedMs, null);
  assert.equal(viewState({status:'running', startedAt:'invalid'}).elapsedMs, null);
  assert.equal(viewState({status:'completed', startedAt:1000, endedAt:2000}).agents, 0);
  assert.equal(viewState({status:'mystery'}).agents, null);
});

test('counts unique observed agent identities and excludes parent tasks and planned nodes', () => {
  const session = {
    status:'running', localAgentRunId:'local-agent-1',
    tasks:[
      {id:'parent-task',status:'running',workflow_plan:[{id:'planned',status:'running'}],calls:[
        {id:'worker-1',status:'running'}, {task_id:'worker-1',status:'active'},
        {id:'worker-done',status:'completed'}, {id:'worker-2',status:'pending'}
      ]},
      {id:'parent-task-2',status:'running',calls:[{id:'worker-2',status:'running'}]}
    ]
  };
  assert.equal(countRunningAgents(session), 3);
});

test('scope changes clear chip state and valid stopped sessions preserve host count', () => {
  assert.deepEqual(viewState(undefined), {status:'unknown', startedAt:null, endedAt:null, elapsedMs:null, agents:null});
  const startedAt = Date.parse('2026-10-21T10:00:00Z');
  const state = viewState({status:'cancelled',startedAt,endedAt:startedAt + 4000,localAgentRunId:'local-agent'});
  assert.equal(state.elapsedMs, 4000);
  assert.equal(state.agents, 0);
});

test('missing live observations and future timestamps remain unknown; shared task IDs do not collapse distinct agents',()=>{
  const start=Date.parse('2026-10-21T10:00:00Z');
  assert.equal(elapsedMs({status:'running',startedAt:start},start-1),null);
  assert.equal(viewState({status:'running',startedAt:start,tasks:[{id:'parent',status:'running'}]}).agents,null);
  const session={status:'running',tasks:[{calls:[{id:'wrapper',status:'running',calls:[
    {id:'one',task_id:'same-task',status:'running'},
    {id:'two',task_id:'same-task',status:'running'},
    {id:'planned-queue',status:'queued'}
  ]}]}]};
  assert.equal(countRunningAgents(session),2);
});
