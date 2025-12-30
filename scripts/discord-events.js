import { getDiscordProxyKey, isDiscordEnabled } from './discord-settings.js';

const DISCORD_WORKER_URL = 'https://ccapp.shawnpeiris22.workers.dev/';
const DEFAULT_HEADERS = { 'Content-Type': 'application/json' };
const RETRY_DELAY_MS = 500;

const isValidWorkerUrl = (url) =>
  typeof url === 'string'
  && /^https:\/\//i.test(url)
  && !/YOUR-WORKER/i.test(url);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const sendEventToDiscordWorker = async (payload) => {
  if (!isDiscordEnabled()) return false;
  if (!isValidWorkerUrl(DISCORD_WORKER_URL)) return false;
  const key = getDiscordProxyKey();
  if (!key || typeof fetch !== 'function') return false;

  const requestInit = {
    method: 'POST',
    headers: {
      ...DEFAULT_HEADERS,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  };

  const attempt = async () => {
    const res = await fetch(DISCORD_WORKER_URL, requestInit);
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
