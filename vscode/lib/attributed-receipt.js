'use strict';
const {createHash} = require('node:crypto');

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

const validHash = value => typeof value === 'string' && value.length === 64 && SHA.test(value);
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

// The caller must already have an authenticated Workspace response. The hash
// checks exact receipt bytes; it is not a signature or an authority grant.
function fixtureReceipt(value, projectId) {
  const {projection_sha256: fingerprint, ...body} = value;
  const states = ['quoted','running','completed','cancelled','unknown'];
  if (value.schema !== 'tvijo.execution.evidence/1' || value.fixture_id !== 'sha256-public-worker-v1'
      || value.admission_version !== 'public-fixture/v1' || value.model_request_sent !== false
      || value.customer_model_workflow !== 'NOT_RUN' || value.execution_repeated !== false
      || value.task_id !== value.id || value.attempt_id !== value.id || !states.includes(value.status)
      || ![fingerprint,value.configuration_hash,value.input_hash,value.contract_hash].every(validHash)
      || createHash('sha256').update(canonical(body)).digest('hex') !== fingerprint) return null;
  const complete = value.status === 'completed';
  if (complete && (value.process_count !== 1 || value.launch_intent_count !== 1 || value.local_outbox_ack !== true
      || value.deterministic_fixture !== 'pass' || value.result_envelope?.contract_hash !== value.contract_hash
      || !/^fixture-sha256:[a-f0-9]{64}$/.test(value.result) || value.result.length !== 79)) return null;
  return {
    schema:'tvijo.execution.evidence/1', task_id:value.id, project_id:projectId, status:value.status,
    configuration_hash:value.configuration_hash, input_hash:value.input_hash, contract_hash:value.contract_hash,
    fixture_id:'sha256-public-worker-v1', source_projection_sha256:fingerprint,
    deterministic_fixture:complete ? 'pass' : 'unknown', model_request_sent:false, customer_model_workflow:'NOT_RUN',
    cost:{service_unit:'micro_tvijo',debited:0,held:0,provider_usd:'0',provider_cost_status:'fixture_no_provider',
      provider_cost_source:'fixed_public_fixture_only',invoice_usd:'0'},
    verification:{status:'not_independently_verified',reviewer:null},runtime_ack:'UNKNOWN'
  };
}

function attributedReceipt(value, projectId) {
  if (!validId(projectId) || !value || value.project_id !== projectId || !validId(value.id)) return null;
  if (value.fixture_id !== undefined || value.admission_version !== undefined) return fixtureReceipt(value, projectId);
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
