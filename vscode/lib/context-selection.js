'use strict';
const {createHash} = require('node:crypto');
const {EXCLUDED_DIRS, EXCLUDED_FILE} = require('./workspace-context');

// Local, folder-specific preferences. Absence means the default bounded scan;
// an empty selection intentionally sends no project files.
function createContextSelection({vscode, state, L = en => en}) {
  const key = folder => 'tvijo.contextSelection.' + createHash('sha256').update(JSON.stringify([folder.uri.scheme,folder.uri.authority || '',folder.uri.fsPath])).digest('hex');
  const selected = folder => {
    const value = state.get(key(folder));
    return Array.isArray(value) ? value.filter(x => typeof x === 'string' && x && !/[\\/]/.test(x) && x !== '..') : null;
  };
  async function choose(folder, guard = async () => {}) {
    await guard();
    const previous = selected(folder);
    const listing = await vscode.workspace.fs.readDirectory(folder.uri);
    await guard();
    const items = listing.filter(([name,type]) => !(type & vscode.FileType.SymbolicLink) && (type === vscode.FileType.Directory ? !EXCLUDED_DIRS.has(name) && !name.startsWith('.') : type === vscode.FileType.File && !EXCLUDED_FILE.test(name))).sort((a,b) => a[0].localeCompare(b[0])).map(([name,type]) => ({label:name, description:type === vscode.FileType.Directory ? L('Folder','Папка') : L('File','Файл'), picked:previous === null || previous.includes(name)}));
    const picks = await vscode.window.showQuickPick(items,{canPickMany:true,title:L('Choose local project context','Выберите локальный контекст проекта'),placeHolder:L('Only selected top-level folders and files enter bounded context. No remote indexing.','В ограниченный контекст входят выбранные папки и файлы. Без удалённой индексации.')});
    await guard();
    if (!picks) return false;
    const allowed = new Set(items.map(item => item.label));
    await state.update(key(folder),picks.map(item => item.label).filter(name => allowed.has(name)));
    await guard();
    return true;
  }
  return {selected,choose};
}
module.exports = {createContextSelection};
