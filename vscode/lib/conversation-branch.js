'use strict';

// Pure helpers for restoring or forking a local conversation at a chosen message.
// Nothing here touches storage, files or the network: the host decides what to save.
const MAX_ARCHIVES = 50;
const REASONS = new Set(['new', 'fork', 'switch']);

const textOf = item => String(item?.display ?? item?.content ?? '');

// The conversation "at" a message. A question is the state before it was sent, and the
// question itself goes back to the composer; an answer is the state right after it.
function pointAt(history, index) {
  if (!Array.isArray(history) || !Number.isInteger(index) || index < 0 || index >= history.length) return null;
  const item = history[index];
  if (!item || (item.role !== 'user' && item.role !== 'assistant') || item.localRecovery) return null;
  const user = item.role === 'user';
  const keep = history.slice(0, user ? index : index + 1);
  return { role: item.role, keep, removed: history.length - keep.length, draft: user ? textOf(item) : '' };
}

// The composer keeps what the person was typing: a restored question goes in front of it.
function mergeDraft(restored, existing) {
  const joined = restored && existing ? restored + '\n\n' + existing : restored || existing || '';
  return joined.slice(0, 20000);
}

function titleOf(history, limit = 60) {
  const first = Array.isArray(history) ? history.find(item => item?.role === 'user' && textOf(item).trim()) : null;
  const line = first ? textOf(first).replace(/\s+/g, ' ').trim() : '';
  return line.length > limit ? line.slice(0, limit - 1) + '…' : line;
}

// Archives written before 0.10.22 are bare arrays without a time or a reason.
function normalizeArchive(id, raw) {
  const history = Array.isArray(raw) ? raw : raw?.history;
  if (typeof id !== 'string' || !id || !Array.isArray(history) || !history.length) return null;
  return { id, at: Number.isFinite(raw?.at) ? raw.at : null, reason: REASONS.has(raw?.reason) ? raw.reason : null, history };
}

const byNewest = (a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity) || a.id.localeCompare(b.id);
const sortArchives = rows => [...rows].sort(byNewest);

// Oldest first beyond the cap; undated legacy archives go before dated ones.
function overflow(rows, max = MAX_ARCHIVES) {
  return sortArchives(rows).slice(max).map(row => row.id);
}

module.exports = { MAX_ARCHIVES, pointAt, mergeDraft, titleOf, normalizeArchive, sortArchives, overflow };
