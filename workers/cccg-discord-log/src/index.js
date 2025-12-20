const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-CCCG-Auth",
};

const MAX_PAYLOAD_BYTES = 28 * 1024;
const MAX_CONTENT_CHARS = 1900;
const MAX_EMBEDS = 5;

const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
let rateTokens = RATE_LIMIT_MAX;
let rateRefillAt = Date.now();

function checkRateLimit() {
  const now = Date.now();
  const elapsed = now - rateRefillAt;
  if (elapsed >= RATE_LIMIT_WINDOW_MS) {
    rateTokens = RATE_LIMIT_MAX;
    rateRefillAt = now;
  }
  if (rateTokens <= 0) return false;
  rateTokens -= 1;
  return true;
}

async function readJson(request) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return { error: "Payload too large", status: 413 };
  }
  const text = await request.text();
  if (text.length > MAX_PAYLOAD_BYTES) {
    return { error: "Payload too large", status: 413 };
  }
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: "Bad JSON", status: 400 };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST" || url.pathname !== "/discord/log") {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    if (!checkRateLimit()) {
      return new Response("Rate limited", { status: 429, headers: corsHeaders });
    }

    const auth = request.headers.get("X-CCCG-Auth") || "";
    if (!env.CCCG_AUTH || auth !== env.CCCG_AUTH) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    if (!env.DISCORD_WEBHOOK_URL) {
      return new Response("Webhook not configured", { status: 500, headers: corsHeaders });
    }

    const { body, error, status } = await readJson(request);
    if (error) {
      return new Response(error, { status, headers: corsHeaders });
    }

    const content = typeof body?.content === "string" ? body.content.trim() : "";
    const embeds = Array.isArray(body?.embeds) ? body.embeds.slice(0, MAX_EMBEDS) : undefined;

    if (!content && !embeds?.length) {
      return new Response("Empty payload", { status: 400, headers: corsHeaders });
    }

    const payload = {
      content: content.slice(0, MAX_CONTENT_CHARS),
      ...(embeds?.length ? { embeds } : {}),
    };

    const res = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    return new Response(JSON.stringify({ ok: res.ok, status: res.status }), {
      status: res.ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  },
};
