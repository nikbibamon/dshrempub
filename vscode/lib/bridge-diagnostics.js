'use strict';

// Diagnostics never enter the chat/task pipeline. Durable inbox statuses still
// own replay and reload recovery; a failed status write cannot start any work.
function createBridgeDelivery({ inbox, view, enabled, runtimeVersion, health, focus, timeoutMs = 3000 }) {
  const completions = new Map();
  const controllers = new Set();
  let focusFlight = null;
  let disposed = false;

  function flush() {
    if (disposed) return;
    for (const [id, result] of completions) {
      try { inbox().finish(id, 'completed', result); completions.delete(id); }
      catch { /* Retain the exact result until the durable outbox is writable. */ }
    }
  }

  async function diagnose(id) {
    const controller = new AbortController();
    controllers.add(controller);
    let timer;
    let timedOut = false;
    let healthState;
    try {
      const response = await Promise.race([
        Promise.resolve().then(() => health(controller.signal)),
        new Promise((_, reject) => {
          timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new Error('timeout')); }, timeoutMs);
        })
      ]);
      healthState = response?.status === 'ok' && response?.service === 'dshrem'
        ? { status: 'ok' }
        : { status: 'unavailable', reason: 'invalid_response' };
    } catch {
      // Never serialize provider responses, URLs, tokens or exception messages.
      healthState = { status: 'unavailable', reason: timedOut ? 'timeout' : 'unavailable' };
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
    }
    if (disposed) return;
    const version = runtimeVersion();
    const answer = JSON.stringify({
      runtimeVersion: typeof version === 'string' && version.length <= 64 && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version) ? version : 'unknown',
      bridgeEnabled: enabled() === true,
      viewResolved: !!view(),
      health: healthState
    });
    completions.set(id, { answer, outcome: 'diagnostic' });
    flush();
  }

  function deliver(message) {
    if (disposed || !enabled()) return false;
    const queue = inbox();
    if (message.text === '/status') {
      const state = queue.status(message.id)?.state;
      if (state !== 'accepted') return true;
      try { queue.mark(message.id, 'running'); }
      catch { return false; }
      void diagnose(message.id);
      return true;
    }
    const target = view();
    if (!target) {
      if (!focusFlight && !queue.status(message.id)?.viewFocusAttempted) {
        // Persist the attempt before opening UI: polling/reload must not steal
        // focus forever when VS Code cannot resolve the view.
        try { queue.mark(message.id, 'accepted', { viewFocusAttempted: true }); }
        catch { return false; }
        focusFlight = Promise.resolve().then(focus).catch(() => {}).finally(() => { focusFlight = null; });
      }
      return false;
    }
    target.show?.(true);
    Promise.resolve(target.webview.postMessage({ type: 'inbox', ...message })).then(
      ok => { if (ok === false) queue.unhand(message.id); },
      () => queue.unhand(message.id)
    );
    return true;
  }

  return { deliver, flush, dispose() { disposed = true; for (const controller of controllers) controller.abort(); controllers.clear(); } };
}

module.exports = { createBridgeDelivery };
