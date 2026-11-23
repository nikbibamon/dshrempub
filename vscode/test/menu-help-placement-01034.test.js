'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {helpPlacement} = require('../lib/menu-help');
const {sidebar} = require('./helpers/sidebar');

const GAP = 8;
const overlaps = (top, height, rect) => top < rect.bottom && top + height > rect.top;

test('0.10.34 help for a menu item sits above the open menu instead of covering other choices', () => {
  // Geometry measured on the 0.10.33 panel at 420×820: the permission menu and its ExtraFullAccess item.
  const viewport = {width:420, height:820};
  const menu = {top:350, bottom:754, left:12, right:408};
  const extra = {top:607, bottom:668, left:20, right:400};
  const box = {width:380, height:187};
  const before = extra.top - box.height - GAP; // 0.10.33 placed the help directly above the item
  assert.ok(overlaps(before, box.height, menu), '0.10.33 covered the items above the hovered one');
  const place = helpPlacement(extra, menu, box, viewport);
  assert.equal(place.maxHeight, null);
  assert.equal(place.top + box.height, menu.top - GAP);
  assert.ok(!overlaps(place.top, box.height, menu));
});

test('0.10.34 on a short panel long help scrolls in the free space and still leaves the menu visible', () => {
  const viewport = {width:420, height:560};
  const menu = {top:131, bottom:495, left:12, right:408};
  const item = {top:300, bottom:340, left:20, right:400};
  const place = helpPlacement(item, menu, {width:380, height:187}, viewport);
  assert.equal(place.top, GAP);
  assert.equal(place.maxHeight, menu.top - 2 * GAP);
  assert.ok(!overlaps(place.top, place.maxHeight, menu));
});

test('0.10.34 help for an ordinary control keeps its 0.10.33 position next to the control', () => {
  const control = {top:700, bottom:730, left:12, right:42};
  const box = {width:300, height:120};
  assert.deepEqual(helpPlacement(control, null, box, {width:720, height:850}), {top:572, left:12, maxHeight:null});
  // Without room above the control the help opens below it, and it never leaves the viewport.
  const top = helpPlacement({top:20, bottom:50, left:700, right:720}, null, box, {width:720, height:850});
  assert.equal(top.top, 58); assert.equal(top.left, 720 - 300 - GAP);
  // A menu filling a tiny panel leaves no free space: the help falls back to the viewport edge.
  const tiny = helpPlacement({top:40, bottom:70, left:12, right:42}, {top:30, bottom:110, left:0, right:300}, {width:280, height:200}, {width:300, height:150});
  assert.deepEqual(tiny, {top:GAP, left:12, maxHeight:null});
});

test('0.10.34 the webview uses the menu bounds when it shows mode help', () => {
  const view = sidebar({}, {fullAccess:{available:true,enabled:true,extra:false,reviews:false},options:{agentPreset:'full'}});
  const menu = view.element('mode-menu');
  menu.hidden = false;
  menu.getBoundingClientRect = () => ({top:380, bottom:785, left:12, right:708, width:696, height:405});
  const item = menu.children.find(node => node.getAttribute('data-mode') === 'extra');
  item.getBoundingClientRect = () => ({top:637, bottom:698, left:20, right:700, width:680, height:61});
  item.closest = selector => selector === '[data-help]' ? item : selector.includes('#mode-menu') ? menu : null;
  const tip = view.element('menu-tooltip');
  tip.getBoundingClientRect = () => ({top:0, bottom:187, left:0, right:380, width:380, height:187});
  view.emit('body:pointerover', {target:item});
  assert.equal(tip.hidden, false);
  assert.equal(tip.textContent, item.getAttribute('data-help'));
  assert.equal(tip.style.top, (380 - 187 - GAP) + 'px', 'the help ends above the menu');
  assert.equal(tip.style.maxHeight, '');
});
