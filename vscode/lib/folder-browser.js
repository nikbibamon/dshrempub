'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {resolveFolder, validFolder} = require('./active-workspace');
const SKIP = new Set(['node_modules','.git','.venv','venv','env','__pycache__','.cache','cache','.next','dist','build','coverage','.tox']);
const uriData = uri => ({scheme:uri.scheme,authority:uri.authority || '',path:uri.path || uri.fsPath});
function folderUri(vscode, value) {
  if (!value || value.scheme !== 'file' || value.authority || typeof value.path !== 'string' || value.path.length > 8192 || !path.isAbsolute(value.path)) throw Error('Choose a folder inside an open workspace.');
  return vscode.Uri.file(value.path);
}
async function listFolders(vscode, value) {
  if (!vscode.workspace.isTrusted) throw Error('Trust this workspace before browsing project folders.');
  const row = folder => ({name:folder.name || path.basename(folder.uri.fsPath),uri:uriData(folder.sourceUri),path:folder.uri.fsPath});
  if (!value) {
    const folders=[];
    for (const root of (vscode.workspace.workspaceFolders || []).slice(0,100)) {
      try { folders.push(row(resolveFolder(vscode,root))); } catch { /* Unsafe roots are not choices. */ }
    }
    return {folders,truncated:(vscode.workspace.workspaceFolders || []).length>100};
  }
  const parent=resolveFolder(vscode,{uri:folderUri(vscode,value)});
  const folders=[]; let scanned=0,truncated=false;
  // One bounded directory read per explicit disclosure. No recursive scan.
  const directory=await fs.promises.opendir(parent.uri.fsPath);
  for await (const entry of directory) {
    if (++scanned>500 || folders.length>=100) { truncated=true; break; }
    if (SKIP.has(entry.name) || !(entry.isDirectory() || entry.isSymbolicLink())) continue;
    try {
      const uri=vscode.Uri.joinPath(parent.sourceUri,entry.name);
      folders.push(row(resolveFolder(vscode,{uri,name:entry.name})));
    } catch { /* Files, vanished directories and symlink escapes are omitted. */ }
  }
  if (!vscode.workspace.isTrusted || !validFolder(vscode,parent)) throw Error('The workspace changed. Open the folder browser again.');
  folders.sort((a,b)=>a.name.localeCompare(b.name));
  return {folders,truncated};
}
module.exports={listFolders,folderUri,uriData};
