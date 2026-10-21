'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { exportConversation, redact } = require('../lib/export-conversation');

test('export contains allowlisted conversation roles and redacts explicit token canaries', () => {
  const token = 'tvijo-live-secret-12345';
  const fakeProviderKey = ['sk', 'abcdefghijklmnopqrstuvwxyz123456'].join('-');
  const markdown = exportConversation([
    { role: 'user', content: 'question ' + token, display: 'question ' + token },
    { role: 'assistant', content: 'Bearer abcdefghijklmnop', display: 'Bearer abcdefghijklmnop' },
    { role: 'system', content: 'must not export' },
    { role: 'tool', content: 'must not export' },
    { role: 'assistant', content: fakeProviderKey }
  ], { knownSecrets: [token] });
  assert.ok(markdown.includes('[redacted]'));
  assert.ok(!markdown.includes(token) && !markdown.includes('abcdefghijklmnop'));
  assert.ok(!markdown.includes('must not export'));
  assert.ok(markdown.includes(fakeProviderKey) === false);
});

test('standard credential patterns are redacted in text but plain conversation remains readable', () => {
  assert.equal(redact('API_KEY=example-secret-1234'), '[redacted credential]');
  assert.match(exportConversation([{ role: 'user', content: 'private context + attachment bytes', display: 'hello' }]), /hello/);
  assert.ok(!exportConversation([{ role: 'user', content: 'private context + attachment bytes' }]).includes('private context'));
  const storagePath = ['', 'root', '.vscode', 'globalStorage', 'tvijo', 'state.json'].join('/');
  const canaries = exportConversation([{ role: 'assistant', content: 'project_key=project-secret telegram_bot_token=bot-secret 123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn ' + storagePath }]);
  for (const secret of ['project-secret', 'bot-secret', '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ', storagePath]) assert.ok(!canaries.includes(secret));
});

test('export redacts unknown project keys, JWTs, current tokens and storage URIs while omitting hidden checkpoint fields', () => {
  const projectKey = ['tvijo', 'pk', 'synthetic_project_canary_123456'].join('_');
  const jwt = ['eyJsyntheticHeader', 'syntheticPayload123456', 'syntheticSignature123456'].join('.');
  const current = 'synthetic-current-token-42';
  const storage = '/workspace/globalStorage/account-A';
  const telegram = ['123456789', 'syntheticTelegramTokenCharacters'.repeat(2)].join(':');
  const byok = 'byok_key=synthetic-byok-secret';
  const raw = [projectKey, jwt, current, telegram, byok];
  const markdown = exportConversation([
    { role: 'user', content: 'checkpoint_state=hidden attachment=PRIVATE_ATTACHMENT_BYTES', display: 'visible question' },
    { role: 'assistant', content: raw.join(' '), snapshot: 'PRIVATE_SNAPSHOT_BYTES', storage: 'PRIVATE_STORAGE_BYTES', checkpoint: { raw: 'PRIVATE_CHECKPOINT_BYTES' } }
  ], { knownSecrets: [current, storage, storage + '/file'] });
  for (const value of raw.concat([storage, 'PRIVATE_SNAPSHOT_BYTES', 'PRIVATE_STORAGE_BYTES', 'PRIVATE_CHECKPOINT_BYTES', 'checkpoint_state=hidden', 'attachment='])) assert.ok(!markdown.includes(value), value);
  assert.match(markdown, /visible question/);
});

test('export redacts unknown project keys, JWTs, current tokens and storage URIs while omitting hidden checkpoint fields', () => {
  const projectKey = ['tvijo', 'pk', 'synthetic_project_canary_123456'].join('_');
  const jwt = ['eyJsyntheticHeader', 'syntheticPayload123456', 'syntheticSignature123456'].join('.');
  const current = 'synthetic-current-token-42';
  const storage = '/workspace/globalStorage/account-A';
  const telegram = ['123456789', 'syntheticTelegramTokenCharacters'.repeat(2)].join(':');
  const raw = [projectKey, jwt, current, telegram, 'byok_key=synthetic-byok-secret'];
  const markdown = exportConversation([
    { role: 'user', content: 'checkpoint_state=hidden attachment=PRIVATE_ATTACHMENT_BYTES', display: 'visible question' },
    { role: 'assistant', content: raw.join(' '), snapshot: 'PRIVATE_SNAPSHOT_BYTES', storage: 'PRIVATE_STORAGE_BYTES', checkpoint: { raw: 'PRIVATE_CHECKPOINT_BYTES' } }
  ], { knownSecrets: [current, storage, storage + '/file'] });
  for (const value of raw.concat([storage, 'PRIVATE_SNAPSHOT_BYTES', 'PRIVATE_STORAGE_BYTES', 'PRIVATE_CHECKPOINT_BYTES', 'checkpoint_state=hidden', 'attachment='])) assert.ok(!markdown.includes(value), value);
  assert.match(markdown, /visible question/);
});
