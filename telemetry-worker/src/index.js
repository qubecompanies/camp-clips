// ============ Camp Clips — error telemetry Worker (ES module) ============
// Receives privacy-minimal error reports from the app and (optionally) stores
// them in KV for later review. It NEVER receives photos, songs, or any media —
// only error text plus minimal context (message, stack, a context label, app
// version, path, user-agent). Deployed separately from the app via wrangler.
//
//   POST /report           → record an error (from the app; CORS-gated)
//   GET  /report?token=...  → read back recent errors (token-gated, for you)
//
// Persistence is optional: bind a KV namespace named ERRORS to keep 30 days of
// reports; without it, the Worker still logs each report (visible in
// `wrangler tail` and the dashboard).

const MAX_BODY = 8 * 1024; // 8 KB — reports are tiny; reject anything larger
const ALLOWED_ORIGINS = [
  'https://campclips.qubecompanies.com',
  'https://camp-clips-74dbc.web.app',
  'http://localhost:5173',
  'http://localhost:4173',
];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const clip = (s, n) => (typeof s === 'string' ? s.slice(0, n) : undefined);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // ---- Read back recent reports (for you), token-gated ----
    if (request.method === 'GET' && url.pathname === '/report') {
      if (!env.READ_TOKEN || url.searchParams.get('token') !== env.READ_TOKEN) {
        return new Response('Unauthorized', { status: 401 });
      }
      if (!env.ERRORS) {
        return Response.json({ errors: [], note: 'No ERRORS KV namespace bound — reports are logged only.' });
      }
      const list = await env.ERRORS.list({ prefix: 'err:', limit: 200 });
      const errors = [];
      for (const k of list.keys) {
        const v = await env.ERRORS.get(k.name);
        if (v) errors.push(JSON.parse(v));
      }
      errors.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      return Response.json({ count: errors.length, errors });
    }

    // ---- Receive a report from the app ----
    if (request.method === 'POST' && url.pathname === '/report') {
      const len = Number(request.headers.get('Content-Length') || 0);
      if (len > MAX_BODY) {
        return new Response('Too large', { status: 413, headers: corsHeaders(origin) });
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response('Bad JSON', { status: 400, headers: corsHeaders(origin) });
      }

      // Whitelist + truncate. Anything not listed here is dropped on the floor.
      const record = {
        ts: Date.now(),
        message: clip(body.message, 500),
        stack: clip(body.stack, 4000),
        context: clip(body.context, 200),
        app: clip(body.app, 40),
        version: clip(body.version, 40),
        path: clip(body.path, 200),
        ua: clip(request.headers.get('User-Agent'), 300),
        country: request.cf ? request.cf.country : undefined,
      };

      console.log('[camp-clips error]', JSON.stringify(record));

      if (env.ERRORS) {
        const key = `err:${record.ts}:${Math.random().toString(36).slice(2, 8)}`;
        // Keep reports for 30 days, then let them expire automatically.
        await env.ERRORS.put(key, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 30 });
      }

      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    return new Response('Not found', { status: 404 });
  },
};
