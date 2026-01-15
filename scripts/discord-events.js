import { toastOnce } from './ui-notify.js';
import { getDiscordProxyKey, isDiscordEnabled } from './discord-settings.js';

const DEFAULT_HEADERS = { 'Content-Type': 'application/json' };
const PROXY_URL_OVERRIDE_KEY = 'cc:discord:proxyUrl';
const LEGACY_PROXY_URL_OVERRIDE_KEY = 'cc.discord.proxyUrl';
const DEBUG_HEADER = 'X-CCCG-Proxy-Debug';
const MAX_RETRY_ATTEMPTS = 4;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 4_000;

const PLACEHOLDER_VALUES = new Set([
  'https://YOUR-WORKER.yourdomain.workers.dev',
  '__DISCORD_PROXY_URL__',
  'REPLACE_ME',
]);
const RETRY_JITTER_RATIO = 0.15;

const isPlaceholderUrl = (url) =>
  typeof url === 'string'
  && (/__DISCORD_PROXY_URL__/.test(url) || /YOUR-WORKER/i.test(url));

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

const readLocalStorageValue = (key) => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const value = localStorage.getItem(key);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
};

const migrateLegacyProxyUrlOverride = () => {
  if (typeof localStorage === 'undefined') return;
  try {
    const current = localStorage.getItem(PROXY_URL_OVERRIDE_KEY);
    if (current && current.trim()) return;
    const legacy = localStorage.getItem(LEGACY_PROXY_URL_OVERRIDE_KEY);
    if (legacy && legacy.trim()) {
      localStorage.setItem(PROXY_URL_OVERRIDE_KEY, legacy.trim());
      localStorage.removeItem(LEGACY_PROXY_URL_OVERRIDE_KEY);
    }
  } catch {
    /* ignore */
  }
};

const readGlobalProxyUrl = () => {
  if (typeof window === 'undefined') return null;
  const candidate = window.DISCORD_PROXY_URL
    || window.CCCG_DISCORD_PROXY_URL
    || window.__CCCG_DISCORD_PROXY_URL__
    || window.discordProxyUrl;
  return typeof candidate === 'string' ? candidate : null;
};

const isPlaceholderValue = (value) => {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (PLACEHOLDER_VALUES.has(trimmed)) return true;
  const lowered = trimmed.toLowerCase();
  return lowered.includes('placeholder')
    || lowered.includes('your-worker')
    || lowered.includes('__discord_proxy_url__')
    || lowered.includes('replace_me');
};

const normalizeProxyBaseUrl = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || isPlaceholderValue(trimmed)) return null;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol === 'http:') {
    const host = url.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') return null;
  } else if (url.protocol !== 'https:') {
    return null;
  }
  let base = trimmed.replace(/\/+$/, '');
  base = base.replace(/\/(roll|health)$/i, '');
  return base;
};

export const resolveDiscordProxyConfig = () => {
  migrateLegacyProxyUrlOverride();
  const candidates = [
    readLocalStorageValue(PROXY_URL_OVERRIDE_KEY),
    readMeta('discord-proxy-url'),
    readGlobalProxyUrl(),
  ];
  for (const candidate of candidates) {
    const normalized = normalizeProxyBaseUrl(candidate);
    if (normalized) {
      return {
        baseUrl: normalized,
        rollUrl: `${normalized}/roll`,
        healthUrl: `${normalized}/health`,
      };
    }
  }
  return null;
};

const getDiscordProxyConfig = ({ warnOnMissing = false } = {}) => {
  const config = resolveDiscordProxyConfig();
  if (!config && warnOnMissing) {
    toastOnce(
      'discord-proxy-url-missing',
      'Discord relay URL is missing or invalid. Update the proxy URL to enable relay.',
      'warning'
    );
  }
  return config;
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

const jitterDelay = (ms) => {
  const jitter = ms * RETRY_JITTER_RATIO;
  const offset = (Math.random() * (jitter * 2)) - jitter;
  return Math.max(0, Math.round(ms + offset));
};

const parseRetryAfterMs = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds * 1000));
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return null;
};

const shouldRetry = (status) => status === 429 || status >= 500;

const fetchWithRetry = async (requestFactory) => {
  let attempt = 0;
  let lastError = null;
  while (attempt < MAX_RETRY_ATTEMPTS) {
    attempt += 1;
    try {
      const response = await requestFactory();
      if (response.ok || response.status === 401 || response.status === 403) {
        return { response, attempt };
      }
      if (!shouldRetry(response.status) || attempt >= MAX_RETRY_ATTEMPTS) {
        return { response, attempt };
      }
      const retryAfter = parseRetryAfterMs(response.headers.get('Retry-After'));
      const baseDelay = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * (2 ** (attempt - 1)));
      const delay = retryAfter != null ? Math.max(retryAfter, baseDelay) : baseDelay;
      await sleep(jitterDelay(delay));
    } catch (err) {
      lastError = err;
      if (attempt >= MAX_RETRY_ATTEMPTS) {
        return { error: lastError, attempt };
      }
      const delay = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * (2 ** (attempt - 1)));
      await sleep(jitterDelay(delay));
    }
  }
  return { error: lastError, attempt: MAX_RETRY_ATTEMPTS };
};

const buildDiscordHeaders = (key, extraHeaders = {}, includeFallback = false) => {
  const headers = {
    ...DEFAULT_HEADERS,
    Authorization: `Bearer ${key}`,
    ...extraHeaders,
  };
  if (includeFallback) {
    headers['X-CCCG-Secret'] = key;
  }
  return headers;
};

export const testDiscordRelay = async ({ debug = false } = {}) => {
  const config = getDiscordProxyConfig({ warnOnMissing: true });
  if (!config) {
    return { ok: false, code: 'missing_proxy_url', status: 0, detail: 'Missing proxy URL.' };
  }
  const key = getDiscordProxyKey();
  if (!key) {
    return { ok: false, code: 'missing_proxy_key', status: 0, detail: 'Missing proxy key.' };
  }
  if (typeof fetch !== 'function') {
    return { ok: false, code: 'fetch_unavailable', status: 0, detail: 'Fetch unavailable.' };
  }
  const headers = buildDiscordHeaders(key, debug ? { [DEBUG_HEADER]: '1' } : {}, true);
  const requestInit = { method: 'GET', headers };

  const result = await fetchWithRetry(() => fetch(config.healthUrl, requestInit));
  if (result.error) {
    return { ok: false, code: 'network_error', status: 0, detail: result.error?.message || 'Network error.' };
  }
  const { response } = result;
  let detail = null;
  try {
    detail = await response.clone().json();
  } catch {
    try {
      detail = await response.text();
    } catch {
      detail = null;
    }
  }
  if (response.ok) {
    return { ok: true, code: 'ok', status: response.status, detail };
  }
  if (response.status === 401) {
    return { ok: false, code: 'unauthorized', status: response.status, detail };
  }
  if (response.status === 403) {
    return { ok: false, code: 'forbidden', status: response.status, detail };
  }
  if (response.status === 429) {
    return { ok: false, code: 'rate_limited', status: response.status, detail };
  }
  if (response.status >= 500) {
    return { ok: false, code: 'server_error', status: response.status, detail };
  }
  return { ok: false, code: 'error', status: response.status, detail };
};

export const sendEventToDiscordWorker = async (payload) => {
  if (!isDiscordEnabled()) return false;
  const config = getDiscordProxyConfig({ warnOnMissing: true });
  if (!config) return false;
  const key = getDiscordProxyKey();
  if (!key || typeof fetch !== 'function') return false;
  const body = buildDiscordPayload(payload);
  if (!body) return false;

  const requestInit = {
    method: 'POST',
    headers: buildDiscordHeaders(key),
    body: JSON.stringify(body),
  };

  const result = await fetchWithRetry(() => fetch(config.rollUrl, requestInit));
  if (result.error) {
    console.warn('Discord relay request failed', result.error);
    return false;
  }
  if (result.response?.ok) return true;
  console.warn('Discord relay returned', result.response?.status);
  return false;
};

export const __test__ = {
  normalizeProxyBaseUrl,
  resolveDiscordProxyConfig,
  isPlaceholderValue,
  buildDiscordHeaders,
};
