import { getDiscordProxyKey, getDiscordRoute, isDiscordEnabled } from './discord-settings.js';

const DEFAULT_HEADERS = { 'Content-Type': 'application/json' };

const readMeta = (name) => {
  try {
    const el = typeof document !== 'undefined'
      ? document.querySelector(`meta[name="${name}"]`)
      : null;
    const value = el?.content?.trim();
    return value?.length ? value : null;
  } catch (_) {
    return null;
  }
};

const isValidProxyUrl = (url) =>
  typeof url === 'string'
  && /^https:\/\//i.test(url)
  && !/YOUR-WORKER/i.test(url);

const getProxyConfig = () => {
  const proxyUrl = readMeta('discord-proxy-url');
  const proxyKey = getDiscordProxyKey();

  const headers = proxyKey
    ? { ...DEFAULT_HEADERS, 'X-App-Key': proxyKey }
    : DEFAULT_HEADERS;

  return { proxyUrl, headers };
};

const asEventEnvelope = (event, payload = {}) => ({
  event,
  payload,
  route: getDiscordRoute(),
  timestamp: new Date().toISOString(),
});

const chunkText = (text, max = 1800) => {
  const lines = String(text || '').split('\n');
  const chunks = [];
  let buf = '';

  for (const rawLine of lines) {
    const line = String(rawLine ?? '');
    if (line.length > max) {
      if (buf) {
        chunks.push(buf);
        buf = '';
      }
      let remaining = line;
      while (remaining.length > max) {
        chunks.push(remaining.slice(0, max));
        remaining = remaining.slice(max);
      }
      buf = remaining;
      continue;
    }

    const next = buf ? `${buf}\n${line}` : line;
    if (next.length > max) {
      if (buf) chunks.push(buf);
      buf = line;
    } else {
      buf = next;
    }
  }

  if (buf) chunks.push(buf);
  return chunks;
};

const lastDispatchByEvent = new Map();
const DISPATCH_THROTTLE_MS = 300;
const DISCORD_FIELD_LIMIT = 1024;
const FIELD_SAFETY_MARGIN = 40;

const clampFieldValue = (value) => {
  if (typeof value !== 'string') return value;
  if (value.length <= DISCORD_FIELD_LIMIT - FIELD_SAFETY_MARGIN) return value;
  const maxLen = DISCORD_FIELD_LIMIT - FIELD_SAFETY_MARGIN;
  const trimmed = value.slice(0, Math.max(0, maxLen - 20));
  const omitted = value.length - trimmed.length;
  return `${trimmed}… (+${omitted} more)`;
};

// Note: the proxy endpoint must extract `payload` from the envelope and forward
// it to the actual Discord webhook URL.
const sendWebhook = async (event, payloadBuilder) => {
  if (!isDiscordEnabled()) return false;

  const { proxyUrl, headers } = getProxyConfig();
  if (!isValidProxyUrl(proxyUrl) || typeof fetch !== 'function') return false;
  const body = typeof payloadBuilder === 'function'
    ? payloadBuilder()
    : payloadBuilder;
  if (!body) return false;

  const throttleKey = `${event}:${body?.embeds?.[0]?.title || ''}`;
  const now = Date.now();
  const last = lastDispatchByEvent.get(throttleKey);
  if (Number.isFinite(last) && now - last < DISPATCH_THROTTLE_MS) {
    return false;
  }
  lastDispatchByEvent.set(throttleKey, now);

  try {
    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(asEventEnvelope(event, body)),
    });
    if (!res.ok) {
      console.warn('Discord proxy returned', res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Failed to dispatch Discord webhook event', err);
    return false;
  }
};

const diceRollPayload = ({ who, rollType, formula, total, breakdown, target, outcome }) => ({
  username: 'Combat Telemetry',
  embeds: [{
    title: `${rollType || 'Dice Roll'}${who ? `: ${who}` : ''}`,
    description: formula ? `${formula} = **${total ?? '?'}**` : `Total: **${total ?? '?'}**`,
    color: outcome === 'HIT' ? 65280 : outcome === 'MISS' ? 16711680 : 16753920,
    fields: [
      breakdown ? { name: 'Breakdown', value: clampFieldValue(breakdown), inline: false } : null,
      target ? { name: 'Target', value: target, inline: true } : null,
      outcome ? { name: 'Outcome', value: outcome, inline: true } : null,
    ].filter(Boolean),
    timestamp: new Date().toISOString(),
  }],
});

const lockBreachPayload = ({ result, operator, timeSec, consequences, evidence }) => {
  const ok = result === 'SUCCESS';
  return {
    username: 'O.M.N.I. Tactical Systems',
    embeds: [{
      title: `LOCK BREACH ${ok ? 'SUCCESS' : 'FAILED'}`,
      description: ok
        ? 'Access achieved. No alert escalation detected.'
        : 'Access denied. Countermeasures triggered.',
      color: ok ? 65280 : 16711680,
      fields: [
        operator ? { name: 'Operator', value: operator, inline: true } : null,
        Number.isFinite(timeSec) ? { name: 'Completion Time', value: `${timeSec.toFixed(1)}s`, inline: true } : null,
        { name: 'Consequences', value: (consequences || []).join('\n') || 'None', inline: false },
        evidence ? { name: 'Recovered Intel', value: evidence, inline: false } : null,
      ].filter(Boolean),
      timestamp: new Date().toISOString(),
    }],
  };
};

const lootDropPayload = ({ crateName, location, itemsByRarity = {} }) => {
  const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Elite', 'Legendary'];
  const fields = rarityOrder
    .filter((rarity) => (itemsByRarity[rarity] || []).length)
    .map((rarity) => ({
      name: rarity,
      value: clampFieldValue(itemsByRarity[rarity].map((item) => `• ${item}`).join('\n')),
      inline: false,
    }));

  return {
    username: 'Supply Chain Node',
    embeds: [{
      title: `Supply Crate Contents: ${crateName || 'Crate'}`,
      description: location ? `Recovered at: ${location}` : '',
      color: 3447003,
      fields,
      timestamp: new Date().toISOString(),
    }],
  };
};

const sessionHeaderPayload = ({ sessionNumber, title, dateStr, players = [], tags = [] }) => ({
  username: 'O.M.N.I. After Action Recorder',
  embeds: [{
    title: `Session ${sessionNumber}: ${title || 'Untitled'}`,
    description: `Date: ${dateStr || 'TBD'}\nRoster: ${players.join(', ') || 'Unknown'}\nTags: ${tags.join(', ') || 'none'}`,
    color: 10181046,
    timestamp: new Date().toISOString(),
  }],
});

const sessionLogPayloads = ({ sessionNumber, entries = [] }) => {
  const text = entries.map((entry) => `• ${entry}`).join('\n');
  return chunkText(text).map((chunk, idx) => ({
    username: 'O.M.N.I. After Action Recorder',
    embeds: [{
      title: `Session ${sessionNumber} Event Log (part ${idx + 1})`,
      description: chunk,
      color: 10181046,
      timestamp: new Date().toISOString(),
    }],
  }));
};

export const emitDiceRollMessage = (detail = {}) =>
  sendWebhook('DICE_ROLL', diceRollPayload(detail));

export const emitInitiativeRollMessage = (detail = {}) =>
  emitDiceRollMessage({ rollType: 'Initiative', ...detail });

export const emitLockBreachMessage = (detail = {}) =>
  sendWebhook('MINIGAME_RESULT', lockBreachPayload(detail));

export const emitLootDropMessage = (detail = {}) =>
  sendWebhook('LOOT_DROP', lootDropPayload(detail));

export const emitSessionHeaderMessage = (detail = {}) =>
  sendWebhook('SESSION_HEADER', sessionHeaderPayload(detail));

export const emitSessionLogMessages = async (detail = {}) => {
  const payloads = sessionLogPayloads(detail);
  const results = await Promise.all(payloads.map((payload) => sendWebhook('SESSION_LOG', payload)));
  return results.some(Boolean);
};

export const hasDiscordProxy = () => isValidProxyUrl(getProxyConfig().proxyUrl);
