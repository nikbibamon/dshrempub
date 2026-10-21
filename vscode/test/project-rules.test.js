'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { collect, inspect, compileGlob, MAX_RULES_BYTES } = require('../lib/project-rules');

const base = process.env.TVIJO_FIT_TEST_TMP || path.join(os.tmpdir(), 'tvijo-worker-fit-rules');

async function workspace() {
  await fsp.mkdir(base, { recursive: true });
  const root = await fsp.mkdtemp(path.join(base, 'rules-'));
  await fsp.mkdir(path.join(root, '.tvijo'));
  return root;
}

async function rules(root, value) {
  await fsp.writeFile(path.join(root, '.tvijo', 'rules.md'), value);
}

test('glob filtering supports literals, star, question and whole-segment double star', () => {
  assert.equal(compileGlob('src/**/*.js').test('src/app/main.js'), true);
  assert.equal(compileGlob('src/**/*.js').test('src/main.js'), true);
  assert.equal(compileGlob('test/a?.js').test('test/ab.js'), true);
  for (const invalid of ['../x', '/x', 'C:/x', 'src/**x.js', 'src/[ab].js', 'src/{a,b}.js', '!src/a.js', 'src\\a.js']) {
    assert.equal(compileGlob(invalid), null, invalid);
  }
});

test('global and scoped rules require explicit approval for the exact raw snapshot', async () => {
  const root = await workspace();
  await rules(root, 'Use two spaces.\n');
  const denied = collect({ root });
  assert.equal(denied.status, 'unapproved');
  assert.equal(denied.text, '');
  assert.doesNotMatch(JSON.stringify(denied), /Use two spaces/);
  const inspection = inspect({ root });
  assert.equal(inspection.status, 'ready');
  assert.equal(inspection.text, 'Use two spaces.\n');
  assert.match(inspection.hash, /^[a-f0-9]{64}$/);
  const global = collect({ root, allowRules: (candidateRoot, hash) => candidateRoot === root && hash === inspection.hash });
  assert.equal(global.status, 'included');
  assert.match(global.text, /applies to all project questions/);
  await rules(root, '<!-- tvijo-globs: ["src/**/*.js", "test/*.js"] -->\nUse the existing tests.\n');
  const noMatch = collect({ root, knownPaths: ['README.md'] });
  assert.equal(noMatch.status, 'unmatched');
  assert.equal(noMatch.text, '');
  const current = inspect({ root });
  const matched = collect({ root, knownPaths: ['src/main.js', '../outside.js', '.env'], allowRules: (_root, hash) => hash === current.hash });
  assert.equal(matched.status, 'included');
  assert.deepEqual(matched.paths, ['src/main.js']);
  assert.match(matched.text, /applies to: src\/main\.js/);
  assert.doesNotMatch(matched.text, /outside|\.env/);
});

test('approval callback must return true synchronously and a changed byte invalidates the hash', async () => {
  const root = await workspace();
  await rules(root, 'first\r\n');
  const before = inspect({ root });
  assert.equal(collect({ root, allowRules: () => false }).status, 'unapproved');
  assert.equal(collect({ root, allowRules: () => { throw new Error('deny'); } }).status, 'unapproved');
  assert.equal(collect({ root, allowRules: () => Promise.resolve(true) }).status, 'unapproved');
  await rules(root, 'first\n');
  const after = inspect({ root });
  assert.notEqual(after.hash, before.hash);
  assert.equal(collect({ root, allowRules: (_root, hash) => hash === before.hash }).status, 'unapproved');
});

test('malformed metadata and credentials are refused without echoing rules text', async () => {
  const root = await workspace();
  await rules(root, '<!-- tvijo-globs: ["../secret"] -->\nNEVER_ECHO_THIS\n');
  const invalid = collect({ root });
  assert.equal(invalid.status, 'rejected');
  assert.equal(invalid.reason, 'malformed-metadata');
  assert.doesNotMatch(JSON.stringify(invalid), /NEVER_ECHO_THIS/);
  await rules(root, 'api_key = secret-value-123\n');
  assert.equal(collect({ root }).reason, 'credential-content');
  await rules(root, 'Known token: canary-value-55\n');
  assert.equal(collect({ root, knownSecrets: ['canary-value-55'] }).reason, 'credential-content');
  for (const metadata of [
    '<!-- tvijo-globs: [] -->\n',
    '<!-- tvijo-globs: [' + Array(17).fill('"src/*.js"').join(',') + '] -->\n',
    '<!-- tvijo-globs: ["' + 'a'.repeat(257) + '"] -->\n',
    '<!-- tvijo-globs: ["src/**x.js"] -->\n',
    'text\n<!-- tvijo-globs: ["src/*.js"] -->\n'
  ]) {
    await rules(root, metadata + 'private payload\n');
    const refused = collect({ root });
    assert.equal(refused.status, 'rejected');
    assert.doesNotMatch(JSON.stringify(refused), /private payload/);
  }
});

test('rules enforce UTF-8 and byte boundaries, including metadata', async () => {
  const root = await workspace();
  await rules(root, Buffer.from([0xff, 0xfe]));
  assert.equal(collect({ root }).reason, 'invalid-utf8');
  await rules(root, 'x'.repeat(MAX_RULES_BYTES));
  assert.equal(collect({ root, allowRules: () => true }).status, 'included');
  await rules(root, 'x'.repeat(MAX_RULES_BYTES + 1));
  assert.equal(collect({ root }).reason, 'oversized');
  await rules(root, '<!-- tvijo-globs: ["src/**/*.js"] -->\n' + 'x'.repeat(MAX_RULES_BYTES - 20));
  assert.equal(collect({ root, knownPaths: ['src/a.js'] }).reason, 'oversized');
});

test('symlinked chains and hard-linked rules are refused', async t => {
  const root = await workspace();
  const external = path.join(root, 'outside.md');
  await fsp.writeFile(external, 'global instructions\n');
  const linkRoot = path.join(base, 'rules-link-' + process.pid + '-' + Date.now());
  try { await fsp.symlink(root, linkRoot, 'dir'); } catch (error) { if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('symlink creation unavailable'); throw error; }
  assert.equal(collect({ root: linkRoot }).reason, 'symlink');
  const hard = path.join(root, '.tvijo', 'hard.md');
  try { await fsp.link(path.join(root, '.tvijo', 'rules.md'), hard); } catch (error) {
    if (error.code === 'ENOENT') {
      await rules(root, 'safe\n');
      await fsp.link(path.join(root, '.tvijo', 'rules.md'), hard);
    } else throw error;
  }
  await rules(root, 'safe\n');
  assert.equal(collect({ root }).reason, 'unsafe-file');
  assert.equal(fs.lstatSync(path.join(root, '.tvijo', 'rules.md')).nlink, 2);
  const fileLinkRoot = await workspace();
  await fsp.writeFile(path.join(fileLinkRoot, 'rules-source.md'), 'safe\n');
  try { await fsp.symlink(path.join(fileLinkRoot, 'rules-source.md'), path.join(fileLinkRoot, '.tvijo', 'rules.md')); }
  catch (error) { if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('symlink creation unavailable'); throw error; }
  assert.equal(collect({ root: fileLinkRoot }).reason, 'symlink');
});

test('workspace context mode Off disables rules and Preview uses the same complete block', async () => {
  const root = await workspace();
  await rules(root, '<!-- tvijo-globs: ["src/*.js"] -->\nUse semicolons.\n');
  assert.equal(collect({ root, knownPaths: ['src/app.js'], contextMode: 'off' }).status, 'disabled');
  const unapprovedPreview = collect({ root, knownPaths: ['src/app.js'], contextMode: 'preview' });
  assert.equal(unapprovedPreview.status, 'unapproved');
  assert.equal(unapprovedPreview.text, '');
  const preview = collect({ root, knownPaths: ['src/app.js'], contextMode: 'preview', allowRules: () => true });
  assert.equal(preview.status, 'preview');
  assert.match(preview.text, /Use semicolons/);
});

test('partial reads retain the complete rules snapshot and same-size concurrent rewrites are refused',async()=>{
  const root=await workspace(),target=path.join(root,'.tvijo','rules.md');
  const body='RULE_SNAPSHOT_CANARY: Use the complete convention.\n';
  await rules(root,body);
  const originalRead=fs.readSync;
  try{
    fs.readSync=(fd,buffer,offset,length,position)=>originalRead(fd,buffer,offset,Math.min(length,3),position);
    const complete=collect({root, allowRules: () => true});
    assert.equal(complete.status,'included');assert.ok(complete.text.includes(body.trim()));
  }finally{fs.readSync=originalRead;}
  let changed=false;
  try{
    fs.readSync=(...args)=>{
      const count=originalRead(...args);
      if(count&&!changed){changed=true;fs.writeFileSync(target,'X'.repeat(Buffer.byteLength(body)));fs.utimesSync(target,new Date(),new Date(Date.now()+1000));}
      return count;
    };
    assert.equal(collect({root}).reason,'changed-file');
  }finally{fs.readSync=originalRead;}
});

test('bare credential canaries and unsafe known-path symlinks are refused without content disclosure',async()=>{
  const root=await workspace();
  const canary=['tvijo','pk','syntheticRulesTokenValue123456'].join('_');
  await rules(root,canary);
  const refused=collect({root});assert.equal(refused.reason,'credential-content');assert.ok(!JSON.stringify(refused).includes(canary));
  await rules(root,'<!-- tvijo-globs: ["*.txt"] -->\nScoped style.\n');
  await fsp.writeFile(path.join(root,'outside.txt'),'x');
  await fsp.symlink(path.join(root,'outside.txt'),path.join(root,'linked.txt'));
  assert.equal(collect({root,knownPaths:['linked.txt']}).status,'unmatched');
});
