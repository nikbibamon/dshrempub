'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PRESETS, presetFor, isPlanBypass, autoWritePolicy } = require('../lib/modes');

test('four presets map to the two existing approval flags', () => {
  assert.deepEqual(PRESETS.manual,{agentAutoApply:false,agentAutoRun:false});
  assert.deepEqual(PRESETS.edit,{agentAutoApply:true,agentAutoRun:false});
  assert.deepEqual(PRESETS.plan,{agentAutoApply:false,agentAutoRun:false});
  assert.deepEqual(PRESETS.auto,{agentAutoApply:true,agentAutoRun:true});
  assert.equal(presetFor(false,false),'manual');
  assert.equal(presetFor(true,false),'edit');
  assert.equal(presetFor(true,true),'auto');
  assert.equal(presetFor(false,true),'custom');
});

test('Plan composer rejects shell commands and write-capable slash dispatches', () => {
  assert.equal(isPlanBypass(' !echo blocked ',null),true);
  assert.equal(isPlanBypass('/edit',{command:'tvijo.quickEdit'}),true);
  assert.equal(isPlanBypass('/agent',{command:'tvijo.agent'}),true);
  assert.equal(isPlanBypass('/codeapply',{command:'tvijo.applyCoding'}),true);
  assert.equal(isPlanBypass('/rewind',{command:'tvijo.rewind'}),true);
  assert.equal(isPlanBypass('/help',{command:'tvijo.help'}),false);
  assert.equal(isPlanBypass('Read this project',null),false);
});

test('Auto write classification trusts only exact dispatcher replacement matches', () => {
  assert.equal(autoWritePolicy('write_file',null),true);
  assert.equal(autoWritePolicy('replace_in_file',null),true);
  assert.equal(autoWritePolicy('replace_in_file','old bytes'),true);
  assert.equal(autoWritePolicy('replace_in_file','old bytes','eol'),false);
  assert.equal(autoWritePolicy('replace_in_file','old bytes','trailing_whitespace'),false);
  assert.equal(autoWritePolicy('replace_in_file','old bytes','indent'),false);
  assert.equal(autoWritePolicy('write_file','old bytes'),false);
  assert.equal(autoWritePolicy('run_command','old bytes'),false);
});

test('Plan composer refuses configuring a syntax tool that would run native probes',()=>{
  const {isPlanBypass}=require('../lib/modes');
  assert.equal(isPlanBypass('/syntax',{command:'tvijo.configureAutoLint'}),true);
  assert.equal(isPlanBypass('/syntax-off',{command:'tvijo.disableAutoLint'}),false);
});


test('Full access is an explicit host grant overlay, independent of normal preset flags',()=>{
  assert.deepEqual(PRESETS.full,{agentAutoApply:true,agentAutoRun:true});
  assert.equal(presetFor(false,false,true),'full');assert.equal(presetFor(true,false,true),'full');assert.equal(presetFor(true,true,true),'full');
  assert.equal(presetFor(false,false,false),'manual');
});
