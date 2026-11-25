'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { prepareAttachment, questionWithAttachments, checkAttachmentSet, imageInfo } = require('../lib/attachments');
const { ACTIONS, slashAction, fileReference } = require('../lib/actions');
const manifest = require('../package.json');

function pngHeader(width, height) {
  const data = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(data);
  data.write('IHDR', 12); data.writeUInt32BE(width, 16); data.writeUInt32BE(height, 20);
  return data;
}

test('image attachment uses bounded local OCR and never sends base64 in model context', async () => {
  const bytes = pngHeader(640, 480);
  let called = 0;
  const attachment = await prepareAttachment('screen.png', bytes, { ocr: async (input) => { assert.deepEqual(input, bytes); called++; return 'Error: connection refused'; } });
  assert.equal(called, 1);
  assert.equal(attachment.kind, 'image');
  assert.ok(attachment.preview.startsWith('data:image/png;base64,'));
  const context = questionWithAttachments('Explain this error', [attachment]);
  assert.match(context, /Error: connection refused/);
  assert.match(context, /the image itself was not seen/);
  assert.ok(!context.includes(attachment.preview));
});

test('a logo without OCR text sends the bounded grayscale sketch as text', async () => {
  const bytes = pngHeader(640, 480);
  const sketch = '   9 9\n  99999';
  const attachment = await prepareAttachment('logo.png', bytes, {
    ocr: async () => '',
    layout: async (input, info) => {
      assert.deepEqual(input, bytes);
      assert.deepEqual(info, { mime:'image/png', width:640, height:480 });
      return sketch;
    }
  });
  const question = questionWithAttachments('Describe the logo', [attachment]);
  assert.match(question, /Grayscale thumbnail/);
  assert.ok(question.includes(sketch));
  assert.ok(!question.includes(attachment.preview));
  assert.equal(require('../lib/attachments').attachmentSummary(attachment).layout, true);
  assert.throws(() => checkAttachmentSet([{...attachment, text:'x'.repeat(80 * 1024)}]), {code:'attachment_context'});
  await assert.rejects(prepareAttachment('secret.png', bytes, {
    ocr: async () => 'api_key=example-secret-value',
    layout: async () => sketch
  }), {code:'attachment_refused'});
});

test('large image dimensions, empty OCR and credential text are refused before a task', async () => {
  let called = false;
  await assert.rejects(prepareAttachment('huge.png', pngHeader(10000, 10000), { ocr: async () => { called = true; return 'x'; } }), { code: 'image_dimensions' });
  assert.equal(called, false);
  await assert.rejects(prepareAttachment('empty.png', pngHeader(2, 2), { ocr: async () => '' }), { code: 'image_no_text' });
  await assert.rejects(prepareAttachment('secret.png', pngHeader(2, 2), { ocr: async () => 'api_key=example-secret-value' }), { code: 'attachment_refused' });
  await assert.rejects(prepareAttachment('.env', Buffer.from('SAFE=still-not-allowed')), { code: 'attachment_refused' });
});

test('text attachments reject binary content and escape their data fence', async () => {
  await assert.rejects(prepareAttachment('file.bin', Buffer.from([0, 1, 2])), { code: 'attachment_refused' });
  await assert.rejects(prepareAttachment('fake.jpg', Buffer.from('not a JPEG')), { code: 'image_format' });
  const attachment = await prepareAttachment('example.js', Buffer.from('~~~~\nquoted data'));
  const context = questionWithAttachments('Review', [attachment]);
  assert.match(context, /\n~~~~~\n~~~~\nquoted data\n~~~~~/);
  assert.throws(() => checkAttachmentSet(Array.from({ length: 5 }, () => attachment)), { code: 'attachment_count' });
  assert.equal(imageInfo(Buffer.from('short')), null);
});

test('slash commands are explicit, bounded and declared in the manifest', () => {
  assert.equal(slashAction('Explain this code'), null);
  assert.deepEqual(slashAction('/attach "folder/screen shot.png"'), { command: 'tvijo.attachFile', argument: '"folder/screen shot.png"' });
  assert.equal(slashAction('/unknown').command, null);
  const declared = new Set(manifest.contributes.commands.map((item) => item.command));
  for (const [id] of ACTIONS) assert.ok(declared.has(id), id);
  assert.equal(fileReference('/workspace/design/screen shot.jpg'), '/workspace/design/screen shot.jpg');
  assert.equal(fileReference('[screenshot](</workspace/screen shot.png>)'), '/workspace/screen shot.png');
  assert.equal(fileReference('file:///workspace/screen%20shot.png'), '/workspace/screen shot.png');
  assert.equal(fileReference('https://example.com/image.png'), null);
  assert.equal(fileReference('Explain src/example.js'), null);
  assert.equal(fileReference('/status'), null);
  assert.equal(fileReference('/attach src/example.js'), null);
});


test('decoded non-text image is attachable and produces one bounded RGB PNG stripped of metadata', async t => {
  if (spawnSync('ffmpeg', ['-version']).error?.code === 'ENOENT') return t.skip('FFmpeg is not installed');
  const jpeg = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=blue:s=32x32',
    '-frames:v', '1', '-c:v', 'mjpeg', '-threads', '1', '-f', 'image2pipe', 'pipe:1']).stdout;
  const metadata = Buffer.from('Exif\0\0PRIVATE_SOURCE_MARKER');
  const app1 = Buffer.from([0xff, 0xe1, 0, metadata.length + 2]);
  const pixels = Buffer.concat([jpeg.subarray(0, 2), app1, metadata, jpeg.subarray(2)]);
  const item = await prepareAttachment('private-name.jpg', pixels, { ocr: async () => '', layout: async () => '' });
  assert.equal(item.text, '');
  assert.ok(item.frame);
  assert.deepEqual(imageInfo(item.frame), { mime: 'image/png', width:32, height:32 });
  assert.equal(item.frame[25], 2, 'PNG color type is RGB');
  assert.equal(item.frame.includes(metadata), false);
  const decoded = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'image2pipe', '-i', 'pipe:0',
    '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { input:item.frame }).stdout;
  assert.equal(decoded.length, 32 * 32 * 3);
  assert.ok(decoded[2] > 220 && decoded[0] < 20 && decoded[1] < 20, 'Blue survives normalization');
  assert.deepEqual(Object.keys(require('../lib/attachments').attachmentSummary(item)).includes('frame'), false);
  const content = questionWithAttachments('Describe the image', [item], { served_model:'gpt-6.2-sol', image_sha256:'synthetic', observation:'<script>\nVisible text' });
  assert.match(content, /quoted untrusted data/);
  assert.match(content, /"observation":"<script>\\nVisible text"/);
  assert.doesNotMatch(content, /data:image/);
});
