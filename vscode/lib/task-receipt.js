'use strict';

// A local execution receipt. Model prose cannot create verification evidence.
const OUTCOMES = new Set(['done','blocked','partial','cancelled','failed','unknown']);
function measuredCost(answer) {
  const value = answer?.cost?.spent_usd ?? answer?.cost?.budget?.spent_usd ?? answer?.cost?.spent;
  if (typeof value !== 'number' && !(typeof value === 'string' && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function outcomeOf(result) {
  if (result?.partial || result?.reason === 'step_limit' || result?.reason === 'answer') return 'partial';
  return OUTCOMES.has(result?.status) ? result.status : 'blocked';
}
const line = (value, limit = 300) => typeof value === 'string' ? value.replace(/[\r\n\u0000]/g,' ').slice(0,limit) : '';
function createTaskReceipt({id, projectScope, projectId = null, folder, mode, model, startedAt = Date.now()}) {
  const taskIds = [], commands = [], edits = [], reviews = [], editorChecks = [], grantedModels = new Set(), reportedModels = new Set();
  let knownCost = 0, unknownCost = false, answers = 0, requests = 0, steps = 0, eventCount = 0, truncated = false;
  function task(taskId, servedModel) {
    if (typeof taskId === 'string' && !taskIds.includes(taskId)) {
      if (taskIds.length < 201) taskIds.push(line(taskId,256)); else truncated = true;
    }
    if (typeof servedModel === 'string' && grantedModels.size < 40) grantedModels.add(line(servedModel,100));
  }
  function answer(value) {
    answers++; task(value?.taskId);
    if (typeof value?.execution?.model === 'string' && reportedModels.size < 40) reportedModels.add(line(value.execution.model,100));
    const cost = measuredCost(value);
    if (cost === null) unknownCost = true; else knownCost += cost;
  }
  function event(value) {
    if (Number.isSafeInteger(value?.step)) steps = Math.max(steps,value.step);
    if (value?.type !== 'result') return;
    eventCount++;
    const action = value.action || {}, result = value.result || {};
    if ((typeof action.command === 'string' && action.command.length > 512) || (typeof (result.path || action.path) === 'string' && (result.path || action.path).length > 300) || (typeof result.lint_feedback === 'string' && result.lint_feedback.length > 1000) || (typeof result.diagnostics_feedback === 'string' && result.diagnostics_feedback.length > 1000)) truncated=true;
    if (action.tool === 'run_command') {
      commands.push({command:line(action.command,512),cwd:line(result.cwd,300),ok:result.ok === true,exit_code:Number.isInteger(result.exitCode) ? result.exitCode : null,timed_out:result.timedOut === true,cancelled:result.cancelled === true,termination:line(result.termination,80),error:line(result.error || result.reason,200),step:value.step});
      if (commands.length > 40) {commands.shift();truncated=true;}
    } else if (['write_file','replace_in_file'].includes(action.tool) && result.ok === true && !result.unchanged) {
      edits.push({path:line(result.path || action.path,300),operation:action.tool,saved:result.saved === true,step:value.step});
      if (edits.length > 40) {edits.shift();truncated=true;}
      if (result.lint_feedback || result.diagnostics_feedback) {
        editorChecks.push({path:line(result.path || action.path,300),syntax_feedback:line(result.lint_feedback,1000),diagnostics_feedback:line(result.diagnostics_feedback,1000),step:value.step});
        if (editorChecks.length > 20) {editorChecks.shift();truncated=true;}
      }
    } else if (action.tool === 'agent_review') {
      reviews.push({id:line(result.id,80),agent:line(action.agent,40),ok:result.ok === true,reason:line(result.reason,100),auth:line(result.auth,40),requested_model:line(result.requested_model,100),served_model:line(result.served_model,100) || 'unknown',packet_sha256:line(result.packet_sha256,64)});
    }
  }
  function finish({result, error, cancelled = false, endedAt = Date.now()} = {}) {
    const outcome = cancelled ? 'cancelled' : error ? 'failed' : outcomeOf(result);
    const pendingCost = unknownCost || (taskIds.length > answers) || requests > answers || error?.code === 'usage_unknown';
    const receipt = {schema:1,id,project:{scope:line(projectScope,64),id:projectId ? line(projectId,256) : null,folder:line(folder,1000)},mode,started_at:startedAt,ended_at:endedAt,
      execution:{outcome,reason:line(error?.code || result?.reason,100),model_claimed_status:line(result?.modelStatus || result?.status,30) || null,steps:result?.steps ?? steps},
      verification:{status:'not_independently_verified',basis:'observed_local_tool_results',commands,edits,editor_checks:editorChecks,reviews,event_count:eventCount,truncated},
      provider_tasks:taskIds,models:{requested:model || null,granted:[...grantedModels],reported_served:[...reportedModels]},
      usage:{status:pendingCost ? 'unknown' : answers ? 'measured' : 'no_provider_calls',spent_usd:pendingCost ? null : knownCost,known_spent_usd:knownCost},
      remaining_operator_steps:Array.isArray(result?.remainingOperatorSteps) ? result.remainingOperatorSteps.filter(x=>typeof x==='string').slice(0,12).map(x=>line(x,300)) : []};
    // Keep the receipt independently bounded even with maximum-size server IDs.
    while (Buffer.byteLength(JSON.stringify(receipt)) > 60000) {
      const list = [commands,editorChecks,edits,taskIds].find(rows=>rows.length>1);
      if (!list) break;
      list.shift(); receipt.verification.truncated = true;
    }
    return receipt;
  }
  return {task,answer,event,finish,request:()=>{requests++;},requestedModel:value=>{model=line(value,100);}};
}
function formatReceipt(receipt, locale = 'en') {
  const ru = locale === 'ru', code = value => '`' + line(String(value),512).replace(/`/g,"'") + '`';
  const outcome = receipt.execution.outcome;
  const labels = ru ? {done:'выполнение завершено',blocked:'заблокировано',partial:'частичный результат',cancelled:'отменено',failed:'ошибка',unknown:'неизвестно'} : {done:'execution finished',blocked:'blocked',partial:'partial result',cancelled:'cancelled',failed:'failed',unknown:'unknown'};
  const usage = receipt.usage.status === 'unknown' ? (ru ? 'неизвестно; подтверждено $' : 'unknown; measured $') + receipt.usage.known_spent_usd.toFixed(6) : '$' + receipt.usage.spent_usd.toFixed(6);
  const lines = [(ru ? 'Квитанция задачи ' : 'Task receipt ') + code(receipt.id) + ' · ' + labels[outcome],
    (ru ? 'Проект: ' : 'Project: ') + code(receipt.project.folder) + (receipt.project.id ? ' · ' + code(receipt.project.id) : ''),
    (ru ? 'Задачи сервиса: ' : 'Service tasks: ') + (receipt.provider_tasks.length ? receipt.provider_tasks.slice(-8).map(code).join(', ') : '—'),
    (ru ? 'Расход API: ' : 'API cost: ') + usage,
    ru ? 'Статус модели не является независимой проверкой. Ниже только наблюдаемые результаты инструментов.' : 'Model completion is not independent verification. The following are observed tool results.'];
  if (receipt.usage.settlement === 'pending_reconciliation') lines.push(ru ? 'Финансовая сверка ещё не завершена; запись заявки сохранена.' : 'Financial reconciliation is pending; the request record is retained.');
  for (const item of receipt.verification.commands.slice(-8)) lines.push((ru ? 'Команда: ' : 'Command: ') + code(item.command) + ' · ' + (item.cancelled ? 'cancelled' : item.timed_out ? 'timed out' : item.exit_code === null ? (ru ? 'код выхода неизвестен' : 'exit unknown') : 'exit ' + item.exit_code) + (item.ok ? '' : ' · ' + (item.error || 'not successful')));
  if (!receipt.verification.commands.length) lines.push(ru ? 'Выполнение run_command не зарегистрировано.' : 'No run_command execution was recorded.');
  if (receipt.verification.editor_checks.length) lines.push((ru ? 'Наблюдаемые проверки редактора: ' : 'Observed editor checks: ') + receipt.verification.editor_checks.slice(-3).map(x=>code(x.path)+': '+line(x.syntax_feedback || x.diagnostics_feedback,200)).join('; '));
  if (receipt.verification.edits.length) lines.push((ru ? 'Правки файловыми инструментами: ' : 'File-tool edits: ') + [...new Set(receipt.verification.edits.map(x=>x.path))].slice(-12).map(code).join(', '));
  if (receipt.remaining_operator_steps.length) lines.push((ru ? 'Оставшиеся внешние шаги: ' : 'Remaining external steps: ') + receipt.remaining_operator_steps.map(x=>line(x)).join('; '));
  if (receipt.verification.truncated || receipt.verification.commands.length > 8 || receipt.provider_tasks.length > 8) lines.push(ru ? 'Показана часть квитанции; полный сохранённый журнал доступен локально.' : 'This is a receipt excerpt; the retained journal is stored locally.');
  return lines.join('\n\n');
}
module.exports = {measuredCost,outcomeOf,createTaskReceipt,formatReceipt};
