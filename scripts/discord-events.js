import { getDiscordProxyKey, isDiscordEnabled } from './discord-settings.js';

const DEFAULT_WORKER_URL = '';
const DEFAULT_HEADERS = { 'Content-Type': 'application/json' };
const RETRY_DELAY_MS = 500;

const isValidWorkerUrl = (url) =>
  typeof url === 'string'
  && /^https:\/\//i.test(url)
  && !/YOUR-WORKER/i.test(url);

const readMeta = (name) => {
  try {
    const el = typeof document !== 'undefined'
      ? document.querySelector(`meta[name="${name}"]`)
      : null;
    const value = el?.content?.trim();
    return value?.length ? value : null;
  } catch {
    return null;
  }
};

const normalizeWorkerUrl = (url) => {
  if (!url) return null;
  if (url.endsWith('/roll')) return url;
  return `${url.replace(/\/$/, '')}/roll`;
};

const buildDiscordPayload = (payload = {}) => {
  if (payload.roll && typeof payload.roll === 'object') {
    return { roll: payload.roll };
  }
  const detail = payload.detail || {};
  const actor = payload.actor || {};
  const who = actor.playerName || actor.vigilanteName || detail.playerName || detail.characterName;
  const expr = detail.formula || detail.expr || detail.result || payload.type || 'Roll';
  const total = detail.total ?? detail.result;
  const breakdown = detail.breakdown || detail.notes || '';
  if (detail.before?.message || detail.after?.message) {
    return { content: detail.after?.message || detail.before?.message };
  }
  if (expr || total != null || breakdown) {
    return { roll: { who, expr, total, breakdown } };
  }
  return null;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const sendEventToDiscordWorker = async (payload) => {
  if (!isDiscordEnabled()) return false;
  const metaUrl = readMeta('discord-proxy-url') || DEFAULT_WORKER_URL;
  const workerUrl = normalizeWorkerUrl(metaUrl);
  if (!isValidWorkerUrl(workerUrl)) return false;
  const key = getDiscordProxyKey();
  if (!key || typeof fetch !== 'function') return false;
  const body = buildDiscordPayload(payload);
  if (!body) return false;

  const requestInit = {
    method: 'POST',
    headers: {
      ...DEFAULT_HEADERS,
      Authorization: `Bearer ${key}`,
      'X-CCCG-Secret': key,
    },
    body: JSON.stringify(body),
  };

  const attempt = async () => {
    const res = await fetch(workerUrl, requestInit);
    return { ok: res.ok, status: res.status };
  };

  try {
    const result = await attempt();
    if (result.ok) return true;
    console.warn('Discord relay returned', result.status);
  } catch (err) {
    console.warn('Discord relay request failed', err);
  }

  await sleep(RETRY_DELAY_MS);

  try {
    const result = await attempt();
    if (!result.ok) {
      console.warn('Discord relay retry returned', result.status);
    }
    return result.ok;
  } catch (err) {
    console.warn('Discord relay retry failed', err);
    return false;
  }
};
