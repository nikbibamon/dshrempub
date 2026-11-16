'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomBytes}=require('node:crypto');
const {sha256,treeSha256,exerciseInstance,threadIdFor,instantiateProposal,artifactSha256,candidateId}=require('./learn-candidate');
const PINNED_MANIFEST_SHA256='0000000000000000000000000000000000000000000000000000000000000000';
function checkFrozen({ templateBytes, manifestSha256, frozenArtifact, fields, anchor }) {
  const errors = [];
  if (sha256(templateBytes) !== manifestSha256) errors.push('template_hash_mismatch');                   // external anchor: the manifest pins the template
  let expected; try { expected = instantiateProposal(JSON.parse(Buffer.from(templateBytes).toString('utf8')), fields); } catch { return [...errors, 'template_unreadable']; }
  let got; try { got = artifactSha256(frozenArtifact); } catch { return [...errors, 'artifact_unreadable']; }
  if (got !== artifactSha256(expected)) errors.push('instance_mismatch');                                // the copy is exactly template + the two fields
  if (got !== anchor.instance_sha256) errors.push('anchor_mismatch');
  let cid = null; try { cid = candidateId(frozenArtifact); } catch { /* malformed copy */ }
  if (cid !== anchor.candidate_id) errors.push('candidate_mismatch');
  return errors;
}

const fail=code=>{throw Object.assign(new Error(code),{code});};
function relative(p){if(typeof p!=='string'||!p||p.includes('\\')||p.startsWith('/')||p.split('/').some(x=>!x||x==='.'||x==='..')||/[\x00-\x1f:]/.test(p))fail('manifest_hash_mismatch');return p;}
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
async function verifiedFile(root,name){relative(name);let p=root;for(const part of name.split('/')){p=path.join(p,part);if((await fs.lstat(p)).isSymbolicLink())fail('manifest_hash_mismatch');}const st=await fs.stat(p);if(!st.isFile()||st.size>65536||st.nlink!==1)fail('manifest_hash_mismatch');const b=await fs.readFile(p);if(b.length>65536||!Buffer.from(b.toString('utf8')).equals(b))fail('manifest_hash_mismatch');return b.toString('utf8');}
async function verify({root,manifestBytes,expectedSha=PINNED_MANIFEST_SHA256}){
 if(sha256(manifestBytes)!==expectedSha)fail('manifest_hash_mismatch');
 const manifest=JSON.parse(manifestBytes);
 if(manifest.id!=='day-planner/1'||manifest.commands||!['python-unittest'].includes(manifest.runner)||!manifest.files||Object.keys(manifest.files).length>40||!manifest.tasks||!manifest.truth)fail('manifest_hash_mismatch');
 const files={};for(const [name,digest]of Object.entries(manifest.files)){const bytes=await verifiedFile(root,name);if(sha256(bytes)!==digest)fail('manifest_hash_mismatch');files[name]=bytes;}
 for(const [task,row]of Object.entries(manifest.tasks)){relative(row.dir);relative(row.proposal);if(!files[row.proposal]||!['correct','defective','ambiguous'].includes(manifest.truth[task]))fail('manifest_hash_mismatch');}
 return freeze({id:manifest.id,manifest,files,manifest_sha256:expectedSha});
}
async function load(id){if(id!=='day-planner/1')fail('exercise_unknown');const root=path.join(__dirname,'../learn/exercises/day-planner-1');return verify({root,manifestBytes:await verifiedFile(root,'manifest.json')});}
function ctxFor(exercise){return {tasks:new Set(Object.keys(exercise.manifest.tasks)),exercises:new Set([exercise.id]),criteria:new Set(exercise.manifest.criteria_without_check)};}
async function start({exercise,storageRoot}){
 const root=path.join(storageRoot,'learn/workspaces',exercise.id),nonce=randomBytes(16).toString('hex');
 try{await fs.access(root);const marker=JSON.parse(await fs.readFile(path.join(root,'.learn-instance.json'),'utf8'));if(marker.exercise_id!==exercise.id)fail('stand_modified');await fs.rename(root,root+'.previous-'+nonce);}catch(e){if(e.code!=='ENOENT')throw e;}
 const stand={};for(const row of Object.values(exercise.manifest.tasks))for(const [file,bytes]of Object.entries(exercise.files))if(file.startsWith('stand/'))stand[row.dir+'/'+file.slice(6)]=bytes;
 await fs.mkdir(root,{recursive:true,mode:0o700});for(const [name,bytes]of Object.entries(stand)){const dest=path.join(root,relative(name));await fs.mkdir(path.dirname(dest),{recursive:true,mode:0o700});await fs.writeFile(dest,bytes,{flag:'wx',mode:0o600});}
 const stand_tree_sha256=treeSha256(stand),instance=exerciseInstance({manifest_sha256:exercise.manifest_sha256,stand_tree_sha256,start_nonce:nonce});
 const marker={exercise_id:exercise.id,manifest_sha256:exercise.manifest_sha256,stand_tree_sha256,start_nonce:nonce,exercise_instance:instance};
 await fs.writeFile(path.join(root,'.learn-instance.json'),JSON.stringify(marker),{flag:'wx',mode:0o600});
 return {root,instance,thread_id:threadIdFor(instance),marker_sha256:sha256(JSON.stringify(marker)),exercise,decided:new Set()};
}
module.exports={load,verify,start,ctxFor,PINNED_MANIFEST_SHA256,instantiateProposal,artifactSha256,checkFrozen,freeze,relative};
