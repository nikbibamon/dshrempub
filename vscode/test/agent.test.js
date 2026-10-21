'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseAction, runAgent } = require('../lib/agent');
const { createTools, safePath } = require('../lib/local-tools');

async function workspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tvijo-agent-'));
  await fs.writeFile(path.join(root, 'a.txt'), 'hello\nTODO fix me\n', 'utf8');
  await fs.writeFile(path.join(root, 'secret.env'), 'TOKEN=1\n', 'utf8');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src/app.js'), 'const value = 1;\n', 'utf8');
  return root;
}

test('agent parses one JSON action and accepts a fenced object', () => {
  assert.deepEqual(parseAction('{"tool":"read_file","path":"a.txt"}'), { tool: 'read_file', path: 'a.txt' });
  assert.deepEqual(parseAction('```json\n{"tool":"finish","answer":"ok"}\n```'), { tool: 'finish', answer: 'ok' });
  assert.equal(parseAction('plain text answer'), null);
  assert.equal(parseAction('{"not_a_tool":true}'), null);
});

test('Agent and Plan runs receive explicit attachment context as untrusted data', async () => {
  const { runAgent } = require('../lib/agent');
  const { prepareAttachment, questionWithAttachments } = require('../lib/attachments');
  const attachment = await prepareAttachment('src/example.js', Buffer.from('const value = 1;'));
  for (const planMode of [false, true]) {
    let sent;
    await runAgent({
      goal: questionWithAttachments('Review this file', [attachment]), planMode, maxSteps: 1,
      tools: { execute: async () => ({ ok: true }) },
      ask: async ({ messages }) => { sent = messages; return { content: '{"tool":"finish","answer":"Reviewed"}' }; }
    });
    const serialized = JSON.stringify(sent);
    assert.match(serialized, /const value = 1/);
    assert.match(serialized, /untrusted|not instructions/i);
  }
});

test('agent loop executes a tool and stops on finish', async () => {
  const answers = ['{"tool":"read_file","path":"a.txt"}', '{"tool":"finish","answer":"done"}'];
  const events = [];
  const result = await runAgent({
    goal: 'inspect', tree: 'a.txt',
    ask: async () => ({ content: answers.shift(), cost: { spent_usd: '0.001' } }),
    tools: { execute: async () => ({ ok: true, content: 'hello' }) },
    onEvent: event => events.push(event)
  });
  assert.equal(result.text, 'done');
  assert.equal(result.steps, 2);
  assert.deepEqual(events.map(event => event.type), ['step', 'action', 'result', 'step', 'final']);
});

test('agent loop stops when the local session budget is exhausted', async () => {
  await assert.rejects(() => runAgent({
    goal: 'loop', budgetUsd: 0.5,
    ask: async () => ({ content: '{"tool":"read_file","path":"a.txt"}', cost: { spent_usd: '0.6' } }),
    tools: { execute: async () => ({ ok: true }) }
  }), /budget exhausted/);
});

test('agent loop never treats a plain text answer as a tool call', async () => {
  const result = await runAgent({
    goal: 'say hi', ask: async () => ({ content: 'Hi. Nothing to change.', cost: { spent_usd: '0' } }),
    tools: { execute: async () => { throw new Error('must not run'); } }
  });
  assert.equal(result.reason, 'answer');
  assert.match(result.text, /Nothing to change/);
});

test('tools stay inside the workspace and refuse secret files', async () => {
  const root = await workspace();
  const tools = createTools({ root, confirmRun: async () => true, confirmWrite: async () => true });
  await assert.rejects(async () => safePath(root, '../outside.txt'), /escapes the workspace/);
  await assert.rejects(async () => safePath(root, '.env'), /excluded directory|Secret-like/);
  await assert.rejects(async () => tools.execute({ tool: 'read_file', path: 'secret.env' }), /excluded directory|Secret-like/);
  const read = await tools.execute({ tool: 'read_file', path: 'a.txt' });
  assert.match(read.content, /hello/);
  const listed = await tools.execute({ tool: 'list_dir', path: '.' });
  assert.ok(listed.entries.includes('a.txt'));
});

test('tools write only after confirmation and plan mode refuses writes', async () => {
  const root = await workspace();
  let confirmed = 0;
  const tools = createTools({ root, confirmRun: async () => true, confirmWrite: async () => { confirmed += 1; return true; } });
  const written = await tools.execute({ tool: 'write_file', path: 'src/app.js', content: 'const value = 2;\n' });
  assert.equal(written.ok, true);
  assert.equal(confirmed, 1);
  assert.equal(await fs.readFile(path.join(root, 'src/app.js'), 'utf8'), 'const value = 2;\n');
  const refused = await tools.execute({ tool: 'write_file', path: 'src/app.js', content: 'x' }, { planMode: true });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'plan_mode');
});

test('replace_in_file requires unique text, a confirmation and plan mode blocks it', async () => {
  const root = await workspace();
  let confirmed = 0;
  const tools = createTools({ root, confirmRun: async () => true, confirmWrite: async () => { confirmed += 1; return true; } });
  await assert.rejects(async () => tools.execute({ tool: 'replace_in_file', path: 'a.txt', old: 'missing', new: 'x' }), /not found/);
  await fs.writeFile(path.join(root, 'dup.txt'), 'same\nsame\n', 'utf8');
  await assert.rejects(async () => tools.execute({ tool: 'replace_in_file', path: 'dup.txt', old: 'same', new: 'x' }), /appears 2 times/);
  const replaced = await tools.execute({ tool: 'replace_in_file', path: 'a.txt', old: 'TODO fix me', new: 'fixed' });
  assert.equal(replaced.ok, true);
  assert.equal(confirmed, 1);
  assert.equal(await fs.readFile(path.join(root, 'a.txt'), 'utf8'), 'hello\nfixed\n');
  const refused = await tools.execute({ tool: 'replace_in_file', path: 'a.txt', old: 'fixed', new: 'x' }, { planMode: true });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'plan_mode');
  const declined = createTools({ root, confirmRun: async () => false, confirmWrite: async () => false });
  const notApplied = await declined.execute({ tool: 'replace_in_file', path: 'a.txt', old: 'fixed', new: 'x' });
  assert.equal(notApplied.refused, true);
  assert.equal(await fs.readFile(path.join(root, 'a.txt'), 'utf8'), 'hello\nfixed\n');
});

test('tools refuse destructive commands and run an allowed command', async () => {
  const root = await workspace();
  const tools = createTools({ root, confirmRun: async () => true, confirmWrite: async () => true });
  await assert.rejects(async () => tools.execute({ tool: 'run_command', command: 'rm -rf /' }), /blocked/);
  const result = await tools.execute({ tool: 'run_command', command: 'printf hello' });
  assert.equal(result.ok, true);
  assert.match(result.stdout, /hello/);
  const declined = createTools({ root, confirmRun: async () => false, confirmWrite: async () => false });
  const refused = await declined.execute({ tool: 'run_command', command: 'printf no' });
  assert.equal(refused.refused, true);
});

test('agent budget exhaustion is classified with spent and budget', async () => {
  await assert.rejects(
    runAgent({
      goal: 'spend', maxSteps: 3, budgetUsd: 0.5,
      ask: async () => ({ content: '{"tool":"list_dir","path":"."}', cost: { spent_usd: '1.2' } }),
      tools: { execute: async () => ({ ok: true }) }
    }),
    (error) => {
      assert.equal(error.code, 'agent_budget');
      assert.equal(error.budget, 0.5);
      assert.equal(error.spent, 1.2);
      return true;
    }
  );
});

test('agent retries one malformed JSON turn and then finishes', async () => {
  const answers = ['I will read the file.', '{"tool":"finish","answer":"done"}'];
  const events = [];
  const result = await runAgent({
    goal: 'retry', maxSteps: 4,
    ask: async () => ({ content: answers.shift(), cost: { spent_usd: '0.001' } }),
    tools: { execute: async () => ({ ok: true }) },
    onEvent: event => events.push(event)
  });
  assert.equal(result.text, 'done');
  assert.equal(result.steps, 2);
  assert.ok(events.some(event => event.type === 'notice'));
});

test('agent step limit returns a partial result instead of throwing', async () => {
  const result = await runAgent({
    goal: 'limit', maxSteps: 1,
    ask: async () => ({ content: '{"tool":"read_file","path":"a.txt"}', cost: { spent_usd: '0.001' } }),
    tools: { execute: async () => ({ ok: true, content: 'hello' }) }
  });
  assert.equal(result.reason, 'step_limit');
  assert.equal(result.partial, true);
  assert.match(result.text, /step limit/);
});
