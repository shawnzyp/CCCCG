import { getDiscordProxyKey, getDiscordProxyUrl, isDiscordEnabled } from './discord-settings.js';

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

const readStoredProxyUrl = () => {
  try {
    const value = getDiscordProxyUrl();
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed || isPlaceholderUrl(trimmed)) return null;
    return trimmed;
  } catch {
    return null;
  }
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
  readStoredProxyUrl()
  || readMeta('discord-proxy-url')
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

const classifyRelayStatus = (status) => {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status >= 500) return 'server-error';
  return 'bad-response';
};

const buildDebugPayload = () => ({
  event: 'debug.test',
  payload: {
    source: 'cccg',
    mode: 'debug',
    ts: Date.now(),
  },
});

const normalizeBaseUrl = (url) => {
  if (!url) return null;
  if (url.endsWith('/roll')) {
    return url.slice(0, -'/roll'.length) || null;
  }
  return url;
};

const dispatchUiNotify = (message, level = 'warning') => {
  if (!message) return;
  const detail = { message, level, source: 'discord' };
  try {
    if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function') {
      document.dispatchEvent(new CustomEvent('cc:ui-notify', { detail }));
      return;
    }
  } catch {
    /* ignore dispatch failures */
  }
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('cc:ui-notify', { detail }));
    }
  } catch {
    /* ignore dispatch failures */
  }
};

const warnMissingProxy = (url) => {
  if (proxyWarningShown) return;
  proxyWarningShown = true;
  const message = url
    ? 'Discord relay not configured. Open DM Tools → Discord to add the Proxy URL and Relay Key.'
    : 'Discord relay URL missing. Open DM Tools → Discord to add the Proxy URL and Relay Key.';
  dispatchUiNotify(message, 'warning');
  console.warn(message);
};

export const testDiscordRelay = async () => {
  const metaUrl = resolveDiscordProxyUrl();
  if (!metaUrl) {
    warnMissingProxy(metaUrl);
    return { ok: false, reason: 'missing-url' };
  }
  const workerUrl = normalizeWorkerUrl(metaUrl);
  if (!isValidWorkerUrl(workerUrl)) {
    warnMissingProxy(metaUrl);
    return { ok: false, reason: 'invalid-url' };
  }
  const key = getDiscordProxyKey();
  if (!key || typeof fetch !== 'function') {
    return { ok: false, reason: 'missing-key' };
  }

  const baseUrl = normalizeBaseUrl(workerUrl);
  const healthUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/health` : null;
  const headers = {
    ...DEFAULT_HEADERS,
    Authorization: `Bearer ${key}`,
    'X-CCCG-Secret': key,
  };

  if (healthUrl) {
    try {
      const res = await fetch(healthUrl, { method: 'GET', headers });
      if (res.ok) return { ok: true, status: res.status };
      if (res.status === 404) {
        // fall through to debug payload
      } else {
        return { ok: false, status: res.status, reason: classifyRelayStatus(res.status) };
      }
    } catch (err) {
      return { ok: false, reason: 'network-error', detail: err };
    }
  }

  try {
    const res = await fetch(`${workerUrl}?debug=1`, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildDebugPayload()),
    });
    if (res.ok) return { ok: true, status: res.status };
    return { ok: false, status: res.status, reason: classifyRelayStatus(res.status) };
  } catch (err) {
    return { ok: false, reason: 'network-error', detail: err };
  }
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
