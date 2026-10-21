'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const profiles=require('./lint-profiles');
const syntax=require('./auto-lint');
const {safePath}=require('./local-tools');
const PREFIX='tvijo.syntaxProfiles.v1.';
const MAX_CHECKS=4;
const hash=text=>createHash('sha256').update(text,'utf8').digest('hex');

function createSyntaxHost({vscode,state,storageRoot,chooseFolder,scope,L=en=>en,runCheck=syntax.run}){
  let epoch=0,activeCheck=null,configCheck=null,storeQueue=Promise.resolve();
  const observed=new Map(),listeners=[];
  const diagnostics=typeof vscode.languages?.createDiagnosticCollection==='function'?vscode.languages.createDiagnosticCollection('tvijo-syntax'):null;
  function clearDiagnostics(){observed.clear();diagnostics?.clear();}
  function publishResult(document,result){
    if(!diagnostics)return;
    const uri=document.uri,uriKey=uri.toString();
    if(result.status==='passed'){observed.delete(uriKey);diagnostics.delete(uri);return;}
    if(result.status!=='failed')return;
    const rows=(result.diagnostics||[]).slice(0,20).map(row=>{
      const line=Math.max(0,(Number(row.line)||1)-1),column=Math.max(0,(Number(row.column)||1)-1);
      const diagnostic=new vscode.Diagnostic(new vscode.Range(new vscode.Position(line,column),new vscode.Position(line,column+1)),L('Syntax error','Синтаксическая ошибка'),vscode.DiagnosticSeverity.Error);
      diagnostic.source='Tvijo syntax';diagnostic.code=result.profileId;return diagnostic;
    });
    if(observed.size>=32&&!observed.has(uriKey)){const oldest=observed.keys().next().value;diagnostics.delete(observed.get(oldest).uri);observed.delete(oldest);}
    observed.set(uriKey,{uri,version:document.version});diagnostics.set(uri,rows);
  }
  if(typeof vscode.workspace.onDidChangeTextDocument==='function')listeners.push(vscode.workspace.onDidChangeTextDocument(event=>{
    const id=event.document.uri.toString(),previous=observed.get(id);
    if(previous&&previous.version!==event.document.version){observed.delete(id);diagnostics?.delete(event.document.uri);}
  }));
  if(typeof vscode.workspace.onDidCloseTextDocument==='function')listeners.push(vscode.workspace.onDidCloseTextDocument(document=>{observed.delete(document.uri.toString());diagnostics?.delete(document.uri);}));
  const runs=new WeakSet();
  const roots=()=> (vscode.workspace.workspaceFolders||[]).map(f=>f.uri.fsPath);
  function rootSignature(){const values=roots();if(values.length>64)throw Error('Too many workspace roots.');return JSON.stringify(values.map(root=>fs.realpathSync(root)).sort());}
  function key(folder){
    if(vscode.workspace.isTrusted!==true||!folder||!(vscode.workspace.workspaceFolders||[]).some(f=>f.uri.scheme==='file'&&!f.uri.authority&&f.uri.fsPath===folder.uri.fsPath))return null;
    return scope(folder);
  }
  function slots(folder){const id=key(folder),value=id&&state.get(PREFIX+id);return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
  function store(fn){const result=storeQueue.then(fn);storeQueue=result.catch(()=>{});return result;}
  function newRun(){const run={checks:0,seen:new Set()};runs.add(run);return run;}
  async function configure(){
    if(process.platform!=='linux')throw Error(L('Automatic syntax checks currently require a Linux extension host.','Автоматическая проверка синтаксиса пока доступна только на Linux-хосте расширения.'));
    const folder=await chooseFolder(),id=key(folder),capturedEpoch=epoch;
    if(!folder)return false;
    if(!id)throw Error(L('Trust this local workspace in VS Code first.','Сначала разрешите доверие к локальной рабочей области в VS Code.'));
    const launchRoots=rootSignature();
    const choice=await vscode.window.showQuickPick([
      {label:L('Python syntax (.py)','Синтаксис Python (.py)'),profileId:'python-ast'},
      {label:L('Node CommonJS syntax (.cjs, .js)','Синтаксис Node CommonJS (.cjs, .js)'),profileId:'node-cjs'},
      {label:L('Node ES module syntax (.mjs, .js)','Синтаксис модулей Node ES (.mjs, .js)'),profileId:'node-esm'}
    ],{title:L('Approve an automatic syntax check','Разрешить автоматическую проверку синтаксиса')});
    if(!choice)return false;
    const picked=await vscode.window.showOpenDialog({canSelectFiles:true,canSelectFolders:false,canSelectMany:false,
      title:L('Choose the installed Python or Node executable on this host','Выберите установленный исполняемый файл Python или Node на этом хосте')});
    if(!picked?.[0])return false;
    if(picked.length!==1||picked[0].scheme!=='file'||picked[0].authority)throw Error('Choose one local executable.');
    const record=await profiles.inspectExecutable({profileId:choice.profileId,executable:picked[0].fsPath,scopeKey:id,workspaceRoots:roots()});
    const approve=L('Approve this syntax tool','Разрешить этот инструмент');
    const answer=await vscode.window.showWarningMessage(L('Automatically parse Tvijo-edited buffers with this interpreter?','Автоматически проверять изменённые Tvijo буферы этим интерпретатором?'),
      {modal:true,detail:record.profileId+'\n'+record.executable+'\nSHA256: '+record.sha256+'\n'+L('Parses the current buffer on stdin. Files stay unsaved. The interpreter runs with your local permissions; project hooks and plugins are excluded.','Проверяет текущий буфер через stdin. Файлы остаются несохранёнными. Интерпретатор работает с вашими локальными правами; хуки и плагины проекта исключены.')},approve);
    if(answer!==approve)return false;
    // A mistaken executable such as `true` must not report every buffer valid.
    // Probe only fixed host-authored inputs, after the native tool approval.
    const probeAbort=new AbortController();configCheck=probeAbort;
    try{
      const cwd=await profiles.emptyCwd(storageRoot,roots());
      const python=record.profileId==='python-ast';
      for(const [text,status] of python?[['value = 1\n','passed'],['def (\n','failed']]:[['const value = 1;\n','passed'],['const value = ;\n','failed']]){
        const assertLaunchAllowed=()=>{if(epoch!==capturedEpoch||key(folder)!==id||rootSignature()!==launchRoots||probeAbort.signal.aborted)throw Error('Syntax tool approval changed.');};
        const result=await runCheck({profile:{...record,cwd,workspaceRoots:roots()},snapshot:{scopeKey:id,path:'syntax-probe'+(python?'.py':record.profileId==='node-esm'?'.mjs':'.cjs'),version:0,text,contentHash:hash(text)},signal:probeAbort.signal,isCurrent:()=>true,
          guard:async()=>{assertLaunchAllowed();},assertLaunchAllowed});
        if(result.status!==status)throw Error(L('This executable did not pass the syntax-tool self-check. No profile was enabled.','Этот исполняемый файл не прошёл самопроверку инструмента. Профиль не включён.'));
      }
    }finally{if(configCheck===probeAbort)configCheck=null;}
    await store(async()=>{
      if(epoch!==capturedEpoch||key(folder)!==id||!await profiles.verifyExecutable(record,{scopeKey:id,workspaceRoots:roots()}))throw Error('The selected folder or syntax tool changed during approval.');
      if(epoch!==capturedEpoch||key(folder)!==id)throw Error('Syntax approval expired.');
      const slot=record.profileId==='python-ast'?'python':'node';
      await state.update(PREFIX+id,{...slots(folder),[slot]:record});
      if(epoch!==capturedEpoch)throw Error('Syntax approval was revoked while saving.');
      epoch++;activeCheck?.abort();
    });
    return true;
  }
  async function disable(){
    const folder=await chooseFolder();if(!folder)return false;
    const id=scope(folder);epoch++;activeCheck?.abort();configCheck?.abort();clearDiagnostics();
    if(id)await store(()=>state.update(PREFIX+id,undefined));
    return true;
  }
  async function check(document,folder,{guard=async()=>{},signal,run}={}){
    if(process.platform!=='linux')return null;
    const id=key(folder),configured=slots(folder);
    if(!id||(!configured.python&&!configured.node))return null;
    if(!runs.has(run))throw Error('A host-owned syntax-check run is required.');
    if(!document||document.uri?.scheme!=='file'||document.uri.authority||document.isClosed)return {status:'skipped',reason:'unsupported_document'};
    let absolute;
    try{absolute=safePath(folder.uri.fsPath,document.uri.fsPath);}catch{return {status:'skipped',reason:'unsafe_path'};}
    const relative=path.relative(folder.uri.fsPath,absolute).split(path.sep).join('/');
    if(relative.length>500)return {status:'skipped',reason:'snapshot_limit'};
    const ext=path.extname(relative).toLowerCase();
    const record=ext==='.py'?configured.python:['.js','.mjs','.cjs'].includes(ext)?configured.node:null;
    if(!record)return {status:'skipped',path:relative,reason:'unsupported_language_or_profile'};
    if((ext==='.mjs'&&record.profileId!=='node-esm')||(ext==='.cjs'&&record.profileId!=='node-cjs'))return {status:'skipped',path:relative,reason:'profile_language_mismatch'};
    const text=document.getText(),version=document.version,contentHash=hash(text);
    let launchRoots;try{launchRoots=rootSignature();}catch{return {status:'tool_error',reason:'workspace_unavailable'};}
    const recordSignature=JSON.stringify(record);
    const base={profileId:record.profileId,path:relative,version,contentHash};
    if(Buffer.byteLength(text,'utf8')>128*1024||!Number.isSafeInteger(version))return {...base,status:'skipped',reason:'snapshot_limit'};
    const snapshotKey=relative+'\0'+version+'\0'+contentHash;
    if(run.seen.has(snapshotKey))return {...base,status:'skipped',reason:'duplicate_snapshot'};
    if(run.checks>=MAX_CHECKS)return {...base,status:'skipped',reason:'run_limit'};
    run.seen.add(snapshotKey);run.checks++;
    const capturedEpoch=epoch,controller=new AbortController();
    const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    if(activeCheck){signal?.removeEventListener('abort',abort);return {...base,status:'skipped',reason:'check_busy'};}
    activeCheck=controller;
    const current=()=>!document.isClosed&&document.version===version&&hash(document.getText())===contentHash;
    try{
      const cwd=await profiles.emptyCwd(storageRoot,roots());
      const assertLaunchAllowed=()=>{
        if(epoch!==capturedEpoch||key(folder)!==id||rootSignature()!==launchRoots||controller.signal.aborted||JSON.stringify(slots(folder)[ext==='.py'?'python':'node'])!==recordSignature||!current())throw Error('Syntax check snapshot or authority changed.');
      };
      const result=await runCheck({profile:{...record,cwd,workspaceRoots:roots()},snapshot:{...base,scopeKey:id,text},signal:controller.signal,isCurrent:current,assertLaunchAllowed,
        guard:async()=>{
          await guard();
          assertLaunchAllowed();
          await guard();
          assertLaunchAllowed();
        }});
      if(!current())return {...base,status:'stale',reason:'buffer_changed'};
      if(epoch!==capturedEpoch)return {...base,status:'cancelled',reason:'profile_revoked'};
      publishResult(document,result);
      return result;
    }catch{
      return {...base,status:!current()?'stale':controller.signal.aborted?'cancelled':'tool_error',reason:'syntax_check_unavailable'};
    }finally{signal?.removeEventListener('abort',abort);if(activeCheck===controller)activeCheck=null;}
  }
  function invalidate(){epoch++;activeCheck?.abort();configCheck?.abort();clearDiagnostics();}
  function dispose(){invalidate();for(const listener of listeners)listener.dispose();diagnostics?.dispose();}
  function cancelActive(){activeCheck?.abort();}
  return {configure,disable,newRun,check,dispose,invalidate,cancelActive};
}
module.exports={createSyntaxHost,PREFIX,MAX_CHECKS};
