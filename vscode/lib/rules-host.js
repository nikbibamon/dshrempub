'use strict';

// Only the extension host can approve a rules snapshot. No model, project
// configuration or webview value is accepted as a trust record.
const fs = require('node:fs');
const path = require('node:path');
const {createHash, randomBytes} = require('node:crypto');
const os = require('node:os');
const rules = require('./project-rules');
const trust = require('./rules-trust');
const {safePath} = require('./local-tools');
const PREFIX = 'tvijo.rulesTrust.v1.';

function createRulesHost({vscode, state, storageRoot, L = en => en, showPreview, knownSecrets = () => [], onRevoke = () => {}}) {
  let epoch = 0;
  function hostIdentity() {
    if (typeof storageRoot !== 'string' || !path.isAbsolute(storageRoot)) throw Error('Host storage is unavailable.');
    const root = fs.realpathSync(storageRoot);
    for (const folder of vscode.workspace.workspaceFolders || []) {
      const relative = path.relative(fs.realpathSync(folder.uri.fsPath),root);
      if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw Error('Host storage is inside a workspace.');
    }
    const marker = path.join(root,'rules-host-identity-v1');
    if (!fs.existsSync(marker)) {
      let fd;
      try {fd=fs.openSync(marker,'wx',0o600);fs.writeFileSync(fd,randomBytes(32).toString('hex'));fs.fsyncSync(fd);}
      catch(error){if(error.code!=='EEXIST')throw error;}
      finally{if(fd!==undefined)fs.closeSync(fd);}
    }
    const fd = fs.openSync(marker,fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
      const stat=fs.fstatSync(fd),current=fs.lstatSync(marker);
      if(!stat.isFile()||stat.nlink!==1||stat.size!==64||current.isSymbolicLink()||stat.ino!==current.ino||stat.dev!==current.dev||(process.platform!=='win32'&&(stat.mode&0o077)!==0))throw Error('Unsafe host identity.');
      const text=fs.readFileSync(fd,'utf8');
      if(!/^[a-f0-9]{64}$/.test(text))throw Error('Invalid host identity.');
      return text;
    }finally{fs.closeSync(fd);}
  }
  function scope(folder) {
    try {
      if (!folder || folder.uri.scheme !== 'file' || folder.uri.authority) return null;
      const root = safePath(folder.uri.fsPath, '.');
      const fileScope=trust.scopeKey({scheme:'file', authority:'', canonicalRoot:fs.realpathSync(root)});
      if(!fileScope)return null;
      // A file URI inside an SSH extension host need not identify that host.
      // Bind client-side memento approvals to a host-local, non-synced marker.
      return createHash('sha256').update(JSON.stringify(['tvijo-host-folder-v1',hostIdentity(),os.hostname(),fileScope])).digest('hex');
    } catch { return null; }
  }
  function folderFor(root) {
    return (vscode.workspace.workspaceFolders || []).find(folder => path.resolve(folder.uri.fsPath) === path.resolve(root));
  }
  function decision(folder, hash) {
    const key = scope(folder);
    return trust.decide({workspaceTrusted:vscode.workspace.isTrusted === true, scopeKey:key, hash,
      record:key ? state.get(PREFIX + key) : null});
  }
  async function chooseFolder() {
    const folders = vscode.workspace.workspaceFolders || [];
    if (!folders.length) return null;
    if (folders.length === 1) return folders[0];
    const selected = await vscode.window.showQuickPick(folders.map((folder, index) => ({
      label:folder.name || path.basename(folder.uri.fsPath), description:folder.uri.fsPath, index
    })), {title:L('Choose the folder for project rules', 'Выберите папку для правил проекта')});
    return selected && Number.isInteger(selected.index) ? folders[selected.index] || null : null;
  }
  function inspect(folder) {
    if (!scope(folder)) return {status:'unsupported'};
    return rules.inspect({root:folder.uri.fsPath, knownSecrets:knownSecrets()});
  }
  async function approve(folder) {
    if (vscode.workspace.isTrusted !== true) throw new Error(L('Trust this workspace in VS Code first.', 'Сначала разрешите доверие к рабочей области в VS Code.'));
    const key = scope(folder), capturedEpoch = epoch;
    if (!key) throw new Error(L('Rules trust requires a local folder without symlinks.', 'Для доверия правилам нужна локальная папка без симлинков.'));
    const candidate = inspect(folder);
    if (candidate.status !== 'ready') throw new Error(L('No safe rules file is available to approve.', 'Нет безопасного файла правил для одобрения.'));
    await showPreview('# ' + L('Local rules preview', 'Локальный просмотр правил') + '\n\n' + folder.uri.fsPath + '\nSHA256: ' + candidate.hash + '\n\n' + candidate.text);
    const label = L('Trust these rules', 'Доверять этим правилам');
    const answer = await vscode.window.showWarningMessage(
      L('Send these exact folder rules with project context?', 'Отправлять именно эти правила папки с контекстом проекта?'),
      {modal:true, detail:folder.uri.fsPath + '\nSHA256: ' + candidate.hash + '\n' + L('A changed file needs new approval. Rules cannot grant tool permissions.', 'Изменённый файл потребует нового одобрения. Правила не дают прав инструментам.')}, label);
    if (answer !== label) return false;
    const latest = inspect(folder);
    if (capturedEpoch !== epoch || vscode.workspace.isTrusted !== true || scope(folder) !== key || !folderFor(folder.uri.fsPath) || latest.status !== 'ready' || latest.hash !== candidate.hash) throw new Error(L('The folder or rules changed during approval. Preview again.', 'Папка или правила изменились во время одобрения. Повторите просмотр.'));
    await state.update(PREFIX + key, trust.makeRecord({scopeKey:key, hash:candidate.hash, approvedAt:Date.now()}));
    if (capturedEpoch !== epoch || vscode.workspace.isTrusted !== true || scope(folder) !== key || inspect(folder).hash !== candidate.hash) {
      // Preserve the stored record as historical evidence; exact-hash and
      // workspace checks deny it. Epoch catches revocation during persistence.
      if (capturedEpoch !== epoch) await state.update(PREFIX + key, undefined);
      throw new Error(L('Rules approval expired before it was saved.', 'Одобрение правил устарело до сохранения.'));
    }
    return true;
  }
  async function revoke(folder) {
    const key = scope(folder);
    epoch++;
    onRevoke();
    if (key) await state.update(PREFIX + key, undefined);
  }
  async function collect(options = {}) {
    const grants = [], capturedEpoch = epoch;
    const collected = await require('./workspace-context').collect(vscode, {...options, allowRules:(root, hash) => {
      const folder = folderFor(root), allowed = decision(folder, hash).allowed;
      if (allowed) grants.push({root, hash, scopeKey:scope(folder), epoch:capturedEpoch});
      return allowed;
    }});
    return {...collected, ruleGrants:['included','preview'].includes(collected.summary.rules?.status) ? grants : []};
  }
  function assertCurrent(grants = []) {
    for (const grant of grants) {
      const folder = folderFor(grant.root), latest = folder && inspect(folder);
      if (epoch !== grant.epoch || scope(folder) !== grant.scopeKey || latest?.status !== 'ready' || latest.hash !== grant.hash || !decision(folder, grant.hash).allowed) throw new Error(L('Project rules approval changed. Start a new request after previewing the rules.', 'Одобрение правил проекта изменилось. Просмотрите правила и начните новый запрос.'));
    }
  }
  return {scope, chooseFolder, inspect, approve, revoke, collect, assertCurrent, decision};
}

module.exports = {createRulesHost, PREFIX};
