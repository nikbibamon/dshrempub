'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ACTIONS, ACTION_BY_ID, PLUS_ACTIONS, slashAction } = require('../lib/actions');
const { chatHtml } = require('../lib/chat-view');

test('slice 3 actions share command identities across menu and slash registry', () => {
  const required = [
    ['tvijo.attachFile', '/attach'], ['tvijo.mentionFile', '/mention'],
    ['tvijo.attachProblems', '/problems'], ['tvijo.attachTerminal', '/terminal-output'],
    ['tvijo.newConversation', '/new'], ['tvijo.rewind', '/rewind'],
    ['tvijo.export', '/export'], ['tvijo.chooseWorkflow', '/model']
  ];
  for (const [id, command] of required) {
    assert.ok(ACTIONS.some(item => item[0] === id), id);
    assert.equal(ACTION_BY_ID[id].id, id);
    assert.equal(slashAction(command).command, id, command);
  }
  assert.deepEqual([...PLUS_ACTIONS].sort(), required.map(item => item[0]).sort());
  const html = chatHtml({ cspSource: 'vscode-resource:' });
  for (const id of ['mention-file', 'attach-problems', 'attach-terminal', 'clear-conversation', 'rewind-action', 'export-conversation', 'switch-model']) assert.match(html, new RegExp('id="' + id + '"'));
  for (const id of ['attachFile', 'mentionFile', 'attachProblems', 'attachTerminal', 'newConversation', 'rewind', 'export', 'chooseWorkflow']) assert.match(html, new RegExp('data-action-id="tvijo\\.' + id + '"'));
  assert.match(html, /for \(const button of plusMenu\.querySelectorAll\('\[data-action-id\]'\)\) button\.addEventListener/);
  assert.match(html, /role="menu" aria-label="Actions"/);
  assert.match(html, /event\.key==='Home'/);
});
