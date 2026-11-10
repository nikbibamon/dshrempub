'use strict';

// A scoped projection of observed service receipts, never model-generated proof.
// Provider USD is a Decimal string; service credits are separate integer units.
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const SHA = /^[a-f0-9]{64}$/;
const STATES = new Set(['issued','running','completed','failed','cancelled','frozen','unknown']);
const UNCERTAIN = new Set(['usage_unknown','charge_pending','usage_reconciliation_required','usage_recovery_unavailable']);
const SETTLED = new Set(['completed','failed','cancelled','expired']);
const COST_STATUS = new Set(['reported','estimated']);
const COST_SOURCES = new Set(['provider:cost','provider:total_cost','provider:estimated_cost','provider_rejected']);
const validId = value => typeof value === 'string' && ID.test(value) && !/[\r\n]/.test(value);
const amount = value => typeof value === 'string' && value.length <= 64 && !/\s/.test(value)
  && /^(?:0|[1-9]\d{0,19})(?:\.\d{1,28})?$/.test(value) ? value : null;
const units = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

function attributedReceipt(value, projectId) {
  if (!validId(projectId) || !value || value.project_id !== projectId || !validId(value.id)) return null;
  const receipt = value.receipt || {};
  const costStatus = value.byok?.provider_cost_status;
  const unknown = UNCERTAIN.has(value.reason) || !SETTLED.has(value.status) || !COST_STATUS.has(costStatus);
  const providerCost = unknown ? null : amount(value.byok?.provider_cost_usd);
  return {
    schema:'tvijo.execution.evidence/1', task_id:value.id, project_id:projectId,
    status:STATES.has(value.status) ? value.status : 'unknown',
    configuration_hash:typeof value.configuration_hash === 'string' && value.configuration_hash.length === 64 && SHA.test(value.configuration_hash) ? value.configuration_hash : null,
    cost:{service_unit:'micro_tvijo',debited:units(receipt.debited_micro_tvijo),held:units(receipt.held_micro_tvijo),
      provider_usd:providerCost,provider_cost_status:providerCost === null ? 'unknown' : costStatus,
      provider_cost_source:COST_SOURCES.has(value.byok?.provider_cost_source) ? value.byok.provider_cost_source : null,
      invoice_usd:null},
    verification:{status:'not_independently_verified',reviewer:null},runtime_ack:'UNKNOWN'
  };
}

module.exports = {attributedReceipt};
