'use strict';

function snapshotDiagnostics(items) {
  const result = [];
  for (const item of items || []) {
    const severity = item && item.severity;
    if (severity !== 0 && severity !== 1) continue;
    const range = item.range || {};
    const start = range.start || {};
    const end = range.end || {};
    const source = typeof item.source === 'string' ? item.source : undefined;
    const rawCode = item.code;
    const codeValue = rawCode && typeof rawCode === 'object' ? rawCode.value : rawCode;
    const code = ['string','number'].includes(typeof codeValue) ? String(codeValue) : undefined;
    const record = {
      severity: severity === 0 ? 'Error' : 'Warning',
      message: String(item.message == null ? '' : item.message)
    };
    if (source !== undefined) record.source = source;
    if (code !== undefined) record.code = code;
    const position = (p) => {
      const out = {};
      if (Number.isInteger(p.line) && p.line >= 0) out.line = p.line;
      if (Number.isInteger(p.character) && p.character >= 0) out.character = p.character;
      return Object.freeze(out);
    };
    record.start = position(start);
    record.end = position(end);
    if (record.start.line !== undefined) record.line = record.start.line + 1;
    if (record.start.character !== undefined) record.column = record.start.character + 1;
    result.push(Object.freeze(record));
  }
  return Object.freeze(result);
}

function diffDiagnostics(before, after) {
  const key = (r) => JSON.stringify([
    r.severity, r.source, r.code, r.message,
    r.start && r.start.line, r.start && r.start.character,
    r.end && r.end.line, r.end && r.end.character
  ]);
  const counts = new Map();
  for (const record of before || []) {
    const k = key(record);
    const entry = counts.get(k);
    if (entry) entry.count++;
    else counts.set(k, { count: 1, record });
  }
  const added = [];
  let unchangedCount = 0;
  for (const record of after || []) {
    const entry = counts.get(key(record));
    if (entry && entry.count > 0) {
      entry.count--;
      unchangedCount++;
    } else added.push(record);
  }
  const resolved = [];
  for (const entry of counts.values()) {
    for (let i = 0; i < entry.count; i++) resolved.push(entry.record);
  }
  return { new: added, resolved, unchangedCount };
}

module.exports = { snapshotDiagnostics, diffDiagnostics };
