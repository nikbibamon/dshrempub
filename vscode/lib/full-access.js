'use strict';
const path = require('node:path');
const {randomUUID} = require('node:crypto');

const PREFIX = 'tvijo.fullAccess.v1.';
const VALID_SCOPE = /^[a-f0-9]{64}$/;

function createFullAccess({ vscode, state, scope, L = en => en, onRevoke = () => {} }) {
  let epoch = 0;
  const denied = new Set();
  const writes = new Map();

  function identity(folder) {
    if (!folder || folder.uri?.scheme !== 'file' || folder.uri?.authority) return null;
    if (!require('./active-workspace').validFolder(vscode,folder)) return null;
    const current = folder.canonicalRoot ? folder : (vscode.workspace.workspaceFolders || []).find(f=>path.resolve(f.uri.fsPath)===path.resolve(folder.uri.fsPath));
    if (!current) return null;
    const key = scope(current);
    return typeof key === 'string' && VALID_SCOPE.test(key) ? key : null;
  }
  function record(key) {
    const value = state.get(PREFIX + key);
    return value && value.schema === 1 && value.scopeKey === key && value.enabled === true && Number.isFinite(value.approvedAt) && typeof value.approvalId === 'string' ? value : null;
  }
  function status(folder) {
    const key = identity(folder);
    const available = vscode.workspace.isTrusted === true && !!key;
    const stored = available && record(key);
    const enabled = !!stored && !denied.has(key);
    return { available, enabled, scopeKey: key, folder: folder?.name || folder?.uri?.fsPath?.split(/[\\/]/).filter(Boolean).pop() || '' };
  }
  function check(folder, key, capturedEpoch) {
    if (capturedEpoch !== epoch || !status(folder).available || identity(folder) !== key) throw new Error(L('Full access approval expired because workspace trust or folder identity changed.', 'Одобрение полного доступа устарело: доверие или папка изменились.'));
  }
  function queue(key, operation) {
    const previous = writes.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    writes.set(key, current);
    current.finally(() => { if (writes.get(key) === current) writes.delete(key); }).catch(() => {});
    return current;
  }
  async function enable(folder, { guard = async () => {} } = {}) {
    const initial = status(folder);
    if (!initial.available) return false;
    const key = initial.scopeKey, capturedEpoch = epoch;
    let savedRecord = null;
    if (initial.enabled) return true;
    try {
      await guard(); check(folder, key, capturedEpoch);
      const label = L('Enable Full access', 'Включить полный доступ');
      const detail = folder.uri.fsPath + '\n' + L('Scope: this exact directory and all its descendants, including open child projects. Other siblings and ancestors are excluded. Automatically approve edits and commands using local host permissions. Agent edits are saved for disk checks; existing dirty buffers are refused. Hard command, path, secret, and budget limits and Rewind remain in effect. Commands are not an operating-system sandbox.', 'Область: именно эта папка и всё её содержимое, включая открытые дочерние проекты. Соседние и родительские папки исключены. Автоматически одобрять правки и команды с правами хоста. Правки агента сохраняются для проверок на диске; несохранённые пользовательские буферы не изменяются. Ограничения команд, путей, секретов и бюджета, а также Rewind сохраняются. Команды не изолированы песочницей ОС.');
      const answer = await vscode.window.showWarningMessage(L('Enable Full access for this folder?', 'Включить полный доступ для этой папки?'), { modal: true, detail }, label);
      check(folder, key, capturedEpoch);
      await guard(); check(folder, key, capturedEpoch);
      if (answer !== label) return false;
      denied.add(key);
      await queue(key, async () => {
        check(folder, key, capturedEpoch);
        savedRecord = { schema: 1, scopeKey: key, enabled: true, approvedAt: Date.now(), approvalId:randomUUID() };
        await state.update(PREFIX + key, savedRecord);
        await guard();
        check(folder, key, capturedEpoch);
        denied.delete(key);
      });
      return status(folder).enabled;
    } catch (_) {
      denied.add(key);
      if (savedRecord) await queue(key,async() => {
        if (state.get(PREFIX + key)?.approvalId === savedRecord.approvalId) await state.update(PREFIX + key,undefined);
      }).catch(() => {});
      return false;
    }
  }
  function disable(folder) {
    const key = identity(folder);
    if (!key) return Promise.resolve(false);
    denied.add(key); epoch++;
    try { onRevoke(); } catch (_) {}
    return queue(key, async () => {
      await state.update(PREFIX + key, undefined);
      return true;
    }).catch(() => false);
  }
  function capture(folder) {
    const current = status(folder);
    return current.enabled ? { scopeKey: current.scopeKey, epoch } : null;
  }
  function assertCurrent(folder, grant) {
    if (!grant || grant.epoch !== epoch || !status(folder).enabled || grant.scopeKey !== identity(folder)) throw new Error(L('Full access grant is no longer current.', 'Разрешение полного доступа больше не действует.'));
    return true;
  }
  function invalidate() {
    epoch++;
    try { onRevoke(); } catch (_) {}
  }
  return { status, enable, disable, capture, assertCurrent, invalidate };
}

module.exports = { PREFIX, createFullAccess };
