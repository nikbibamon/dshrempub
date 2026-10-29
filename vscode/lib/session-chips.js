'use strict';

function timestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value < 1e12 ? value * 1000 : value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function elapsedMs(session, now = Date.now()) {
  if (!session || typeof session !== 'object') return null;
  const start = timestamp(session.startedAt ?? session.started_at);
  if (start === null) return null;
  const running = session.status === 'running';
  const end = running ? now : timestamp(session.endedAt ?? session.ended_at);
  return end === null || !Number.isFinite(end) || end < start ? null : end - start;
}

function countRunningAgents(session = {}) {
  const ids = new Set();
  const add = (id, status) => {
    if (typeof id !== 'string' || !id.trim() || !['running','active'].includes(String(status).toLowerCase())) return;
    ids.add(id.trim());
  };
  // A local Agent run is an observed host lifecycle with its own explicit identity.
  if (session.status === 'running' && typeof session.localAgentRunId === 'string') add(session.localAgentRunId, 'running');
  let visited = 0;
  function visit(node, depth) {
    if (!node || typeof node !== 'object' || visited++ >= 400 || depth > 4) return;
    const branches = Array.isArray(node.agent_tree) && node.agent_tree.length ? node.agent_tree : Array.isArray(node.calls) ? node.calls : [];
    for (const child of branches.slice(0, 80)) {
      if (!child || typeof child !== 'object') continue;
      const identity = child.agent_id ?? child.session_id ?? child.execution_id ?? child.id ?? child.request_id ?? child.task_id ?? child.taskId;
      const nested = child.agent_tree?.length || child.calls?.length;
      if (!nested) add(typeof identity === 'string' || typeof identity === 'number' ? String(identity) : null, child.status ?? child.outcome);
      visit(child, depth + 1);
    }
  }
  for (const task of (Array.isArray(session.tasks) ? session.tasks : []).slice(-80)) visit(task, 0);
  return ids.size;
}

function viewState(session, now = Date.now()) {
  if (!session || typeof session !== 'object') return { status:'unknown', startedAt:null, endedAt:null, elapsedMs:null, agents:null };
  const status = ['running','completed','blocked','partial','failed','cancelled'].includes(session.status) ? session.status : 'unknown';
  return {
    status,
    startedAt: timestamp(session.startedAt ?? session.started_at),
    endedAt: timestamp(session.endedAt ?? session.ended_at),
    elapsedMs: elapsedMs(session, now),
    agents: status === 'unknown' ? null : status === 'running' ? (countRunningAgents(session) || (session.localOnlyCommand===true?0:null)) : countRunningAgents(session)
  };
}

function formatElapsed(value) {
  if (!Number.isFinite(value) || value < 0) return '—';
  const seconds = Math.floor(value / 1000);
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}

module.exports = { timestamp, elapsedMs, countRunningAgents, viewState, formatElapsed };
