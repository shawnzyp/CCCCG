const ENABLE_KEY = 'cc:discord:enabled';
const ENDPOINT_KEY = 'cc:discord:endpoint';
const ROUTE_KEY = 'cc:discord:route';
const PROXY_KEY = 'cc:discord:proxy-key';
export const DEFAULT_DISCORD_ENDPOINT = 'https://cccg-error-inbox.shawnpeiris22.workers.dev';

export function isDiscordEnabled() {
  try {
    return localStorage.getItem(ENABLE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDiscordEnabled(enabled) {
  try {
    localStorage.setItem(ENABLE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function getDiscordEndpoint() {
  try {
    const stored = (localStorage.getItem(ENDPOINT_KEY) || '').trim();
    return stored || DEFAULT_DISCORD_ENDPOINT;
  } catch {
    return DEFAULT_DISCORD_ENDPOINT;
  }
}

export function setDiscordEndpoint(endpoint) {
  try {
    const value = String(endpoint || '').trim();
    if (!value) {
      localStorage.removeItem(ENDPOINT_KEY);
      return;
    }
    localStorage.setItem(ENDPOINT_KEY, value);
  } catch {
    /* ignore */
  }
}

export function getDiscordRoute() {
  try {
    return (localStorage.getItem(ROUTE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setDiscordRoute(route) {
  try {
    localStorage.setItem(ROUTE_KEY, String(route || '').trim());
  } catch {
    /* ignore */
  }
}

export function getDiscordProxyKey() {
  try {
    return (sessionStorage.getItem(PROXY_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setDiscordProxyKey(key) {
  try {
    const value = String(key || '').trim();
    if (!value) {
      sessionStorage.removeItem(PROXY_KEY);
      return;
    }
    sessionStorage.setItem(PROXY_KEY, value);
  } catch {
    /* ignore */
  }
}
