const ALLOWED_ORIGIN = 'https://shawnzyp.github.io';
const BUILD_ID = 'ccapp-2026-01-03-final';
const DEFAULT_USERNAME = 'Catalyst Core';

const LIMITS = {
  content: 2000,
  embedTitle: 256,
  embedDescription: 4096,
  fieldName: 256,
  fieldValue: 1024,
  maxFields: 6,
  maxDetailFields: 5,
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // curl / server-side
  if (origin === ALLOWED_ORIGIN) return true;
  // Optional local dev allowlist:
  if (/^https?:\/\/localhost(:\d+)?$/i.test(origin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin)) return true;
  return false;
};

const resolveCorsOrigin = (origin) => {
  // For curl/no Origin: allow anyone (CORS not relevant there)
  if (!origin) return '*';
  // For browsers: echo back only if allowed
  return isAllowedOrigin(origin) ? origin : 'null';
};

const buildCorsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': resolveCorsOrigin(origin),
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-CCCG-Secret, Authorization, X-Debug',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
});

const jsonResponse = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...buildCorsHeaders(origin),
      'Content-Type': 'application/json',
    },
  });

const textResponse = (body, status, origin) =>
  new Response(body, {
    status,
    headers: {
      ...buildCorsHeaders(origin),
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });

const isPlainObject = (value) =>
  Boolean(value)
  && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const clampText = (text, limit) => {
  if (text == null) return '';
  const value = String(text);
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3))}...`;
};

const parseTotalValue = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getAuthToken = (request) => {
  const direct = request.headers.get('X-CCCG-Secret');
  if (direct) return String(direct).trim();

  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? String(match[1]).trim() : '';
};

const invalidRollDetails = (roll, expr) => ({
  expr,
  totalType: typeof roll?.total,
  totalValue: roll?.total ?? null,
});

const validateRollPayload = (roll) => {
  if (!isPlainObject(roll)) return { ok: false, details: invalidRollDetails({}, null) };

  const expr = roll.expr != null ? String(roll.expr).trim() : '';
  if (!expr || expr.toLowerCase() === 'roll') {
    return { ok: false, details: invalidRollDetails(roll, expr || null) };
  }

  const total = parseTotalValue(roll.total);
  if (total == null) {
    return { ok: false, details: invalidRollDetails(roll, expr) };
  }

  return {
    ok: true,
    value: {
      who: roll.who ? String(roll.who) : 'Someone',
      expr,
      total,
      breakdown: roll.breakdown ? String(roll.breakdown) : '',
    },
  };
};

const formatRollMessage = (roll) => {
  const who = roll.who ? String(roll.who) : 'Someone';
  const expr = String(roll.expr);
  const total = String(roll.total);
  const breakdown = roll.breakdown ? `\n${roll.breakdown}` : '';
  return `**${who}** rolled ${expr} = **${total}**${breakdown}`;
};

const sanitizeEmbed = (embed) => {
  if (!isPlainObject(embed)) return null;
  const next = { ...embed };

  if (next.title) next.title = clampText(next.title, LIMITS.embedTitle);
  if (next.description) next.description = clampText(next.description, LIMITS.embedDescription);

  if (Array.isArray(next.fields)) {
    next.fields = next.fields
      .slice(0, LIMITS.maxFields)
      .map((field) => {
        if (!isPlainObject(field)) return null;
        return {
          name: clampText(field.name ?? '', LIMITS.fieldName),
          value: clampText(field.value ?? '', LIMITS.fieldValue),
          inline: Boolean(field.inline),
        };
      })
      .filter(Boolean);
  }

  return next;
};

const withDefaultUsername = (payload) => {
  if (!isPlainObject(payload)) return payload;
  if (payload.username) return payload;
  return { ...payload, username: DEFAULT_USERNAME };
};

const sanitizeDiscordPayload = (payload) => {
  if (!isPlainObject(payload)) return payload;
  const next = { ...payload };

  if (typeof next.content === 'string') {
    next.content = clampText(next.content, LIMITS.content);
  }

  if (Array.isArray(next.embeds)) {
    next.embeds = next.embeds.map(sanitizeEmbed).filter(Boolean);
  }

  return withDefaultUsername(next);
};

const isRawDiscordPayload = (payload) => {
  if (!isPlainObject(payload)) return false;
  const hasContent = typeof payload.content === 'string' && payload.content.length > 0;
  const hasEmbeds = Array.isArray(payload.embeds);
  return hasContent || hasEmbeds;
};

const pickActorName = (payload, actor) =>
  actor?.playerName
  || actor?.characterName
  || actor?.name
  || payload?.who
  || payload?.playerName
  || payload?.characterName
  || null;

const buildEventFields = (detail) => {
  const fields = [];
  if (!isPlainObject(detail)) return fields;

  const candidates = [
    { key: 'formula', label: 'Formula' },
    { key: 'expr', label: 'Expression' },
    { key: 'total', label: 'Total' },
    { key: 'result', label: 'Result' },
    { key: 'breakdown', label: 'Breakdown' },
    { key: 'outcome', label: 'Outcome' },
    { key: 'target', label: 'Target' },
  ];

  for (const { key, label } of candidates) {
    if (fields.length >= LIMITS.maxDetailFields) break;
    const value = detail[key];
    if (value == null) continue;
    if (typeof value === 'object') continue;
    fields.push({
      name: clampText(label, LIMITS.fieldName),
      value: clampText(value, LIMITS.fieldValue),
      inline: false,
    });
  }

  return fields;
};

const buildEventDiscordPayload = (event, payload) => {
  const detail = isPlainObject(payload?.detail) ? payload.detail : {};
  const actor = isPlainObject(payload?.actor) ? payload.actor : {};
  const actorName = pickActorName(payload, actor);

  const message =
    detail.message
    || detail.summary
    || payload?.message
    || payload?.summary
    || '';

  const descriptionParts = [];
  if (actorName) descriptionParts.push(`**${actorName}**`);
  if (message) descriptionParts.push(String(message));

  const descriptionFallback = event ? `Event: ${event}` : 'Event';
  const description = clampText(descriptionParts.join(' '), LIMITS.embedDescription) || descriptionFallback;

  const fields = [];
  if (event) fields.push({ name: 'Event', value: clampText(event, LIMITS.fieldValue), inline: true });
  if (actorName) fields.push({ name: 'Actor', value: clampText(actorName, LIMITS.fieldValue), inline: true });

  const detailFields = buildEventFields(detail);

  return sanitizeDiscordPayload({
    embeds: [
      {
        title: 'Event',
        description,
        fields: [...fields, ...detailFields].slice(0, LIMITS.maxFields),
        timestamp: new Date().toISOString(),
      },
    ],
  });
};

const buildRollDiscordPayload = (roll) =>
  sanitizeDiscordPayload({
    embeds: [
      {
        title: 'Roll',
        description: clampText(formatRollMessage(roll), LIMITS.embedDescription),
        timestamp: new Date().toISOString(),
      },
    ],
  });

// Classification priority:
// 1) raw Discord payload
// 2) event wrapper
// 3) roll wrapper
const normalizeRequestPayload = (body) => {
  if (!isPlainObject(body)) return { error: 'unknown_payload' };

  // 1) raw Discord payload passthrough
  if (isRawDiscordPayload(body)) {
    return { kind: 'discord', normalized: body, build: sanitizeDiscordPayload(body) };
  }

  // 2) event wrapper
  if (typeof body.event === 'string' && body.event.trim().length > 0) {
    const event = body.event.trim();
    const payload = isPlainObject(body.payload) ? body.payload : {};

    // If event payload is already a discord payload, passthrough it
    if (isRawDiscordPayload(payload)) {
      return { kind: 'event-discord', normalized: { event, payload }, build: sanitizeDiscordPayload(payload) };
    }

    return { kind: 'event-structured', normalized: { event, payload }, build: buildEventDiscordPayload(event, payload) };
  }

  // 3) roll wrapper
  if (Object.prototype.hasOwnProperty.call(body, 'roll')) {
    const validation = validateRollPayload(body.roll);
    if (!validation.ok) return { error: 'invalid_roll', details: validation.details };
    return { kind: 'roll', normalized: { roll: validation.value }, build: buildRollDiscordPayload(validation.value) };
  }

  return { error: 'unknown_payload' };
};

const buildShape = (body) => {
  const keys = isPlainObject(body) ? Object.keys(body) : [];
  const hasEvent = isPlainObject(body) && Object.prototype.hasOwnProperty.call(body, 'event');
  const hasRoll = isPlainObject(body) && Object.prototype.hasOwnProperty.call(body, 'roll');
  const roll = hasRoll && isPlainObject(body.roll)
    ? { who: body.roll.who ?? null, expr: body.roll.expr ?? null, total: body.roll.total ?? null }
    : null;
  return { hasEvent, hasRoll, keys, roll };
};

const BLOCKED_SUBSTRING = 'rolled `roll` = **?**';

const containsBlockedContent = (payload) => {
  if (!isPlainObject(payload)) return false;
  const content = typeof payload.content === 'string' ? payload.content : '';
  if (content.includes(BLOCKED_SUBSTRING)) return true;
  if (!Array.isArray(payload.embeds)) return false;
  return payload.embeds.some((embed) => {
    if (!isPlainObject(embed)) return false;
    const description = typeof embed.description === 'string' ? embed.description : '';
    return description.includes(BLOCKED_SUBSTRING);
  });
};

const postToDiscord = async (webhookUrl, payload) => {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return { ok: false, status: response.status, body: clampText(text, 500) };
  }

  return { ok: true, status: response.status };
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  const debugMode = request.headers.get('X-Debug') === '1';

  // CORS preflight
  if (request.method === 'OPTIONS') {
    if (!isAllowedOrigin(origin)) {
      return jsonResponse({ ok: false, error: 'origin_not_allowed' }, 403, origin);
    }
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }

  // Health
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    return textResponse('ok', 200, origin);
  }

  // Only POST / or /roll
  if (request.method !== 'POST' || !['/', '/roll'].includes(url.pathname)) {
    return jsonResponse({ ok: false, error: 'not_found' }, 404, origin);
  }

  if (!isAllowedOrigin(origin)) {
    return jsonResponse({ ok: false, error: 'origin_not_allowed' }, 403, origin);
  }

  // Auth required
  if (!env.CCCG_PROXY_KEY) {
    return jsonResponse({ ok: false, error: 'missing_proxy_key', build: BUILD_ID }, 500, origin);
  }
  const provided = getAuthToken(request);
  if (!provided || provided !== String(env.CCCG_PROXY_KEY).trim()) {
    return jsonResponse({ ok: false, error: 'unauthorized', build: BUILD_ID }, 401, origin);
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json', build: BUILD_ID }, 400, origin);
  }

  // Compact log, no secrets
  const shape = buildShape(body);
  console.log('relay', { path: url.pathname, method: request.method, ...shape });

  const normalized = normalizeRequestPayload(body);
  if (normalized.error) {
    return jsonResponse(
      { ok: false, error: normalized.error, details: normalized.details, build: BUILD_ID },
      400,
      origin,
    );
  }

  // Debug never posts
  if (debugMode) {
    const blocked = containsBlockedContent(normalized.build);
    return jsonResponse(
      {
        ok: true,
        build: BUILD_ID,
        kind: normalized.kind,
        normalized: normalized.normalized,
        shape,
        blocked,
        blockedReason: blocked ? 'blocked_content' : null,
      },
      200,
      origin,
    );
  }

  if (containsBlockedContent(normalized.build)) {
    return jsonResponse(
      { ok: false, error: 'blocked_content', build: BUILD_ID },
      400,
      origin,
    );
  }

  // Only require webhook when actually posting
  if (!env.DISCORD_WEBHOOK_URL) {
    return jsonResponse({ ok: false, error: 'missing_discord_webhook', build: BUILD_ID }, 500, origin);
  }

  const result = await postToDiscord(env.DISCORD_WEBHOOK_URL, normalized.build);
  if (!result.ok) {
    return jsonResponse(
      { ok: false, error: 'discord_error', details: result.body, status: result.status, build: BUILD_ID },
      502,
      origin,
    );
  }

  return jsonResponse({ ok: true, discordStatus: result.status, build: BUILD_ID }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    try {
      return await handleRequest(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      return jsonResponse({ ok: false, error: message, build: BUILD_ID }, 500, origin);
    }
  },
};

export const __test__ = {
  normalizeRequestPayload,
  validateRollPayload,
  parseTotalValue,
  containsBlockedContent,
};
