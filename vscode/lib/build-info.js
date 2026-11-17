'use strict';
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');

function buildCommit(){try{const value=require('../BUILD_INFO.json').commit;return typeof value==='string'&&/^[a-f0-9]{40}$/.test(value)?value:'unknown';}catch{return 'unknown';}}

// VS Code can retire an installed directory while its old extension host still runs.
async function runningPackageMarkedObsolete(extensionPath) {
  const directory = path.basename(extensionPath).toLowerCase();
  if (!/^tvijo\.tvijo-dshrem-\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/.test(directory)) return null;
  let file;
  try {
    const marker = path.join(path.dirname(extensionPath), '.obsolete');
    file = await fs.open(marker, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 256 * 1024) return null;
    const buffer = Buffer.alloc(stat.size + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== stat.size) return null;
    const entries = JSON.parse(buffer.toString('utf8', 0, bytesRead));
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return null;
    if (!Object.hasOwn(entries, directory)) return false;
    return typeof entries[directory] === 'boolean' ? entries[directory] : null;
  } catch (error) {
    return error.code === 'ENOENT' ? false : null;
  } finally {
    if (file) await file.close().catch(() => {});
  }
}

module.exports = { buildCommit, runningPackageMarkedObsolete };
