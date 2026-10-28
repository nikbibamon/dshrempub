'use strict';

// Fail closed until the trusted launcher has attested this task. A saved UI
// grant alone must never authorize the old root host shell.
function unavailable() {
  return { available: false, reason: 'Extra sandbox launcher has not passed preflight; host shell is forbidden at uid 0.' };
}

function assertExtraSandbox(sandbox) {
  if (!sandbox || sandbox.ready !== true || typeof sandbox.execute !== 'function') {
    throw Object.assign(new Error(unavailable().reason), { code: 'extra_sandbox_unavailable', stopAgent: true });
  }
}

module.exports = { unavailable, assertExtraSandbox };
