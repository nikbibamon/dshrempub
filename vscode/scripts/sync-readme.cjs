#!/usr/bin/env node
// The Marketplace Overview tab is README.md, and it is frozen into each published version.
// A hand-written "what's new" block went stale (0.10.14 shown while 0.10.20 was live), so the
// block and the version line are generated from CHANGELOG.md and package.json instead.
// Usage: node scripts/sync-readme.cjs [--check]   (no flag rewrites README.md)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const START = '<!-- changelog-latest:start (generated from CHANGELOG.md by scripts/sync-readme.cjs; edit CHANGELOG.md) -->';
const END = '<!-- changelog-latest:end -->';
const ENTRY = /^#{1,2}\s+(\d+\.\d+\.\d+)\b(.*)$/;

function latestEntry(changelog) {
  const lines = changelog.split('\n');
  const first = lines.findIndex((line) => ENTRY.test(line));
  if (first < 0) throw new Error('CHANGELOG.md has no version entry');
  let last = lines.length;
  for (let i = first + 1; i < lines.length; i += 1) {
    if (ENTRY.test(lines[i])) { last = i; break; }
  }
  const [, version, tail] = lines[first].match(ENTRY);
  return { version, tail: tail.trim(), body: lines.slice(first + 1, last).join('\n').trim() };
}

function renderBlock(entry) {
  const suffix = entry.tail ? ` ${entry.tail}` : '';
  return `${START}\n## What's new in ${entry.version}${suffix}\n\n${entry.body}\n\nEarlier versions: the **Changelog** tab.\n${END}`;
}

function sync(readme, changelog, packageVersion) {
  const entry = latestEntry(changelog);
  if (entry.version !== packageVersion) {
    throw new Error(`CHANGELOG.md top entry is ${entry.version}, package.json is ${packageVersion}`);
  }
  const block = renderBlock(entry);
  let out = readme;
  const from = out.indexOf(START);
  const to = out.indexOf(END);
  if (from >= 0 && to > from) out = out.slice(0, from) + block + out.slice(to + END.length);
  else out = `${block}\n\n${out}`;
  const versionLine = /^Version \d+\.\d+\.\d+\. A project-scoped chat/m;
  if (!versionLine.test(out)) throw new Error('README.md lost its "Version X. A project-scoped chat" line');
  return out.replace(versionLine, `Version ${packageVersion}. A project-scoped chat`);
}

if (require.main === module) {
  const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
  const version = JSON.parse(read('package.json')).version;
  const expected = sync(read('README.md'), read('CHANGELOG.md'), version);
  if (process.argv.includes('--check')) {
    if (expected !== read('README.md')) {
      console.error('README.md is out of date with CHANGELOG.md; run: node scripts/sync-readme.cjs');
      process.exit(1);
    }
  } else {
    fs.writeFileSync(path.join(root, 'README.md'), expected);
  }
}

module.exports = { latestEntry, renderBlock, sync, START, END };
