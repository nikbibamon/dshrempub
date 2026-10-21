'use strict';

// Local, privacy-preserving product metrics. Only metadata is written: no
// prompts, file contents, command output or credentials. The log is append-only
// JSONL under the extension's global storage and can be exported on demand.

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function createMetrics({ context, version = 'unknown', telemetryEnabled = () => true } = {}) {
  const dir = context?.globalStorageUri?.fsPath || path.join(os.tmpdir(), 'tvijo-metrics');
  const file = path.join(dir, 'events.jsonl');
  async function record(event) {
    try {
      if (typeof telemetryEnabled !== 'function' || telemetryEnabled() !== true) return;
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      const row = { ts: new Date().toISOString(), version, ...event };
      await fs.appendFile(file, JSON.stringify(row) + '\n', { mode: 0o600 });
    } catch { /* Metrics must never break a paid task. */ }
  }
  async function read() {
    try {
      const text = await fs.readFile(file, 'utf8');
      return text.split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
  }
  async function summary() {
    const rows = await read();
    const byOutcome = {};
    const byEvent = {};
    let cost = 0;
    let duration = 0;
    let durationCount = 0;
    for (const row of rows) {
      byOutcome[row.outcome || 'unknown'] = (byOutcome[row.outcome || 'unknown'] || 0) + 1;
      byEvent[row.event || 'unknown'] = (byEvent[row.event || 'unknown'] || 0) + 1;
      if (Number.isFinite(Number(row.cost_usd))) cost += Number(row.cost_usd);
      if (Number.isFinite(Number(row.duration_ms))) { duration += Number(row.duration_ms); durationCount += 1; }
    }
    return {
      file,
      events: rows.length,
      by_event: byEvent,
      by_outcome: byOutcome,
      total_cost_usd: Number(cost.toFixed(6)),
      avg_duration_ms: durationCount ? Math.round(duration / durationCount) : null,
      first_at: rows[0]?.ts || null,
      last_at: rows[rows.length - 1]?.ts || null
    };
  }
  return { record, summary, file };
}

module.exports = { createMetrics };
