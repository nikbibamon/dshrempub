'use strict';

const MAX_SOURCE_BYTES = 128 * 1024;

function linesOf(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_SOURCE_BYTES || value.includes('\r') && /\r(?!\n)/.test(value)) return null;
  const lines = [];
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== '\n') continue;
    const crlf = i > start && value[i - 1] === '\r';
    lines.push({ start, bodyEnd: crlf ? i - 1 : i, end: i + 1, eol: crlf ? '\r\n' : '\n' });
    start = i + 1;
  }
  if (start < value.length || !lines.length) lines.push({ start, bodyEnd: value.length, end: value.length, eol: '' });
  return lines;
}

function body(value, line) { return value.slice(line.start, line.bodyEnd); }
function trimTrailing(text) { return text.replace(/[ \t]+$/g, ''); }
function trimIndent(text) { return text.replace(/^[ \t]+/, ''); }
function isBlank(text) { return /^[ \t]*$/.test(text); }
// KMP avoids repeated rescanning of long, repetitive anchors on the host thread.
function matchingBlocks(source, anchor, visit) {
  const prefix = new Array(anchor.length).fill(0);
  for (let i = 1, n = 0; i < anchor.length; i++) {
    while (n && anchor[i] !== anchor[n]) n = prefix[n - 1];
    if (anchor[i] === anchor[n]) n++;
    prefix[i] = n;
  }
  for (let i = 0, n = 0; i < source.length; i++) {
    while (n && source[i] !== anchor[n]) n = prefix[n - 1];
    if (source[i] === anchor[n]) n++;
    if (n === anchor.length) {
      if (visit(i - n + 1) === false) return;
      n = prefix[n - 1];
    }
  }
}

function findTrailingWhitespaceMatch(previous, old) {
  const src = linesOf(previous), anchor = linesOf(old);
  if (!src || !anchor || !old || anchor.every(x => isBlank(body(old, x)))) return { match: null };
  const hasNewline = old.endsWith('\n');
  const count = anchor.length;
  const eols = anchor.map(line => line.eol).filter(Boolean), style = eols[0] || '';
  if (eols.some(eol => eol !== style)) return { match:null };
  const wrongEol = [0];
  for (const line of src) wrongEol.push(wrongEol.at(-1) + (line.eol === style ? 0 : 1));
  const sourceBodies = src.map(line => body(previous,line)), anchorBodies = anchor.map(line => body(old,line));
  const unchanged = new Set();
  matchingBlocks(sourceBodies,anchorBodies,i => { unchanged.add(i); });
  const matches = [];
  matchingBlocks(sourceBodies.map(trimTrailing), anchorBodies.map(trimTrailing), i => {
    if (unchanged.has(i)) return;
    const consumedLines = count - (hasNewline ? 0 : 1);
    if (wrongEol[i + consumedLines] !== wrongEol[i]) return;
    const last = src[i + count - 1];
    const end = hasNewline ? last.end : last.bodyEnd;
    matches.push({ start: src[i].start, end });
    if (matches.length > 1) return false;
  });
  if (matches.length > 1) return { ambiguous:true };
  return matches.length ? { match: matches[0] } : { match: null };
}

function indentationHint(previous, old) {
  const src = linesOf(previous), anchor = linesOf(old);
  if (!src || !anchor || !old || anchor.length > 40 || anchor.every(x => isBlank(body(old, x)))) return null;
  const anchorLines = anchor.map(x => body(old, x));
  const matches = [];
  outer: for (let i = 0; i + anchor.length <= src.length; i++) {
    let differs = false;
    for (let j = 0; j < anchor.length; j++) {
      const a = anchorLines[j], b = body(previous, src[i + j]);
      if (trimTrailing(trimIndent(a)) !== trimTrailing(trimIndent(b))) continue outer;
      if (a.match(/^[ \t]*/)[0] !== b.match(/^[ \t]*/)[0]) differs = true;
    }
    const first = src[i], last = src[i + anchor.length - 1];
    const text = previous.slice(first.start, last.end);
    matches.push({ text, startLine: i + 1, endLine: i + anchor.length, differs });
    if (matches.length > 1) return null;
  }
  if (!matches.length || !matches[0].differs || Buffer.byteLength(matches[0].text, 'utf8') > 4096) return null;
  const { differs, ...hint } = matches[0];
  return hint;
}

module.exports = { findTrailingWhitespaceMatch, indentationHint };
