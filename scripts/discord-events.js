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

const parseTotalValue = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const isValidRoll = (roll) => {
  if (!roll || typeof roll !== 'object') return false;
  const expr = roll.expr != null ? String(roll.expr).trim() : '';
  if (!expr || expr.toLowerCase() === 'roll') return false;
  return parseTotalValue(roll.total) != null;
};

const buildDiscordPayload = (payload = {}) => {
  if (payload.content || payload.embeds) {
    if (payload.allowDiscordRaw === true) {
      return payload;
    }
    return {
      event: payload.event || payload.type || 'event',
      payload,
    };
  }

  const event = payload.event || payload.type || 'event';

  if (payload.roll && typeof payload.roll === 'object') {
    if (isValidRoll(payload.roll)) {
      const total = parseTotalValue(payload.roll.total);
      return {
        roll: {
          ...payload.roll,
          total,
        },
      };
    }
    return { event, payload };
  }

  const detail = payload.detail || {};
  const actor = payload.actor || {};
  const who = actor.playerName || actor.vigilanteName || detail.playerName || detail.characterName;
  const expr = detail.formula || detail.expr || detail.result || payload.type || '';
  const total = parseTotalValue(detail.total ?? detail.result);
  const breakdown = detail.breakdown || detail.notes || '';

  if (expr && expr.toLowerCase() !== 'roll' && total != null) {
    return { roll: { who, expr, total, breakdown } };
  }

  return { event, payload };
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
