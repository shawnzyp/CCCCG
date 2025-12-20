const AUTH_KEY = 'cccg:discord-auth';
const SAFE_MODE_KEY = 'cc:safe-mode';

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

const sanitizeProxyUrl = (url) => {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed || /YOUR-WORKER/i.test(trimmed)) return null;
  if (!/^https:\/\//i.test(trimmed)) return null;
  return trimmed;
};

export function getDiscordProxyUrl() {
  return sanitizeProxyUrl(readMeta('discord-proxy-url'));
}

export function getDiscordAuthKey() {
  try {
    return localStorage.getItem(AUTH_KEY) || '';
  } catch {
    return '';
  }
}

export function setDiscordAuthKey(value) {
  try {
    if (!value) {
      localStorage.removeItem(AUTH_KEY);
    } else {
      localStorage.setItem(AUTH_KEY, value);
    }
  } catch {}
}

export function isSafeModeEnabled() {
  try {
    return localStorage.getItem(SAFE_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export async function sendDiscordLog({ content, embeds } = {}, { allowInSafeMode = false } = {}) {
  if (!allowInSafeMode && isSafeModeEnabled()) return false;
  const proxy = getDiscordProxyUrl();
  if (!proxy || typeof fetch !== 'function') return false;
  const auth = getDiscordAuthKey();
  if (!auth) return false;

  const endpoint = /\/(log|discord\/log)$/i.test(proxy) ? proxy : `${proxy}/log`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CCCG-Auth': auth,
      },
      body: JSON.stringify({ content, embeds }),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

function formatDelta(delta) {
  const n = Number(delta);
  if (!Number.isFinite(n) || n === 0) return '0';
  return `${n > 0 ? '+' : ''}${n}`;
}

function formatTimestamp(ts = Date.now()) {
  try {
    return new Date(ts).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

const clampText = (value, max) => {
  if (typeof value !== 'string') return value;
  if (!Number.isFinite(max) || max <= 0) return value;
  return value.length > max ? value.slice(0, Math.max(0, max - 1)) + '…' : value;
};

const clampField = (field) => {
  if (!field || typeof field !== 'object') return null;
  const name = clampText(String(field.name || ''), 256);
  const value = clampText(String(field.value || ''), 1024);
  if (!name || !value) return null;
  return { ...field, name, value };
};

export async function logActivity(event = {}) {
  if (!event || typeof event !== 'object') return false;
  if (isSafeModeEnabled()) return false;
  const type = String(event.type || 'activity');
  const actor = event.actor || 'Unknown';
  const timestamp = formatTimestamp(event.timestamp);

  let content = '';
  const fields = [];

  if (type === 'roll') {
    content = `${actor} rolled ${event.name || 'a check'} = ${event.total ?? '?'}`;
    fields.push(
      { name: 'Roll', value: `${event.rollTotal ?? '?'}${event.modifier ? ` ${formatDelta(event.modifier)}` : ''}`, inline: true },
      { name: 'Total', value: String(event.total ?? '?'), inline: true }
    );
    if (event.breakdown) {
      fields.push({ name: 'Breakdown', value: String(event.breakdown), inline: false });
    }
    if (event.rollMode && event.rollMode !== 'normal') {
      fields.push({ name: 'Mode', value: String(event.rollMode), inline: true });
    }
  } else if (type === 'hp') {
    content = `${actor} HP ${event.before ?? '?'} → ${event.after ?? '?'} (${formatDelta(event.delta)})`;
    fields.push(
      { name: 'Before', value: String(event.before ?? '?'), inline: true },
      { name: 'After', value: String(event.after ?? '?'), inline: true },
      { name: 'Delta', value: formatDelta(event.delta), inline: true }
    );
    if (event.max != null) {
      fields.push({ name: 'Max', value: String(event.max), inline: true });
    }
  } else if (type === 'sp') {
    content = `${actor} SP ${event.before ?? '?'} → ${event.after ?? '?'} (${formatDelta(event.delta)})`;
    fields.push(
      { name: 'Before', value: String(event.before ?? '?'), inline: true },
      { name: 'After', value: String(event.after ?? '?'), inline: true },
      { name: 'Delta', value: formatDelta(event.delta), inline: true }
    );
    if (event.max != null) {
      fields.push({ name: 'Max', value: String(event.max), inline: true });
    }
  } else if (type === 'campaign') {
    content = `${actor}: ${event.text || ''}`.trim();
    fields.push({ name: 'Entry', value: String(event.text || ''), inline: false });
  } else {
    content = `${actor}: ${event.text || event.message || 'Activity logged'}`;
    fields.push({ name: 'Detail', value: String(event.text || event.message || ''), inline: false });
  }

  const embeds = [{
    title: 'Campaign + Action Log',
    description: clampText(content, 2048),
    fields: fields.map(clampField).filter(Boolean).slice(0, 20),
    timestamp,
    color: 3447003,
  }];

  return sendDiscordLog({ content, embeds });
}
