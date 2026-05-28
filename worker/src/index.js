// Cloudflare Worker: proxies the puppy growth chart's data file through to GitHub.
//
// Routes:
//   GET  /api/data  → returns the parsed weights.json
//   PUT  /api/data  → validates body, commits a new weights.json to the repo
//   OPTIONS *       → CORS preflight
//
// Env (from wrangler.toml [vars]):
//   GITHUB_REPO       e.g. "mkny13/puppy-growth-chart"
//   GITHUB_BRANCH     e.g. "main"
//   DATA_PATH         e.g. "data/weights.json"
//   ALLOWED_ORIGIN    e.g. "https://mkny13.github.io"
//
// Secrets (`wrangler secret put`):
//   GITHUB_TOKEN  fine-grained PAT with Contents: read/write on GITHUB_REPO
//   APP_KEY       shared header value, also baked into the frontend bundle

const MAX_RETRIES = 3;

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-App-Key',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
});

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const checkAuth = (request, env) => {
  const origin = request.headers.get('Origin') || '';
  // Local dev (vite at localhost) is allowed in addition to the production origin.
  const allowed =
    origin === env.ALLOWED_ORIGIN ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:');
  if (!allowed) return { ok: false, status: 403, reason: 'origin' };
  const key = request.headers.get('X-App-Key') || '';
  if (!env.APP_KEY || key !== env.APP_KEY) {
    return { ok: false, status: 403, reason: 'key' };
  }
  return { ok: true, origin };
};

const ghHeaders = (env) => ({
  'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'puppy-growth-sync-worker',
  'X-GitHub-Api-Version': '2022-11-28',
});

const fileUrl = (env) =>
  `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${env.DATA_PATH}?ref=${env.GITHUB_BRANCH}`;

const validateBody = (body) => {
  if (!body || typeof body !== 'object') return 'body must be an object';
  if (!Array.isArray(body.entries)) return 'entries must be an array';
  if (body.entries.length > 5000) return 'too many entries';
  for (const e of body.entries) {
    if (!e || typeof e !== 'object') return 'entry must be an object';
    if (typeof e.week !== 'number' || !Number.isFinite(e.week)) return 'week must be a number';
    if (e.luke != null && (typeof e.luke !== 'number' || !Number.isFinite(e.luke))) return 'luke must be a number';
    if (e.leia != null && (typeof e.leia !== 'number' || !Number.isFinite(e.leia))) return 'leia must be a number';
  }
  return null;
};

const decodeContent = (base64) => {
  // atob → binary string → UTF-8
  const bin = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

const encodeContent = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const fetchData = async (env) => {
  const res = await fetch(fileUrl(env), { headers: ghHeaders(env) });
  if (res.status === 404) return { data: null, sha: null };
  if (!res.ok) throw new Error(`GitHub GET ${res.status}: ${await res.text()}`);
  const meta = await res.json();
  const text = decodeContent(meta.content);
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('weights.json is not valid JSON'); }
  return { data: parsed, sha: meta.sha };
};

const putData = async (env, body, sha) => {
  const payload = {
    version: 1,
    updated: new Date().toISOString(),
    entries: body.entries,
  };
  const res = await fetch(fileUrl(env).replace(/\?ref=.+$/, ''), {
    method: 'PUT',
    headers: { ...ghHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Update weights.json (${payload.entries.length} entries)`,
      content: encodeContent(JSON.stringify(payload, null, 2) + '\n'),
      branch: env.GITHUB_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (res.status === 409 || res.status === 422) {
    return { conflict: true, payload };
  }
  if (!res.ok) {
    throw new Error(`GitHub PUT ${res.status}: ${await res.text()}`);
  }
  return { conflict: false, payload };
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname !== '/api/data') {
      return json({ error: 'not found' }, 404, corsHeaders(origin));
    }

    const auth = checkAuth(request, env);
    if (!auth.ok) {
      return json({ error: 'forbidden', reason: auth.reason }, auth.status, corsHeaders(origin));
    }

    try {
      if (request.method === 'GET') {
        const { data } = await fetchData(env);
        const payload = data || { version: 1, updated: null, entries: [] };
        return json(payload, 200, corsHeaders(auth.origin));
      }

      if (request.method === 'PUT') {
        let body;
        try { body = await request.json(); }
        catch { return json({ error: 'invalid json' }, 400, corsHeaders(auth.origin)); }
        const err = validateBody(body);
        if (err) return json({ error: err }, 400, corsHeaders(auth.origin));

        let lastConflictPayload = null;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          const { sha } = await fetchData(env);
          const result = await putData(env, body, sha);
          if (!result.conflict) {
            return json(result.payload, 200, corsHeaders(auth.origin));
          }
          lastConflictPayload = result.payload;
        }
        return json(
          { error: 'conflict', message: 'concurrent writes; please retry', payload: lastConflictPayload },
          409,
          corsHeaders(auth.origin),
        );
      }

      return json({ error: 'method not allowed' }, 405, corsHeaders(auth.origin));
    } catch (e) {
      return json({ error: 'upstream', message: String(e?.message || e) }, 502, corsHeaders(auth.origin));
    }
  },
};
