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

function createRulesHost({vscode, state, storageRoot, L = en => en, showPreview, knownSecrets = () => [], selectedFolder = () => null, accountScope = () => 'local', scanOptions = {}, onRevoke = () => {}}) {
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
  const quarantineKey=()=>'tvijo.quarantinedRules.v2.'+createHash('sha256').update(String(accountScope() || 'signed-out')).digest('hex');
  const quarantine=()=>state.get(quarantineKey()) || {};
  let lastScanTruncated=false;
  function projectOptions(folder=selectedFolder() || vscode.workspace.workspaceFolders?.[0]){
    if(!folder || folder.uri.scheme!=='file')return null;
    try{const checked=require('./active-workspace').resolveFolder(vscode,folder);return {root:checked.canonicalRoot,boundary:checked.owner.canonicalRoot,resolveDirectory:dir=>require('./active-workspace').resolveFolder(vscode,{uri:vscode.Uri.file?vscode.Uri.file(dir):{scheme:'file',fsPath:dir}})};}catch{return null;}
  }
  function snapshot(options={}){
    const project=projectOptions(options.folder);if(!project){lastLoaded=[];return {text:'',status:'unavailable',files:[]};}
    const quarantined=Object.values(quarantine()),paths=quarantined.map(row=>row.absolute);
    const result=rules.collectProject({...project,knownSecrets:[...knownSecrets(),...(options.knownSecrets || [])],knownPaths:options.knownPaths,contextMode:options.contextMode,workspaceTrusted:vscode.workspace.isTrusted===true,disabled:state.get('tvijo.disabledRules.v1') || [],quarantinedPaths:paths});
    const dirs=rules.ruleDirectories(project);
    for(const row of result.files){const absolute=path.resolve(project.root,row.file),entry=quarantined.find(entry=>rules.quarantineMatch(absolute,[entry.absolute]));if(entry)row.quarantineId=entry.id;}
    for(const entry of quarantined){
      const inSubtree=rules.quarantineMatch(entry.absolute,[project.root]);
      const inAncestors=dirs.some(dir=>rules.normalizedRulePath(path.dirname(entry.absolute))===rules.normalizedRulePath(dir) || rules.RULE_FILES.some(file=>rules.normalizedRulePath(path.join(dir,file))===rules.normalizedRulePath(entry.absolute)));
      if(!inSubtree && !inAncestors)continue;
      if(!result.files.some(row=>row.id===entry.id))result.files.push({...entry,file:path.relative(project.root,entry.absolute).split(path.sep).join('/'),status:'quarantined',quarantined:true});
    }
    result.scanTruncated=lastScanTruncated;lastLoaded=result.files;return result;
  }
  function beginTask(folder){
    const project=projectOptions(folder),key=quarantineKey();let baseline=project?rules.fingerprintProject({...project,...scanOptions}):new Map();
    const changed=new Map();let scanTruncated=baseline.truncated===true,approvalRequired=scanTruncated;lastScanTruncated=scanTruncated;
    async function check({approvedPath}={}){
      if(!project)return [];
      const current=rules.fingerprintProject({...project,...scanOptions}),found=[];
      if(current.truncated){scanTruncated=true;lastScanTruncated=true;approvalRequired=true;}
      for(const absolute of new Set([...baseline.keys(),...current.keys()])){
        const before=baseline.get(absolute),after=current.get(absolute);
        if((before?.fingerprint || 'missing')===(after?.fingerprint || 'missing'))continue;
        // A direct approved creation can create its parent directories too.
        const accepted=approvedPath && (absolute===path.resolve(approvedPath) || path.resolve(approvedPath).startsWith(absolute+path.sep) && (before?.fingerprint || 'missing')==='missing' && after?.fingerprint==='directory');
        if(accepted)continue;
        const entry=after || {...before,fingerprint:'missing',bytes:0};changed.set(rules.normalizedRulePath(absolute),entry);found.push(entry);
      }
      baseline=current;
      if(found.length){
        approvalRequired=true;const stored={...(state.get(key) || {})};
        for(const entry of found){const absolute=rules.quarantinePath(entry.absolute),id=rules.ruleId(absolute);stored[id]={absolute,id,file:path.relative(project.root,absolute).split(path.sep).join('/'),bytes:entry.bytes,quarantined:true,status:'quarantined'};}
        await state.update(key,stored);
        for(const row of lastLoaded){const entry=Object.values(stored).find(entry=>rules.quarantineMatch(path.resolve(project.root,row.file),[entry.absolute]));if(entry)Object.assign(row,{quarantined:true,status:'quarantined',quarantineId:entry.id});}
        for(const entry of Object.values(stored))if(!lastLoaded.some(row=>row.id===entry.id))lastLoaded.push(entry);
      }
      return found;
    }
    return {check,get approvalRequired(){return approvalRequired;},get scanTruncated(){return scanTruncated;},changed:()=>[...changed.values()]};
  }
  async function reenable(id){
    const row=lastLoaded.find(row=>(row.id===id || row.quarantineId===id) && row.quarantined);if(!row)return;
    const stored={...quarantine()};delete stored[row.quarantineId || row.id];await state.update(quarantineKey(),stored);
    await state.update('tvijo.disabledRules.v1',(state.get('tvijo.disabledRules.v1') || []).filter(value=>value!==row.id));
  }
  async function collect(options={}){
    const context=await require('./workspace-context').collect(vscode,options),collected=snapshot(options);
    return {...context,rulesText:collected.text,ruleGrants:collected.text?[{workspaceTrusted:true}]:[],summary:{...context.summary,rules:{status:collected.status,files:collected.files,truncated:collected.truncated,scanTruncated:collected.scanTruncated}}};
  }
  function assertCurrent(grants=[]){if(grants.length && vscode.workspace.isTrusted!==true)throw Error('Workspace trust changed.');}
  async function toggle(id){if(!lastLoaded.some(row=>row.id===id))return;const disabled=state.get('tvijo.disabledRules.v1') || [];await state.update('tvijo.disabledRules.v1',disabled.includes(id)?disabled.filter(x=>x!==id):[...disabled,id]);}
  return {scope,chooseFolder,inspect,collect,assertCurrent,snapshot,toggle,beginTask,reenable,quarantinedPaths:()=>Object.values(quarantine()).map(row=>row.absolute),scanTruncated:()=>lastScanTruncated,loaded:()=>lastLoaded};
}
module.exports={createRulesHost};
