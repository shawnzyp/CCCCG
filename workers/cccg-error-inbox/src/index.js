export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-CCCG-Auth",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const requireAuth = typeof env.AUTH_KEY === "string" && env.AUTH_KEY.length > 0;
    if (requireAuth) {
      const auth = request.headers.get("X-CCCG-Auth");
      if (auth !== env.AUTH_KEY) {
        return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
      }
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    if (url.pathname === "/log") {
      const body = await request.json().catch(() => ({}));
      const webhookUrl = env.LOG_WEBHOOK_URL;
      if (!webhookUrl) {
        return new Response(JSON.stringify({ ok: false, error: "missing_log_webhook" }), {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
      }
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return new Response(JSON.stringify({ ok: res.ok }), {
        status: res.ok ? 200 : 502,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    if (url.pathname === "/report") {
      const body = await request.json().catch(() => ({}));
      const webhookUrl = env.ERROR_WEBHOOK_URL;
      if (!webhookUrl) {
        return new Response(JSON.stringify({ ok: false, error: "missing_error_webhook" }), {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
      }

      const discordPayload = buildErrorPayload(body);
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discordPayload),
      });

      return new Response(JSON.stringify({ ok: res.ok }), {
        status: res.ok ? 200 : 502,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
      status: 404,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  },
};

function clampText(value, max) {
  if (typeof value !== "string") return "";
  if (!Number.isFinite(max) || max <= 0) return value;
  return value.length > max ? value.slice(0, Math.max(0, max - 1)) + "…" : value;
}

function buildErrorPayload(payload = {}) {
  const kind = clampText(String(payload.kind || "error"), 100);
  const message = clampText(String(payload.message || "Unknown error"), 2000);
  const url = clampText(String(payload.url || ""), 2000);
  const stack = clampText(String(payload.stack || ""), 4000);
  const ua = clampText(String(payload.ua || ""), 300);
  const build = clampText(String(payload.build || ""), 100);
  const extra = payload.extra && typeof payload.extra === "object"
    ? clampText(JSON.stringify(payload.extra), 1000)
    : "";

  const fields = [];
  if (url) fields.push({ name: "URL", value: url });
  if (build) fields.push({ name: "Build", value: build, inline: true });
  if (ua) fields.push({ name: "User Agent", value: ua });
  if (extra) fields.push({ name: "Extra", value: extra });
  if (stack) fields.push({ name: "Stack", value: `\`\`\`\n${stack}\n\`\`\`` });

  return {
    content: `Error report: ${kind}`,
    embeds: [
      {
        title: message,
        color: 15158332,
        fields,
      },
    ],
  };
}
