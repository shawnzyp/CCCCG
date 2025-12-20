export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/report" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      // TODO: verify token, store, email, etc.
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    return new Response("ok");
  },
};
