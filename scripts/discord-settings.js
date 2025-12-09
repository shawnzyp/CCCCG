const ENABLE_KEY = 'cc:discord:enabled';
const ROUTE_KEY = 'cc:discord:route';

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
