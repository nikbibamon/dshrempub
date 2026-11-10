'use strict';

// A scoped projection of observed service receipts, never model-generated proof.
// Provider USD is a Decimal string; service credits are separate integer units.
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const SHA = /^[a-f0-9]{64}$/;
const STATES = new Set(['issued','running','completed','failed','cancelled','frozen','unknown','expired']);
const UNCERTAIN = new Set(['usage_unknown','charge_pending','usage_reconciliation_required','usage_recovery_unavailable']);
const SETTLED = new Set(['completed','failed','cancelled','expired']);
const COST_STATUS = new Set(['reported','estimated']);
const COST_PROVENANCE = new Map([['provider:cost','reported'],['provider:total_cost','reported'],
  ['provider:estimated_cost','estimated'],['provider_rejected','reported']]);
const validId = value => typeof value === 'string' && ID.test(value) && !/[\r\n]/.test(value);
const amount = value => typeof value === 'string' && value.length <= 64 && !/\s/.test(value)
  && /^(?:0|[1-9]\d{0,19})(?:\.\d{1,28})?$/.test(value) ? value : null;
const units = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

function attributedReceipt(value, projectId) {
  if (!validId(projectId) || !value || value.project_id !== projectId || !validId(value.id)) return null;
  const receipt = value.receipt || {};
  const costStatus = value.byok?.provider_cost_status;
  const costSource = value.byok?.provider_cost_source;
  const provenance = COST_STATUS.has(costStatus) && COST_PROVENANCE.get(costSource) === costStatus;
  const unknown = UNCERTAIN.has(value.reason) || !SETTLED.has(value.status) || !provenance;
  let providerCost = unknown ? null : amount(value.byok?.provider_cost_usd);
  if (providerCost !== null && /^0(?:\.0+)?$/.test(providerCost) && costStatus !== 'reported') providerCost = null;
  if (providerCost !== null && costSource === 'provider_rejected' && !/^0(?:\.0+)?$/.test(providerCost)) providerCost = null;
  return {
    schema:'tvijo.execution.evidence/1', task_id:value.id, project_id:projectId,
    status:STATES.has(value.status) ? value.status : 'unknown',
    configuration_hash:typeof value.configuration_hash === 'string' && value.configuration_hash.length === 64 && SHA.test(value.configuration_hash) ? value.configuration_hash : null,
    cost:{service_unit:'micro_tvijo',debited:units(receipt.debited_micro_tvijo),held:units(receipt.held_micro_tvijo),
      provider_usd:providerCost,provider_cost_status:providerCost === null ? 'unknown' : costStatus,
      provider_cost_source:provenance ? costSource : null,
      invoice_usd:null},
    verification:{status:'not_independently_verified',reviewer:null},runtime_ack:'UNKNOWN'
  };
}

module.exports = {attributedReceipt};
