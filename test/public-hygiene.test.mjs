import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const markers = [
  ['HC_', 'Volume'].join(''),
  ['aios-', 'artifacts'].join(''),
  ['bi', 'ba2'].join(''),
].map((marker) => Buffer.from(marker));
const historyFiles = new Set(['CHANGELOG.md', 'vscode/CHANGELOG.md']);

test('tracked working-tree files contain no private markers outside changelog history', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot });
  const paths = tracked.toString('utf8').split('\0').filter(Boolean);
  const offending = [];

  for (const relativePath of paths) {
    if (historyFiles.has(relativePath)) continue;
    const contents = readFileSync(path.join(repoRoot, relativePath));
    if (markers.some((marker) => contents.includes(marker))) offending.push(relativePath);
  }

  assert.deepEqual(offending, [], `Private markers found in tracked files: ${offending.join(', ')}`);
});
