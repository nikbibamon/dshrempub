'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {commitAuthor,identityEnv}=require('../lib/commit-author');
test('private attribution is stable per local account without using email or credentials',async()=>{
 const m=new Map(),state={get:k=>m.get(k),update:async(k,v)=>m.set(k,v)};
 assert.equal(await commitAuthor('git',state),null);
 const a=await commitAuthor('private',state,'account-a');assert.deepEqual(await commitAuthor('private',state,'account-a'),a);assert.notDeepEqual(await commitAuthor('private',state,'account-b'),a);
 assert.match(a.email,/^u-[a-f0-9]{32}@users.noreply.tvijo.com$/);
 assert.equal(identityEnv(a).GIT_COMMITTER_EMAIL,a.email);assert.equal(identityEnv(a).GIT_AUTHOR_EMAIL,a.email);
 assert.throws(()=>identityEnv({name:'evil',email:'real@example.com'}));assert.deepEqual(await commitAuthor('tvijo',state),{name:'Tvijo',email:'noreply@tvijo.com'});
});
