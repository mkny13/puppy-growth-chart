# puppy-growth-sync (Cloudflare Worker)

Tiny proxy between the puppy growth chart frontend and `data/weights.json` in
this repo. Holds a GitHub PAT server-side so the static site never sees it.

## Routes

- `GET /api/data` — returns `{ version, updated, entries }`.
- `PUT /api/data` — body `{ entries: [...] }`. Writes `data/weights.json` and
  commits to `main`. Retries up to 3× on 409/422 SHA conflicts.

Both routes require:
- `Origin: https://mkny13.github.io` (or `http://localhost:*` for dev)
- `X-App-Key: <APP_KEY>` header

## One-time deploy

1. **Cloudflare account.** Free tier is fine. `npm i -g wrangler && wrangler login`.

2. **GitHub PAT.** Generate a fine-grained token at
   https://github.com/settings/personal-access-tokens/new:
   - Resource owner: your account
   - Repository access: **only** `mkny13/puppy-growth-chart`
   - Permissions → Repository → **Contents: Read and write**
   - Expiry: 1 year (set a calendar reminder to rotate)

3. **Pick an `APP_KEY`.** Any random string, e.g. `openssl rand -hex 24`. Keep
   it handy — it goes into both the Worker secret and the frontend bundle.

4. **From this `worker/` directory:**
   ```sh
   wrangler secret put GITHUB_TOKEN   # paste the PAT
   wrangler secret put APP_KEY        # paste the random string
   wrangler deploy
   ```
   Note the deployed URL (e.g. `https://puppy-growth-sync.<sub>.workers.dev`).

5. **Wire the frontend.** Edit `src/GrowthChart.jsx` and set:
   ```js
   const WORKER_URL = 'https://puppy-growth-sync.<sub>.workers.dev';
   const APP_KEY    = '<same random string>';
   ```
   Commit + push. GitHub Pages rebuilds; sync is live.

## Rotating the PAT

```sh
wrangler secret put GITHUB_TOKEN
```
No frontend change needed.

## Local dev

```sh
wrangler dev
```
Serves at `http://localhost:8787`. Set `WORKER_URL` to that in the frontend
during local testing.
