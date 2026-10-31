'use strict';

// Only the gateway's four public read operations are exposed to the agent.
const FIELDS = Object.freeze({
  wiki_search: ['query','limit','lang'], wiki_context: ['key','expect_sha256','max_tokens'],
  catalog_search: ['query','limit','category'], catalog_get: ['slug']
});
const MAX_ARGUMENTS = 4096, MAX_RESULT = 64 * 1024;
const validText = (v, n) => typeof v === 'string' && !!v.trim() && v.length <= n && !/[\x00-\x1f]/.test(v);
const validInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
function argumentsFor(action) {
  if (!action || !Object.hasOwn(FIELDS, action.tool) || Object.keys(action).some(k => k !== 'tool' && !FIELDS[action.tool].includes(k))) throw new Error('Invalid knowledge tool arguments.');
  const {tool, ...args} = action;
  let valid = false;
  if (tool === 'wiki_search') valid = validText(args.query,200) && (args.limit === undefined || validInt(args.limit,1,10)) && (args.lang === undefined || ['en','ru'].includes(args.lang));
  if (tool === 'wiki_context') valid = validText(args.key,160) && /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/.test(args.key) && /^[a-f0-9]{64}$/.test(args.expect_sha256 || '') && (args.max_tokens === undefined || validInt(args.max_tokens,100,2000));
  if (tool === 'catalog_search') valid = validText(args.query,200) && (args.limit === undefined || validInt(args.limit,1,10)) && (args.category === undefined || validText(args.category,100));
  if (tool === 'catalog_get') valid = typeof args.slug === 'string' && /^[a-z0-9][a-z0-9-]{0,80}$/.test(args.slug);
  if (!valid || Buffer.byteLength(JSON.stringify(args),'utf8') > MAX_ARGUMENTS) throw new Error('Invalid knowledge tool arguments.');
  return args;
}
function createKnowledgeTool({api, token, guard = async () => {}}) {
  return async (action, {signal} = {}) => {
    const args = argumentsFor(action);
    await guard();
    if (signal?.aborted) return {ok:false,refused:true,reason:'cancelled'};
    let result;
    try {
      result = await api.request('/knowledge/tools/' + action.tool, {method:'POST',token,body:args,signal,maxResponseBytes:MAX_RESULT});
    } catch (error) {
      await guard();
      if (signal?.aborted) return {ok:false,refused:true,reason:'cancelled'};
      return {ok:false,refused:true,reason:error?.status === 409 ? 'stale_wiki_revision' : error?.code === 'oversized' ? 'knowledge_result_too_large' : 'knowledge_unavailable'};
    }
    await guard();
    if (signal?.aborted) return {ok:false,refused:true,reason:'cancelled'};
    const serialized = JSON.stringify(result);
    if (!result || result.tool !== action.tool || result.untrusted !== true || !Object.hasOwn(result,'data') || typeof serialized !== 'string' || Buffer.byteLength(serialized,'utf8') > MAX_RESULT || (token && serialized.includes(token))) return {ok:false,refused:true,reason:'invalid_knowledge_result'};
    return {ok:true, ...result};
  };
}
module.exports = {createKnowledgeTool, argumentsFor};
