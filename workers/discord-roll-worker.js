const ALLOWED_ORIGINS = new Set([
  'https://shawnzyp.github.io',
  'http://localhost',
  'http://127.0.0.1',
]);

function resolveCorsOrigin(origin) {
  if (!origin) return '';
  try {
    const url = new URL(origin);
    if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.protocol === 'http:') {
      return origin;
    }
  } catch (_) {
    return '';
  }
  return ALLOWED_ORIGINS.has(origin) ? origin : '';
}

function buildCorsHeaders(origin) {
  const allowedOrigin = resolveCorsOrigin(origin);
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CCCG-Secret',
  };
}

function jsonResponse(body, status = 200, origin = '') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...buildCorsHeaders(origin),
      'Content-Type': 'application/json',
    },
  });
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.content || payload.username || payload.embeds) {
    return payload;
  }
  const roll = payload.roll;
  if (roll && typeof roll === 'object') {
    const who = roll.who ? String(roll.who) : 'Unknown';
    const expr = roll.expr ? String(roll.expr) : 'Roll';
    const total = roll.total != null ? String(roll.total) : '?';
    const breakdown = roll.breakdown ? `\n${roll.breakdown}` : '';
    return {
      content: `**${who}** rolled ${expr} = **${total}**${breakdown}`,
    };
  }
  return null;
}

function isAuthorized(request, secret) {
  if (!secret) return true;
  const headerSecret = request.headers.get('X-CCCG-Secret');
  const authHeader = request.headers.get('Authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return headerSecret === secret || bearer === secret;
}

async function forwardToDiscord(webhookUrl, payload) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    return {
      ok: false,
      status: response.status,
      body: text,
    };
  }
  return { ok: true };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = buildCorsHeaders(origin);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname !== '/roll') {
      return jsonResponse({ ok: false, status: 404, body: 'Not found' }, 404, origin);
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, status: 405, body: 'Method not allowed' }, 405, origin);
    }

    if (!env.DISCORD_WEBHOOK_URL) {
      return jsonResponse({ ok: false, status: 500, body: 'DISCORD_WEBHOOK_URL is not configured' }, 500, origin);
    }

    if (!isAuthorized(request, env.SHARED_SECRET)) {
      return jsonResponse({ ok: false, status: 401, body: 'Unauthorized' }, 401, origin);
    }

    let payload = null;
    try {
      payload = await request.json();
    } catch (err) {
      return jsonResponse({ ok: false, status: 400, body: 'Invalid JSON payload' }, 400, origin);
    }

    const normalizedPayload = normalizePayload(payload);
    if (!normalizedPayload) {
      return jsonResponse({ ok: false, status: 400, body: 'Unsupported payload format' }, 400, origin);
    }

    const result = await forwardToDiscord(env.DISCORD_WEBHOOK_URL, normalizedPayload);
    if (!result.ok) {
      return jsonResponse({ ok: false, status: 502, body: result.body }, 502, origin);
    }

    return jsonResponse({ ok: true }, 200, origin);
  },
};
