# Agent instructions — puppy-growth-chart

Canonical repository instructions; `CLAUDE.md` is a one-line `@AGENTS.md` pointer. Keep this
file short.

A weight tracker for Luke and Leia (two puppies): a Vite + React single-page app on GitHub
Pages, plus a tiny Cloudflare Worker (`worker/`, "puppy-growth-sync") that reads and writes
`data/weights.json` in this repo through GitHub's Contents API.

## Layout

- `src/growth.js` — pure logic: date/age helpers, Gompertz growth model, projection band,
  scales/paths, y-domain. Unit tested. Put new logic here, not in the component.
- `src/GrowthChart.jsx` — the UI (React + SVG), sync wiring, themes.
- `worker/src/index.js` — the Worker. Config in `worker/wrangler.toml`.
- `data/weights.json` — the only persistent app data (see below).
- `test/` — Vitest: `growth`, `weights` (read-only data checks), `worker` (mocked fetch/env),
  `canary`.

## Verify

```bash
npm ci && npm run verify     # eslint + vitest + vite build
```

No network, secrets or credentials are needed, and none of it may touch the live Worker or
GitHub. CI (`.github/workflows/ci.yml`) runs the same checks on every PR, and `deploy.yml`
deploys only after they pass on `main`.

## Hard rules

- **Merging to `main` deploys to production** (GitHub Pages). Never push to `main` directly.
- **Never write `data/weights.json`.** The Worker owns it (commits titled
  `Update weights.json (N entries)` land on `main` whenever a weight is saved). Tests may
  only read it, and must tolerate it gaining entries. A hand edit can race a live write.
- **Never** run `wrangler deploy` or `wrangler secret put`, or call the live Worker
  (`puppy-growth-sync.mkastellec.workers.dev`). `GITHUB_TOKEN` and `APP_KEY` are Cloudflare
  secrets and must never appear in the repo. (The frontend ships a shared `APP_KEY` by
  design; do not rotate or move it as a drive-by.)
- The repo is public: no secrets, tokens or personal data in any file, issue or PR.
- Keep `vite.config.js` `base` as `/puppy-growth-chart/` for builds or Pages will 404.

## Mahler workflow

- [`.mahler/project.toml`](.mahler/project.toml) is the contract for verify, release,
  environments, persistent data and the canary.
- Work only in the assigned worktree on its `mahler/*` branch. Never switch branches in, or
  edit, the primary checkout.
- A Mahler run ends after the change is committed, `npm run verify` passes, and the branch is
  pushed; the conductor opens the PR, watches CI and merges. Interactive sessions finish with
  `mahler ship <project>#N`.
- Interactive sessions: start from an issue, then `mahler claim puppy-growth-chart#N` before
  writing code. Work on branch `mahler/<N>-short-slug` in your own worktree. Long sessions
  run `mahler heartbeat puppy-growth-chart#N`; if you stop without shipping, run
  `mahler release puppy-growth-chart#N`. Finish with `mahler ship puppy-growth-chart#N`
  once pushed; put `Fixes #N` in any PR you open. Don't leave a PR open unhanded.
- End a Mahler run with exactly one status line: `STATUS: DONE <summary>`,
  `STATUS: NEEDS-YOU <question>`, `STATUS: BLOCKED <reason>` or `STATUS: YIELDED <handoff>`.
- GitHub Issues are the backlog (see `TASKS.md`).
- Things that need a human: anything affecting the Worker deployment or secrets, and
  confirming the live site still shows the charts and existing weights after a UI change.
