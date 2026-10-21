'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePreferences, PURPOSES, unknownPreferences } = require('../lib/data-privacy');

test('preference parser accepts explicit server states only', () => {
  const preferences = PURPOSES.map(purpose => ({purpose,state:purpose === 'history' ? 'always' : 'off'}));
  assert.deepEqual(parsePreferences({schema:'tvijo.data-preferences.v1',preferences}), {valid:true,preferences});
});

test('missing, malformed, duplicate or guessed preference states remain wholly unknown', () => {
  const base = {schema:'tvijo.data-preferences.v1',preferences:PURPOSES.map(purpose => ({purpose,state:'off'}))};
  for (const value of [null, {}, {preferences:null}, {...base,schema:'old'}, {...base,preferences:base.preferences.slice(1)}, {...base,preferences:[...base.preferences,base.preferences[0]]}, {...base,preferences:base.preferences.map((item,i)=>i ? item : {...item,state:true})}]) {
    assert.deepEqual(parsePreferences(value), {valid:false,preferences:unknownPreferences()});
  }
});
