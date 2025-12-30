const MAX_BODY_BYTES = 15000;
const MAX_STRING_LENGTH = 400;
const MAX_NAME_LENGTH = 120;
const MAX_ID_LENGTH = 120;
const MAX_CONTEXT_LENGTH = 180;
const MAX_FORMULA_LENGTH = 120;
const MAX_BREAKDOWN_LENGTH = 800;
const MAX_REASON_LENGTH = 240;
const MAX_FIELD_LENGTH = 1024;

const EVENT_TYPES = new Set([
  'dice.roll',
  'coin.flip',
  'initiative.roll',
  'character.update',
  'combat.start',
  'combat.end',
]);

const EVENT_COLORS = {
  'dice.roll': 5793266,
  'coin.flip': 15105570,
  'initiative.roll': 15844367,
  'character.update': 3066993,
  'combat.start': 15158332,
  'combat.end': 10070709,
};

const rateBuckets = {
  ip: new Map(),
  character: new Map(),
};

const RATE_LIMITS = {
  ip: { capacity: 24, refillPerMs: 24 / 60000 },
  character: { capacity: 12, refillPerMs: 12 / 60000 },
};

const sanitizeText = (value) => String(value || '').replace(/@/g, '@\u200b');

const clampNumber = (value, { min = -9999, max = 9999 } = {}) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(max, Math.max(min, Math.trunc(num)));
};

const requireString = (value, field, maxLen = MAX_STRING_LENGTH) => {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  if (trimmed.length > maxLen) {
    throw new Error(`${field} is too long`);
  }
  return sanitizeText(trimmed);
};

const optionalString = (value, maxLen = MAX_STRING_LENGTH) => {
  if (value == null) return '';
  if (typeof value !== 'string') {
    throw new Error('Invalid string value');
  }
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length > maxLen) {
    throw new Error('String value is too long');
  }
  return sanitizeText(trimmed);
};

const getAllowedOrigin = (origin, env) => {
  const allowedOrigin = env?.ALLOWED_ORIGIN?.trim();
  if (allowedOrigin) {
    if (origin && origin === allowedOrigin) return allowedOrigin;
    if (!origin) return allowedOrigin;
    return '';
  }
  return '*';
};

const buildCorsHeaders = (origin, env) => {
  const allowedOrigin = getAllowedOrigin(origin, env);
  if (!allowedOrigin) return null;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
};

const jsonResponse = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

const getClientIp = (request) => {
  const direct = request.headers.get('CF-Connecting-IP');
  if (direct) return direct;
  const forwarded = request.headers.get('X-Forwarded-For');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
};

const checkRateLimit = (map, key, limit) => {
  const now = Date.now();
  const entry = map.get(key) || { tokens: limit.capacity, last: now };
  const elapsed = Math.max(0, now - entry.last);
  const refilled = Math.min(limit.capacity, entry.tokens + elapsed * limit.refillPerMs);
  if (refilled < 1) {
    map.set(key, { tokens: refilled, last: now });
    return false;
  }
  map.set(key, { tokens: refilled - 1, last: now });
  return true;
};

const normalizeTimestamp = (value) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error('timestamp is required');
  }
  const date = new Date(numeric);
  if (Number.isNaN(date.getTime())) {
    throw new Error('timestamp is invalid');
  }
  return date.toISOString();
};

const formatCharacterFields = (character, campaignId, sessionId) => {
  const fields = [
    { name: 'Vigilante', value: character.vigilanteName, inline: true },
  ];
  if (character.playerName) {
    fields.push({ name: 'Player', value: character.playerName, inline: true });
  }
  if (character.id) {
    fields.push({ name: 'Character ID', value: character.id, inline: true });
  }
  if (campaignId || sessionId) {
    fields.push({
      name: 'Session',
      value: [campaignId, sessionId].filter(Boolean).join(' / '),
      inline: false,
    });
  }
  return fields.map((field) => ({
    ...field,
    value: field.value.length > MAX_FIELD_LENGTH ? field.value.slice(0, MAX_FIELD_LENGTH) : field.value,
  }));
};

const buildEmbed = ({
  title,
  description,
  color,
  timestamp,
  fields,
}) => ({
  title,
  description,
  color,
  fields,
  footer: { text: `Catalyst Core • ${timestamp}` },
});

const buildDiceEmbed = (payload, timestamp) => {
  const roll = payload.roll || {};
  const formula = optionalString(roll.formula, MAX_FORMULA_LENGTH);
  const total = clampNumber(roll.total, { min: -99999, max: 99999 });
  const breakdown = optionalString(roll.breakdown, MAX_BREAKDOWN_LENGTH);
  const context = optionalString(roll.context, MAX_CONTEXT_LENGTH);
  const advantageState = optionalString(roll.advantageState, 20);
  const summaryParts = [];
  if (context) summaryParts.push(context);
  if (formula) summaryParts.push(formula);
  const summary = summaryParts.length
    ? `${summaryParts.join(' • ')} = ${total}`
    : `Total: ${total}`;
  const fields = [];
  if (breakdown) {
    fields.push({ name: 'Breakdown', value: breakdown, inline: false });
  }
  if (advantageState) {
    fields.push({ name: 'Mode', value: advantageState, inline: true });
  }
  return buildEmbed({
    title: 'Dice Roll',
    description: summary,
    color: EVENT_COLORS['dice.roll'],
    timestamp,
    fields,
  });
};

const buildCoinEmbed = (payload, timestamp) => {
  const coin = payload.coin || {};
  const result = requireString(coin.result, 'coin.result', 20);
  const context = optionalString(coin.context, MAX_CONTEXT_LENGTH);
  const description = context ? `${context} • ${result}` : result;
  return buildEmbed({
    title: 'Coin Flip',
    description,
    color: EVENT_COLORS['coin.flip'],
    timestamp,
    fields: [],
  });
};

const buildInitiativeEmbed = (payload, timestamp) => {
  const initiative = payload.initiative || {};
  const formula = optionalString(initiative.formula, MAX_FORMULA_LENGTH);
  const total = clampNumber(initiative.total, { min: -99999, max: 99999 });
  const breakdown = optionalString(initiative.breakdown, MAX_BREAKDOWN_LENGTH);
  const summary = formula ? `${formula} = ${total}` : `Total: ${total}`;
  const fields = [];
  if (breakdown) {
    fields.push({ name: 'Breakdown', value: breakdown, inline: false });
  }
  return buildEmbed({
    title: 'Initiative Roll',
    description: summary,
    color: EVENT_COLORS['initiative.roll'],
    timestamp,
    fields,
  });
};

const stringifyChange = (value) => {
  if (value == null) return '';
  if (typeof value === 'string') return optionalString(value, MAX_REASON_LENGTH);
  const json = JSON.stringify(value);
  if (json.length > MAX_REASON_LENGTH) {
    throw new Error('change payload too long');
  }
  return json;
};

const buildCharacterUpdateEmbed = (payload, timestamp) => {
  const update = payload.update || {};
  const type = requireString(update.type, 'update.type', 40);
  const reason = optionalString(update.reason, MAX_REASON_LENGTH);
  const beforeText = stringifyChange(update.before);
  const afterText = stringifyChange(update.after);
  const fields = [];
  if (beforeText) fields.push({ name: 'Before', value: beforeText, inline: false });
  if (afterText) fields.push({ name: 'After', value: afterText, inline: false });
  if (reason) fields.push({ name: 'Reason', value: reason, inline: false });
  return buildEmbed({
    title: `Character Update: ${type}`,
    description: reason ? `Update recorded: ${reason}` : `Update recorded: ${type}`,
    color: EVENT_COLORS['character.update'],
    timestamp,
    fields,
  });
};

const buildCombatEmbed = (payload, timestamp, eventType) => {
  const summary = optionalString(payload.summary, MAX_CONTEXT_LENGTH);
  return buildEmbed({
    title: eventType === 'combat.start' ? 'Combat Started' : 'Combat Ended',
    description: summary || 'Combat state updated.',
    color: EVENT_COLORS[eventType],
    timestamp,
    fields: [],
  });
};

const buildEmbedsForEvent = (payload, timestamp) => {
  switch (payload.eventType) {
    case 'dice.roll':
      return [buildDiceEmbed(payload, timestamp)];
    case 'coin.flip':
      return [buildCoinEmbed(payload, timestamp)];
    case 'initiative.roll':
      return [buildInitiativeEmbed(payload, timestamp)];
    case 'character.update':
      return [buildCharacterUpdateEmbed(payload, timestamp)];
    case 'combat.start':
    case 'combat.end':
      return [buildCombatEmbed(payload, timestamp, payload.eventType)];
    default:
      return [];
  }
};

const envValue = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length ? trimmed : '';
};

const validatePayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload');
  }
  const eventType = requireString(payload.eventType, 'eventType', 60);
  if (!EVENT_TYPES.has(eventType)) {
    throw new Error('eventType not supported');
  }
  const timestamp = normalizeTimestamp(payload.timestamp);
  const character = payload.character && typeof payload.character === 'object'
    ? payload.character
    : null;
  if (!character) {
    throw new Error('character is required');
  }
  const id = requireString(character.id, 'character.id', MAX_ID_LENGTH);
  const vigilanteName = requireString(character.vigilanteName, 'character.vigilanteName', MAX_NAME_LENGTH);
  const playerName = optionalString(character.playerName, MAX_NAME_LENGTH);
  const campaignId = optionalString(payload.campaignId, MAX_NAME_LENGTH);
  const sessionId = optionalString(payload.sessionId, MAX_NAME_LENGTH);
  return {
    ...payload,
    eventType,
    timestamp,
    campaignId,
    sessionId,
    character: {
      id,
      vigilanteName,
      playerName,
    },
  };
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/discord') {
      return jsonResponse(404, { ok: false, error: 'not_found' });
    }
    const origin = request.headers.get('Origin');
    const cors = buildCorsHeaders(origin, env);
    if (!cors) {
      return jsonResponse(403, { ok: false, error: 'forbidden' });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return jsonResponse(405, { ok: false, error: 'method_not_allowed' }, cors);
    }

    const expectedToken = env?.CCCG_PROXY_TOKEN;
    if (!expectedToken) {
      return jsonResponse(503, { ok: false, error: 'missing_token' }, cors);
    }

    const authHeader = request.headers.get('Authorization') || '';
    const providedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!providedToken || providedToken !== expectedToken) {
      return jsonResponse(401, { ok: false, error: 'unauthorized' }, cors);
    }

    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return jsonResponse(415, { ok: false, error: 'unsupported_media_type' }, cors);
    }

    let rawBody = '';
    try {
      rawBody = await request.text();
    } catch {
      return jsonResponse(400, { ok: false, error: 'invalid_body' }, cors);
    }

    if (rawBody.length > MAX_BODY_BYTES) {
      return jsonResponse(413, { ok: false, error: 'payload_too_large' }, cors);
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonResponse(400, { ok: false, error: 'invalid_json' }, cors);
    }

    let normalized;
    try {
      normalized = validatePayload(payload);
    } catch (err) {
      return jsonResponse(400, { ok: false, error: err.message || 'invalid_payload' }, cors);
    }

    const clientIp = getClientIp(request);
    if (!checkRateLimit(rateBuckets.ip, clientIp, RATE_LIMITS.ip)) {
      return jsonResponse(429, { ok: false, error: 'rate_limited' }, cors);
    }
    if (!checkRateLimit(rateBuckets.character, normalized.character.id, RATE_LIMITS.character)) {
      return jsonResponse(429, { ok: false, error: 'rate_limited' }, cors);
    }

    const webhookUrl = env?.DISCORD_WEBHOOK_URL;
    if (!webhookUrl || typeof webhookUrl !== 'string') {
      return jsonResponse(500, { ok: false, error: 'webhook_not_configured' }, cors);
    }

    const timestamp = normalized.timestamp;
    const embedFields = formatCharacterFields(
      normalized.character,
      normalized.campaignId,
      normalized.sessionId,
    );

    let embeds;
    try {
      embeds = buildEmbedsForEvent(normalized, timestamp).map(embed => ({
        ...embed,
        fields: [...embed.fields, ...embedFields].filter(Boolean),
        timestamp,
      }));
    } catch (err) {
      return jsonResponse(400, { ok: false, error: err.message || 'invalid_payload' }, cors);
    }

    if (!embeds.length) {
      return jsonResponse(400, { ok: false, error: 'missing_embed' }, cors);
    }

    const webhookPayload = {
      username: envValue(env?.DISCORD_WEBHOOK_USERNAME) || 'Catalyst Core',
      avatar_url: envValue(env?.DISCORD_WEBHOOK_AVATAR) || undefined,
      embeds,
      allowed_mentions: { parse: [] },
    };

    let res;
    try {
      res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });
    } catch {
      return jsonResponse(502, { ok: false, error: 'discord_unreachable' }, cors);
    }

    if (!res.ok) {
      return jsonResponse(res.status, { ok: false, error: 'discord_rejected' }, cors);
    }

    return jsonResponse(200, { ok: true, discordStatus: res.status }, cors);
  },
};
