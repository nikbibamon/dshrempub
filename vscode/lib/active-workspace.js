'use strict';
const path = require('node:path');
const KEY = 'tvijo.activeWorkspace.v1';
const identity = folder => folder?.uri ? JSON.stringify([folder.uri.scheme,folder.uri.authority || '',path.resolve(folder.uri.fsPath)]) : null;
function contains(parent, child) {
  if (parent.uri.scheme !== child.uri.scheme || (parent.uri.authority || '') !== (child.uri.authority || '')) return false;
  const relative = path.relative(parent.uri.fsPath,child.uri.fsPath);
  return !!relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}
function createActiveWorkspace({vscode,state,L = en => en,onChange = () => {}}) {
  const folders = () => vscode.workspace.workspaceFolders || [];
  function current() {
    const all = folders(), saved = state.get(KEY);
    // Never infer multi-root consent from editor focus or array order.
    return all.find(folder => identity(folder) === saved) || (all.length === 1 ? all[0] : null);
  }
  async function choose() {
    const all = folders();
    if (!all.length) return null;
    const picked = all.length === 1 ? {folder:all[0]} : await vscode.window.showQuickPick(all.map(folder => ({folder,label:folder.name || path.basename(folder.uri.fsPath),description:folder.uri.fsPath,detail:all.some(child => contains(folder,child)) ? L('Contains other open projects; choose a child project for Full access.','Содержит другие проекты; для полного доступа выберите дочерний проект.') : ''})),{title:L('Local workspace — choose the active folder','Локальная рабочая область — выберите активную папку')});
    if (!picked || !folders().some(folder => identity(folder) === identity(picked.folder))) return null;
    const previous = current();
    await state.update(KEY,identity(picked.folder));
    if (identity(previous) !== identity(picked.folder)) onChange(previous,picked.folder);
    return current();
  }
  function hasNested(folder = current()) { return !!folder && folders().some(child => contains(folder,child)); }
  return {current,choose,hasNested,identity,ensure:async() => current() || choose()};
}
module.exports = {createActiveWorkspace,identity,contains,KEY};
