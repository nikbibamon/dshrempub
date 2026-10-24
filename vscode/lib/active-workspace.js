'use strict';
const path = require('node:path');
const fs = require('node:fs');
const {scopeError}=require('./scope-notices');
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
  if (!folder?.uri || folder.uri.scheme !== 'file' || folder.uri.authority) throw scopeError('scope_uri',folder?.uri);
  let canonical;try{canonical=fs.realpathSync(folder.uri.fsPath);}catch{throw scopeError('scope_missing',folder.uri);}
  if ([path.parse(canonical).root,require('node:os').homedir(),'/root','/home','/etc','/usr','/var'].includes(canonical)) throw scopeError('scope_system',folder?.uri);
  if (!fs.statSync(canonical).isDirectory()) throw scopeError('scope_directory',folder?.uri);
  const roots=(vscode.workspace.workspaceFolders || []).filter(root=>root.uri.scheme===folder.uri.scheme && (root.uri.authority || '')===(folder.uri.authority || ''));
  const candidates=roots.map(root=>{try{return {root,canonical:fs.realpathSync(root.uri.fsPath)}}catch{return null}}).filter(Boolean);
  const within=(root,target)=>{const rel=path.relative(root,target);return !rel || rel!=='..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel)};
  const lexical=candidates.filter(row=>within(row.root.uri.fsPath,folder.uri.fsPath)).sort((a,b)=>b.root.uri.fsPath.length-a.root.uri.fsPath.length);
  // A lexical owner takes precedence: a child symlink cannot escape it merely
  // because its target also happens to be another open workspace.
  const owner=lexical[0] || candidates.filter(row=>within(row.canonical,canonical)).sort((a,b)=>b.canonical.length-a.canonical.length)[0];
  if(!owner || !within(owner.canonical,canonical)) throw scopeError('scope_outside',folder?.uri);
  if(savedOwner && (savedOwner.identity!==identity(owner.root) || savedOwner.canonicalRoot!==owner.canonical)) throw scopeError('scope_owner',folder?.uri);
  const uri=folder.uri.with ? folder.uri.with({path:canonical}) : vscode.Uri.file(canonical);
  return {...folder,uri,sourceUri:folder.uri,canonicalRoot:canonical,owner:{identity:identity(owner.root),canonicalRoot:owner.canonical}};
}
function validFolder(vscode,folder) {
  if (!folder) return false;
  if (!folder.canonicalRoot) return (vscode.workspace.workspaceFolders || []).some(root=>identity(root)===identity(folder));
  try { const checked=resolveFolder(vscode,{uri:folder.sourceUri},folder.owner);return checked.canonicalRoot===folder.canonicalRoot && fs.realpathSync(folder.uri.fsPath)===folder.canonicalRoot; }
  catch { return false; }
}
function createActiveWorkspace({vscode,state,L = en => en,onChange = () => {}, isBusy = () => false}) {
  const folders = () => vscode.workspace.workspaceFolders || [];
  let guessed, refusal = null;
  function guess() {
    if(guessed!==undefined)return guessed;
    if(isBusy())return null;
    const all=folders();if(!all.length)return null;
    const editor=vscode.window.activeTextEditor?.document?.uri;
    let candidate=all[0];
    if(editor?.scheme==='file'){
      const owner=all.filter(root=>identity(root)===identity({uri:editor}) || contains(root,{uri:editor})).sort((a,b)=>b.uri.fsPath.length-a.uri.fsPath.length)[0];
      if(owner){
        let dir=path.dirname(editor.fsPath);
        while(true){if(fs.existsSync(path.join(dir,'.git'))){candidate={uri:vscode.Uri.file(dir),name:path.basename(dir)};break;}if(dir===owner.uri.fsPath || path.dirname(dir)===dir)break;dir=path.dirname(dir);}
      }
    }
    try{guessed=resolveFolder(vscode,candidate);refusal=null;}catch(error){guessed=null;refusal=error;}
    return guessed;
  }
  function current() {
    const all = folders(), saved = state.get(KEY);
    if (saved && typeof saved === 'object' && saved.schema === 2) {
      try {
        const sourceUri=typeof saved.sourceUri==='string' ? vscode.Uri.parse(saved.sourceUri) : vscode.Uri.from ? vscode.Uri.from(saved.sourceUri) : vscode.Uri.file(saved.sourceUri.path);
        if (sourceUri.scheme!==saved.sourceUri.scheme || (sourceUri.authority || '')!==(saved.sourceUri.authority || '')) return null;
        const folder=resolveFolder(vscode,{uri:sourceUri,name:saved.name},saved.owner);
        return folder.canonicalRoot === saved.canonicalRoot ? folder : null;
      } catch(error) { refusal=error;return null; }
    }
    if(!saved)return guess();
    const legacy=all.find(folder=>identity(folder)===saved);
    if (!legacy) {refusal=scopeError('scope_owner');return null;}
    try { return resolveFolder(vscode,legacy); } catch(error) {refusal=error;return null;}
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
    return select(candidate.uri);
  }
  async function select(uri) {
    const next=resolveFolder(vscode,{uri,name:path.basename(uri.fsPath)}),previous=current();
    await state.update(KEY,{schema:2,sourceUri:{scheme:next.sourceUri.scheme,authority:next.sourceUri.authority || '',path:next.sourceUri.path || next.sourceUri.fsPath},canonicalRoot:next.canonicalRoot,owner:next.owner,name:next.name});
    refusal=null;guessed=next;
    const recent=state.get(KEY+'.recent') || [];await state.update(KEY+'.recent',[next.sourceUri.fsPath,...recent.filter(p=>p!==next.sourceUri.fsPath)].slice(0,12));
    if(identity(previous)!==identity(next))onChange(previous,next);
    return current();
  }
  function hasNested(folder = current()) { return !!folder && folders().some(child => contains(folder,child)); }
  async function resetGuess(){if(isBusy())return;const previous=current();await state.update(KEY,undefined);guessed=undefined;refusal=null;const next=current();if(identity(previous)!==identity(next))onChange(previous,next);}
  async function ensure(){const folder=current();if(!folder)throw refusal || scopeError('no_workspace');if(!state.get(KEY) || typeof state.get(KEY)==='string')return select(folder.sourceUri || folder.uri);return folder;}
  async function chooseRecent(){const items=(state.get(KEY+'.recent') || []).map(p=>({label:path.basename(p),description:p}));const pick=await vscode.window.showQuickPick(items,{title:L('Recent folders','Недавние папки')});if(pick)return select(vscode.Uri.file(pick.description));return null;}
  return {current,choose,select,hasNested,identity,ensure,resetGuess,chooseRecent,refusal:()=>refusal};
}
module.exports = {createActiveWorkspace,identity,contains,resolveFolder,validFolder,KEY};
