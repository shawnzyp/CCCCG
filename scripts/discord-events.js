import { getDiscordProxyKey, isDiscordEnabled } from './discord-settings.js';
import { toast } from './notifications.js';

const DEFAULT_WORKER_URL = '';
const DEFAULT_HEADERS = { 'Content-Type': 'application/json' };
const RETRY_DELAY_MS = 500;
let proxyWarningShown = false;

const isPlaceholderUrl = (url) =>
  typeof url === 'string'
  && (/__DISCORD_PROXY_URL__/i.test(url) || /YOUR-WORKER/i.test(url));

const isValidWorkerUrl = (url) =>
  typeof url === 'string'
  && /^https:\/\//i.test(url)
  && !isPlaceholderUrl(url);

const readBuildTimeProxyUrl = () => {
  try {
    if (typeof __DISCORD_PROXY_URL__ !== 'undefined') {
      const value = String(__DISCORD_PROXY_URL__).trim();
      return value.length && !isPlaceholderUrl(value) ? value : null;
    }
  } catch {
    /* ignore missing build-time constant */
  }
  try {
    const value = typeof globalThis !== 'undefined'
      ? globalThis.__DISCORD_PROXY_URL__ || globalThis.DISCORD_PROXY_URL
      : null;
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed.length && !isPlaceholderUrl(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
  return null;
};

const readMeta = (name) => {
  try {
    const el = typeof document !== 'undefined'
      ? document.querySelector(`meta[name="${name}"]`)
      : null;
    const value = el?.content?.trim();
    if (!value?.length || isPlaceholderUrl(value)) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
};

const resolveDiscordProxyUrl = () => (
  readMeta('discord-proxy-url')
  || readBuildTimeProxyUrl()
  || DEFAULT_WORKER_URL
);

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

const warnMissingProxy = (url) => {
  if (proxyWarningShown) return;
  proxyWarningShown = true;
  const message = url
    ? 'Discord relay URL is invalid. Update the proxy URL before sending telemetry.'
    : 'Discord relay URL is missing. Configure the proxy URL before sending telemetry.';
  try {
    toast(message, 'warn');
  } catch {
    /* ignore toast failures */
  }
  console.warn(message);
};

export const sendEventToDiscordWorker = async (payload) => {
  if (!isDiscordEnabled()) return false;
  const metaUrl = resolveDiscordProxyUrl();
  const workerUrl = normalizeWorkerUrl(metaUrl);
  if (!isValidWorkerUrl(workerUrl)) {
    warnMissingProxy(metaUrl);
    return false;
  }
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
