'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { settingsHtml, SETTINGS_HELP, GUIDE_ACTIONS } = require('../lib/settings-guide');
const properties = require('../package.json').contributes.configuration.properties;
test('guide covers every public configuration key in both languages', () => {
  assert.equal(Object.keys(SETTINGS_HELP).length, 18);
  assert.deepEqual(Object.keys(SETTINGS_HELP).sort(), Object.keys(properties).sort());
  for (const help of Object.values(SETTINGS_HELP)) { assert.ok(help.en.length > 60); assert.match(help.ru, /[а-я]/i); }
});
test('only fixed commands and HTTPS destinations are exposed', () => {
  for (const value of Object.values(GUIDE_ACTIONS)) assert.match(value, /^(tvijo\.[A-Za-z]+|workbench\.action\.openSettings|https:\/\/(tvijo\.com|dsh\.tvijo\.com|platform\.tvijo\.com))$/);
  assert.equal(GUIDE_ACTIONS.terminal, 'tvijo.terminal');
  assert.equal(GUIDE_ACTIONS.dataPrivacy, 'tvijo.dataPrivacy');
  assert.equal(GUIDE_ACTIONS.resources, 'tvijo.resources');
});
test('nonce CSP, injection resistance and endpoint credential redaction', () => {
  const attack = '</script><img src=x onerror=alert(1)>';
  const html = settingsHtml({}, { properties, values: { 'tvijo.model': attack, 'tvijo.apiBase': 'https://user:secret@example.com/api?token=secret#secret', access_token: 'PRIVATE_TOKEN' } });
  assert.match(html, /default-src 'none'/);
  assert.doesNotMatch(html, /unsafe-inline|PRIVATE_TOKEN|user:secret|token=secret|#secret/);
  assert.ok(!html.includes(attack));
  const nonce = html.match(/script-src 'nonce-([^']+)'/)[1];
  assert.ok(html.includes('<script nonce="' + nonce + '">'));
  assert.ok(html.includes('<style nonce="' + nonce + '">'));
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new vm.Script(script));
});
test('script renders configuration with textContent and emits narrow host messages', () => {
  const html = settingsHtml({}, { locale: 'ru', properties, values: {} });
  assert.match(html, /<html lang="ru">/);
  assert.doesNotMatch(html, /innerHTML|sendText|executeCommand|fetch\(/);
  assert.match(html, /type:'openSetting',key:row.key/);
  assert.match(html, /type:'guideAction',id/);
  assert.match(html, /type:'refresh'/);
  assert.match(html, /textContent=text/);
});
test('DOM execution supports search, language, setting actions and safe refresh', () => {
  class Element {
    constructor() { this.children = []; this.handlers = {}; this.value = ''; }
    appendChild(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    setAttribute() {}
  }
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const messages = [];
  let receive;
  const html = settingsHtml({}, { properties });
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
  const document = { documentElement: {}, getElementById: get, createElement: () => new Element() };
  vm.runInNewContext(script, { document, URL, acquireVsCodeApi: () => ({ postMessage: message => messages.push(message) }), window: { addEventListener: (_, fn) => { receive = fn; } } });
  assert.equal(get('cards').children.length, 18);
  get('cards').children[0].children.at(-1).handlers.click();
  assert.equal(messages[0].key, 'tvijo.pack');
  get('search').value = 'ocrLanguages'; get('search').handlers.input();
  assert.equal(get('cards').children.length, 1);
  get('language').handlers.click();
  assert.equal(document.documentElement.lang, 'ru');
  receive({ data: { type: 'settingsValues', values: { 'tvijo.ocrLanguages': 'eng', 'tvijo.apiBase': 'https://name:secret@host.test/path?token=secret' } } });
  assert.match(get('cards').children[0].children[2].textContent, /"eng"/);
  get('search').value = 'apiBase'; get('search').handlers.input();
  assert.doesNotMatch(get('cards').children[0].children[2].textContent, /secret|name:/);
  get('refresh').handlers.click();
  assert.equal(messages.at(-1).type, 'refresh');
});
