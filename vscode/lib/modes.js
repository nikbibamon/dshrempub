'use strict';

const PRESETS = Object.freeze({
  manual: Object.freeze({ agentAutoApply: false, agentAutoRun: false }),
  edit: Object.freeze({ agentAutoApply: true, agentAutoRun: false }),
  plan: Object.freeze({ agentAutoApply: false, agentAutoRun: false }),
  auto: Object.freeze({ agentAutoApply: true, agentAutoRun: true })
});

function presetFor(autoApply, autoRun) {
  if (autoApply === false && autoRun === false) return 'manual';
  if (autoApply === true && autoRun === false) return 'edit';
  if (autoApply === true && autoRun === true) return 'auto';
  return 'custom';
}

function isPlanBypass(question, action) {
  const value = typeof question === 'string' ? question.trim() : '';
  if (value.startsWith('!')) return true;
  return !!action?.command && ['tvijo.quickEdit', 'tvijo.agent', 'tvijo.applyCoding', 'tvijo.rewind'].includes(action.command);
}

function autoWritePolicy(operation, previous) {
  if (previous === null) return true;
  return operation === 'replace_in_file';
}

module.exports = { PRESETS, presetFor, isPlanBypass, autoWritePolicy };
