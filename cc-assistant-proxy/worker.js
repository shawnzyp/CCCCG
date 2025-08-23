export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // ALLOW MY SITES ONLY (origin must be exact: scheme + host + optional port)
    const ORIGINS = [
      "https://shawnzyp.github.io",
      "http://localhost:3000",
      "http://localhost:5173"
    ];
    const origin = req.headers.get("Origin") || "";
    const allow = ORIGINS.includes(origin) ? origin : ORIGINS[0];

    const CORS = {
      "Access-Control-Allow-Origin": allow,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Expose-Headers": "Content-Type",
      "Cache-Control": "no-store",
      "Vary": "Origin"
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }
    if (url.pathname !== "/chat" || req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    let body;
    try { body = await req.json(); } catch { body = {}; }

    const {
      messages = [],
      system = "",
      model = env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free",
      stream = true,
      max_tokens,
      temperature
    } = body;

    if (!env.OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY is not set in Worker secrets." }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const headers = {
      "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": allow,          // recommended by OpenRouter
      "X-Title": "Catalyst Core Assistant",
      "Content-Type": "application/json",
      "Accept": "text/event-stream"   // request SSE when streaming
    };

    const payload = {
      model,
      stream,
      messages: system ? [{ role: "system", content: system }, ...messages] : messages,
      ...(max_tokens ? { max_tokens } : {}),
      ...(temperature ? { temperature } : {})
    };

    let upstream;
    try {
      upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Network error contacting OpenRouter", detail: String(e) }), {
        status: 502,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const ct = upstream.headers.get("Content-Type") || "";
    if (!upstream.ok) {
      let text = await upstream.text();
      // forward any OpenRouter error body
      return new Response(text, {
        status: upstream.status,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    if (ct.includes("text/event-stream")) {
      // Pass through SSE stream
      const sseHeaders = new Headers(upstream.headers);
      for (const [k,v] of Object.entries(CORS)) sseHeaders.set(k, v);
      sseHeaders.set("Content-Type", "text/event-stream; charset=utf-8");
      sseHeaders.set("Cache-Control", "no-store");
      sseHeaders.set("Connection", "keep-alive");
      return new Response(upstream.body, { status: 200, headers: sseHeaders });
    }

    // Fallback: non-stream JSON
    const json = await upstream.text();
    return new Response(json, {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
};
