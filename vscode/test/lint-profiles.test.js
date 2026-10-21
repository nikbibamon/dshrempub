'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { emptyCwd, inspectExecutable, verifyExecutable, pinExecutable } = require('../lib/lint-profiles');

const artifactRoot = process.env.TVIJO_TEST_ARTIFACTS;
const fitRoot = process.env.TVIJO_FIT_TEST_TMP;
if (!artifactRoot || !path.isAbsolute(artifactRoot) || !fitRoot || !path.isAbsolute(fitRoot)) {
  throw new Error('TVIJO test artifact paths must be absolute');
}
const fitRelative = path.relative(artifactRoot, fitRoot);
if (!fitRelative || fitRelative === '..' || fitRelative.startsWith(`..${path.sep}`) || path.isAbsolute(fitRelative)) {
  throw new Error('TVIJO_FIT_TEST_TMP must be a fresh child of TVIJO_TEST_ARTIFACTS');
}

const ownFixtures = path.join(fitRoot, 'ownfixtures');
const exactExecutables = path.join(fitRoot, 'exactexecutables');
const ownStorage = path.join(fitRoot, 'hoststorage');
const profileId = 'node-cjs';
const scopeKey = 'a'.repeat(64);
// Keep adversarial file-copy fixtures small; actual Node/Python execution has separate coverage.
const copySource = process.platform==='linux'&&fs.existsSync('/usr/bin/true')?'/usr/bin/true':process.execPath;

async function withPathReplacementDuringRead(target, replacement, action) {
  const saved = `${target}.saved`;
  const originalOpen = fs.promises.open;
  let reads = 0;
  fs.promises.open = async (...args) => {
    const handle = await originalOpen(...args);
    if (args[0] !== target) return handle;
    const originalRead = handle.read.bind(handle);
    handle.read = async (...readArgs) => {
      const result = await originalRead(...readArgs);
      reads += 1;
      if (reads === 1) {
        await fs.promises.rename(target, saved);
        await fs.promises.rename(replacement, target);
      }
      return result;
    };
    return handle;
  };
  try {
    return await action();
  } finally {
    fs.promises.open = originalOpen;
    try {
      await fs.promises.rename(saved, target);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error;
    }
    try {
      await fs.promises.unlink(replacement);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error;
    }
  }
}

test('pinExecutable holds the approved inode across pathname replacement', async () => {
  if (process.platform !== 'linux' || fs.constants.O_NOFOLLOW === undefined) return;
  const pinDir = path.join(fitRoot, 'pin-executable');
  await fs.promises.mkdir(ownFixtures, { recursive: true, mode: 0o700 });
  await fs.promises.mkdir(pinDir, { recursive: true, mode: 0o700 });
  const target = path.join(pinDir, 'approved-tool');
  const replacement = path.join(pinDir, 'replacement-tool');
  await fs.promises.copyFile('/usr/bin/true', target);
  await fs.promises.chmod(target, 0o700);
  await fs.promises.copyFile('/usr/bin/false', replacement);
  await fs.promises.chmod(replacement, 0o700);
  const record = await inspectExecutable({
    profileId, executable: target, scopeKey, workspaceRoots: [ownFixtures]
  });

  const wrongRecord = { ...record, sha256: '0'.repeat(64) };
  await assert.rejects(pinExecutable(wrongRecord, { scopeKey, workspaceRoots: [ownFixtures] }));
  await assert.rejects(pinExecutable(record, {
    scopeKey: 'b'.repeat(64), workspaceRoots: [ownFixtures]
  }));

  const handle = await pinExecutable(record, { scopeKey, workspaceRoots: [ownFixtures] });
  const pinnedStat = await handle.stat({ bigint: true });
  assert.equal(pinnedStat.dev.toString(), record.identity.dev);
  assert.equal(pinnedStat.ino.toString(), record.identity.ino);
  const digest = await new Promise((resolve, reject) => {
    const hash = require('node:crypto').createHash('sha256');
    const stream = fs.createReadStream(null, { fd: handle.fd, autoClose: false });
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
  assert.equal(digest, record.sha256);

  await fs.promises.rename(target, `${target}.saved`);
  await fs.promises.rename(replacement, target);
  const child = childProcess.spawn('/proc/self/fd/3', [], {
    argv0: record.executable,
    cwd: fitRoot,
    env: { PATH: '/usr/bin:/bin' },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe', handle.fd]
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => resolve(code));
  });
  assert.equal(exitCode, 0);
  assert.equal((await handle.stat({ bigint: true })).ino.toString(), record.identity.ino);
  await handle.close();
  await assert.rejects(handle.stat(), { code: 'EBADF' });
});

test('inspect and verify only trusted native executables; keep unsafe cwd data intact', async () => {
  await fs.promises.mkdir(ownFixtures, { recursive: true, mode: 0o700 });
  await fs.promises.mkdir(exactExecutables, { recursive: true, mode: 0o700 });
  await fs.promises.mkdir(ownStorage, { recursive: true, mode: 0o700 });

  const trusted = await inspectExecutable({
    profileId,
    executable: process.execPath,
    scopeKey,
    workspaceRoots: [ownFixtures]
  });
  assert.equal(trusted.executable, await fs.promises.realpath(process.execPath));
  assert.match(trusted.sha256, /^[a-f0-9]{64}$/);
  assert.equal(trusted.v, 1);
  assert.equal(Object.isFrozen(trusted), true);
  assert.equal(Object.isFrozen(trusted.identity), true);
  assert.equal(await verifyExecutable(trusted, { scopeKey, workspaceRoots: [ownFixtures] }), true);
  assert.equal(await verifyExecutable(trusted, { scopeKey: `${scopeKey}/other`, workspaceRoots: [ownFixtures] }), false);
  assert.equal(await verifyExecutable(trusted, { scopeKey, workspaceRoots: [path.join(fitRoot, 'missing-root')] }), false);

  await assert.rejects(inspectExecutable({
    profileId: 'unknown-profile', executable: process.execPath, scopeKey, workspaceRoots: [ownFixtures]
  }));
  await assert.rejects(inspectExecutable({
    profileId, executable: process.execPath, scopeKey: 'arbitraryscope', workspaceRoots: [ownFixtures]
  }));
  await assert.rejects(inspectExecutable({
    profileId, executable: path.relative(process.cwd(), process.execPath), scopeKey, workspaceRoots: [ownFixtures]
  }));
  await assert.rejects(inspectExecutable({
    profileId, executable: `${process.execPath}\n`, scopeKey, workspaceRoots: [ownFixtures]
  }));

  const projectBinary = path.join(ownFixtures, 'project-native');
  await fs.promises.copyFile(copySource, projectBinary);
  await fs.promises.chmod(projectBinary, 0o700);
  await assert.rejects(inspectExecutable({
    profileId, executable: projectBinary, scopeKey, workspaceRoots: [ownFixtures]
  }));

  const projectLink = path.join(ownFixtures, 'project-link');
  await fs.promises.symlink(projectBinary, projectLink);
  await assert.rejects(inspectExecutable({
    profileId, executable: projectLink, scopeKey, workspaceRoots: [ownFixtures]
  }));

  const trustedCopy = path.join(exactExecutables, 'node-copy');
  await fs.promises.copyFile(copySource, trustedCopy);
  await fs.promises.chmod(trustedCopy, 0o700);
  const copiedRecord = await inspectExecutable({
    profileId, executable: trustedCopy, scopeKey, workspaceRoots: [ownFixtures]
  });
  assert.equal(await verifyExecutable(copiedRecord, { scopeKey, workspaceRoots: [ownFixtures] }), true);
  await fs.promises.appendFile(trustedCopy, Buffer.from([0]));
  assert.equal(await verifyExecutable(copiedRecord, { scopeKey, workspaceRoots: [ownFixtures] }), false);

  const symlinkToTrustedCopy = path.join(exactExecutables, 'node-link');
  await fs.promises.symlink(process.execPath, symlinkToTrustedCopy);
  const canonicalized = await inspectExecutable({
    profileId, executable: symlinkToTrustedCopy, scopeKey, workspaceRoots: [ownFixtures]
  });
  assert.equal(canonicalized.executable, await fs.promises.realpath(process.execPath));

  const raceTarget = path.join(exactExecutables, 'race-target');
  const raceReplacement = path.join(exactExecutables, 'race-replacement');
  await fs.promises.copyFile(copySource, raceTarget);
  await fs.promises.chmod(raceTarget, 0o700);
  await fs.promises.copyFile(copySource, raceReplacement);
  await fs.promises.appendFile(raceReplacement, Buffer.from('replacement bytes'));
  await fs.promises.chmod(raceReplacement, 0o700);
  await assert.rejects(withPathReplacementDuringRead(raceTarget, raceReplacement, () => inspectExecutable({
    profileId, executable: raceTarget, scopeKey, workspaceRoots: [ownFixtures]
  })));

  await fs.promises.copyFile(copySource, raceTarget);
  await fs.promises.chmod(raceTarget, 0o700);
  const raceRecord = await inspectExecutable({
    profileId, executable: raceTarget, scopeKey, workspaceRoots: [ownFixtures]
  });
  await fs.promises.copyFile(copySource, raceReplacement);
  await fs.promises.appendFile(raceReplacement, Buffer.from('replacement bytes'));
  await fs.promises.chmod(raceReplacement, 0o700);
  assert.equal(await withPathReplacementDuringRead(raceTarget, raceReplacement, () => verifyExecutable(
    raceRecord, { scopeKey, workspaceRoots: [ownFixtures] }
  )), false);

  assert.equal(await verifyExecutable({ ...trusted, extra: 'cannot authorize arbitrary args' }, {
    scopeKey, workspaceRoots: [ownFixtures]
  }), false);

  const script = path.join(exactExecutables, 'not-native');
  await fs.promises.writeFile(script, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  await assert.rejects(inspectExecutable({
    profileId, executable: script, scopeKey, workspaceRoots: [ownFixtures]
  }));

  const oversized = path.join(exactExecutables, 'oversized');
  const oversizedHandle = await fs.promises.open(oversized, 'w', 0o700);
  try {
    await oversizedHandle.truncate(256 * 1024 * 1024 + 1);
  } finally {
    await oversizedHandle.close();
  }
  await assert.rejects(inspectExecutable({
    profileId, executable: oversized, scopeKey, workspaceRoots: [ownFixtures]
  }));

  await assert.rejects(emptyCwd(ownFixtures, [ownFixtures]));
  assert.equal((await fs.promises.stat(projectBinary)).isFile(), true);
  const blockedStorage = path.join(fitRoot, 'blockedstorage');
  const blockedCwd = path.join(blockedStorage, '.tvijo-auto-lint-cwd');
  const sentinel = path.join(blockedCwd, 'keep.txt');
  await fs.promises.mkdir(blockedCwd, { recursive: true, mode: 0o700 });
  await fs.promises.writeFile(sentinel, 'preserve');
  await assert.rejects(emptyCwd(blockedStorage, [ownFixtures]));
  assert.equal(await fs.promises.readFile(sentinel, 'utf8'), 'preserve');

  const cwd = await emptyCwd(ownStorage, [ownFixtures]);
  assert.equal(cwd, path.join(await fs.promises.realpath(ownStorage), '.tvijo-auto-lint-cwd'));
  assert.deepEqual(await fs.promises.readdir(cwd), []);
});
