'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');

// The catalogue, including its private instructions, lives only in host memory.
// Cache failures as well: an older/offline service must stay quiet for the session.
function createPackCache() {
  let entry = null;
  return {
    clear() { entry = null; },
    async get(auth, client) {
      if (!auth?.access_token) return [];
      if (!entry || entry.base !== auth.api_base || entry.token !== auth.access_token) {
        entry = { base: auth.api_base, token: auth.access_token, promise: null };
        entry.promise = Promise.resolve().then(() => client.request('/packs', { token: auth.access_token, timeoutMs: 5000 }))
          .then(validateCatalogue).catch(() => []);
      }
      return entry.promise;
    }
  };
}

function validateCatalogue(value) {
  if (value?.schema !== 'tvijo.skill_packs/v1' || !Array.isArray(value.packs)) return [];
  const ids = new Set();
  const localized = value => value && ['en', 'ru'].every(key => typeof value[key] === 'string' && value[key].trim());
  return value.packs.filter(pack => {
    if (!pack || typeof pack.id !== 'string' || !/^[a-z0-9_-]+$/i.test(pack.id) || ids.has(pack.id) ||
        !localized(pack.title) || !localized(pack.summary) || typeof pack.model !== 'string' || !pack.model.trim() ||
        typeof pack.instructions !== 'string' || !pack.instructions.trim() ||
        !Array.isArray(pack.markers) || !pack.markers.every(marker => typeof marker === 'string') ||
        !pack.checklist || !['en', 'ru'].every(key => Array.isArray(pack.checklist[key]) && pack.checklist[key].every(item => typeof item === 'string'))) return false;
    ids.add(pack.id); return true;
  });
}

async function selectPack(packs, configured, root, stat = fs.stat) {
  if (configured) return { pack: packs.find(pack => pack.id === configured) || null, auto: false };
  if (root) {
    for (const pack of packs) {
      for (const marker of pack.markers) {
        // Literal root filenames only; no globs, traversal or recursive reads.
        if (!marker || marker === '.' || marker === '..' || /[/\\\0]/.test(marker)) continue;
        try { if ((await stat(path.join(root, marker))).isFile()) return { pack, auto: true }; }
        catch { /* Missing or inaccessible marker. */ }
      }
    }
  }
  return { pack: packs.find(pack => pack.id === 'engineer') || null, auto: true };
}

function packLabel(selection, locale = 'en') {
  const title = selection?.pack?.title[locale === 'ru' ? 'ru' : 'en'];
  return title ? (selection.auto ? (locale === 'ru' ? 'авто: ' : 'auto: ') : '') + title : '';
}

function publicSelection(selection, locale) {
  return selection?.pack ? { label: packLabel(selection, locale), summary: selection.pack.summary[locale === 'ru' ? 'ru' : 'en'] } : null;
}

function packMessages(messages, pack) {
  if (!pack) return messages;
  // Agent tool rules and finalization rules remain in the same system message.
  // The caller retains its original history; no private pack text is persisted.
  const rules = messages.filter(item => item.role === 'system').map(item => item.content);
  return [{ role: 'system', content: [pack.instructions, ...rules].join('\n\n') }, ...messages.filter(item => item.role !== 'system')];
}

function packModel(config, key, fallback, pack) {
  const inspected = config.inspect?.(key);
  const explicit = inspected
    ? ['globalValue', 'workspaceValue', 'workspaceFolderValue', 'globalLanguageValue', 'workspaceLanguageValue', 'workspaceFolderLanguageValue'].some(scope => inspected[scope] !== undefined)
    : config.get(key) !== undefined;
  return explicit ? config.get(key, fallback) : (pack?.model || config.get(key, fallback));
}

function dailySpend(account) {
  const value = account?.budget?.daily_spent_usd;
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function statusText(selection, account, locale) {
  const amount = dailySpend(account);
  const spend = amount === null ? '—' : amount > 0 && amount < 0.000001 ? '<$0.000001' : '$' + amount.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  return 'Tvijo · ' + (packLabel(selection, locale) || (locale === 'ru' ? 'Выбрать пакет' : 'Choose pack')) + ' · ' + spend;
}

module.exports = { createPackCache, selectPack, packLabel, publicSelection, packMessages, packModel, dailySpend, statusText };
