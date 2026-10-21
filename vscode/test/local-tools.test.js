'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createTools, autoCommand, cleanEnv } = require('../lib/local-tools');
const { autoWritePolicy } = require('../lib/modes');

async function workspace() {
  const parent = process.env.TVIJO_TEST_ARTIFACTS || os.tmpdir();
  const root = await fs.mkdtemp(path.join(parent,'slice2-tools-'));
  await fs.writeFile(path.join(root,'source.js'),'const old = 1;\n','utf8');
  return root;
}

test('tool dispatcher supplies trusted operation identity for write_file and unique replacement', async () => {
  const root=await workspace(), operations=[];
  const tools=createTools({root,confirmWrite:async info=>{operations.push(info);return false;}});
  const whole=await tools.execute({tool:'write_file',path:'source.js',content:'const next = 2;\n',operation:'replace_in_file'});
  const replacement=await tools.execute({tool:'replace_in_file',path:'source.js',old:'const old = 1;',new:'const next = 2;'});
  assert.equal(whole.refused,true); assert.equal(replacement.refused,true);
  assert.deepEqual(operations.map(item=>item.operation),['write_file','replace_in_file']);
  assert.equal(autoWritePolicy(operations[0].operation,operations[0].previous),false);
  assert.equal(autoWritePolicy(operations[1].operation,operations[1].previous),true);
  assert.equal(await fs.readFile(path.join(root,'source.js'),'utf8'),'const old = 1;\n');
});

test('blocked command never reaches approval or process spawn; Auto vectors stay exact', async () => {
  const root=await workspace(); let approvals=0;
  const tools=createTools({root,confirmRun:async()=>{approvals++;return true;}});
  await assert.rejects(tools.execute({tool:'run_command',command:'sudo echo blocked'}),/blocked by the local safety rules/);
  assert.equal(approvals,0);
  assert.deepEqual(['npm test','pnpm test','yarn test','go test ./...','cargo test'].map(autoCommand),[
    ['npm','test'],['pnpm','test'],['yarn','test'],['go','test','./...'],['cargo','test']
  ]);
  assert.equal(autoCommand('npm test -- --run'),null);
  for (const name of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','TVIJO_API_KEY']) assert.equal(Object.hasOwn(cleanEnv(),name),false);
});
