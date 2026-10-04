# Puppy growth chart

A weight tracker for Luke and Leia: weigh-ins plotted against a fitted growth curve with a
projected adult-weight range. Live at <https://mkny13.github.io/puppy-growth-chart/>.

## How it fits together

- **Frontend** — Vite + React single-page app (`src/`), published to GitHub Pages.
  Growth maths and chart shaping are pure functions in `src/growth.js`; the UI is
  `src/GrowthChart.jsx`.
- **Worker** — `worker/` is a small Cloudflare Worker (`puppy-growth-sync`) that proxies
  reads and writes of `data/weights.json` through GitHub's Contents API, so the GitHub token
  never reaches the browser. See [worker/README.md](worker/README.md).
- **Data** — `data/weights.json` is the only persistent data. The Worker commits to it on
  `main` whenever a weight is saved; don't edit it by hand while the app is in use.

## Develop

```sh
npm ci
npm run dev        # http://localhost:5173 — talks to the LIVE Worker, so don't add test weights
npm run verify     # eslint + vitest + production build (what CI runs)
```

`npm run lint`, `npm test` and `npm run build` run the three steps separately. Tests need no
network or secrets.

## Deploy

Merging to `main` deploys. `.github/workflows/ci.yml` (lint, tests, build) must pass first;
`deploy.yml` then publishes `dist/` to GitHub Pages. The Worker is **not** deployed by CI:
after changing `worker/`, run `wrangler deploy` from that directory.

## Working with agents

Work is tracked in GitHub Issues and handled through Mahler. Agent rules, the verify command,
release/rollback steps and the data inventory are in [AGENTS.md](AGENTS.md) and
[.mahler/project.toml](.mahler/project.toml).
