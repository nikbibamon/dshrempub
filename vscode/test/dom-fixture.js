'use strict';

function dom() {
  const created = [];
  const document = { activeElement:null, createElement(tag) {
    const node = { tag, children:[], attributes:{}, listeners:{}, textContent:'',
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; },
      setAttribute(key, value) { this.attributes[key] = value; },
      getAttribute(key) { return this.attributes[key]; },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      focus() { document.activeElement = this; }
    };
    created.push(node); return node;
  } };
  return { document, created, root:document.createElement('div') };
}
function text(node) { return node.textContent + node.children.map(text).join(''); }
module.exports = { dom, text };
