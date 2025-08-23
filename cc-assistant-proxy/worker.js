export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    const ORIGINS = [
      "https://mycampaignsite.com", // replace with my real domain(s)
      "http://localhost:3000"
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
      return new Response(JSON.stringify({error:"Not found"}), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    let body; try { body = await req.json(); } catch { body = {}; }
    const { messages=[], system="", model=env.OPENROUTER_MODEL, stream=true, max_tokens, temperature } = body;

    if (!env.OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not set" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const headers = {
      "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": allow,
      "X-Title": "Catalyst Core Assistant",
      "Content-Type": "application/json",
      "Accept": "text/event-stream"
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
        method: "POST", headers, body: JSON.stringify(payload)
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Network error", detail: String(e) }), {
        status: 502,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const ct = upstream.headers.get("Content-Type") || "";
    if (!upstream.ok) {
      let text = await upstream.text();
      return new Response(text, { status: upstream.status, headers: { ...CORS, "Content-Type": "application/json" }});
    }

    if (ct.includes("text/event-stream")) {
      const headersSSE = new Headers(upstream.headers);
      for (const [k,v] of Object.entries(CORS)) headersSSE.set(k,v);
      headersSSE.set("Content-Type","text/event-stream; charset=utf-8");
      headersSSE.set("Cache-Control","no-store");
      headersSSE.set("Connection","keep-alive");
      return new Response(upstream.body, { status:200, headers:headersSSE });
    }

    const json = await upstream.text();
    return new Response(json, { status:200, headers:{ ...CORS, "Content-Type":"application/json" }});
  }
};

