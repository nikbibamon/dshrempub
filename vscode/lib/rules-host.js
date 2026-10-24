'use strict';

// Workspace Trust authorizes project advice. Host-local folder identities also
// bind tool permissions; project files and webview values cannot grant them.
const fs = require('node:fs');
const path = require('node:path');
const {createHash, randomBytes} = require('node:crypto');
const os = require('node:os');
const rules = require('./project-rules');
const trust = require('./rules-trust');
const {safePath} = require('./local-tools');

function createRulesHost({vscode, state, storageRoot, L = en => en, showPreview, knownSecrets = () => [], selectedFolder = () => null, onRevoke = () => {}}) {
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
    const selected = selectedFolder();
    if (selected && require('./active-workspace').validFolder(vscode,selected) && path.resolve(selected.uri.fsPath) === path.resolve(root)) return selected;
    return (vscode.workspace.workspaceFolders || []).find(folder => path.resolve(folder.uri.fsPath) === path.resolve(root));
  }
  async function chooseFolder() {
    if (selectedFolder()) return selectedFolder();
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
  let lastLoaded=[];
  function snapshot(options={}){
    const folder=options.folder || selectedFolder() || vscode.workspace.workspaceFolders?.[0];
    if(!folder || folder.uri.scheme!=='file')return {text:'',status:'unsupported',files:[]};
    let root,boundary;
    try{root=fs.realpathSync(folder.uri.fsPath);const checked=require('./active-workspace').resolveFolder(vscode,folder);boundary=checked.owner.canonicalRoot;}catch{return {text:'',status:'unavailable',files:[]};}
    const result=rules.collectProject({root,boundary,resolveDirectory:dir=>require('./active-workspace').resolveFolder(vscode,{uri:vscode.Uri.file?vscode.Uri.file(dir):{scheme:'file',fsPath:dir}}),
      knownSecrets:[...knownSecrets(),...(options.knownSecrets || [])],knownPaths:options.knownPaths,contextMode:options.contextMode,workspaceTrusted:vscode.workspace.isTrusted===true,disabled:state.get('tvijo.disabledRules.v1') || []});
    lastLoaded=result.files;return result;
  }
  async function collect(options={}){
    const context=await require('./workspace-context').collect(vscode,options),collected=snapshot(options);
    return {...context,rulesText:collected.text,ruleGrants:collected.text?[{workspaceTrusted:true}]:[],summary:{...context.summary,rules:{status:collected.status,files:collected.files,truncated:collected.truncated}}};
  }
  function assertCurrent(grants=[]){if(grants.length && vscode.workspace.isTrusted!==true)throw Error('Workspace trust changed.');}
  async function toggle(id){if(!lastLoaded.some(row=>row.id===id))return;const disabled=state.get('tvijo.disabledRules.v1') || [];await state.update('tvijo.disabledRules.v1',disabled.includes(id)?disabled.filter(x=>x!==id):[...disabled,id]);}
  return {scope,chooseFolder,inspect,collect,assertCurrent,snapshot,toggle,loaded:()=>lastLoaded};
}
module.exports={createRulesHost};
