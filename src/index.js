const ALLOWED_ORIGIN = 'https://shawnzyp.github.io';

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

const validateRollPayload = (roll) => {
  if (!roll || typeof roll !== 'object') {
    return { ok: false, details: { reason: 'missing_roll' } };
  }
  const expr = roll.expr != null ? String(roll.expr).trim() : '';
  if (!expr) {
    return { ok: false, details: { reason: 'missing_expr' } };
  }
  if (expr.toLowerCase() === 'roll') {
    return { ok: false, details: { reason: 'placeholder_expr', expr } };
  }
  const total = parseTotalValue(roll.total);
  if (total == null) {
    return { ok: false, details: { reason: 'invalid_total', total: roll.total } };
  }
  return {
    ok: true,
    value: {
      who: roll.who ? String(roll.who) : 'Unknown',
      expr,
      total,
      breakdown: roll.breakdown ? String(roll.breakdown) : '',
    },
  };
};

const formatRollMessage = (roll) => {
  const who = roll.who ? String(roll.who) : 'Unknown';
  const expr = roll.expr ? String(roll.expr) : 'Roll';
  const total = roll.total != null ? String(roll.total) : '?';
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

const buildEventDiscordPayload = (event, payload) => {
  const detail = payload?.detail && typeof payload.detail === 'object' ? payload.detail : {};
  const actor = payload?.actor && typeof payload.actor === 'object' ? payload.actor : {};
  const description = detail.message || detail.summary || '';
  const fields = [];
  if (event) {
    fields.push({ name: 'Event', value: String(event), inline: true });
  }
  const actorName = actor.playerName || actor.characterName || actor.vigilanteName || actor.name;
  if (actorName) {
    fields.push({ name: 'Actor', value: String(actorName), inline: true });
  }
  const embed = {
    title: 'Event',
    description: description || (event ? `Event: ${event}` : 'Event'),
  };
  if (fields.length) embed.fields = fields;
  return { embeds: [embed] };
};

const isRawDiscordPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return false;
  return Boolean(payload.content || payload.embeds || payload.username);
};

const normalizeRequestPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return { error: 'invalid_payload', details: { reason: 'missing_body' } };
  }
  const hasEvent = Object.prototype.hasOwnProperty.call(payload, 'event')
    && Object.prototype.hasOwnProperty.call(payload, 'payload');
  if (hasEvent) {
    return {
      kind: 'event',
      normalized: { event: payload.event, payload: payload.payload },
      build: buildEventDiscordPayload(payload.event, payload.payload),
    };
  }
  if (isRawDiscordPayload(payload)) {
    return { kind: 'raw', normalized: payload, build: payload };
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
  return { error: 'invalid_payload', details: { reason: 'unsupported_shape' } };
};

const logIncomingShape = (payload, path) => {
  const keys = payload && typeof payload === 'object' ? Object.keys(payload) : [];
  const hasEvent = payload && typeof payload === 'object' && 'event' in payload;
  const hasRoll = payload && typeof payload === 'object' && 'roll' in payload;
  const roll = hasRoll && payload.roll && typeof payload.roll === 'object'
    ? {
        who: payload.roll.who ?? null,
        expr: payload.roll.expr ?? null,
        total: payload.roll.total ?? null,
      }
    : null;
  console.log('incoming shape', { path, hasEvent, hasRoll, keys, roll });
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

  logIncomingShape(payload, url.pathname);
  const normalized = normalizeRequestPayload(payload);
  if (normalized.error) {
    const status = normalized.error === 'invalid_roll' ? 400 : 400;
    return jsonResponse({ ok: false, error: normalized.error, details: normalized.details }, status, origin);
  }

  if (debugMode) {
    return jsonResponse(
      { ok: true, kind: normalized.kind, normalized: normalized.normalized, build: normalized.build },
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
