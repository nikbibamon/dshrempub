'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chatHtml } = require('../lib/chat-view');
function sidebar(initialState = {}) {
  const listeners = new Map();
  const elements = new Map();
  const created = [];
  const outgoing = [];
  let savedState = initialState;
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', disabled: false, textContent: '',
      style: {}, attributes: {},
      addEventListener(type, fn) { listeners.set(`${id}:${type}`, fn); },
      focus() {}, replaceChildren() {}, append() {}, requestSubmit() {}, querySelectorAll() { return []; }, setAttribute(name, value) { this.attributes[name] = value; }, click() {}
    });
    return elements.get(id);
  }
  const document = { getElementById: element, body: element('body'), documentElement: element('html'), createElement: (tag) => { const node = { tag, append() {}, addEventListener() {}, setAttribute() {} }; created.push(node); return node; } };
  const window = { addEventListener(type, fn) { listeners.set(`window:${type}`, fn); } };
  const html = chatHtml({ cspSource: 'vscode-webview:' });
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'webview script exists');
  vm.runInNewContext(script, { document, window, acquireVsCodeApi: () => ({ postMessage: (message) => outgoing.push(message), getState: () => savedState, setState: (next) => { savedState = next; } }) });
  listeners.get('window:message')({ data: { type: 'state', scopeKey: 'tenant-a', messages: [], signedIn: true, attachments: [] } });
  return { element, outgoing, created, state: () => savedState, emit: (key, event) => {
    if (event?.data?.type === 'state' && event.data.scopeKey === undefined) event = { data: { ...event.data, scopeKey: 'tenant-a' } };
    return listeners.get(key)(event);
  } };
}


test('service receipts show unknown model counts and cannot inject markup or survive a scope change', () => {
  const v=sidebar();
  v.emit('window:message',{ data:{ type:'usage', scopeKey:'tenant-a', usage:{ unit:'micro_tvijo', balance:null, tasks:[{title:'<script>private</script>',service_id:'standard',status:'completed',receipt:{ debited_micro_tvijo:1,held_micro_tvijo:0,tariff_version:'pilot-v1' },usage:{prompt_tokens:null,completion_tokens:2,total_tokens:null,completeness:'partial'}}] } } });
  const text=v.created.map(n=>n.textContent).filter(Boolean).join('\n');
  assert.match(text,/available — TT/); assert.match(text,/debited 0.000001 TT/); assert.match(text,/actual model tokens: in — \/ out 2 \/ total — \(partial\)/);
  assert.ok(v.created.filter(n=>n.textContent?.includes('<script>')).every(n=>n.tag==='p' && n.innerHTML===undefined)); assert.match(text,/<script>private<\/script>/);
  const size=v.created.length;
  v.emit('window:message',{data:{type:'usage',scopeKey:'wrong-project',usage:{unit:'micro_tvijo',tasks:[]}}});
  assert.equal(v.created.length,size);
  let cleared=0;v.element('usage-items').replaceChildren=()=>cleared++;
  v.emit('window:message',{data:{type:'state',scopeKey:'project-b',signedIn:true,account:{tenant_id:'tenant-a'},messages:[]}});
  assert.ok(cleared>0);
});

test('quote estimate is scoped and localized; ceiling details require engineering view', () => {
  const v=sidebar();
  v.emit('window:message',{data:{type:'quote',scopeKey:'tenant-a',quote:{quote_id:'q',ceiling_micro_tvijo:1234567,tariff_version:'v1'}}});
  assert.equal(v.element('state').textContent,'Up to — TT');
  v.emit('window:message',{data:{type:'quote',scopeKey:'other',quote:{quote_id:'private-other'}}});
  assert.equal(v.element('state').textContent,'Up to — TT');
  v.emit('engineering:click',{});
  assert.equal(v.element('state').textContent,'Up to — TT · Quote q · Ceiling 1.234567 TT · Tariff v1');
  v.emit('window:message',{data:{type:'quote',scopeKey:'other',quote:{quote_id:'private-other',ceiling_micro_tvijo:9999999}}});
  assert.equal(v.element('state').textContent,'Up to — TT · Quote q · Ceiling 1.234567 TT · Tariff v1');
  v.emit('engineering:click',{});
  v.emit('lang:click',{});
  assert.equal(v.element('state').textContent,'До — TT');
});

test('service events keep signed integer deltas separate from model usage',()=>{
 const v=sidebar();
 v.emit('window:message',{data:{type:'usage',scopeKey:'tenant-a',usage:{unit:'micro_tvijo',balance:null,tasks:[],events:[{id:7,task:'t',kind:'debit',credit_delta:0,held_delta:-1234567,debit_delta:1234567,created:1760000000}]}}});
 const text=v.created.map(n=>n.textContent).filter(Boolean).join('\n');
 assert.match(text,/held -1.234567 TT/);assert.match(text,/debit \+1.234567 TT/);assert.doesNotMatch(text,/provider|routing/);
});
