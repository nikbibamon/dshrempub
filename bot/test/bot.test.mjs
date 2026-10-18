import test from 'node:test';
import assert from 'node:assert/strict';
import { configFrom, replyFor, readOnlyStatus, telegramRequest, run } from '../src/bot.mjs';
const token = `123456:${'A'.repeat(25)}`;
const update = (id, text, type = 'private') => ({update_id: 10, message: {chat: {id, type}, from: {id}, text}});

test('normal mode requires explicit owner and never binds first visitor', () => {
  assert.throws(() => configFrom({DSHREM_BOT_TOKEN: token}), /owner_id_required/);
  assert.equal(replyFor(update(7, '/status'), {ownerId: '8', status: () => 'secret'}), null);
  assert.equal(replyFor(update(7, '/status', 'group'), {ownerId: '7', status: () => 'secret'}), null);
});

test('pairing reveals only requester id and has no status', () => {
  const found = replyFor(update(7, '/id'), {pair: true});
  assert.match(found.text, /Your Telegram ID: 7/);
  assert.equal(replyFor(update(7, '/status'), {pair: true}), null);
});

test('authorized owner sees read-only status, never shell text', () => {
  assert.equal(replyFor(update(7, '/status'), {ownerId: '7', status: () => 'read-only'}).text, 'read-only');
  assert.equal(replyFor(update(7, '/exec rm'), {ownerId: '7'}), null);
  assert.match(replyFor(update(7, '/help'), {ownerId: '7'}).text, /No shell/);
  assert.match(readOnlyStatus({system:{uptime:()=>7200,loadavg:()=>[.2],hostname:()=> 'host'},disk:()=>({bavail:1024,bsize:1024})}), /Mode: read-only/);
});

test('Telegram errors never contain response body or token', async () => {
  const fetchImpl = async () => ({ok:false,status:401,text:async()=>`secret ${token}`});
  await assert.rejects(telegramRequest({token,method:'getUpdates',payload:{},fetchImpl}), e => e.message === 'telegram_http_401' && !e.message.includes(token));
});

test('polling sends only the owner response and pairing stops after id', async () => {
  const sent=[];let polls=0;
  const api=async({method,payload})=>{
    if(method==='getUpdates') { polls++; if(polls===1) return [update(8,'/status'),update(7,'/status')]; throw Error('telegram_http_409'); }
    sent.push(payload); return {};
  };
  const code=await run({token,ownerId:'7',pair:false,api,log:()=>{}});
  assert.equal(code,2);assert.equal(sent.length,1);assert.equal(sent[0].chat_id,7);
  const pairSent=[];
  const paired=await run({token,pair:true,api:async({method,payload})=>{
    if(method==='getUpdates') return [update(8,'/status'),update(7,'/id')];
    pairSent.push(payload);return {};
  },now:()=>0,log:()=>{}});
  assert.equal(paired,0);assert.equal(pairSent.length,1);assert.match(pairSent[0].text,/Your Telegram ID: 7/);
});

test('Telegram 409 stops immediately without token leakage or retry', async () => {
  const errors=[];const stopped=await run({token,ownerId:'7',pair:false,api:async()=>{throw Error('telegram_http_409')},log:x=>errors.push(x),sleep:()=>{throw Error('unexpected retry')}});
  assert.equal(stopped,2);assert.deepEqual(errors,['DSHREMBOT: telegram_http_409']);
});
