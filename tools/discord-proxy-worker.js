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
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const requiredKey = env?.APP_KEY;
    const providedKey = request.headers.get('X-App-Key');
    if (requiredKey && requiredKey !== providedKey) {
      return new Response('Unauthorized', { status: 401 });
    }

    let envelope;
    try {
      envelope = await request.json();
    } catch (err) {
      return new Response('Invalid JSON', { status: 400 });
    }

    const payload = envelope?.payload;
    if (!payload) {
      return new Response('Missing payload', { status: 400 });
    }

    const webhookUrl = env?.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      return new Response('Webhook URL not configured', { status: 500 });
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return new Response('Discord rejected payload', { status: res.status });
    }

    return new Response('ok', { status: 200 });
  },
};
