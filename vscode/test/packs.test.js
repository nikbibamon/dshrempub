'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('../lib/client');
const packs = require('../lib/packs');
const synthetic = (id, markers = []) => ({ id, title: { en: 'TEST ' + id, ru: 'ТЕСТ ' + id }, summary: { en: 'Synthetic summary', ru: 'Тестовое описание' }, model: 'synthetic-model', markers, instructions: 'SYNTHETIC_' + id.toUpperCase(), checklist: { en: ['TEST_CHECK'], ru: ['ТЕСТ'] } });
const auth = { api_base: 'http://localhost:18106/api/dshrem/v1', access_token: 'synthetic-token' };
const catalogue = items => ({ schema: 'tvijo.skill_packs/v1', packs: items });

test('packs fetch uses existing API base and bearer auth; concurrent and later reads share session cache', async () => {
  let calls = 0;
  const api = createClient({ base: auth.api_base, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, auth.api_base + '/packs');
    assert.equal(options.headers.authorization, 'Bearer synthetic-token');
    assert.equal(options.method, 'GET');
    return Response.json(catalogue([synthetic('engineer')]));
  } });
  const cache = packs.createPackCache();
  const [a, b] = await Promise.all([cache.get(auth, api), cache.get(auth, api)]);
  assert.equal(a, b);
  assert.equal((await cache.get(auth, api))[0].instructions, 'SYNTHETIC_ENGINEER');
  assert.equal(calls, 1);
});

test('404, unavailable, unauthorized and malformed pack catalogues silently cache an empty result', async () => {
  for (const result of [404, 503, 401, 'offline', 'schema', 'malformed']) {
    let calls = 0;
    const api = createClient({ base: auth.api_base, fetchImpl: async () => {
      calls++;
      if (result === 'offline') throw Error('synthetic offline');
      if (typeof result === 'number') return Response.json({}, { status: result });
      return Response.json(result === 'schema' ? { packs: [] } : catalogue([{ id: 'broken' }]));
    } });
    const cache = packs.createPackCache();
    assert.deepEqual(await cache.get(auth, api), []);
    assert.deepEqual(await cache.get(auth, api), []);
    assert.equal(calls, 1);
  }
});

test('signed-out cache never fetches; service/token changes and explicit clear invalidate it', async () => {
  let calls = 0;
  const api = { request: async () => { calls++; return catalogue([synthetic('engineer')]); } };
  const cache = packs.createPackCache();
  assert.deepEqual(await cache.get(null, api), []);
  assert.equal(calls, 0);
  await cache.get(auth, api);
  await cache.get({ ...auth, access_token: 'synthetic-b' }, api);
  await cache.get({ ...auth, api_base: 'http://localhost:18107/api/dshrem/v1' }, api);
  cache.clear(); await cache.get(auth, api);
  assert.equal(calls, 4);
});

test('auto suggestion picks the first matching root marker file in server order', async () => {
  const checked = [];
  const items = [synthetic('first', ['missing.test', 'marker.test']), synthetic('second', ['marker.test']), synthetic('engineer')];
  const selection = await packs.selectPack(items, '', '/synthetic-root', async value => {
    checked.push(value);
    if (value.endsWith('missing.test')) throw Error('ENOENT');
    return { isFile: () => true };
  });
  assert.equal(selection.pack.id, 'first');
  assert.equal(selection.auto, true);
  assert.deepEqual(checked, ['/synthetic-root/missing.test', '/synthetic-root/marker.test']);
  assert.equal(packs.packLabel(selection), 'auto: TEST first');
  assert.equal(packs.packLabel(selection, 'ru'), 'авто: ТЕСТ first');
});

test('auto suggestion ignores directories, traversal and nested paths; falls back only to a served engineer', async () => {
  const checked = [];
  const items = [synthetic('first', ['../outside', '/absolute', 'nested/file', 'nested\\file', '.', '..', '*', 'folder']), synthetic('engineer')];
  const selection = await packs.selectPack(items, '', '/synthetic-root', async value => { checked.push(value); return { isFile: () => false }; });
  assert.equal(selection.pack.id, 'engineer');
  assert.deepEqual(checked, ['/synthetic-root/*', '/synthetic-root/folder']);
  assert.equal((await packs.selectPack(items, '', null)).pack.id, 'engineer');
  assert.equal((await packs.selectPack([items[0]], '', null)).pack, null);
});

test('explicit pack choice bypasses markers; an unknown saved ID does not invent a pack', async () => {
  const items = [synthetic('engineer'), synthetic('chosen')];
  const stat = () => { throw Error('must not check markers'); };
  const selection = await packs.selectPack(items, 'chosen', '/synthetic-root', stat);
  assert.equal(selection.auto, false);
  assert.equal(packs.packLabel(selection), 'TEST chosen');
  assert.equal((await packs.selectPack(items, 'unknown', '/synthetic-root', stat)).pack, null);
});

test('none disables automatic selection even if the server serves a pack with that ID', async () => {
  const selection = await packs.selectPack([synthetic('none', ['marker']), synthetic('engineer')], 'none', '/synthetic-root', () => assert.fail('must not check markers'));
  assert.deepEqual(selection, { pack: null, auto: false, none: true });
  const messages = [{ role: 'system', content: 'AGENT_RULES' }, { role: 'user', content: 'TEST' }];
  assert.equal(packs.packMessages(messages, selection.pack), messages);
  for (const [locale, label] of [['en', 'No pack'], ['ru', 'Без набора']]) {
    assert.equal(packs.packLabel(selection, locale), label);
    assert.deepEqual(packs.publicSelection(selection, locale), { label, summary: '' });
    assert.equal(packs.statusText(selection, null, locale), 'Tvijo · ' + label + ' · —');
  }
});

test('pack adds exactly one leading system message without mutating stored turns or duplicating agent rules', () => {
  const pack = synthetic('engineer');
  const messages = [{ role: 'system', content: 'SYNTHETIC_AGENT_PROTOCOL' }, { role: 'user', content: 'TEST' }, { role: 'assistant', content: 'TEST_REPLY' }];
  const before = JSON.stringify(messages);
  for (let n = 0; n < 3; n++) {
    const request = packs.packMessages(messages, pack);
    assert.equal(request[0].role, 'system');
    assert.equal(request.filter(item => item.role === 'system').length, 1);
    assert.equal(request[0].content, 'SYNTHETIC_ENGINEER\n\nSYNTHETIC_AGENT_PROTOCOL');
  }
  assert.equal(JSON.stringify(messages), before);
  assert.equal(packs.packMessages(messages, null), messages);
});

test('explicit model choices including the default and auto override the pack in every configuration scope', () => {
  const pack = synthetic('engineer');
  for (const key of ['model', 'agentModel']) {
    for (const scope of ['globalValue', 'workspaceValue', 'workspaceFolderValue', 'globalLanguageValue', 'workspaceLanguageValue', 'workspaceFolderLanguageValue']) {
      for (const chosen of ['coding', 'auto', 'synthetic-choice']) {
        const config = { inspect: () => ({ defaultValue: 'coding', [scope]: chosen }), get: () => chosen };
        assert.equal(packs.packModel(config, key, 'coding', pack), chosen);
      }
    }
    const defaults = { inspect: () => ({ defaultValue: 'coding' }), get: () => 'coding' };
    assert.equal(packs.packModel(defaults, key, 'coding', pack), 'synthetic-model');
    assert.equal(packs.packModel(defaults, key, 'coding', null), 'coding');
  }
});

test('status bar never mistakes unknown, lifetime or missing allowance for today’s zero', () => {
  const selection = { pack: synthetic('engineer'), auto: false };
  for (const value of [undefined, null, '', ' ', false, true, 'unknown', -1, '-1', Infinity, 'Infinity', NaN, [], {}]) {
    for (const locale of ['en', 'ru']) {
      assert.equal(packs.statusText(selection, { budget: { daily_remaining_usd: value, daily_spent_usd: '0', spent_usd: '8' } }, locale), 'Tvijo · ' + packs.packLabel(selection, locale) + ' · —');
    }
  }
  assert.equal(packs.statusText(selection, null), 'Tvijo · TEST engineer · —');
  assert.equal(packs.statusText(selection, {}), 'Tvijo · TEST engineer · —');
});

test('status bar shows localized remaining allowance, including known zero and small amounts', () => {
  const selection = { pack: synthetic('engineer'), auto: false };
  for (const [value, dollars] of [['0.95', '$0.95'], ['0', '$0.00'], [0, '$0.00'], ['0.012340', '$0.01234'], [0.0000001, '<$0.000001']]) {
    const account = { budget: { daily_remaining_usd: value, spent_usd: '8' } };
    assert.equal(packs.statusText(selection, account, 'en'), 'Tvijo · TEST engineer · ' + dollars + ' left today');
    assert.equal(packs.statusText(selection, account, 'ru'), 'Tvijo · ТЕСТ engineer · осталось ' + dollars + ' сегодня');
  }
});

test('only localized public pack labels and summaries reach the webview selection', () => {
  const result = packs.publicSelection({ pack: synthetic('engineer'), auto: true }, 'ru');
  assert.deepEqual(result, { label: 'авто: ТЕСТ engineer', summary: 'Тестовое описание' });
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC_ENGINEER'));
});

test('0.10.8 settings retain automatic pack selection and add local auto-commit only', () => {
  const properties = require('../package.json').contributes.configuration.properties;
  const original = ['service', 'model', 'agentMode', 'reasoningMethod', 'workspaceContext', 'workspaceContextMaxBytes', 'autoApply', 'agentModel', 'agentMaxSteps', 'agentBudgetUsd', 'agentAutoRun', 'agentAutoApply', 'telegram.enabled', 'telegram.ownerId', 'ocrLanguages', 'apiBase', 'telegram.allowedServices'].map(key => 'tvijo.' + key);
  assert.deepEqual(Object.keys(properties).filter(key => !original.includes(key)), ['tvijo.pack','tvijo.autoCommit',...['enabled','profile','workerPolicy','controllerPath','pythonPath','statePath'].map(key=>'tvijo.orchestration.'+key),'tvijo.colorTheme','tvijo.commitIdentity','tvijo.orchestration.agentCount','tvijo.orchestration.reportFormat']);
  assert.equal(properties['tvijo.autoCommit'].default,'afterTask');assert.deepEqual(properties['tvijo.autoCommit'].enum,['afterTask','off']);
  assert.ok(original.every(key => Object.hasOwn(properties, key)));
  assert.equal(properties['tvijo.pack'].type, 'string');
  assert.equal(properties['tvijo.pack'].default, '');
  assert.match(require('../package.nls.json')[properties['tvijo.pack'].markdownDescription.slice(1,-1)], /\bnone\b/);
});
