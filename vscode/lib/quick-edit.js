'use strict';

// One-file quick edit. The selected model returns the complete revised file
// inside an explicit envelope; nothing is written until the user sees a diff
// and confirms. This is deliberately not a shell-capable agent.

const MAX_FILE_BYTES = 128 * 1024;

function instruction(path, language) {
  return [
    'You are editing exactly one file.',
    'File: ' + path + (language ? ' (' + language + ')' : ''),
    'Return the COMPLETE revised file, not a diff and not commentary.',
    'Preserve unrelated code, formatting and line endings unless the instruction requires a change.',
    'Do not invent imports, dependencies or files that were not provided.',
    'Wrap the result exactly as:',
    '<<<FILE>>>',
    '<complete file content>',
    '<<<END>>>'
  ].join('\n');
}

function parse(answer) {
  const text = typeof answer === 'string' ? answer : '';
  const match = text.match(/<<<FILE>>>\s*\n([\s\S]*?)\n?\s*<<<END>>>/);
  if (!match) return null;
  let content = match[1];
  // Some providers wrap the envelope in a fenced block or add a trailing fence.
  content = content.replace(/^```[^\n]*\n/, '').replace(/\n```\s*$/, '');
  if (!content.trim()) return null;
  if (content.includes('\u0000')) return null;
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) return null;
  return content;
}

function same(original, proposed) {
  return String(original).replace(/\r\n/g, '\n') === String(proposed).replace(/\r\n/g, '\n');
}

async function preview(vscode, document, proposed, title) {
  const proposedDocument = await vscode.workspace.openTextDocument({ content: proposed, language: document.languageId });
  await vscode.commands.executeCommand('vscode.diff', document.uri, proposedDocument.uri, title || ('Tvijo edit: ' + document.fileName.split(/[\\/]/).pop()));
  return proposedDocument;
}

async function apply(vscode, document, proposed) {
  const end = document.positionAt(document.getText().length);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(new vscode.Position(0, 0), end), proposed);
  const ok = await vscode.workspace.applyEdit(edit);
  if (!ok) throw new Error('The editor refused the workspace edit.');
  return ok;
}

module.exports = { instruction, parse, same, preview, apply, MAX_FILE_BYTES };
