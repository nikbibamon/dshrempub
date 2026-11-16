'use strict';
function buildCommit(){try{const value=require('../BUILD_INFO.json').commit;return typeof value==='string'&&/^[a-f0-9]{40}$/.test(value)?value:'unknown';}catch{return 'unknown';}}
module.exports={buildCommit};
