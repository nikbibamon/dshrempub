'use strict';

// Local, privacy-preserving product metrics. Only metadata is written: no
// prompts, file contents, command output or credentials. The log is append-only
// JSONL under the extension's global storage and can be exported on demand.

const fs = require('node:fs/promises');
const path = require('node:path');

const EVENTS = new Set(['agent', 'shell', 'edit', 'ask']);
const OUTCOMES = new Set(['completed', 'blocked', 'cancelled', 'failed', 'partial', 'error', 'proposed', 'applied']);
const STRINGS = {
  mode: /^(?:plan|agent|chat)$/,
  model: /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/,
  method: /^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/,
  task_id: /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/,
  error_code: /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/
};
const SECRET_PREFIX = /^(?:sk[-_]|pk[-_]|gh[pousr]_|xox[baprs]-|bearer\b|token\b|password\b|secret\b)/i;
const COUNTERS = new Set(['attachments', 'steps', 'exit_code']);

function cleanMetadata(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  if (!EVENTS.has(event.event) || !OUTCOMES.has(event.outcome)) return null;
  const row = { event: event.event, outcome: event.outcome };
  for (const key of ['mode', 'model', 'method', 'task_id', 'error_code']) {
    const value = event[key];
    if (typeof value === 'string' && value.length <= 96 && !/[\x00-\x1f\x7f]/.test(value) && !SECRET_PREFIX.test(value) && STRINGS[key].test(value)) row[key] = value;
  }
  if (typeof event.context === 'boolean') row.context = event.context;
  for (const key of ['cost_usd', 'duration_ms', ...COUNTERS]) {
    const value = event[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && (!COUNTERS.has(key) || Number.isInteger(value))) row[key] = value;
  }
  return row;
}

function createMetrics({ context, version = 'unknown', telemetryEnabled } = {}) {
  const dir = typeof context?.globalStorageUri?.fsPath === 'string' && context.globalStorageUri.fsPath ? context.globalStorageUri.fsPath : null;
  const file = dir ? path.join(dir, 'events.jsonl') : null;
  function enabled() {
    try { return typeof telemetryEnabled === 'function' && telemetryEnabled() === true; } catch { return false; }
  }
  async function record(event) {
    try {
      if (!file || !enabled()) return;
      const metadata = cleanMetadata(event);
      if (!metadata) return;
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      if (!enabled()) return;
      const row = { ts: new Date().toISOString(), version, ...metadata };
      await fs.appendFile(file, JSON.stringify(row) + '\n', { mode: 0o600 });
    } catch { /* Metrics must never break a paid task. */ }
  }
  async function read() {
    try {
      if (!file) return [];
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
