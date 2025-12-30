import {
  DEFAULT_DISCORD_ENDPOINT,
  getDiscordEndpoint,
  getDiscordProxyKey,
  isDiscordEnabled,
} from './discord-settings.js';

const DISCORD_PATH = '/api/discord';
const DEFAULT_HEADERS = { 'Content-Type': 'application/json' };

const normalizeBaseUrl = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
};

const resolveEndpointUrl = () => {
  const base = normalizeBaseUrl(getDiscordEndpoint() || DEFAULT_DISCORD_ENDPOINT);
  if (!base) return '';
  return `${base}${DISCORD_PATH}`;
};

const isValidEndpointUrl = (url) =>
  typeof url === 'string'
  && /^https:\/\//i.test(url)
  && !/YOUR-WORKER/i.test(url);

export const canSendDiscordEvents = () => {
  const endpoint = resolveEndpointUrl();
  const key = getDiscordProxyKey();
  return isDiscordEnabled() && !!key && isValidEndpointUrl(endpoint);
};

export const sendDiscordEvent = async (payload) => {
  if (!isDiscordEnabled()) return { ok: false, error: 'disabled' };

  const endpoint = resolveEndpointUrl();
  if (!isValidEndpointUrl(endpoint)) return { ok: false, error: 'invalid_endpoint' };

  const key = getDiscordProxyKey();
  if (!key) return { ok: false, error: 'missing_key' };

  if (typeof fetch !== 'function') return { ok: false, error: 'fetch_unavailable' };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...DEFAULT_HEADERS,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return { ok: false, status: res.status };
    }

    return { ok: true, status: res.status };
  } catch {
    return { ok: false, error: 'network_error' };
  }
};

const withTimestamp = (payload) => ({
  ...payload,
  timestamp: Date.now(),
});

const normalizeCharacter = (character) => {
  if (!character || typeof character !== 'object') return null;
  const vigilanteName = character.vigilanteName || character.name || '';
  return {
    id: character.id || '',
    vigilanteName: vigilanteName || '',
    playerName: character.playerName || '',
  };
};

export const sendDiceRollEvent = (payload) => {
  const character = normalizeCharacter(payload?.character);
  if (!character?.id || !character?.vigilanteName) return Promise.resolve({ ok: false, error: 'missing_character' });
  return sendDiscordEvent(withTimestamp({
    eventType: 'dice.roll',
    campaignId: payload?.campaignId,
    sessionId: payload?.sessionId,
    character,
    roll: payload?.roll || {},
  }));
};

export const sendCoinFlipEvent = (payload) => {
  const character = normalizeCharacter(payload?.character);
  if (!character?.id || !character?.vigilanteName) return Promise.resolve({ ok: false, error: 'missing_character' });
  return sendDiscordEvent(withTimestamp({
    eventType: 'coin.flip',
    campaignId: payload?.campaignId,
    sessionId: payload?.sessionId,
    character,
    coin: payload?.coin || {},
  }));
};

export const sendInitiativeEvent = (payload) => {
  const character = normalizeCharacter(payload?.character);
  if (!character?.id || !character?.vigilanteName) return Promise.resolve({ ok: false, error: 'missing_character' });
  return sendDiscordEvent(withTimestamp({
    eventType: 'initiative.roll',
    campaignId: payload?.campaignId,
    sessionId: payload?.sessionId,
    character,
    initiative: payload?.initiative || {},
  }));
};

export const sendCharacterUpdateEvent = (payload) => {
  const character = normalizeCharacter(payload?.character);
  if (!character?.id || !character?.vigilanteName) return Promise.resolve({ ok: false, error: 'missing_character' });
  return sendDiscordEvent(withTimestamp({
    eventType: 'character.update',
    campaignId: payload?.campaignId,
    sessionId: payload?.sessionId,
    character,
    update: payload?.update || {},
  }));
};

export const sendCombatEvent = (payload) => {
  const character = normalizeCharacter(payload?.character);
  if (!character?.id || !character?.vigilanteName) return Promise.resolve({ ok: false, error: 'missing_character' });
  const eventType = payload?.eventType === 'combat.end' ? 'combat.end' : 'combat.start';
  return sendDiscordEvent(withTimestamp({
    eventType,
    campaignId: payload?.campaignId,
    sessionId: payload?.sessionId,
    character,
    summary: payload?.summary || '',
  }));
};
