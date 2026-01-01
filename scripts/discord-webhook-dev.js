const DISCORD_WEBHOOK_PREFIX = 'https://discord.com/api/webhooks/';

function isLocalhostHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function requireAbsoluteDiscordWebhookUrl(url) {
  if (typeof url !== 'string' || !url.startsWith(DISCORD_WEBHOOK_PREFIX)) {
    throw new Error('Discord webhook URL must be a full https://discord.com/api/webhooks/... URL.');
  }
  return url;
}

async function sendDiscordWebhookTest(url, payload) {
  const target = requireAbsoluteDiscordWebhookUrl(url);
  const body = payload && typeof payload === 'object' ? payload : {
    content: 'CCCG webhook test. Provide a JSON payload to override this message.',
  };
  const response = await fetch(target, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord webhook failed: HTTP ${response.status} ${text}`.trim());
  }
  return true;
}

if (typeof window !== 'undefined') {
  if (isLocalhostHost(window.location?.hostname || '')) {
    window.__CCCG_TEST_DISCORD_WEBHOOK__ = sendDiscordWebhookTest;
  }
}

export { sendDiscordWebhookTest };
