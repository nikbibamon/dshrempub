'use strict';

// A bounded client-side agent loop. Each model turn is one ordinary paid task
// through the existing service route; tools run locally on the editor host.
// The loop stops on a final answer, a step cap or a local session budget.

const TOOL_HELP = [
  '{"tool":"list_dir","path":"src"}',
  '{"tool":"read_file","path":"src/app.js","start":1,"end":200}',
  '{"tool":"search","query":"TODO","path":"src","max":20}',
  '{"tool":"replace_in_file","path":"src/app.js","old":"exact existing text","new":"replacement text"}',
  '{"tool":"write_file","path":"src/app.js","content":"complete new file"}',
  '{"tool":"run_command","command":"npm test","cwd":".","timeout_ms":60000}',
  '{"tool":"finish","answer":"what was done, what was checked, what remains"}'
].join('\n');

function systemPrompt({ tree = '', planMode = false, step = 1, maxSteps = 6, budgetUsd = 2 }) {
  return [
    'You are Tvijo Agent, a coding agent inside VS Code.',
    'Work only inside the opened workspace. Return exactly one JSON object per turn and nothing else.',
    'Available actions:',
    TOOL_HELP,
    'Rules:',
    '- Paths are relative to the workspace root. Never read or write secrets, .env, keys, .git, .ssh or .aws.',
    '- Prefer small, reviewable edits: use replace_in_file when the existing text is unique, write_file mainly for new files. Do not invent files or dependencies.',
    '- Before changing code, read the relevant files. After changing code, run the narrowest useful check.',
    '- If a command fails, inspect the output and either fix the cause or finish with the exact blocker.',
    '- In plan mode, write_file, replace_in_file and run_command are refused; only inspect and finish.',
    '- Never claim a command or test passed unless the tool result says so.',
    '- Finish only with {"tool":"finish","answer":"..."} and include changed paths, checks, and remaining risks.',
    planMode ? 'MODE: PLAN ONLY — no writes, no commands.' : 'MODE: ACT — writes and commands need user approval unless explicitly auto-approved.',
    'Step ' + step + ' of at most ' + maxSteps + '. Local session budget: $' + budgetUsd + '.',
    tree ? 'Workspace tree (bounded):\n' + tree : ''
  ].filter(Boolean).join('\n');
}

function parseAction(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const candidates = [cleaned];
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value.tool === 'string') return value;
    } catch { /* Try the next candidate. */ }
  }
  return null;
}

function costOf(answer) {
  const value = answer?.cost?.spent_usd ?? answer?.cost?.budget?.spent_usd ?? answer?.cost?.spent ?? 0;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

async function runAgent({ goal, tree, planMode, maxSteps = 6, budgetUsd = 2, ask, tools, onEvent = () => {}, signal }) {
  if (!goal || !goal.trim()) throw new Error('A goal is required.');
  const steps = Math.min(Math.max(Number(maxSteps) || 6, 1), 12);
  const budget = Math.max(Number(budgetUsd) || 2, 0);
  const messages = [{ role: 'system', content: systemPrompt({ tree, planMode, step: 1, maxSteps: steps, budgetUsd: budget }) }, { role: 'user', content: goal.trim() }];
  let spent = 0;
  let parseFailures = 0;
  for (let step = 1; step <= steps; step++) {
    if (signal?.aborted) { const stopped = new Error('Agent stopped by the user.'); stopped.code = 'agent_stopped'; throw stopped; }
    onEvent({ type: 'step', step, maxSteps: steps, spent });
    const answer = await ask({ messages, step, signal });
    spent += costOf(answer);
    if (spent > budget) {
      const failure = new Error('Local agent budget exhausted ($' + spent.toFixed(6) + ' of $' + budget + '). No further step was started.');
      failure.code = 'agent_budget'; failure.spent = spent; failure.budget = budget;
      throw failure;
    }
    const action = parseAction(answer.content);
    if (!action) {
      if (parseFailures < 1 && step < steps) {
        parseFailures += 1;
        onEvent({ type: 'notice', text: 'The model returned no tool JSON; asking once for a strict JSON turn.' });
        messages.push({ role: 'assistant', content: answer.content });
        messages.push({ role: 'user', content: 'Return exactly one JSON object with a "tool" field and no prose or markdown.' });
        continue;
      }
      onEvent({ type: 'final', text: answer.content, steps: step, spent });
      return { text: answer.content, steps: step, spent, reason: 'answer' };
    }
    parseFailures = 0;
    if (action.tool === 'finish') {
      const text = typeof action.answer === 'string' && action.answer.trim() ? action.answer : answer.content;
      onEvent({ type: 'final', text, steps: step, spent });
      return { text, steps: step, spent, reason: 'finish' };
    }
    onEvent({ type: 'action', action, step, spent });
    let result;
    try {
      result = await tools.execute(action, { planMode, signal });
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    onEvent({ type: 'result', action, result, step, spent });
    messages.push({ role: 'assistant', content: answer.content });
    messages.push({ role: 'user', content: 'TOOL_RESULT ' + JSON.stringify(result).slice(0, 24000) });
    // Keep the bounded transcript small enough for the service. The oldest
    // tool exchange is dropped first; the goal and the latest result stay.
    while (messages.length > 12) messages.splice(1, 2);
  }
  // A step limit is a partial outcome, not a reason to discard everything the
  // user already paid for. Return the last tool result with an explicit marker.
  const lastResult = [...messages].reverse().find(item => item.role === 'user' && String(item.content).startsWith('TOOL_RESULT'));
  const text = 'Agent reached the step limit (' + steps + '). No final finish was returned.\n\n' + (lastResult ? String(lastResult.content).slice(0, 2000) : 'No tool result is available.');
  onEvent({ type: 'final', text, steps, spent, partial: true });
  return { text, steps, spent, reason: 'step_limit', partial: true };
}

module.exports = { runAgent, parseAction, systemPrompt, costOf, TOOL_HELP };
