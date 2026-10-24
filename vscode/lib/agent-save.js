'use strict';

// Save exactly one agent-owned editor change. Never use saveAll or retry save
// participants: a participant/user edit makes the outcome a conflict.
const path = require('node:path');
const fs = require('node:fs');
const quickEdit = require('./quick-edit');
const {safePath, writeSnapshot, assertWriteSnapshot} = require('./local-tools');
function conflict(message, code = 'agent_save_conflict') {
  return Object.assign(new Error(message), {code, stopAgent:true});
}
function assertDocument(document, absolute, content, version, clean = false) {
  if (!document || document.isClosed || document.uri?.scheme !== 'file' || document.uri.authority ||
      path.resolve(document.uri.fsPath) !== absolute || !Number.isInteger(version) ||
      document.version !== version || document.getText() !== content || (clean && document.isDirty !== false)) {
    throw conflict('Agent stopped: the file has unsaved or concurrent editor changes. Review the buffer before trying again.');
  }
}
function assertClean(document, absolute, previous) {
  assertDocument(document,absolute,previous,document?.version,true);
}
function normalizeEditorText(content, eol) {
  return content.replace(/\r\n|\r|\n/g,eol);
}
function editorEol(vscode, document, absolute) {
  if (document?.eol === 1) return '\n';
  if (document?.eol === 2) return '\r\n';
  const configured = vscode.workspace.getConfiguration('files',vscode.Uri.file(absolute)).get('eol','auto');
  return configured === '\n' || configured === '\r\n' ? configured : require('node:os').EOL;
}
function directoryIdentity(directory) {
  const stat = fs.statSync(directory,{bigint:true});
  return String(stat.dev) + ':' + String(stat.ino);
}
function verifySaved(root, owned) {
  assertDocument(owned.document,owned.absolute,owned.content,owned.version,true);
  try {
    assertWriteSnapshot(root,owned.absolute,owned.content,owned.diskIdentity);
    if (directoryIdentity(path.dirname(owned.absolute)) !== owned.parentIdentity) throw Error('Parent changed');
  } catch { throw conflict('Agent stopped: the saved file or its directory changed. No further checks were run.'); }
}
async function applySavedWrite({vscode,root,absolute,previous,content,diskIdentity,document,version,guard,signal,checkpoint,beforeApply}) {
  const creating = previous === null;
  const check = async () => {
    await guard();
    if (signal?.aborted) throw conflict('Agent stopped before saving. Review any remaining editor changes.','agent_stopped');
  };
  try {
    await check();
    safePath(root,absolute,true);
    assertWriteSnapshot(root,absolute,previous,diskIdentity);
    if (previous === null) {
      // A missing disk file can still have an existing dirty editor. Do not
      // mistake that editor for a newly-created agent-owned document.
      if ((vscode.workspace.textDocuments || []).some(doc=>doc.uri?.scheme==='file' && path.resolve(doc.uri.fsPath)===absolute)) throw conflict('Agent stopped: an editor already owns the new file path. Save or close it before trying again.');
      // Predict the empty document's configured EOL before recording its expected after-hash.
      content = normalizeEditorText(content,editorEol(vscode,null,absolute));
      checkpoint({absolute,content});
      await check();
      assertWriteSnapshot(root,absolute,null,null);
      const edit = new vscode.WorkspaceEdit();
      edit.createFile(vscode.Uri.file(absolute),{overwrite:false,ignoreIfExists:false});
      if (!await vscode.workspace.applyEdit(edit)) throw conflict('Agent stopped: the editor refused to create the file.');
      await check();
      document = await vscode.workspace.openTextDocument(vscode.Uri.file(absolute));
      await check();
      assertClean(document,absolute,'');
      const created = writeSnapshot(root,absolute);
      if (created.content !== '') throw conflict('Agent stopped: the new file changed during creation.');
      previous = ''; diskIdentity = created.identity; version = document.version;
    }
    await check();
    assertDocument(document,absolute,previous,version,true);
    assertWriteSnapshot(root,absolute,previous,diskIdentity);
    const editorContent = normalizeEditorText(content,editorEol(vscode,document,absolute));
    if (creating && editorContent !== content) throw conflict('Agent stopped: the new document line-ending configuration changed during creation.');
    content = editorContent;
    const parentIdentity = directoryIdentity(path.dirname(absolute));
    beforeApply(document);
    if (content !== previous) {
      await quickEdit.apply(vscode,document,content,() => {
        if (signal?.aborted) throw conflict('Agent stopped before applying the edit.','agent_stopped');
        assertDocument(document,absolute,previous,version,true);
        assertWriteSnapshot(root,absolute,previous,diskIdentity);
        // New files were checkpointed while absent, before createFile.
        if (!creating) checkpoint({absolute,content,document});
        assertDocument(document,absolute,previous,version,true);
        assertWriteSnapshot(root,absolute,previous,diskIdentity);
      });
      version++;
    }
    await check();
    assertDocument(document,absolute,content,version);
    if (directoryIdentity(path.dirname(absolute)) !== parentIdentity) throw conflict('Agent stopped: the parent directory changed before saving.');
    // The editor may already have auto-saved this exact version. Otherwise the
    // old disk identity must still match immediately before document.save().
    if (document.isDirty === false) {
      if (writeSnapshot(root,absolute).content !== content) throw conflict('Agent stopped: the editor and disk disagree after applying the edit.');
    } else {
      assertWriteSnapshot(root,absolute,previous,diskIdentity);
      if (typeof document.save !== 'function') throw conflict('Agent stopped: saving this editor is unavailable.','agent_save_failed');
      let saved;
      try { saved = await document.save(); }
      catch { throw conflict('Agent stopped: saving failed. The buffer may remain changed; disk checks were not run.','agent_save_failed'); }
      await check();
      if (saved !== true) throw conflict('Agent stopped: the editor did not save the file. Review the buffer; disk checks were not run.','agent_save_failed');
    }
    assertDocument(document,absolute,content,version,true);
    const saved = writeSnapshot(root,absolute);
    if (saved.content !== content) throw conflict('Agent stopped: disk content does not match the agent edit after saving.');
    const owned = {document,absolute,content,version,diskIdentity:saved.identity,parentIdentity};
    verifySaved(root,owned);
    return owned;
  } catch (error) {
    // Do not let the model continue to read/test the old disk or claim success.
    error.stopAgent = true;
    if (!error.code || !String(error.code).startsWith('agent_')) {
      const wrapped = conflict('Agent stopped before a verified save: ' + error.message);
      throw wrapped;
    }
    throw error;
  }
}
module.exports = {applySavedWrite,assertClean,verifySaved};
