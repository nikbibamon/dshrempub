'use strict';

// The endpoint contract is deliberately narrow. An absent or malformed response
// produces no inferred preferences; only explicit server states are displayed.
const PURPOSES = ['history', 'security', 'improve', 'training', 'stats', 'showcase', 'email'];
const STATES = new Set(['on', 'off', 'ask', 'always', 'never', 'unknown']);
const unknownPreferences = () => PURPOSES.map(purpose => ({ purpose, state: 'unknown' }));

function parsePreferences(response) {
  if (!response || response.schema !== 'tvijo.data-preferences.v1' || !Array.isArray(response.preferences)) {
    return { valid: false, preferences: unknownPreferences() };
  }
  const seen = new Set();
  const preferences = [];
  let malformed = false;
  for (const item of response.preferences) {
    if (!item || !PURPOSES.includes(item.purpose)) {
      malformed = true;
      continue;
    }
    if (!STATES.has(item.state) || seen.has(item.purpose)) malformed = true;
    seen.add(item.purpose);
    preferences.push({ purpose: item.purpose, state: STATES.has(item.state) ? item.state : 'unknown' });
  }
  if (seen.size !== PURPOSES.length) malformed = true;
  return { valid: !malformed, preferences: malformed ? unknownPreferences() : PURPOSES.map(purpose => preferences.find(item => item.purpose === purpose)) };
}

module.exports = { parsePreferences, unknownPreferences, PURPOSES };
