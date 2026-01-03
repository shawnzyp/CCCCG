const ALLOWED_ORIGIN = 'https://shawnzyp.github.io';
const BUILD_ID = 'ccapp-2025-03-06-a';

const buildCorsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
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

const isPlainObject = (value) =>
  Boolean(value)
  && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const invalidRollDetails = (roll, expr) => ({
  expr,
  totalType: typeof roll?.total,
  totalValue: roll?.total ?? null,
});

const validateRollPayload = (roll) => {
  if (!isPlainObject(roll)) {
    return { ok: false, details: invalidRollDetails({}, null) };
  }
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

const buildRollDiscordPayload = (roll) => ({
  embeds: [
    {
      title: 'Roll',
      description: formatRollMessage(roll),
    },
  ],
});

const clampText = (text, limit) => {
  if (!text) return '';
  const value = String(text);
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 3)}...`;
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
    if (fields.length >= 5) break;
    const value = detail[key];
    if (value == null) continue;
    if (typeof value === 'object') continue;
    fields.push({
      name: clampText(label, 256),
      value: clampText(value, 1024),
      inline: false,
    });
  }
  return fields;
};

const buildEventDiscordPayload = (event, payload) => {
  const detail = isPlainObject(payload?.detail) ? payload.detail : {};
  const actor = isPlainObject(payload?.actor) ? payload.actor : {};
  const actorName = pickActorName(payload, actor);
  const message = detail.message
    || detail.summary
    || payload?.message
    || payload?.summary
    || '';
  const descriptionParts = [];
  if (actorName) {
    descriptionParts.push(`**${actorName}**`);
  }
  if (message) {
    descriptionParts.push(String(message));
  }
  const descriptionFallback = event ? `Event: ${event}` : 'Event';
  const description = clampText(descriptionParts.join(' '), 4096) || descriptionFallback;
  const fields = [];
  if (event) {
    fields.push({ name: 'Event', value: clampText(event, 1024), inline: true });
  }
  if (actorName) {
    fields.push({ name: 'Actor', value: clampText(actorName, 1024), inline: true });
  }
  const detailFields = buildEventFields(detail);
  const embed = {
    title: 'Event',
    description,
    fields: [...fields, ...detailFields].slice(0, 6),
  };
  return { embeds: [embed] };
};

const isRawDiscordPayload = (payload) => {
  if (!isPlainObject(payload)) return false;
  return Boolean(payload.content || payload.embeds || payload.username);
};

const normalizeRequestPayload = (payload) => {
  if (!isPlainObject(payload)) {
    return { error: 'unknown_payload' };
  }
  if (isRawDiscordPayload(payload)) {
    return { kind: 'discord', normalized: payload, build: payload };
  }
  const event = payload.event;
  const hasEvent = typeof event === 'string' && event.trim().length > 0;
  if (hasEvent) {
    const eventPayload = isPlainObject(payload.payload) ? payload.payload : {};
    if (isRawDiscordPayload(eventPayload)) {
      return {
        kind: 'event-discord',
        normalized: { event, payload: eventPayload },
        build: eventPayload,
      };
    }
    return {
      kind: 'event-structured',
      normalized: { event, payload: eventPayload },
      build: buildEventDiscordPayload(event, eventPayload),
    };
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'roll')) {
    const validation = validateRollPayload(payload.roll);
    if (!validation.ok) {
      return { error: 'invalid_roll', details: validation.details };
    }
    return {
      kind: 'roll',
      normalized: { roll: validation.value },
      build: buildRollDiscordPayload(validation.value),
    };
  }
  return { error: 'unknown_payload' };
};

const buildShape = (payload) => {
  const keys = isPlainObject(payload) ? Object.keys(payload) : [];
  const hasEvent = isPlainObject(payload) && 'event' in payload;
  const hasRoll = isPlainObject(payload) && 'roll' in payload;
  const roll = hasRoll && isPlainObject(payload.roll)
    ? {
        who: payload.roll.who ?? null,
        expr: payload.roll.expr ?? null,
        total: payload.roll.total ?? null,
      }
    : null;
  return { hasEvent, hasRoll, keys, roll };
};

const logIncomingShape = (payload, path, method) => {
  const shape = buildShape(payload);
  console.log('incoming shape', { path, method, ...shape });
  return shape;
};

const postToDiscord = async (webhookUrl, payload) => {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        body: await response.text(),
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      body: error instanceof Error ? error.message : 'Discord request failed',
    };
  }
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  const debugMode = request.headers.get('X-Debug') === '1';

  if ((url.pathname === '/roll' || url.pathname === '/') && request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }

  if ((url.pathname === '/' || url.pathname === '/health') && request.method === 'GET') {
    return textResponse('ok', 200, origin);
  }

  if (!['/roll', '/'].includes(url.pathname) || request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'not_found' }, 404, origin);
  }

  if (!env.DISCORD_WEBHOOK_URL) {
    return jsonResponse({ ok: false, error: 'missing_discord_webhook' }, 500, origin);
  }

  if (!env.CCCG_PROXY_KEY) {
    return jsonResponse({ ok: false, error: 'missing_proxy_key' }, 500, origin);
  }

  const providedSecret = request.headers.get('X-CCCG-Secret') || '';
  const authHeader = request.headers.get('Authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const bearerToken = bearerMatch ? bearerMatch[1] : '';
  if (providedSecret !== env.CCCG_PROXY_KEY && bearerToken !== env.CCCG_PROXY_KEY) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401, origin);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400, origin);
  }

  const shape = logIncomingShape(payload, url.pathname, request.method);
  const normalized = normalizeRequestPayload(payload);
  if (normalized.error) {
    const status = normalized.error === 'invalid_roll' ? 400 : 400;
    return jsonResponse(
      {
        ok: false,
        error: normalized.error,
        details: normalized.details,
        build: BUILD_ID,
      },
      status,
      origin,
    );
  }

  if (debugMode) {
    return jsonResponse(
      {
        ok: true,
        build: BUILD_ID,
        kind: normalized.kind,
        normalized: normalized.normalized,
        shape,
      },
      200,
      origin,
    );
  }

  const result = await postToDiscord(env.DISCORD_WEBHOOK_URL, normalized.build);
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.body }, 502, origin);
  }

  return jsonResponse({ ok: true }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    try {
      return await handleRequest(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      return jsonResponse({ ok: false, error: message }, 500, origin);
    }
  },
};

export const __test__ = {
  normalizeRequestPayload,
  validateRollPayload,
  buildEventDiscordPayload,
  buildRollDiscordPayload,
  formatRollMessage,
};
