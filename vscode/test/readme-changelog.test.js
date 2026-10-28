'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { latestEntry, sync } = require('../scripts/sync-readme.cjs');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('README what\'s-new block and version line follow the latest CHANGELOG entry', () => {
  const version = JSON.parse(read('package.json')).version;
  assert.equal(latestEntry(read('CHANGELOG.md')).version, version);
  assert.equal(sync(read('README.md'), read('CHANGELOG.md'), version), read('README.md'),
    'README.md is stale; run: node scripts/sync-readme.cjs');
});

test('sync refuses a changelog that is behind package.json', () => {
  assert.throws(() => sync('Version 1.0.0. A project-scoped chat', '## 1.0.0 — x\n- a', '1.0.1'), /top entry is 1\.0\.0/);
});

test('latestEntry reads both heading styles and stops at the next version', () => {
  const entry = latestEntry('## 0.2.0 — d\n\n- new\n\n# 0.1.0 · prepared\n- old\n');
  assert.deepEqual(entry, { version: '0.2.0', tail: '— d', body: '- new' });
});
