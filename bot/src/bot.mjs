/** Self-hosted, read-only customer BotFather preview. No shell, model or Tvijo API access. */
import os from 'node:os';
import { statfsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const TOKEN_RE = /^\d{5,15}:[A-Za-z0-9_-]{20,}$/;
const ID_RE = /^\d{1,20}$/;
const MAX_ERRORS = 3;

export function configFrom(env, pair = false) {
  const token = String(env.DSHREM_BOT_TOKEN || '').trim();
  const ownerId = String(env.DSHREM_BOT_OWNER_ID || '').trim();
  if (!TOKEN_RE.test(token)) throw new Error('bot_token_missing_or_invalid');
  if (!pair && !ID_RE.test(ownerId)) throw new Error('owner_id_required');
  return { token, ownerId, pair };
}

export function readOnlyStatus({ system = os, disk = statfsSync } = {}) {
  const uptimeHours = (system.uptime() / 3600).toFixed(1);
  const load = system.loadavg()[0].toFixed(2);
  let diskText = 'unavailable';
  try {
    const stat = disk('/');
    diskText = `${(Number(stat.bavail) * Number(stat.bsize) / (1024 ** 3)).toFixed(1)} GiB free`;
  } catch { /* Never fail open to commands; status can be partial. */ }
  return `DSHREMBOT local preview\nHost: ${system.hostname()}\nUptime: ${uptimeHours} h\nLoad 1m: ${load}\nDisk /: ${diskText}\nMode: read-only. No server commands, agents or paid calls.`;
}

export function replyFor(update, { ownerId, pair, status = readOnlyStatus } = {}) {
  const message = update?.message;
  const chat = message?.chat;
  const from = message?.from;
  if (!message || chat?.type !== 'private' || !ID_RE.test(String(chat?.id ?? ''))
      || !ID_RE.test(String(from?.id ?? '')) || String(chat.id) !== String(from.id)) return null;
  const raw = String(message.text || '').trim();
  const command = raw.match(/^\/(\w+)(?:@\w+)?(?:\s|$)/)?.[1]?.toLowerCase() || '';
  if (pair) return command === 'id' ? { chatId: chat.id, text: `Your Telegram ID: ${from.id}\nSet DSHREM_BOT_OWNER_ID locally, then start normal mode. Do not send your token here.`, done: true } : null;
  if (String(from.id) !== String(ownerId)) return null;
  if (command === 'status') return { chatId: chat.id, text: status(), done: false };
  if (command === 'start' || command === 'help') return { chatId: chat.id, text: 'DSHREMBOT local preview\n/status — read-only host status\n/help — commands\nNo shell, agent execution, model spending or remote server control.', done: false };
  return null;
}

export async function telegramRequest({ token, method, payload, fetchImpl = fetch }) {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(35000),
  });
  if (!response.ok) throw new Error(`telegram_http_${response.status}`);
  const data = await response.json();
  if (!data?.ok) throw new Error('telegram_api_rejected');
  return data.result;
}

export async function run({ token, ownerId, pair, api = telegramRequest, now = Date.now,
                            sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
                            log = console.error } = {}) {
  let offset = 0;
  let failures = 0;
  const pairExpires = now() + 5 * 60_000;
  while (!pair || now() < pairExpires) {
    let updates;
    try {
      updates = await api({ token, method: 'getUpdates', payload: {
        offset, timeout: 25, limit: 20, allowed_updates: ['message'] } });
      failures = 0;
    } catch (error) {
      // Telegram token and response bodies must never enter logs.
      const kind = /^telegram_http_\d{3}$/.test(error?.message || '') ? error.message : 'telegram_unavailable';
      log(`DSHREMBOT: ${kind}`);
      if (kind === 'telegram_http_409' || ++failures >= MAX_ERRORS) return 2;
      await sleep(Math.min(5000 * (2 ** (failures - 1)), 20000));
      continue;
    }
    if (!Array.isArray(updates)) return 2;
    for (const update of updates) {
      if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0) continue;
      offset = Math.max(offset, update.update_id + 1);
      const reply = replyFor(update, { ownerId, pair });
      if (!reply) continue;
      try {
        await api({ token, method: 'sendMessage', payload: {
          chat_id: reply.chatId, text: reply.text, disable_web_page_preview: true } });
      } catch (error) {
        log(`DSHREMBOT: ${/^telegram_http_\d{3}$/.test(error?.message || '') ? error.message : 'telegram_send_failed'}`);
        return 2;
      }
      if (reply.done) return 0;
    }
  }
  log('DSHREMBOT: pairing_timeout');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = configFrom(process.env, process.argv.includes('--pair'));
    process.exitCode = await run(config);
  } catch (error) {
    console.error(`DSHREMBOT: ${error?.message === 'owner_id_required' ? 'owner_id_required' : 'bot_token_missing_or_invalid'}`);
    process.exitCode = 2;
  }
}
