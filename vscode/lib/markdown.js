'use strict';

// Shared by the host and webview. Never hand a model-provided URL to navigation.
function safeExternalUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\x00-\x1f\x7f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

// Deliberately small Markdown dialect, parsed directly into an allowlisted DOM.
// No HTML parser, innerHTML, image elements, dynamic attributes or dependencies.
function renderMarkdown(document, target, input, { post = () => {}, copyLabel = 'Copy', plainLabel = 'text', truncatedLabel = 'Answer truncated' } = {}) {
  const MAX = 120000, MAX_NODES = 8000;
  let remaining = MAX_NODES;
  const source = typeof input === 'string' ? input : '';
  const lines = source.slice(0, MAX).replace(/\r\n?/g, '\n').split('\n').slice(0, 4000);
  const node = (tag, text) => {
    if (--remaining < 0) return null;
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function inline(parent, value, depth = 0) {
    if (remaining <= 0) return;
    if (depth > 8) { const el = node('span', value); if (el) parent.append(el); return; }
    // Each alternative consumes at least one character; input and DOM are bounded.
    const pattern = /(`{1,8})([^`\n]*?)\1|!?\[([^\[\]\n]{0,2048})\]\(([^\s)]{1,2048})\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_|<\/?[A-Za-z][^<>]{0,2048}>/g;
    let cursor = 0, match;
    while (remaining > 0 && (match = pattern.exec(value))) {
      if (match.index > cursor) { const text = node('span', value.slice(cursor, match.index)); if (text) parent.append(text); }
      const raw = match[0];
      if (match[1]) { const code = node('code', match[2]); if (code) parent.append(code); }
      else if (match[3] !== undefined) {
        const href = !raw.startsWith('!') && safeExternalUrl(match[4]);
        const el = node(href ? 'a' : 'span');
        if (el) {
          if (href) {
            el.setAttribute('href', '#'); el.setAttribute('title', href);
            el.addEventListener('click', event => { event.preventDefault(); post({ type: 'openExternal', url: href }); });
            el.addEventListener('auxclick', event => { event.preventDefault(); if (event.button === 1) post({ type: 'openExternal', url: href }); });
          }
          inline(el, match[3], depth + 1); parent.append(el);
        }
      } else if (!raw.startsWith('<')) {
        const el = node(match[5] || match[6] ? 'strong' : 'em');
        if (el) { inline(el, match[5] || match[6] || match[7] || match[8], depth + 1); parent.append(el); }
      }
      cursor = pattern.lastIndex;
    }
    if (cursor < value.length && remaining > 0) { const el = node('span', value.slice(cursor)); if (el) parent.append(el); }
  }
  const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').slice(0, 24);
  const divider = line => line.includes('|') && cells(line).every(cell => /^\s*:?-{3,}:?\s*$/.test(cell));
  const list = line => /^(\s*)([-+*]|\d+[.)])\s+(.*)$/.exec(line);
  const blockStart = line => /^\s*(?:#{1,6}\s|`{3,}|~{3,}|>|([-*_])(?:\s*\1){2,}\s*$)/.test(line) || list(line);
  function blocks(parent, rows, depth = 0) {
    if (depth > 8) { inline(parent, rows.join('\n')); return; }
    for (let i = 0; i < rows.length && remaining > 0;) {
      const line = rows[i];
      if (!line.trim()) { i++; continue; }
      const fence = /^\s*(`{3,}|~{3,})\s*([^\s]*)[^\n]*$/.exec(line);
      const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (fence) {
        const content = []; i++;
        while (i < rows.length && !(rows[i].trim().startsWith(fence[1]) && new RegExp('^' + fence[1][0] + '{' + fence[1].length + ',}\\s*$').test(rows[i].trim()))) content.push(rows[i++]);
        if (i < rows.length) i++;
        const wrap = node('div'), bar = node('div'), label = node('span', /^[\w#+.-]{1,32}$/.test(fence[2]) ? fence[2] : plainLabel), copy = node('button', copyLabel), pre = node('pre'), code = node('code', content.join('\n'));
        if (![wrap, bar, label, copy, pre, code].every(Boolean)) break;
        wrap.className = 'md-code'; bar.className = 'md-code-bar'; copy.type = 'button';
        copy.addEventListener('click', () => post({ type: 'copyCode', text: content.join('\n') }));
        bar.append(label, copy); pre.append(code); wrap.append(bar, pre); parent.append(wrap);
      } else if (heading) { const el = node('h' + heading[1].length); if (el) { inline(el, heading[2]); parent.append(el); } i++; }
      else if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) { const el = node('hr'); if (el) parent.append(el); i++; }
      else if (/^\s*>/.test(line)) {
        const quoted = []; while (i < rows.length && /^\s*>/.test(rows[i])) quoted.push(rows[i++].replace(/^\s*> ?/, ''));
        const el = node('blockquote'); if (el) { blocks(el, quoted, depth + 1); parent.append(el); }
      } else if (i + 1 < rows.length && line.includes('|') && divider(rows[i + 1])) {
        const wrap = node('div'), table = node('table'), head = node('thead'), body = node('tbody');
        if (![wrap, table, head, body].every(Boolean)) break;
        const row = (text, tag, container) => { const tr = node('tr'); if (!tr) return; for (const value of cells(text)) { const cell = node(tag); if (cell) { inline(cell, value.trim()); tr.append(cell); } } container.append(tr); };
        row(line, 'th', head); i += 2;
        while (i < rows.length && rows[i].trim() && rows[i].includes('|') && remaining > 0) row(rows[i++], 'td', body);
        wrap.className = 'md-table'; table.append(head, body); wrap.append(table); parent.append(wrap);
      } else if (list(line)) {
        const first = list(line), indent = first[1].length, ordered = /^\d/.test(first[2]);
        const el = node(ordered ? 'ol' : 'ul'); if (!el) break;
        if (ordered) el.setAttribute('start', String(Math.min(100000, parseInt(first[2], 10))));
        while (i < rows.length && remaining > 0) {
          const current = list(rows[i]);
          if (!current || current[1].length !== indent || /^\d/.test(current[2]) !== ordered) break;
          const li = node('li'); if (!li) break;
          inline(li, current[3]); i++;
          const nested = [];
          while (i < rows.length && rows[i].trim() && /^\s+/.test(rows[i]) && rows[i].match(/^\s*/)[0].length > indent) nested.push(rows[i++].slice(indent + 2));
          if (nested.length) blocks(li, nested, depth + 1);
          el.append(li);
        }
        parent.append(el);
      } else {
        const para = [line]; i++;
        while (i < rows.length && rows[i].trim() && !blockStart(rows[i]) && !(i + 1 < rows.length && divider(rows[i + 1]))) para.push(rows[i++]);
        const el = node('p'); if (el) { inline(el, para.join('\n')); parent.append(el); }
      }
    }
  }
  target.className = 'markdown'; blocks(target, lines);
  if (source.length > MAX || source.split('\n', 4001).length > 4000 || remaining <= 0) {
    const note = document.createElement('p'); note.textContent = truncatedLabel; target.append(note);
  }
}

module.exports = { renderMarkdown, safeExternalUrl };
