'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PREFIX, createFullAccess } = require('../lib/full-access');

const a = 'a'.repeat(64), b = 'b'.repeat(64), c = 'c'.repeat(64);
function setup(locale='en') {
  const folder = (name, uri = {}) => ({ name, uri: { scheme: 'file', authority: '', fsPath: `/work/${name}`, ...uri } });
  const first = folder('one'), second = folder('two');
  const values = new Map();
  const state = { get: key => values.get(key), update: async (key, value) => value === undefined ? values.delete(key) : values.set(key, value) };
  const prompts = [];
  const vscode = { workspace: { isTrusted: true, workspaceFolders: [first, second] }, window: { showWarningMessage: async (message, options, label) => { prompts.push({ message, options, label }); return label; } } };
  let scopeOverride;
  const access = createFullAccess({ vscode, state, L:(en,ru)=>locale==='ru'?ru:en, scope: f => scopeOverride ? scopeOverride(f) : f === first ? a : f === second ? b : c });
  return { access, first, second, vscode, state, values, prompts, setScope: fn => { scopeOverride = fn; } };
}

test('trust and exact local workspace folder gate availability and prompts', async () => {
  const x = setup(); x.vscode.workspace.isTrusted = false;
  assert.equal(x.access.status(x.first).available, false);
  assert.equal(await x.access.enable(x.first), false); assert.equal(x.prompts.length, 0);
  x.vscode.workspace.isTrusted = true;
  assert.equal((await x.access.enable(x.first)), true);
  assert.equal(x.access.status(x.second).enabled, false);
  assert.match(x.prompts[0].label, /^Enable Full access$/);
  assert.equal(x.prompts[0].options.modal,true);
  assert.match(x.prompts[0].options.detail, /Hard command, path, secret, and budget limits and Rewind remain/);
  x.vscode.workspace.workspaceFolders = [x.second];
  assert.equal(x.access.status(x.first).available, false);
});

test('only a native explicit label response can grant', async () => {
  const x = setup();
  x.vscode.window.showWarningMessage = async () => 'Enable full access';
  assert.equal(await x.access.enable(x.first), false);
  assert.equal(x.access.status(x.first).enabled, false);
  assert.equal(x.values.has(PREFIX + a), false);
});

test('pending approval expires on identity, trust, or workspace change', async t => {
  for (const change of [
    x => { x.vscode.workspace.isTrusted = false; },
    x => { x.vscode.workspace.workspaceFolders = [x.second]; },
    x => { x.setScope(() => b); }
  ]) {
    const x = setup(); let resolve;
    x.vscode.window.showWarningMessage = () => new Promise(r => { resolve = r; });
    const run = x.access.enable(x.first);
    await Promise.resolve(); await Promise.resolve();
    change(x); resolve('Enable Full access');
    assert.equal(await run, false);
    assert.equal(x.access.status(x.first).enabled, false);
  }
});

test('disable during delayed persistence remains denied and removes the record', async () => {
  const x = setup(); let release;
  x.state.update = async (key, value) => {
    if (value) { await new Promise(r => { release = r; }); x.values.set(key, value); }
    else x.values.delete(key);
  };
  const enabling = x.access.enable(x.first);
  while (!release) await new Promise(r => setImmediate(r));
  const disabling = x.access.disable(x.first);
  release();
  assert.equal(await enabling, false);
  assert.equal(await disabling, true);
  assert.equal(x.access.status(x.first).enabled, false);
  assert.equal(x.values.has(PREFIX + a), false);
});

test('revoke expires active snapshots while invalidate retains durable grants', async () => {
  const x = setup(); await x.access.enable(x.first);
  const grant = x.access.capture(x.first); assert.ok(grant);
  assert.equal(x.access.assertCurrent(x.first, grant), true);
  x.access.invalidate();
  assert.throws(() => x.access.assertCurrent(x.first, grant), /no longer current/);
  assert.equal(x.access.status(x.first).enabled, true);
  const next = x.access.capture(x.first);
  await x.access.disable(x.first);
  assert.throws(() => x.access.assertCurrent(x.first, next), /no longer current/);
});


test('equivalent folder objects use the actual current folder identity and foreign host identity refuses',async()=>{
  const x=setup();await x.access.enable({...x.first,uri:{...x.first.uri}});assert.equal(x.access.status(x.first).enabled,true);
  x.setScope(()=>c);assert.equal(x.access.status(x.first).enabled,false);
});

test('guard failure after persistence removes the exact failed approval before restart',async()=>{
  const x=setup();let guards=0;
  assert.equal(await x.access.enable(x.first,{guard:async()=>{if(++guards===3)throw Error('account changed while saving');}}),false);
  assert.equal(x.values.has(PREFIX+a),false);
  const restarted=createFullAccess({vscode:x.vscode,state:x.state,scope:()=>a});assert.equal(restarted.status(x.first).enabled,false);
});

test('Russian consent requires the explicit localized native button',async()=>{
  const x=setup();const access=createFullAccess({vscode:x.vscode,state:x.state,scope:()=>a,L:(_en,ru)=>ru});
  assert.equal(await access.enable(x.first),true);assert.equal(x.prompts[0].label,'Включить полный доступ');assert.match(x.prompts[0].options.detail,/Rewind/);
});


test('an explicitly approved folder survives a host helper restart with the same identity only',async()=>{
  const x=setup();await x.access.enable(x.first);const restored=createFullAccess({vscode:x.vscode,state:x.state,scope:f=>f===x.first?a:b});assert.equal(restored.status(x.first).enabled,true);assert.equal(restored.status(x.second).enabled,false);await restored.disable(x.first);assert.equal(x.access.status(x.first).enabled,false);
});

test('judgefix2 Full access consent and helper plainly document inherited-environment and post-write quarantine limitations EN/RU',async()=>{
 const {FULL_ACCESS_LIMITS}=require('../lib/full-access');const {SETTINGS_HELP}=require('../lib/settings-guide');
 for(const locale of ['en','ru']){const x=setup(locale);assert.equal(await x.access.enable(x.first),true);assert.ok(FULL_ACCESS_LIMITS?.[locale]);assert.ok(x.prompts[0].options.detail.includes(FULL_ACCESS_LIMITS[locale]));assert.ok(SETTINGS_HELP['tvijo.agentAutoRun'][locale].includes(FULL_ACCESS_LIMITS[locale]));}
 assert.match(FULL_ACCESS_LIMITS.en,/quarantined, not prevented/);assert.match(FULL_ACCESS_LIMITS.en,/rewrites its own environment is not stopped/);
});

test('ExtraFullAccess is a separate approval and invalidates captured Full grants',async()=>{
 const x=setup();await x.access.enable(x.first);const full=x.access.capture(x.first);
 assert.equal(full.extra,false);assert.equal(x.access.status(x.first).extra,false);
 x.vscode.window.showWarningMessage=async()=>undefined;
 assert.equal(await x.access.enable(x.first,{extra:true}),false);
 assert.equal(x.access.status(x.first).extra,false);
 x.vscode.window.showWarningMessage=async(_m,_o,label)=>{assert.equal(label,'Enable ExtraFullAccess');return label;};
 assert.equal(await x.access.enable(x.first,{extra:true}),true);
 assert.equal(x.access.status(x.first).extra,true);
 assert.throws(()=>x.access.assertCurrent(x.first,full));
 const extra=x.access.capture(x.first);assert.equal(x.access.assertCurrent(x.first,extra),true);
 const restart=createFullAccess({vscode:x.vscode,state:x.state,scope:()=>a});assert.equal(restart.status(x.first).extra,true);
 await x.access.disable(x.first);assert.throws(()=>x.access.assertCurrent(x.first,extra));
});

test('legacy Full approval never silently acquires extra host capabilities',async()=>{
 const x=setup();x.values.set(PREFIX+a,{schema:1,scopeKey:a,enabled:true,approvedAt:1,approvalId:'legacy'});
 assert.equal(x.access.status(x.first).enabled,true);assert.equal(x.access.status(x.first).extra,false);
 const grant=x.access.capture(x.first);x.setScope(()=>b);assert.throws(()=>x.access.assertCurrent(x.first,grant));
});
