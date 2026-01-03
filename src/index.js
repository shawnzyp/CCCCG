const ALLOWED_ORIGIN = 'https://shawnzyp.github.io';

const buildCorsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-CCCG-Secret',
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

const formatRollMessage = (roll) => {
  if (!roll || typeof roll !== 'object') {
    throw new Error('Invalid roll payload');
  }
  const who = roll.who ? String(roll.who) : 'Unknown';
  const expr = roll.expr ? String(roll.expr) : 'Roll';
  const total = roll.total != null ? String(roll.total) : '?';
  const breakdown = roll.breakdown ? `\n${roll.breakdown}` : '';
  return `**${who}** rolled ${expr} = **${total}**${breakdown}`;
};

const postToDiscord = async (webhookUrl, content) => {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
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

  if (url.pathname === '/roll' && request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }

  if ((url.pathname === '/' || url.pathname === '/health') && request.method === 'GET') {
    return textResponse('ok', 200, origin);
  }

  if (url.pathname !== '/roll' || request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'not_found' }, 404, origin);
  }

  if (!env.DISCORD_WEBHOOK_URL) {
    return jsonResponse({ ok: false, error: 'missing_discord_webhook' }, 500, origin);
  }

  if (!env.CCCG_PROXY_KEY) {
    return jsonResponse({ ok: false, error: 'missing_proxy_key' }, 500, origin);
  }

  const providedSecret = request.headers.get('X-CCCG-Secret') || '';
  if (providedSecret !== env.CCCG_PROXY_KEY) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401, origin);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400, origin);
  }

  let content;
  try {
    content = formatRollMessage(payload?.roll);
  } catch (error) {
    return jsonResponse({ ok: false, error: 'invalid_roll' }, 400, origin);
  }

  const result = await postToDiscord(env.DISCORD_WEBHOOK_URL, content);
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
