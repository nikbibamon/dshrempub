'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { runAgent } = require('../lib/agent');
const { createTools } = require('../lib/local-tools');

test('SPEC-053 six reads finalize once without tools, raw tool result or lost cost', async () => {
  const calls = [];
  const result = await runAgent({ goal: 'Как дела в проекте?', maxSteps: 6, budgetUsd: .02,
    tools: { execute: async () => ({ ok: true, content: 'Project evidence' }) },
    ask: async req => {
      calls.push(req);
      return { content: req.finalization ? 'В проекте есть собранные данные; полного прогресса не хватает.' : '{"tool":"read_file","path":"progress.md"}', cost: { spent_usd: '.001' } };
    }
  });
  assert.equal(calls.length, 7);
  assert.equal(calls[6].tools, false);
  assert.equal(calls[6].finalization, true);
  assert.match(calls[6].messages[0].content, /Tools are disabled/);
  assert.doesNotMatch(result.text, /TOOL_RESULT/);
  assert.match(result.text, /В проекте/);
  assert.ok(Math.abs(result.spent - .007) < 1e-10);
});

test('SPEC-053 400 KiB read returns first 64 KiB and a usable late line range', async () => {
  const dir = await fs.mkdtemp(path.join(process.env.TVIJO_TEST_ARTIFACTS || os.tmpdir(), '053-read-'));
  await fs.writeFile(dir + '/large.txt', ('a'.repeat(99) + '\n').repeat(4096));
  const tools = createTools({ root: dir });
  const first = await tools.execute({ tool: 'read_file', path: 'large.txt' });
  assert.equal(first.ok, true);
  assert.equal(first.bytes, 409600);
  assert.equal(first.truncated, true);
  assert.ok(Buffer.byteLength(first.content) <= 65536);
  assert.match(first.note, /409600 bytes; use start\/end/);
  const late = await tools.execute({ tool: 'read_file', path: 'large.txt', start: 4090, end: 4096 });
  assert.equal(late.ok, true);
  assert.equal(late.start, 4090);
  assert.ok(late.content.startsWith('a'.repeat(99)));
});

test('SPEC-053 question with default twelve steps finishes in first half', async () => {
  let calls = 0;
  const result = await runAgent({ goal: 'Как дела в проекте?',
    tools: { execute: async () => ({ ok: true, content: 'Progress' }) },
    ask: async req => {
      calls++;
      assert.match(req.messages[0].content, /finish by half the step limit \(step 6\)/);
      return { content: calls === 1 ? '{"tool":"read_file","path":"progress.md"}' : '{"tool":"finish","answer":"Прогресс прочитан; дальше проверка."}' };
    }
  });
  assert.equal(result.reason, 'finish');
  assert.ok(calls <= 6);
});
