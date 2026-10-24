'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {chatHtml} = require('../../lib/chat-view');

function sidebar(initialState = {}, initialHostState = {}) {
  const listeners = new Map();
  const elements = new Map();
  const created = [];
  const outgoing = [];
  const document = { activeElement: null };
  let savedState = initialState;
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', disabled: false, textContent: '',
      attributes: {},
      addEventListener(type, fn) { (this.handlers ||= {})[type] = fn; if (id) listeners.set(`${id}:${type}`, fn); },
      focus() { document.activeElement = this; }, replaceChildren(...nodes) { this.children = nodes; }, append(...nodes) { this.children = [...(this.children || []), ...nodes]; }, requestSubmit() {},
      querySelectorAll(selector) { const nodes=this.children||[]; return selector.includes(':not(:disabled)') ? nodes.filter(node=>!node.disabled) : nodes; },
      querySelector(selector) { const nodes=this.children||[]; return nodes.find(node=>selector.includes('aria-checked') ? node.attributes['aria-checked']==='true' : true); },
      setAttribute(name, value) { this.attributes[name] = value; }, getAttribute(name) { return this.attributes[name]; }, click() { this.clicks=(this.clicks||0)+1; this.handlers?.click?.({target:this}); }
    });
    return elements.get(id);
  }
  document.getElementById = element; document.body = element('body'); document.documentElement = element('html');
  document.createElement = tag => { const node = { tag, textContent: '', children: [], attributes:{}, append(...nodes) { this.children.push(...nodes); }, addEventListener(type,fn) { (this.handlers ||= {})[type]=fn; }, setAttribute(name,value) { this.attributes[name]=value; }, getAttribute(name) { return this.attributes[name]; }, focus(){document.activeElement=this;}, click(){this.handlers?.click?.({target:this});} }; created.push(node); return node; };
  const window = { addEventListener(type, fn) { listeners.set(`window:${type}`, fn); } };
  const html = chatHtml({ cspSource: 'vscode-webview:' });
  element('plus-menu').querySelectorAll = selector => selector.includes('[data-action-id]')
    ? ['attach','mention-file','attach-problems','attach-terminal','clear-conversation','rewind-action','export-conversation','switch-model'].map(id=>{const node=element(id);node.dataset={actionId:{attach:'tvijo.attachFile','mention-file':'tvijo.mentionFile','attach-problems':'tvijo.attachProblems','attach-terminal':'tvijo.attachTerminal','clear-conversation':'tvijo.newConversation','rewind-action':'tvijo.rewind','export-conversation':'tvijo.export','switch-model':'tvijo.chooseWorkflow'}[id]};return node;})
    : selector.includes('[role="menuitem"]') ? ['attach','mention-file','attach-problems','attach-terminal','workspace','selection','path','clear-conversation','rewind-action','export-conversation','switch-model','all-actions'].map(element) : [];
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'webview script exists');
  vm.runInNewContext(script, { document, window, URL, acquireVsCodeApi: () => ({ postMessage: (message) => outgoing.push(message), getState: () => savedState, setState: (next) => { savedState = next; } }) });
  listeners.get('window:message')({ data: { type: 'state', scopeKey: 'tenant-a', messages: [], signedIn: true, attachments: [], ...initialHostState } });
  return { element, outgoing, created, document, state: () => savedState, emit: (key, event) => {
    if (event?.data?.type === 'state' && event.data.scopeKey === undefined) event = { data: { ...event.data, scopeKey: 'tenant-a' } };
    return listeners.get(key)(event);
  } };
}

module.exports = {sidebar};
