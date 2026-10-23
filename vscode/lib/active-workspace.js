'use strict';
const path = require('node:path');
const fs = require('node:fs');
const KEY = 'tvijo.activeWorkspace.v1';
const identity = folder => folder?.uri ? JSON.stringify([folder.uri.scheme,folder.uri.authority || '',path.resolve(folder.uri.fsPath)]) : null;
function contains(parent, child) {
  if (parent.uri.scheme !== child.uri.scheme || (parent.uri.authority || '') !== (child.uri.authority || '')) return false;
  const relative = path.relative(parent.uri.fsPath,child.uri.fsPath);
  return !!relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}
function owned(vscode, folder) {
  return !!folder?.uri && (vscode.workspace.workspaceFolders || []).some(root => identity(root) === identity(folder) || contains(root,folder));
}
// Resolve an explicitly chosen host directory once. File URIs in an SSH extension
// host are local to that host; never convert a remote authority into a local path.
function resolveFolder(vscode, folder, savedOwner = null) {
  if (!folder?.uri || folder.uri.scheme !== 'file' || folder.uri.authority) throw Error('Choose a directory inside an open workspace on this extension host.');
  const canonical = fs.realpathSync(folder.uri.fsPath);
  if ([path.parse(canonical).root,require('node:os').homedir(),'/root','/home','/etc','/usr','/var'].includes(canonical)) throw Error('Choose a project directory, not a system or home directory.');
  if (!fs.statSync(canonical).isDirectory()) throw Error('Choose a directory.');
  const roots=(vscode.workspace.workspaceFolders || []).filter(root=>root.uri.scheme===folder.uri.scheme && (root.uri.authority || '')===(folder.uri.authority || ''));
  const candidates=roots.map(root=>{try{return {root,canonical:fs.realpathSync(root.uri.fsPath)}}catch{return null}}).filter(Boolean);
  const within=(root,target)=>{const rel=path.relative(root,target);return !rel || rel!=='..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel)};
  const lexical=candidates.filter(row=>within(row.root.uri.fsPath,folder.uri.fsPath)).sort((a,b)=>b.root.uri.fsPath.length-a.root.uri.fsPath.length);
  // A lexical owner takes precedence: a child symlink cannot escape it merely
  // because its target also happens to be another open workspace.
  const owner=lexical[0] || candidates.filter(row=>within(row.canonical,canonical)).sort((a,b)=>b.canonical.length-a.canonical.length)[0];
  if(!owner || !within(owner.canonical,canonical)) throw Error('Choose a directory inside its canonical open workspace; symlink escape refused.');
  if(savedOwner && (savedOwner.identity!==identity(owner.root) || savedOwner.canonicalRoot!==owner.canonical)) throw Error('The owning workspace changed. Choose the folder again.');
  const uri=folder.uri.with ? folder.uri.with({path:canonical}) : vscode.Uri.file(canonical);
  return {...folder,uri,sourceUri:folder.uri,canonicalRoot:canonical,owner:{identity:identity(owner.root),canonicalRoot:owner.canonical}};
}
function validFolder(vscode,folder) {
  if (!folder) return false;
  if (!folder.canonicalRoot) return (vscode.workspace.workspaceFolders || []).some(root=>identity(root)===identity(folder));
  try { const checked=resolveFolder(vscode,{uri:folder.sourceUri},folder.owner);return checked.canonicalRoot===folder.canonicalRoot && fs.realpathSync(folder.uri.fsPath)===folder.canonicalRoot; }
  catch { return false; }
}
function createActiveWorkspace({vscode,state,L = en => en,onChange = () => {}}) {
  const folders = () => vscode.workspace.workspaceFolders || [];
  function current() {
    const all = folders(), saved = state.get(KEY);
    if (saved && typeof saved === 'object' && saved.schema === 2) {
      try {
        const sourceUri=typeof saved.sourceUri==='string' ? vscode.Uri.parse(saved.sourceUri) : vscode.Uri.from ? vscode.Uri.from(saved.sourceUri) : vscode.Uri.file(saved.sourceUri.path);
        if (sourceUri.scheme!==saved.sourceUri.scheme || (sourceUri.authority || '')!==(saved.sourceUri.authority || '')) return null;
        const folder=resolveFolder(vscode,{uri:sourceUri,name:saved.name},saved.owner);
        return folder.canonicalRoot === saved.canonicalRoot ? folder : null;
      } catch { return null; }
    }
    const legacy=all.find(folder=>identity(folder)===saved) || (!saved && all.length===1 ? all[0] : null);
    if (!legacy) return null;
    try { return resolveFolder(vscode,legacy); } catch { return null; }
  }
  async function choose() {
    const all = folders();
    if (!all.length) return null;
    const choices=all.map(folder=>({folder,label:folder.name || path.basename(folder.uri.fsPath),description:folder.uri.fsPath,detail:L('This directory and its descendants; other folders are outside this scope.','Эта папка и её содержимое; остальные папки вне этой области.')}));
    choices.push({browse:true,label:L('Browse project subfolder…','Выбрать подпапку проекта…'),detail:L('Choose a directory inside an open workspace or SSH folder.','Выберите папку внутри открытой рабочей области или SSH-папки.')});
    const picked=await vscode.window.showQuickPick(choices,{title:L('Choose execution folder','Выберите папку выполнения')});
    if (!picked) return null;
    let candidate=picked.folder;
    if(picked.browse) {
      const uris=await vscode.window.showOpenDialog({canSelectFiles:false,canSelectFolders:true,canSelectMany:false,defaultUri:current()?.sourceUri || all[0].uri,openLabel:L('Use this project folder','Выбрать эту папку проекта'),title:L('Choose project folder within the workspace','Выберите папку проекта внутри рабочей области')});
      if(!uris?.length)return null;
      candidate={uri:uris[0],name:path.basename(uris[0].fsPath)};
    }
    const next=resolveFolder(vscode,candidate),previous=current();
    await state.update(KEY,{schema:2,sourceUri:{scheme:next.sourceUri.scheme,authority:next.sourceUri.authority || '',path:next.sourceUri.path || next.sourceUri.fsPath},canonicalRoot:next.canonicalRoot,owner:next.owner,name:next.name});
    if(identity(previous)!==identity(next))onChange(previous,next);
    return current();
  }
  function hasNested(folder = current()) { return !!folder && folders().some(child => contains(folder,child)); }
  return {current,choose,hasNested,identity,ensure:async()=>current() || choose()};
}
module.exports = {createActiveWorkspace,identity,contains,resolveFolder,validFolder,KEY};
