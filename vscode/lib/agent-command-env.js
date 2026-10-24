'use strict';
// Children inherit these Git settings, including Python/npm/gh invoking Git.
// This is an inherited policy, not an OS sandbox against programs clearing env.
function blockGitPush(environment = {}) {
  const env = {...environment};
  const raw = env.GIT_CONFIG_COUNT ?? '0';
  if (!/^(?:0|[1-9]\d*)$/.test(raw) || Number(raw) > 10000) throw Error('Invalid inherited Git configuration count.');
  let count = Number(raw);
  for (let index=0;index<count;index++) {
    if (typeof env['GIT_CONFIG_KEY_'+index] !== 'string' || typeof env['GIT_CONFIG_VALUE_'+index] !== 'string') throw Error('Incomplete inherited Git configuration.');
  }
  const add=(key,value)=>{env['GIT_CONFIG_KEY_'+count]=key;env['GIT_CONFIG_VALUE_'+count]=value;count++;};
  // An empty prefix covers relative URLs, scp syntax, absolute and custom URLs.
  // Explicit remote.pushurl ignores pushInsteadOf. Deny transports as well so
  // that case cannot escape; fetch/clone in agent children are also disabled.
  add('url.tvijo-push-blocked:///.pushInsteadOf','');
  add('protocol.tvijo-push-blocked.allow','never');
  env.GIT_CONFIG_COUNT=String(count);
  env.GIT_ALLOW_PROTOCOL='';
  env.GIT_TERMINAL_PROMPT='0';
  return env;
}
module.exports={blockGitPush};
