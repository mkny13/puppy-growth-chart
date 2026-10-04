import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../worker/src/index.js';

// No network, no real secrets: env is fake and global fetch is mocked.
const ORIGIN = 'https://mkny13.github.io';
const env = {
  GITHUB_REPO: 'owner/repo',
  GITHUB_BRANCH: 'main',
  DATA_PATH: 'data/weights.json',
  ALLOWED_ORIGIN: ORIGIN,
  GITHUB_TOKEN: 'test-token',
  APP_KEY: 'test-key',
};

const b64 = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str)));
const ghFile = (obj, sha = 'sha1') => ({ content: b64(JSON.stringify(obj)), sha });
const res = (status, body) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body ?? {}), { status });

const req = (method, { path = '/api/data', origin = ORIGIN, key = 'test-key', body } = {}) =>
  new Request(`https://worker.test${path}`, {
    method,
    headers: {
      ...(origin ? { Origin: origin } : {}),
      ...(key ? { 'X-App-Key': key } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const call = (r, e = env) => worker.fetch(r, e);

describe('routing and CORS', () => {
  it('answers OPTIONS preflight without auth', async () => {
    const r = await call(req('OPTIONS', { key: null }));
    expect(r.status).toBe(204);
    expect(r.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
    expect(r.headers.get('Access-Control-Allow-Headers')).toContain('X-App-Key');
  });
  it('404s unknown paths', async () => {
    const r = await call(req('GET', { path: '/nope' }));
    expect(r.status).toBe(404);
  });
});

describe('auth', () => {
  it('rejects a foreign origin', async () => {
    const r = await call(req('GET', { origin: 'https://evil.example' }));
    expect(r.status).toBe(403);
    expect((await r.json()).reason).toBe('origin');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects a missing origin', async () => {
    const r = await call(req('GET', { origin: null }));
    expect(r.status).toBe(403);
  });
  it('rejects a wrong or missing key', async () => {
    for (const key of ['wrong', null]) {
      const r = await call(req('GET', { key }));
      expect(r.status).toBe(403);
      expect((await r.json()).reason).toBe('key');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects everything when the server has no APP_KEY configured', async () => {
    const r = await call(req('GET', { key: '' }), { ...env, APP_KEY: undefined });
    expect(r.status).toBe(403);
  });
  it('allows local dev origins', async () => {
    fetchMock.mockImplementation(async () => res(200, ghFile({ version: 1, updated: 'x', entries: [] })));
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:4173']) {
      const r = await call(req('GET', { origin }));
      expect(r.status).toBe(200);
      expect(r.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    }
  });
  it('does not allow look-alike origins', async () => {
    for (const origin of ['http://localhost.evil.com', 'https://mkny13.github.io.evil.com']) {
      const r = await call(req('GET', { origin }));
      expect(r.status).toBe(403);
    }
  });
});

describe('GET /api/data', () => {
  it('returns the decoded file from GitHub, using the token', async () => {
    const data = { version: 1, updated: '2026-01-01T00:00:00Z', entries: [{ week: 10, luke: 17.3 }] };
    fetchMock.mockResolvedValueOnce(res(200, ghFile(data)));
    const r = await call(req('GET'));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(data);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/owner/repo/contents/data/weights.json?ref=main');
    expect(init.headers.Authorization).toBe('Bearer test-token');
  });
  it('returns an empty payload when the file does not exist yet', async () => {
    fetchMock.mockResolvedValueOnce(res(404, {}));
    const r = await call(req('GET'));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ version: 1, updated: null, entries: [] });
  });
  it('decodes UTF-8 content', async () => {
    fetchMock.mockResolvedValueOnce(res(200, ghFile({ version: 1, updated: 'é☃', entries: [] })));
    expect((await (await call(req('GET'))).json()).updated).toBe('é☃');
  });
  it('maps GitHub errors to 502', async () => {
    fetchMock.mockResolvedValueOnce(res(500, 'boom'));
    const r = await call(req('GET'));
    expect(r.status).toBe(502);
    expect((await r.json()).error).toBe('upstream');
  });
  it('maps corrupt JSON in the repo to 502', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { content: b64('{not json'), sha: 's' }));
    const r = await call(req('GET'));
    expect(r.status).toBe(502);
    expect((await r.json()).message).toContain('not valid JSON');
  });
  it('rejects unsupported methods', async () => {
    const r = await call(req('DELETE'));
    expect(r.status).toBe(405);
  });
});

describe('PUT /api/data', () => {
  const entries = [{ week: 10, luke: 17.3, leia: 11.8 }, { week: 11, luke: 19 }];

  it('commits the new file with the current sha and returns the payload', async () => {
    fetchMock
      .mockResolvedValueOnce(res(200, ghFile({ entries: [] }, 'old-sha')))
      .mockResolvedValueOnce(res(200, {}));
    const r = await call(req('PUT', { body: { entries } }));
    expect(r.status).toBe(200);
    const out = await r.json();
    expect(out.version).toBe(1);
    expect(out.entries).toEqual(entries);
    expect(Number.isNaN(Date.parse(out.updated))).toBe(false);

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://api.github.com/repos/owner/repo/contents/data/weights.json');
    expect(init.method).toBe('PUT');
    const sent = JSON.parse(init.body);
    expect(sent.sha).toBe('old-sha');
    expect(sent.branch).toBe('main');
    expect(sent.message).toBe('Update weights.json (2 entries)');
    const written = JSON.parse(atob(sent.content));
    expect(written.entries).toEqual(entries);
    expect(atob(sent.content).endsWith('\n')).toBe(true);
  });
  it('creates the file (no sha) when it does not exist', async () => {
    fetchMock.mockResolvedValueOnce(res(404, {})).mockResolvedValueOnce(res(200, {}));
    const r = await call(req('PUT', { body: { entries } }));
    expect(r.status).toBe(200);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty('sha');
  });
  it('retries on a sha conflict and then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(res(200, ghFile({}, 'a')))
      .mockResolvedValueOnce(res(409, {}))
      .mockResolvedValueOnce(res(200, ghFile({}, 'b')))
      .mockResolvedValueOnce(res(200, {}));
    const r = await call(req('PUT', { body: { entries } }));
    expect(r.status).toBe(200);
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).sha).toBe('b');
  });
  it('gives up with 409 after 3 conflicts', async () => {
    for (let i = 0; i < 3; i++) {
      fetchMock.mockResolvedValueOnce(res(200, ghFile({}, `s${i}`))).mockResolvedValueOnce(res(422, {}));
    }
    const r = await call(req('PUT', { body: { entries } }));
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe('conflict');
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
  it('maps a GitHub write failure to 502', async () => {
    fetchMock.mockResolvedValueOnce(res(200, ghFile({}, 'a'))).mockResolvedValueOnce(res(500, 'nope'));
    const r = await call(req('PUT', { body: { entries } }));
    expect(r.status).toBe(502);
  });

  describe('validation (never reaches GitHub)', () => {
    const bad = {
      'invalid json': '{oops',
      'non-object body': 'null',
      'missing entries': {},
      'entries not an array': { entries: 'x' },
      'too many entries': { entries: Array.from({ length: 5001 }, () => ({ week: 1 })) },
      'non-object entry': { entries: [1] },
      'null entry': { entries: [null] },
      'string week': { entries: [{ week: '10' }] },
      'infinite week': { entries: [{ week: Infinity }] },
      'string luke': { entries: [{ week: 1, luke: '5' }] },
      'string leia': { entries: [{ week: 1, leia: '5' }] },
    };
    for (const [name, body] of Object.entries(bad)) {
      it(`400s on ${name}`, async () => {
        const r = await call(req('PUT', { body }));
        expect(r.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
      });
    }
    it('accepts a missing dog value (null/undefined)', async () => {
      fetchMock.mockResolvedValueOnce(res(404, {})).mockResolvedValueOnce(res(200, {}));
      const r = await call(req('PUT', { body: { entries: [{ week: 1, luke: null }, { week: 2 }] } }));
      expect(r.status).toBe(200);
    });
    it('requires auth before touching the body or GitHub', async () => {
      const r = await call(req('PUT', { key: 'wrong', body: { entries } }));
      expect(r.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
