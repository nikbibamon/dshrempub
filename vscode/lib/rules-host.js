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
  const QUARANTINE='tvijo.quarantinedRules.v1';
  const quarantine=()=>state.get(QUARANTINE) || {};
  function projectOptions(folder=selectedFolder() || vscode.workspace.workspaceFolders?.[0]){
    if(!folder || folder.uri.scheme!=='file')return null;
    try{const checked=require('./active-workspace').resolveFolder(vscode,folder);return {root:checked.canonicalRoot,boundary:checked.owner.canonicalRoot,resolveDirectory:dir=>require('./active-workspace').resolveFolder(vscode,{uri:vscode.Uri.file?vscode.Uri.file(dir):{scheme:'file',fsPath:dir}})};}catch{return null;}
  }
  function snapshot(options={}){
    const project=projectOptions(options.folder);if(!project){lastLoaded=[];return {text:'',status:'unavailable',files:[]};}
    const quarantined=quarantine();
    const result=rules.collectProject({...project,knownSecrets:[...knownSecrets(),...(options.knownSecrets || [])],knownPaths:options.knownPaths,contextMode:options.contextMode,workspaceTrusted:vscode.workspace.isTrusted===true,disabled:state.get('tvijo.disabledRules.v1') || [],quarantined:Object.keys(quarantined)});
    const dirs=rules.ruleDirectories(project);
    for(const entry of Object.values(quarantined)){
      if(!dirs.some(dir=>rules.RULE_FILES.some(file=>path.join(dir,file)===entry.absolute) || path.dirname(entry.absolute)===path.join(dir,'.clinerules')&&entry.absolute.endsWith('.md')))continue;
      if(!result.files.some(row=>row.id===entry.id))result.files.push({...entry,file:path.relative(project.root,entry.absolute).split(path.sep).join('/'),status:'quarantined',quarantined:true});
    }
    lastLoaded=result.files;return result;
  }
  function beginTask(folder){
    const project=projectOptions(folder);let baseline=project?rules.fingerprintProject(project):new Map();
    const changed=new Map();let approvalRequired=false;
    async function check({approvedPath}={}){
      if(!project)return [];
      const current=rules.fingerprintProject(project),found=[];
      for(const absolute of new Set([...baseline.keys(),...current.keys()])){
        const before=baseline.get(absolute),after=current.get(absolute);
        if((before?.fingerprint || 'missing')===(after?.fingerprint || 'missing'))continue;
        const accepted=approvedPath && (absolute===path.resolve(approvedPath) || absolute===path.dirname(path.resolve(approvedPath)) && path.basename(absolute)==='.clinerules' && before?.fingerprint==='missing' && after?.fingerprint==='directory');
        if(accepted)continue;
        const entry=after || {...before,fingerprint:'missing',bytes:0};changed.set(absolute,entry);found.push(entry);
      }
      baseline=current;
      if(found.length){
        approvalRequired=true;const stored={...quarantine()};for(const entry of found)stored[entry.id]={...entry,quarantined:true,status:'quarantined'};await state.update(QUARANTINE,stored);
        for(const entry of found){const row=lastLoaded.find(r=>r.id===entry.id);if(row)Object.assign(row,{quarantined:true,status:'quarantined'});else lastLoaded.push({...entry,quarantined:true,status:'quarantined'});}
      }
      return found;
    }
    return {check,get approvalRequired(){return approvalRequired;},changed:()=>[...changed.values()]};
  }
  async function reenable(id){
    if(!lastLoaded.some(row=>row.id===id && row.quarantined))return;
    const stored={...quarantine()};delete stored[id];await state.update(QUARANTINE,stored);
    await state.update('tvijo.disabledRules.v1',(state.get('tvijo.disabledRules.v1') || []).filter(value=>value!==id));
  }
  async function collect(options={}){
    const context=await require('./workspace-context').collect(vscode,options),collected=snapshot(options);
    return {...context,rulesText:collected.text,ruleGrants:collected.text?[{workspaceTrusted:true}]:[],summary:{...context.summary,rules:{status:collected.status,files:collected.files,truncated:collected.truncated}}};
  }
  function assertCurrent(grants=[]){if(grants.length && vscode.workspace.isTrusted!==true)throw Error('Workspace trust changed.');}
  async function toggle(id){if(!lastLoaded.some(row=>row.id===id))return;const disabled=state.get('tvijo.disabledRules.v1') || [];await state.update('tvijo.disabledRules.v1',disabled.includes(id)?disabled.filter(x=>x!==id):[...disabled,id]);}
  return {scope,chooseFolder,inspect,collect,assertCurrent,snapshot,toggle,beginTask,reenable,quarantinedPaths:()=>Object.values(quarantine()).map(row=>row.absolute),loaded:()=>lastLoaded};
}
module.exports={createRulesHost};
