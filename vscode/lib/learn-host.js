'use strict';
const path=require('node:path'),fs=require('node:fs/promises');
const exerciseApi=require('./learn-exercise'),replay=require('./learn-replay'),coding=require('./coding');
const {sha256,treeSha256,candidateId,requestKey}=require('./learn-candidate');
const {open}=require('./learn-journal'),{createRecorder}=require('./learn-recorder');
const {ServiceError}=require('./client');
function createHost({vscode,storageRoot,L=en=>en,enabled,scope,folder,loadExercise=exerciseApi.load,openJournal=open,recorderFactory=createRecorder}){
 const notices={learn_disabled:[L('Enable Tvijo Learn in settings first.','Сначала включите Tvijo Learn в настройках.')],scope_missing:[L('Sign in to Tvijo first.','Сначала войдите в Tvijo.')],no_exercise:[L('Start an exercise and select its workspace folder first.','Сначала запустите упражнение и выберите его рабочую папку.')],exercise_unknown:[L('Choose a candidate from this exercise.','Выберите кандидата из этого упражнения.')],task_already_decided:[L('This task is already decided. Start a new attempt to continue.','По заданию уже принято решение. Для продолжения начните новую попытку.')],stand_dirty:[L('Save pending changes before opening this candidate.','Сохраните изменения перед открытием кандидата.')],stand_modified:[L('This task changed since the exercise started. Your files have been preserved; start a new attempt.','Задание изменилось после старта упражнения. Ваши файлы сохранены; начните новую попытку.')],learn_integrity:[L('The reviewed candidate could not be verified. Reopen the exercise.','Не удалось проверить просмотренного кандидата. Откройте упражнение заново.')],no_candidate:[L('Open a learning candidate first.','Сначала откройте учебного кандидата.')],pack_preload_failed:[L('The exercise could not be loaded and verified.','Не удалось загрузить и проверить упражнение.')]};
 const fail=code=>{throw new ServiceError(code,notices[code]?.[0]||L('The learning action could not be completed.','Не удалось выполнить учебное действие.'));};
 let active=null,checkSeq=0;const reviews=new WeakMap();
 const base=()=>({schema:'tvijo.learn.event/1'});
 function belongs(review){return !!(enabled()&&active&&active.scope===scope()&&path.resolve(folder()||'/')===active.root&&reviews.get(review)?.session===active);}
 function record(event){try{active?.recorder?.submit({...base(),...event});}catch{}}
 function ready(review){try{return belongs(review)&&active.recorder.ready();}catch{return false;}}
 async function start(id,accountScope){
  if(!enabled())fail('learn_disabled');if(!accountScope)fail('scope_missing');
  let timer;const pack=await Promise.race([loadExercise(id),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('pack_preload_failed'),{code:'pack_preload_failed'})),2000);})]).finally(()=>clearTimeout(timer));
  const session=await exerciseApi.start({exercise:pack,storageRoot});let journal=null;try{journal=await openJournal({root:storageRoot,scope:accountScope,ctx:exerciseApi.ctxFor(pack)});}catch{}
  active={...session,scope:accountScope,journal,recorder:recorderFactory({journal}),truth:pack.manifest.truth};
  if(journal)try{checkSeq=(await journal.read()).reduce((n,e)=>e?.type==='check'?Math.max(n,Number(e.check_id.slice(4))||0):n,0);}catch{}
  return active.root;
 }
 async function openProposal(task,guard){
  if(!enabled())fail('learn_disabled');if(!active||active.scope!==scope()||folder()!==active.root)fail('no_exercise');
  await guard();const s=active,row=s.exercise.manifest.tasks[task];if(!row)fail('exercise_unknown');if(s.decided.has(task))fail('task_already_decided');
  const marker=await fs.readFile(path.join(s.root,'.learn-instance.json'),'utf8');if(sha256(marker)!==s.marker_sha256)fail('stand_modified');
  const templateBytes=s.exercise.files[row.proposal],template=JSON.parse(templateBytes),selected=[row.dir+'/planner.py',row.dir+'/tests/test_planner.py',row.dir+'/tests/test_planner_edge.py'];
  for(const file of selected)if((vscode.workspace.textDocuments||[]).some(d=>d.uri?.fsPath===path.join(s.root,file)&&d.isDirty))fail('stand_dirty');
  for(const edit of template.edits)if(sha256(await fs.readFile(path.join(s.root,edit.path)))!==edit.base_sha256)fail('stand_modified');
  const snapshot=await coding.capture({root:s.root,selected,testFiles:[row.dir+'/tests/test_planner.py'],profile:'python-unittest',guard,vscode});
  const fields={thread_id:s.thread_id,snapshot_hash:treeSha256(Object.fromEntries(snapshot.files.map(f=>[f.path,f.content])))};
  const artifact=exerciseApi.freeze(exerciseApi.instantiateProposal(template,fields));coding.validateArtifact(artifact,snapshot);
  const trusted=replay.prepare({exercise:s.exercise,artifact,mode:'trusted'}),cases=replay.prepare({exercise:s.exercise,artifact,mode:'case'});
  const anchor=exerciseApi.freeze({candidate_id:candidateId(artifact),instance_sha256:exerciseApi.artifactSha256(artifact),expected_tree_trusted:trusted.expected_tree_sha256,expected_tree_case:cases.expected_tree_sha256});
  const review={snapshot,artifact,guard};reviews.set(review,{session:s,templateBytes,manifestSha256:s.exercise.manifest.files[row.proposal],fields:exerciseApi.freeze(fields),anchor,artifact,trusted,cases,pending:0,decision:null});return review;
 }
 function present(review){const m=reviews.get(review);if(!belongs(review)||!m)return;record({type:'candidate_presented',candidate_id:m.anchor.candidate_id,exercise_id:active.exercise.id,exercise_instance:active.instance,task_id:review.artifact.task_id,surface:'apply_coding',context:'exercise',integrity:require('./learn-candidate').testIntegrity({snapshot:review.snapshot,artifact:review.artifact}).integrity,observer_ok:ready(review),criteria_without_check:active.exercise.manifest.tasks[review.artifact.task_id].criteria_without_check,scope_violation:false,expected_tree_trusted:m.anchor.expected_tree_trusted,expected_tree_case:m.anchor.expected_tree_case,scale_version:'tvijo.learn.scale/1'});}
 function revalidate(review){const m=reviews.get(review);try{if(!m||exerciseApi.checkFrozen({templateBytes:m.templateBytes,manifestSha256:m.manifestSha256,frozenArtifact:review.artifact,fields:m.fields,anchor:m.anchor}).length)fail('learn_integrity');return m.artifact;}catch{fail('learn_integrity');}}
 const buttons=()=>[L('Apply reviewed edits','Применить просмотренные правки'),L('Return for rework','Вернуть на доработку'),L('Ask independent review','Запросить независимое ревью')];
 function writeDecision(review,event){const m=reviews.get(review);if(event.source==='human')m.session.decided.add(review.artifact.task_id);record(event);}
 async function confirm(review,baseConfirm){
  if(!ready(review))return baseConfirm();const m=reviews.get(review),b=buttons();
  const choice=await vscode.window.showWarningMessage(L('Choose a decision for this candidate. Independent review is recorded only; it is not performed in P1.','Выберите решение по кандидату. Запрос независимого ревью только записывается; в P1 ревью не выполняется.'),{modal:true},...b);
  const approved=choice===b[0]; // Compute the gate value before any Learn recording.
  try{const event={type:'decision',request_key:requestKey({scope:active.scope,task_id:review.artifact.task_id,candidate_id:m.anchor.candidate_id,surface:'apply_coding',action_class:'accept_candidate'}),candidate_id:m.anchor.candidate_id,decision:choice===b[1]?'return':choice===b[2]?'request_review':'accept',source:choice===undefined?'dismissed':'human',reason_code:choice===b[1]?(m.lastResult==='fail'?'test_failed':null):null,observer_ok:ready(review)&&m.pending===0};if(approved)m.decision=event;else writeDecision(review,event);}catch{}
  return approved;
 }
 function recordApply(review,integrityOk){const m=reviews.get(review);if(!m?.decision)return;const event=m.decision;m.decision=null;writeDecision(review,{...event,observer_ok:event.observer_ok&&integrityOk});}
 async function check(review,mode){
  if(!ready(review))fail('no_candidate');const m=reviews.get(review);m.pending++;try{let data=null;
  if(mode==='case'){const value=await vscode.window.showInputBox({title:L('My counterexample (JSON data only)','Мой контрпример (только JSON-данные)'),prompt:L('Enter tasks, slots and expected pairs. Task duration: 1–480 minutes.','Введите tasks, slots и expected. Длительность задачи: 1–480 минут.')});try{data=JSON.parse(value);}catch{}}
  const checkId='chk-'+(++checkSeq);
   const result=await replay.run({prepared:mode==='trusted'?m.trusted:m.cases,storageRoot,data,guard:review.guard});await review.guard();
   record({type:'check',check_id:checkId,candidate_id:m.anchor.candidate_id,kind:mode==='trusted'?'trusted_test_run':'counterexample_run',initiator:'learner',...Object.fromEntries(['result','bound','tree_sha256','tree_sha256_after','expected_tree_sha256','input_sha256','output_sha256','exit_code','duration_ms'].map(k=>[k,result[k]]))});m.lastResult=result.result;
   void vscode.window.showInformationMessage(L('Learn check result: ','Результат проверки Learn: ')+(result.result==='pass'?L('pass','пройдена'):result.result==='fail'?L('fail','ошибка'):L('unknown','неизвестно')));return result;
  }finally{m.pending--;}
 }
 async function data(){
  const account=scope();if(!account)fail('scope_missing');const pack=active?.scope===account?active.exercise:await loadExercise('day-planner/1');
  const journal=active?.scope===account&&active.journal?active.journal:await openJournal({root:storageRoot,scope:account,ctx:exerciseApi.ctxFor(pack)});
  if(active?.scope===account)await active.recorder.flush();const events=await journal.read();if(scope()!==account)fail('scope_missing');
  const {derive}=require('./learn-scorer'),opts={truth:pack.manifest.truth,ctx:exerciseApi.ctxFor(pack)},cumulative=derive(events,undefined,opts),instance=cumulative.instances.at(-1),lastAttempt=instance?derive(events,undefined,{...opts,instance}):derive([],undefined,opts);
  return {events,progress:require('./learn-progress-view').project({cumulative,lastAttempt}),journal,account};
 }
 async function deleteData(){const value=await data();if(value.account!==scope())fail('scope_missing');await value.journal.purge();if(active?.scope===value.account)active=null;}
 return {start,openProposal,belongs,ready,present,revalidate,confirm,recordApply,check,data,deleteData,active:()=>active,flush:()=>active?.recorder.flush()};
}
module.exports={createHost};
