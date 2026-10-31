'use strict';
const path = require('node:path');
const {randomUUID} = require('node:crypto');

const PREFIX = 'tvijo.fullAccess.v1.';
const VALID_SCOPE = /^[a-f0-9]{64}$/;
const ROOT_EXTRA_MESSAGE = Object.freeze({en:'ExtraFullAccess is unavailable on a privileged root host. Select Full access for scoped tools, or open this project in VS Code under a non-root OS account and explicitly enable ExtraFullAccess there. No automatic privilege change is performed.',ru:'ExtraFullAccess недоступен на привилегированном хосте root. Выберите полный доступ для инструментов проекта либо откройте проект в VS Code от обычного пользователя ОС и явно включите ExtraFullAccess там. Права автоматически не меняются.'});
const isRootHost = () => typeof process.getuid === 'function' && process.getuid() === 0;
function assertExtraHost(isPrivileged = isRootHost) {
  if (isPrivileged()) throw Object.assign(new Error(ROOT_EXTRA_MESSAGE.en),{code:'root_extra_access_refused',stopAgent:true});
}
const FULL_ACCESS_LIMITS=Object.freeze({"en": "This mode controls Tvijo Agent. Codex has its own permissions menu and approval policy. The agent works without pausing: no confirmations for edits, checks or chains like cd app && npm test | tail. sudo, destructive Git and removals outside the folder stay blocked. Commands run with your user's rights. Push is blocked for inherited environments; a program that rewrites its own environment is not stopped. Rules files changed by commands are quarantined, not prevented.", "ru": "Этот режим управляет агентом Tvijo. У Codex собственное меню разрешений и политика подтверждений. Агент работает без пауз: без подтверждений правок, проверок и цепочек вида cd app && npm test | tail. sudo, разрушительный Git и удаление вне папки по-прежнему заблокированы. Команды выполняются с правами вашего пользователя. Push блокируется при унаследованном окружении; программа, заменяющая собственное окружение, не останавливается. Изменения файлов правил командами помещаются в карантин, а не предотвращаются."});

function createFullAccess({ vscode, state, scope, L = en => en, onRevoke = () => {}, isPrivileged = isRootHost }) {
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
    const rootExtra = !!stored && stored.level === 'extra' && isPrivileged();
    const enabled = !!stored && !denied.has(key) && !rootExtra;
    return { available, enabled, extra: enabled && stored.level === 'extra', reviews:enabled && (stored.level === 'extra' || stored.reviews === true), extraAvailable:available && !isPrivileged(), extraUnavailableReason:isPrivileged() ? L(ROOT_EXTRA_MESSAGE.en,ROOT_EXTRA_MESSAGE.ru) : null, blockedReason:rootExtra ? 'root_extra_access_refused' : null, scopeKey: key, folder: folder?.name || folder?.uri?.fsPath?.split(/[\\/]/).filter(Boolean).pop() || '' };
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
  async function enable(folder, { guard = async () => {}, extra = false } = {}) {
    if (extra && isPrivileged()) throw Object.assign(new Error(L(ROOT_EXTRA_MESSAGE.en,ROOT_EXTRA_MESSAGE.ru)),{code:'root_extra_access_refused'});
    const initial = status(folder);
    if (!initial.available) return false;
    const key = initial.scopeKey, capturedEpoch = epoch;
    let savedRecord = null;
    if (initial.enabled && initial.extra === extra) return true;
    try {
      await guard(); check(folder, key, capturedEpoch);
      const label = extra ? L('Enable ExtraFullAccess', 'Включить ExtraFullAccess') : L('Enable Full access', 'Включить полный доступ');
      const detail = folder.uri.fsPath + '\n' + (extra ? L('ExtraFullAccess runs POSIX shell scripts (literal commands on Windows), network commands and advisory CLI reviews with this OS account rights. Commands are NOT confined to the project and literal checks are NOT an OS sandbox. Existing files must be preserved. Account CLI review is bounded and advisory; subscriptions and project policy still apply. API keys are not inherited. No automatic elevation or access to other accounts. ', 'ExtraFullAccess выполняет POSIX shell-скрипты (буквальные команды на Windows), сетевые команды и рекомендательное CLI-ревью с правами текущего пользователя ОС. Команды НЕ ограничены проектом; проверка текста НЕ является песочницей ОС. Существующие файлы нужно сохранять. CLI-ревью ограничено и носит рекомендательный характер; подписки и правила проекта сохраняются. API-ключи не наследуются. Повышения прав и доступа к чужим аккаунтам нет. ') : '') + L('Editor file-tool scope: this directory and its descendants. Commands start here but are not confined here. Agent edits are saved for disk checks; existing dirty buffers are refused. Hard command, path, secret, and budget limits and Rewind remain for editor tools and literal command checks, not as an OS sandbox. ', 'Область файловых инструментов редактора: эта папка и её содержимое. Команды запускаются здесь, но не ограничены этой папкой. Правки агента сохраняются для проверок; пользовательские несохранённые буферы защищены. Ограничения файловых инструментов, буквальных команд и бюджета, а также Rewind сохраняются, но не создают изоляцию ОС. ') + (extra ? '' : L(FULL_ACCESS_LIMITS.en,FULL_ACCESS_LIMITS.ru));
      const answer = await vscode.window.showWarningMessage(extra ? L('Enable ExtraFullAccess for this folder?', 'Включить ExtraFullAccess для этой папки?') : L('Enable Full access for this folder?', 'Включить полный доступ для этой папки?'), { modal: true, detail }, label);
      check(folder, key, capturedEpoch);
      await guard(); check(folder, key, capturedEpoch);
      if (answer !== label) return false;
      denied.add(key);
      await queue(key, async () => {
        check(folder, key, capturedEpoch);
        savedRecord = { schema: 1, scopeKey: key, enabled: true, level: extra ? 'extra' : 'full', approvedAt: Date.now(), approvalId:randomUUID() };
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
    if (current.blockedReason) throw Object.assign(new Error(L(ROOT_EXTRA_MESSAGE.en,ROOT_EXTRA_MESSAGE.ru)),{code:current.blockedReason});
    return current.enabled ? { scopeKey: current.scopeKey, epoch, extra: current.extra, reviews:current.reviews, approvalId: record(current.scopeKey)?.approvalId } : null;
  }
  function assertCurrent(folder, grant) {
    if (!grant || grant.epoch !== epoch || !status(folder).enabled || grant.scopeKey !== identity(folder) || grant.approvalId !== record(grant.scopeKey)?.approvalId || grant.extra !== status(folder).extra || grant.reviews !== status(folder).reviews) throw new Error(L('Full access grant is no longer current.', 'Разрешение полного доступа больше не действует.'));
    return true;
  }
  async function setReviews(folder, enabled, {guard = async () => {}} = {}) {
    const grant = capture(folder);
    if (!grant || grant.extra) return false;
    if (grant.reviews === (enabled === true)) return true;
    const key = grant.scopeKey;
    await guard(); assertCurrent(folder,grant);
    if (enabled === true && !grant.reviews) {
      const label = L('Allow account reviews','Разрешить ревью через подписку');
      const choice = await vscode.window.showWarningMessage(L('Allow account CLI reviews for this project?','Разрешить CLI-ревью через подписку для этого проекта?'),{modal:true,detail:folder.uri.fsPath+'\n'+L('The agent may consult installed Codex and explicitly enabled Claude accounts on supplied evidence, at most two fresh reviews per task. No tools, recursive delegation, API-key fallback or changes by the reviewer. Project pauses and account quota apply. This does not enable host shell or ExtraFullAccess.','Агент может обращаться к установленному Codex и отдельно включённому Claude с переданными материалами: не более двух новых ревью на задачу. Без инструментов, рекурсивных вызовов, API-подмены и правок ревьюером. Сохраняются паузы проекта и квота подписки. Shell хоста и ExtraFullAccess не включаются.')},label);
      await guard(); assertCurrent(folder,grant);
      if (choice !== label) return false;
    }
    await queue(key,async()=>{
      await guard(); assertCurrent(folder,grant);
      const current = record(key);
      denied.add(key); epoch++;
      try { onRevoke(); } catch (_) {}
      const next={...current,reviews:enabled === true,approvalId:randomUUID()}, savedEpoch=epoch;
      try {
        await state.update(PREFIX+key,next);
        await guard();
        if (epoch!==savedEpoch || identity(folder)!==key || vscode.workspace.isTrusted!==true) throw Error('Review grant scope changed.');
        denied.delete(key);
      } catch (error) {
        if (record(key)?.approvalId===next.approvalId) await state.update(PREFIX+key,current);
        throw error;
      }
    });
    return status(folder).reviews === (enabled === true);
  }
  function invalidate() {
    epoch++;
    try { onRevoke(); } catch (_) {}
  }
  return { status, enable, disable, capture, assertCurrent, invalidate, setReviews };
}

module.exports = { PREFIX, createFullAccess, FULL_ACCESS_LIMITS, ROOT_EXTRA_MESSAGE, isRootHost, assertExtraHost };
