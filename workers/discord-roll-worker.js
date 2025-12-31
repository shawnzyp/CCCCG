const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...DEFAULT_HEADERS,
      'Content-Type': 'application/json',
    },
  });
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
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: DEFAULT_HEADERS });
    }

    if (url.pathname !== '/roll') {
      return jsonResponse({ error: 'Not found' }, 404);
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    if (!env.DISCORD_WEBHOOK_URL) {
      return jsonResponse({ error: 'DISCORD_WEBHOOK_URL is not configured' }, 500);
    }

    let payload = null;
    try {
      payload = await request.json();
    } catch (err) {
      return jsonResponse({ error: 'Invalid JSON payload' }, 400);
    }

    if (!payload || typeof payload !== 'object') {
      return jsonResponse({ error: 'Payload must be a JSON object' }, 400);
    }

    const result = await forwardToDiscord(env.DISCORD_WEBHOOK_URL, payload);
    if (!result.ok) {
      return jsonResponse({ error: 'Discord webhook failed', details: result.body }, 502);
    }

    return jsonResponse({ ok: true });
  },
};
