'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { approveDevice } = require('../lib/device-login');
const { COPY, LOCALE, run } = require('../lib/organization-setup');

const organization = { id: 'org-one', name: 'Dnipro Studio', role: 'member' };
const project = { id: 'project-one', name: 'Customer portal' };
const session = { api_base: 'https://gateway.example.test/api/dshrem/v1', access_token: 'synthetic-device-session' };

function setup(language, { connection, current = () => true, confirm = true } = {}) {
  const state = new Map();
  const log = { messages: [], warnings: [], prompts: [], requests: [], signIn: [] };
  let signedIn;
  const args = {
    language: 'uk-UA', globalState: { get: key => state.get(key), update: (key, value) => state.set(key, value) },
    window: {
      showQuickPick: (items, settings) => {
        log.prompts.push(settings.placeHolder);
        return log.prompts.length === 1 ? items.find(row => row.id === language) : items[0];
      },
      showInformationMessage: (text, button) => { log.messages.push(text); return confirm ? button : undefined; },
      showWarningMessage: text => log.warnings.push(text),
    },
    readSession: () => signedIn,
    signIn: lang => { log.signIn.push(lang); signedIn = session; },
    stillCurrent: current,
    createClient: ({ base }) => {
      assert.equal(base, session.api_base);
      return { request: (path, request) => {
        log.requests.push(path);
        assert.equal(request.token, session.access_token);
        if (path === '/organizations') return { organizations: [organization] };
        if (path === '/organizations/org-one/projects') return { organization, projects: [project] };
        assert.equal(path, '/organizations/org-one/connection?project_id=project-one');
        return connection ? connection() : { connected: true, organization, project };
      } };
    },
  };
  return { state, log, args };
}

for (const language of ['en', 'ru', 'uk']) {
  test(`first-run picks ${language}, signs in and checks the exact project`, async () => {
    const { state, log, args } = setup(language);
    await run(args);
    assert.equal(state.get(LOCALE), language);
    assert.deepEqual(log.signIn, [language]);
    assert.deepEqual(log.prompts.slice(1), [COPY[language].organization, COPY[language].project]);
    assert.equal(log.requests.length, 3);
    assert.match(log.messages.at(-1), new RegExp(COPY[language].connected));
    assert.match(log.messages.at(-1), /Dnipro Studio · Customer portal/);
    assert.deepEqual(log.warnings, []);
  });
}

test('refresh check refuses a revoked membership and a mismatched project', async () => {
  const revoked = setup('uk', { connection: () => { throw Object.assign(new Error('refused'), { status: 404 }); } });
  await run(revoked.args);
  assert.deepEqual(revoked.log.warnings, [COPY.uk.noAccess]);
  const wrong = setup('uk', { connection: () => ({ connected: true, organization, project: { id: 'wrong' } }) });
  await run(wrong.args);
  assert.deepEqual(wrong.log.warnings, [COPY.uk.failed]);
  assert.equal(wrong.log.messages.length, 1);
});

test('does not reach the gateway with a changed session or issue a check after cancellation', async () => {
  const changed = setup('ru', { current: () => false });
  await run(changed.args);
  assert.deepEqual(changed.log.requests, []);
  assert.deepEqual(changed.log.warnings, [COPY.ru.changed]);
  const cancelled = setup('en', { confirm: false });
  await run(cancelled.args);
  assert.equal(cancelled.log.requests.length, 2);
});

test('the device approval page receives the explicitly selected Ukrainian locale', async () => {
  const mock = {
    window: { showInformationMessage: (_title, detail, open) => {
      assert.match(detail.detail, /підтвердьте вхід/);
      assert.equal(open, 'Відкрити браузер');
      return open;
    } },
    Uri: { parse: value => value },
    env: { openExternal: url => {
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get('lang'), 'uk');
      assert.equal(parsed.searchParams.get('code'), 'AA99CC33');
      return true;
    } },
  };
  await approveDevice(mock, { verification_uri: 'https://gateway.example.test/dshrem/device', user_code: 'AA99CC33' },
                      { language: 'uk', L: (_en, _ru, uk) => uk });
});
