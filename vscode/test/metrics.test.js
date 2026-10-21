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
    const metrics = createMetrics({ context: { globalStorageUri: { fsPath: dir } }, version: '9.9.9', telemetryEnabled: () => true });
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

test('metrics retain only validated allowlisted metadata', async () => {
  await withMetrics(async (metrics, dir) => {
    await metrics.record({ event: 'ask', outcome: 'completed', task_id: 'task-1', context: true, attachments: 2,
      prompt: 'SYNTHETIC_CONTENT_CANARY', command_output: 'private', path: '/secret/file', extra: { nested: true },
      ts: 'caller-ts', version: 'caller-version', cost_usd: -3, duration_ms: Infinity, steps: '2', model: 'sk-live-secret' });
    const text = await fs.readFile(path.join(dir, 'events.jsonl'), 'utf8');
    const row = JSON.parse(text.trim());
    assert.deepEqual(Object.keys(row).sort(), ['attachments', 'context', 'event', 'outcome', 'task_id', 'ts', 'version']);
    assert.equal(row.version, '9.9.9');
    assert.equal(row.task_id, 'task-1');
    assert.equal(JSON.stringify(row).includes('SYNTHETIC_CONTENT_CANARY'), false);
    assert.equal(row.ts === 'caller-ts', false);
  });
});

test('metrics never throw when the storage path is unusable', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'tvijo-metrics-blocked-'));
  try {
    const blocker = path.join(base, 'blocker');
    await fs.writeFile(blocker, 'not a directory');
    const target = path.join(blocker, 'dir');
    const metrics = createMetrics({ context: { globalStorageUri: { fsPath: target } }, telemetryEnabled: () => true });
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
    await metrics.record({event:'ask', outcome:'completed'});
    assert.equal(await fs.readFile(file,'utf8'), '{"event":"prior"}\n');
    enabled = true;
    await metrics.record({event:'edit', outcome:'applied'});
    enabled = false;
    await metrics.record({event:'shell', outcome:'completed'});
    const rows = (await fs.readFile(file,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    assert.deepEqual(rows.map(row=>row.event), ['prior','edit']);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('missing capability or storage never creates a fallback directory', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'tvijo-metrics-absent-'));
  try {
    const disabled = createMetrics({ context: { globalStorageUri: { fsPath: path.join(base, 'disabled') } } });
    await disabled.record({ event: 'ask', outcome: 'completed' });
    assert.equal(await fs.readdir(base).then(items => items.includes('disabled')), false);
    const missing = createMetrics({ telemetryEnabled: () => true });
    await missing.record({ event: 'ask', outcome: 'completed' });
    const summary = await missing.summary();
    assert.equal(summary.file, null);
    assert.equal(summary.events, 0);
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

test('capability changes during directory creation prevent append', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'tvijo-metrics-flip-'));
  try {
    let checks = 0;
    const dir = path.join(base, 'created');
    const metrics = createMetrics({ context: { globalStorageUri: { fsPath: dir } }, telemetryEnabled: () => ++checks === 1 });
    await metrics.record({ event: 'ask', outcome: 'completed' });
    assert.equal(await fs.readdir(dir).then(items => items.includes('events.jsonl')), false);
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});
