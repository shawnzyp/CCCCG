const PRIMARY_ORIGIN = 'https://shawnzyp.github.io';
const LOCALHOST_ORIGINS = new Set(['http://localhost', 'http://127.0.0.1']);
const DEBUG_HEADER = 'X-CCCG-Proxy-Debug';
const SERVICE_NAME = 'discord-relay';

function resolveCorsOrigin(origin) {
  try {
    if (!origin) return PRIMARY_ORIGIN;
    const { hostname } = new URL(origin);
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return origin;
    }
    if (origin === PRIMARY_ORIGIN) return PRIMARY_ORIGIN;
  } catch {
    /* ignore origin parse errors */
  }
  return PRIMARY_ORIGIN;
}

function buildCorsHeaders(origin) {
  const allowedOrigin = resolveCorsOrigin(origin);
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CCCG-Secret, X-CCCG-Proxy-Debug',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CCCG-Secret, X-CCCG-Debug',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
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

function resolveAuthToken(request) {
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return request.headers.get('X-CCCG-Secret') || '';
}

function isAuthorized(request, secret) {
  if (!secret) return true;
  const headerSecret = resolveAuthToken(request);
  return headerSecret === secret;
}

async function forwardToDiscord(webhookUrl, payload) {
  try {
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
  } catch (err) {
    return {
      ok: false,
      status: 502,
      body: err instanceof Error ? err.message : 'Discord request failed',
    };
  }
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  const corsHeaders = buildCorsHeaders(origin);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (url.pathname === '/health' && request.method === 'GET') {
    if (!isAuthorized(request, env.CCCG_SECRET)) {
      return jsonResponse({
        ok: false,
        service: SERVICE_NAME,
        hasWebhookConfigured: !!env.DISCORD_WEBHOOK_URL,
        version: env.VERSION || env.BUILD_ID || 'unknown',
        now: new Date().toISOString(),
        error: 'unauthorized',
      }, 401, origin);
    }
    if (request.headers.get(DEBUG_HEADER)) {
      return jsonResponse({
        ok: true,
        service: SERVICE_NAME,
        hasWebhookConfigured: !!env.DISCORD_WEBHOOK_URL,
        version: env.VERSION || env.BUILD_ID || 'unknown',
        now: new Date().toISOString(),
      }, 200, origin);
    }
    if (!env.DISCORD_WEBHOOK_URL) {
      return jsonResponse({
        ok: false,
        code: 'webhook_not_configured',
        service: SERVICE_NAME,
        hasWebhookConfigured: false,
        version: env.VERSION || env.BUILD_ID || 'unknown',
        now: new Date().toISOString(),
      }, 503, origin);
    }
    return jsonResponse({
      ok: true,
      service: SERVICE_NAME,
      hasWebhookConfigured: true,
      version: env.VERSION || env.BUILD_ID || 'unknown',
      now: new Date().toISOString(),
    }, 200, origin);
      return jsonResponse({ ok: false, status: 401, body: 'Unauthorized' }, 401, origin);
    }
    return jsonResponse({ ok: true, service: 'discord-relay', ts: Date.now() }, 200, origin);
  }

  if (url.pathname !== '/roll') {
    return jsonResponse({ ok: false, status: 404, body: 'Not found' }, 404, origin);
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, status: 405, body: 'Method not allowed' }, 405, origin);
  }

  if (!isAuthorized(request, env.CCCG_SECRET)) {
    return jsonResponse({ ok: false, status: 401, body: 'Unauthorized' }, 401, origin);
  }

  const isDebug = url.searchParams.get('debug') === '1'
    || request.headers.get('X-CCCG-Debug') === '1';

  if (!env.DISCORD_WEBHOOK_URL && !isDebug) {
    return jsonResponse({ ok: false, status: 500, body: 'DISCORD_WEBHOOK_URL is not configured' }, 500, origin);
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

  if (request.headers.get(DEBUG_HEADER)) {
    return jsonResponse({ ok: true, debug: true, normalized: normalizedPayload }, 200, origin);
  }

  if (!env.DISCORD_WEBHOOK_URL) {
    return jsonResponse({ ok: false, status: 500, body: 'DISCORD_WEBHOOK_URL is not configured' }, 500, origin);
  if (isDebug) {
    return jsonResponse({ ok: true, debug: true, payload: normalizedPayload }, 200, origin);
  }

  const result = await forwardToDiscord(env.DISCORD_WEBHOOK_URL, normalizedPayload);
  if (!result.ok) {
    return jsonResponse({ ok: false, status: 502, body: result.body }, 502, origin);
  }

  return jsonResponse({ ok: true }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    try {
      return await handleRequest(request, env);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      return jsonResponse({ ok: false, status: 500, body: message }, 500, origin);
    }
  },
};
