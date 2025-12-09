/**
 * Minimal Cloudflare Worker-style proxy for Discord webhook envelopes.
 *
 * Expected request body: {
 *   event: 'DICE_ROLL' | 'LOOT_DROP' | ...,
 *   payload: { username, embeds, ... },
 *   timestamp: string
 * }
 *
 * The proxy unwraps `payload` and forwards it to the Discord webhook URL stored
 * in DISCORD_WEBHOOK_URL. An optional APP_KEY header can be required for simple
 * shared-secret auth.
 */
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowlist = (env?.ALLOWED_ORIGINS || env?.ALLOWED_ORIGIN || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const isAllowedOrigin = !allowlist.length || !origin || allowlist.includes(origin);
    const allowedOrigin = isAllowedOrigin
      ? origin || allowlist[0] || '*'
      : allowlist[0] || '*';

    const cors = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-App-Key',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (allowlist.length && origin && !allowlist.includes(origin)) {
      return new Response('Forbidden', { status: 403, headers: cors });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    const requiredKey = env?.APP_KEY;
    const providedKey = request.headers.get('X-App-Key');
    if (requiredKey && requiredKey !== providedKey) {
      return new Response('Unauthorized', { status: 401, headers: cors });
    }

    let envelope;
    try {
      envelope = await request.json();
    } catch (err) {
      return new Response('Invalid JSON', { status: 400, headers: cors });
    }

    const payload = envelope?.payload;
    if (!payload) {
      return new Response('Missing payload', { status: 400, headers: cors });
    }

    const webhookUrl = env?.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      return new Response('Webhook URL not configured', { status: 500, headers: cors });
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const retryAfter = res.headers?.get?.('Retry-After');
    const responseHeaders = retryAfter ? { ...cors, 'Retry-After': retryAfter } : cors;

    if (!res.ok) {
      return new Response('Discord rejected payload', { status: res.status, headers: responseHeaders });
    }

    return new Response('ok', { status: 200, headers: responseHeaders });
  },
};
