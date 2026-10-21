'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderMarkdown, safeExternalUrl } = require('../lib/markdown');
const { dom, text } = require('./dom-fixture');

const cases = [
  ['headings', '# One\n## Two\n### Three\n#### Four\n##### Five\n###### Six', ['h1','h2','h3','h4','h5','h6']],
  ['bold and italic', '**bold** __strong__ *italic* _emphasis_', ['strong','strong','em','em']],
  ['inline code', 'A `const x = 1` value', ['p','code']],
  ['fenced code', '```js\nconst a = "<img onerror=evil()>";\n```', ['pre','code','button']],
  ['tilde fence', '~~~python\nprint(1)\n~~~', ['pre','code']],
  ['lists', '- one\n- two\n  - nested\n\n3. three\n4. four', ['ul','ul','ol','li','li','li','li','li']],
  ['blockquote', '> quote\n> **bold**', ['blockquote','strong']],
  ['table', '| A | B |\n| --- | :---: |\n| a | b |', ['table','thead','tbody','th','th','td','td']],
  ['horizontal rules', 'text\n\n---\n***\n___', ['hr','hr','hr']],
  ['links', '[web](https://example.com) [mail](mailto:test@example.com)', ['a','a']]
];
for (const [name, source, tags] of cases) test('Markdown renders ' + name, () => {
  const view = dom(); renderMarkdown(view.document, view.root, source);
  const counts = tag => view.created.filter(node => node.tag === tag).length;
  for (const tag of new Set(tags)) assert.equal(counts(tag), tags.filter(item => item === tag).length, tag);
});

test('Markdown code copy and links send click-only messages', () => {
  const view = dom(), sent = [];
  renderMarkdown(view.document, view.root, '```js\nlet x = 1;\n```\n[link](https://example.com)', {post:event => sent.push(event), copyLabel:'Копировать'});
  assert.equal(sent.length, 0);
  const button = view.created.find(node => node.tag === 'button');
  assert.equal(button.textContent, 'Копировать'); button.listeners.click();
  assert.deepEqual(sent[0], {type:'copyCode',text:'let x = 1;'});
  let prevented = false;
  view.created.find(node => node.tag === 'a').listeners.click({preventDefault() { prevented = true; }});
  assert.equal(prevented, true);
  assert.deepEqual(sent[1], {type:'openExternal',url:'https://example.com/'});
});

test('Markdown drops raw HTML, event attributes, executable links and remote images', () => {
  const view = dom();
  renderMarkdown(view.document, view.root, '<script>alert(1)</script><iframe src=https://evil.test></iframe><img src=x onerror=evil()>\n[b](javascript:alert) [c](data:text/html,evil) [d](command:workbench.action) [e](file:///etc/passwd) [f](vscode:evil) ![alt](https://evil.test/track)');
  assert.ok(!view.created.some(node => ['script','iframe','img','a'].includes(node.tag)));
  for (const node of view.created) assert.equal(Object.keys(node.attributes).length, 0);
  assert.doesNotMatch(text(view.root), /<script|<iframe|onerror|javascript:|https:\/\/evil/);
  assert.match(text(view.root), /alt/);
});

test('URL validation rejects hidden schemes and accepts only the three allowed protocols', () => {
  for (const value of ['javascript:evil','java\nscript:evil','\thttps://example.com','//example.com','https://example.com/\u0000','data:text/html,abc', false, {}, 'https://' + 'a'.repeat(3000)]) assert.equal(safeExternalUrl(value), null);
  for (const value of ['https://example.com','http://localhost:80/','mailto:test@example.com']) assert.ok(safeExternalUrl(value));
});

test('Markdown bounds long input, many nodes and recursive quotes', {timeout:5000}, () => {
  for (const input of ['x'.repeat(2000000), '`'.repeat(200000), '['.repeat(200000), '*a* '.repeat(50000), '> '.repeat(100) + 'deep', 'line\n'.repeat(10000)]) {
    const view = dom(); renderMarkdown(view.document, view.root, input);
    assert.ok(view.created.length <= 8002);
    assert.ok(text(view.root).length <= 121000);
    if (input.length > 120000 || input.split('\n').length > 4000) assert.match(text(view.root), /truncated/);
  }
});
