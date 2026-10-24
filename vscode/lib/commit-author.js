'use strict';
const {randomUUID}=require('node:crypto');
async function commitAuthor(mode,storage,scope='local') {
 if(mode==='git')return null;
 if(mode==='tvijo')return {name:'Tvijo',email:'noreply@tvijo.com'};
 if(mode!=='private')throw Error('Unknown commit identity mode');
 // Random identity instead of a reversible/dictionary-searchable hash of email.
 const key='tvijo.commitPseudonym.'+require('node:crypto').createHash('sha256').update(scope).digest('hex');
 let id=storage.get(key);
 if(typeof id!=='string'||!/^u-[a-f0-9]{32}$/.test(id)){id='u-'+randomUUID().replace(/-/g,'');await storage.update(key,id);}
 return {name:'Tvijo user '+id,email:id+'@users.noreply.tvijo.com'};
}
function identityEnv(author) {
 if(!author)return {};
 if(!/^Tvijo(?: user u-[a-f0-9]{32})?$/.test(author.name)||!(/^(?:noreply@tvijo\.com|u-[a-f0-9]{32}@users\.noreply\.tvijo\.com)$/.test(author.email)))throw Error('Invalid private commit identity');
 return {GIT_AUTHOR_NAME:author.name,GIT_AUTHOR_EMAIL:author.email,GIT_COMMITTER_NAME:author.name,GIT_COMMITTER_EMAIL:author.email};
}
module.exports={commitAuthor,identityEnv};
