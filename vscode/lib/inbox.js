'use strict';

// Local bridge: another tool on this host (Claude Code) drops JSON files into
// <globalStorage>/inbox; each becomes a queued chat message, exactly as if typed.
// Off unless tvijo.bridge.enabled is set, because a queued message runs with the
// user's current preset, including Full access.

const fs = require('node:fs');
const path = require('node:path');

const MAX_FILE_BYTES = 32768;
const MAX_TEXT = 20000;
const MODES = new Set(['agent', 'plan', 'chat']);

function parseMessage(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data.text !== 'string') return null;
  const text = data.text.trim();
  if (!text || text.length > MAX_TEXT) return null;
  const from = typeof data.from === 'string' && /^[\w .-]{1,40}$/.test(data.from) ? data.from : 'local tool';
  return { text, mode: MODES.has(data.mode) ? data.mode : 'agent', from };
}

function createInbox({ dir, deliver, uid = process.getuid?.(), io = fs }) {
  // Files are claimed only when a view can take them; otherwise they wait on disk.
  function poll() {
    if (!dir) return [];
    let names;
    try { names = io.readdirSync(dir); } catch { return []; }
    const delivered = [];
    for (const name of names.filter(item => item.endsWith('.json')).sort()) {
      const file = path.join(dir, name);
      let stat;
      try { stat = io.lstatSync(file); } catch { continue; }
      // Only regular files written by the same account count as the user's own words.
      const foreign = !stat.isFile() || (uid !== undefined && stat.uid !== uid) || stat.size > MAX_FILE_BYTES;
      const message = foreign ? null : parseMessage(io.readFileSync(file, 'utf8'));
      if (message && !deliver(message)) break;
      try { io.unlinkSync(file); } catch { /* Another host already claimed it. */ }
      if (message) delivered.push(message);
    }
    return delivered;
  }
  function ensure() { if (dir) io.mkdirSync(dir, { recursive: true, mode: 0o700 }); }
  return { poll, ensure, dir };
}

module.exports = { createInbox, parseMessage, MAX_TEXT };
