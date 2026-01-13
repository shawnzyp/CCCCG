const ENABLE_KEY = 'cc:discord:enabled';
const ROUTE_KEY = 'cc:discord:route';
const PROXY_KEY = 'cc:discord:proxy-key';
const PROXY_URL_KEY = 'cc:discord:proxy-url';

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

export function clearDiscordProxyKey() {
  try {
    sessionStorage.removeItem(PROXY_KEY);
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

export function getDiscordProxyUrl() {
  try {
    return (localStorage.getItem(PROXY_URL_KEY) || '').trim();
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

export function setDiscordProxyUrl(url) {
  try {
    const value = String(url || '').trim();
    if (!value) {
      localStorage.removeItem(PROXY_URL_KEY);
      return;
    }
    localStorage.setItem(PROXY_URL_KEY, value);
  } catch {
    /* ignore */
  }
}
