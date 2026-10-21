'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createMetrics } = require('../lib/metrics');

async function withMetrics(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvijo-metrics-test-'));
  try {
    const metrics = createMetrics({ context: { globalStorageUri: { fsPath: dir } }, version: '9.9.9' });
    await fn(metrics, dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('metrics summary aggregates outcomes, events, spend and duration', async () => {
  await withMetrics(async (metrics) => {
    await metrics.record({ event: 'agent', outcome: 'completed', cost_usd: 0.25, duration_ms: 1000 });
    await metrics.record({ event: 'agent', outcome: 'error', cost_usd: 0.5, duration_ms: 3000 });
    await metrics.record({ event: 'edit', outcome: 'applied' });
    const summary = await metrics.summary();
    assert.equal(summary.events, 3);
    assert.equal(summary.by_event.agent, 2);
    assert.equal(summary.by_outcome.completed, 1);
    assert.equal(summary.by_outcome.error, 1);
    assert.equal(summary.total_cost_usd, 0.75);
    assert.equal(summary.avg_duration_ms, 2000);
    assert.equal(summary.first_at !== null, true);
  });
});

test('metrics store only the metadata it was given', async () => {
  await withMetrics(async (metrics, dir) => {
    await metrics.record({ event: 'ask', outcome: 'completed', task_id: 'task-1' });
    const text = await fs.readFile(path.join(dir, 'events.jsonl'), 'utf8');
    const row = JSON.parse(text.trim());
    assert.deepEqual(Object.keys(row).sort(), ['event', 'outcome', 'task_id', 'ts', 'version']);
    assert.equal(row.version, '9.9.9');
    assert.equal(row.task_id, 'task-1');
  });
});

test('metrics never throw when the storage path is unusable', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'tvijo-metrics-blocked-'));
  try {
    const blocker = path.join(base, 'blocker');
    await fs.writeFile(blocker, 'not a directory');
    const target = path.join(blocker, 'dir');
    const metrics = createMetrics({ context: { globalStorageUri: { fsPath: target } } });
    await metrics.record({ event: 'ask', outcome: 'completed' });
    assert.equal(metrics.file, path.join(target, 'events.jsonl'));
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

test('telemetry capability is checked at each record and disabled mode preserves existing log', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvijo-metrics-telemetry-'));
  try {
    const file = path.join(dir, 'events.jsonl');
    await fs.writeFile(file, '{"event":"prior"}\n');
    let enabled = false;
    const metrics = createMetrics({context:{globalStorageUri:{fsPath:dir}}, telemetryEnabled:()=>enabled});
    await metrics.record({event:'disabled'});
    assert.equal(await fs.readFile(file,'utf8'), '{"event":"prior"}\n');
    enabled = true;
    await metrics.record({event:'enabled'});
    enabled = false;
    await metrics.record({event:'disabled-again'});
    assert.deepEqual((await fs.readFile(file,'utf8')).trim().split('\n').map(line=>JSON.parse(line).event), ['prior','enabled']);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
