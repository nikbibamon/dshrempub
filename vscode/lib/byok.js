'use strict';
const { ServiceError } = require('./client');
function refused() { throw new ServiceError('payer_changed', 'The provider connection, payer or service fee changed. No Managed fallback was authorized.'); }
function providerCap(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(value) || !(Number(value) > 0 && Number(value) <= 10)) throw new ServiceError('invalid_provider_cap', 'An explicit positive customer-provider USD ceiling is required.');
  return value;
}
function quoteFields(choice) { return choice ? { billing_mode: 'byok', connection_id: choice.id, max_provider_usd: providerCap(choice.max_provider_usd), managed_fallback: false, max_micro_tvijo: 1000 } : {}; }
function validateQuote(quote,choice) {
  if (!choice) { if (quote.billing_mode && quote.billing_mode !== 'managed') refused(); return quote; }
  if (quote.billing_mode !== 'byok' || quote.connection_id !== choice.id || quote.connection_epoch !== choice.epoch || quote.managed_fallback !== false || quote.provider_bill_payer !== 'customer_provider_account' || quote.service_fee_micro_tvijo !== 1000 || quote.ceiling_micro_tvijo !== 1000 || quote.provider_max_usd !== choice.max_provider_usd) refused();
  return quote;
}
function validateConnection(response,choice,project) {
  if (!choice || !response?.connections?.some(c => c.id === choice.id && c.project_id === project && c.epoch === choice.epoch && c.execution_available === true && !c.revoked_at && c.managed_fallback === false && c.provider_bill_payer === 'customer_provider_account' && Number(providerCap(c.max_task_provider_usd)) >= Number(providerCap(choice.max_provider_usd)))) refused();
}
function checkoutUrl(value) {
  let url; try { if (typeof value !== 'string' || value.length > 4096) refused(); url = new URL(value); } catch { refused(); }
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.port || url.username || url.password || !url.pathname.startsWith('/c/')) refused();
  return url.href;
}
async function confirmQuote({quote,choice,project,readChoice,guard,confirm,connections}) {
  validateQuote(quote,choice);
  if (!choice) return;
  await guard(); if (readChoice() !== choice) refused();
  if (!await confirm()) throw new ServiceError('interrupted', 'BYOK task was not authorized.');
  await guard(); if (readChoice() !== choice) refused();
  const fresh = await connections();
  await guard(); if (readChoice() !== choice) refused();
  validateConnection(fresh,choice,project);
}
function createSelection() {
  let selected = null;
  const binding = (auth,project) => JSON.stringify([auth.api_base,auth.scope,auth.authEpoch,auth.access_token,project]);
  return { clear() { selected = null; }, select(auth,project,choice) { if (!project || !choice || !Number.isSafeInteger(choice.epoch)) refused(); selected = { binding:binding(auth,project), choice:{id:choice.id,epoch:choice.epoch,max_provider_usd:providerCap(choice.max_provider_usd)} }; }, get(auth,project) { return selected?.binding === binding(auth,project) ? selected.choice : null; } };
}
function publicReceipt(value) {
  if (!value) return null;
  const status = ['reported','estimated','unknown','not_dispatched'].includes(value.provider_cost_status) ? value.provider_cost_status : 'unknown';
  const cost = typeof value.provider_cost_usd === 'string' && /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value.provider_cost_usd) ? value.provider_cost_usd : null;
  return { provider_bill_payer:'customer_provider_account', managed_fallback:false, provider_cost_status:cost === null && status !== 'not_dispatched' ? 'unknown' : status, provider_cost_usd:status === 'unknown' ? null : cost, provider_cost_source:typeof value.provider_cost_source === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(value.provider_cost_source) ? value.provider_cost_source : 'unknown' };
}
module.exports = { confirmQuote, publicReceipt, providerCap, quoteFields, validateQuote, validateConnection, checkoutUrl, createSelection };
