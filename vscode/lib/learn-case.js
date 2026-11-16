'use strict';
const {canonicalJson}=require('./learn-candidate');
const CASE_ID = /^[a-z][a-z0-9]{0,7}$/;
const isInt = (v, lo, hi) => Number.isSafeInteger(v) && v >= lo && v <= hi;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function validateCase(c) {
  try {
    if (!isObj(c) || Object.keys(c).sort().join() !== 'expected,slots,tasks') return ['case_invalid:keys'];
    const { tasks, slots, expected } = c;
    if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 12) return ['case_invalid:tasks'];
    const ids = new Set();
    for (const t of tasks) {
      if (!isObj(t) || Object.keys(t).sort().join() !== 'id,minutes,priority') return ['case_invalid:task'];
      if (typeof t.id !== 'string' || !CASE_ID.test(t.id) || ids.has(t.id)) return ['case_invalid:task_id'];
      ids.add(t.id);
      if (!isInt(t.priority, 0, 9)) return ['case_invalid:priority'];
      if (!isInt(t.minutes, 1, 480)) return ['case_invalid:minutes'];
    }
    if (!Array.isArray(slots) || slots.length < 1 || slots.length > 6) return ['case_invalid:slots'];
    let prevEnd = -1;
    for (const s of slots) {
      if (!Array.isArray(s) || s.length !== 2 || !isInt(s[0], 0, 1440) || !isInt(s[1], 0, 1440)) return ['case_invalid:slot'];
      if (s[0] >= s[1]) return ['case_invalid:slot_empty'];
      if (s[0] < prevEnd) return ['case_invalid:slots_overlap_or_unsorted'];       // sorted by start, touching is allowed, overlapping is not
      prevEnd = s[1];
    }
    if (!Array.isArray(expected) || expected.length > tasks.length) return ['case_invalid:expected'];
    const placed = new Set();
    for (const e of expected) {
      if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'string' || !ids.has(e[0]) || placed.has(e[0]) || !isInt(e[1], 0, 1440)) return ['case_invalid:expected_pair'];
      placed.add(e[0]);
    }
    return [];
  } catch { return ['case_invalid:unreadable']; }
}

module.exports={validateCase,canonicalCase:canonicalJson};
