export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (url.pathname === "/report" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      // TODO: verify token, store, email, etc.
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    return new Response("ok", { headers: corsHeaders });
  },
};
