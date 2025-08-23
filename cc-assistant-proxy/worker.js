export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Replace with my domains
    const ORIGINS = [
      "https://your-domain.com",
      "https://your-site.web.app"
    ];
    const origin = req.headers.get("Origin") || "";
    const allow = ORIGINS.includes(origin) ? origin : ORIGINS[0];

    const CORS = {
      "Access-Control-Allow-Origin": allow,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-store"
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }
    if (url.pathname !== "/chat" || req.method !== "POST") {
      return new Response("Not found", { status: 404, headers: CORS });
    }

    const body = await req.json().catch(() => ({}));
    const {
      messages = [],
      system = "",
      model = env.OPENROUTER_MODEL,
      stream = true,
      max_tokens,
      temperature
    } = body;

    const headers = {
      "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": allow,
      "X-Title": "Catalyst Core Assistant",
      "Content-Type": "application/json"
    };

    const payload = {
      model,
      stream,
      messages: system ? [{ role: "system", content: system }, ...messages] : messages,
      ...(max_tokens ? { max_tokens } : {}),
      ...(temperature ? { temperature } : {})
    };

    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const respHeaders = new Headers(r.headers);
    for (const [k, v] of Object.entries(CORS)) respHeaders.set(k, v);
    return new Response(r.body, { status: r.status, headers: respHeaders });
  }
};
