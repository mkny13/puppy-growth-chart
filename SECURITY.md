# Security

## How to report a problem

Open a GitHub issue on this repo. Do not paste secrets, tokens or the `APP_KEY` value into it.

## Audit baseline

Audited on the branch after #9 (dependency upgrades, CI audit gate, Dependabot) and #10
(Worker hardening) merged; re-audited under #70 (security and surface area audit).
Surface: Vite/React SPA on GitHub Pages, plus the Cloudflare Worker `worker/src/index.js`
that commits `data/weights.json` through GitHub's Contents API, scheduled upstream contract
check (`scripts/check-upstream-contract.mjs`), and local Claude Code automation hooks (`.claude/hooks/`).
There is no other backend and no runtime Python.

| # | Item | Where checked | Result | Note |
|---|------|---------------|--------|------|
| 1 | Credential boundaries / `.env` leaks | `test/security.test.js`, `.gitignore`, git history | OK | No `.env*` file is tracked; `.gitignore` covers `.env` and `.env.*`. No `ghp_`, `github_pat_` or `GITHUB_TOKEN` assignments in tracked files or in any commit in history. `GITHUB_TOKEN` exists only as a Cloudflare secret. |
| 2 | Shared `APP_KEY` in `src/GrowthChart.jsx` | `src/GrowthChart.jsx`, `AGENTS.md` | Accepted risk | Public by design (it ships in the bundle), so it is not a secret boundary. Anyone can read and write weights through the Worker. Impact is bounded by the origin check, entry allow-list and value bounds from #10. If abused: the owner rotates `APP_KEY` (Cloudflare secret and frontend) and/or adds Cloudflare rate limiting. |
| 3 | Unpooled / hard-coded URLs | `src/`, `worker/src/`, `index.html`, `scripts/`, `test/security.test.js` | OK | External hosts contacted: the Worker (`puppy-growth-sync.mkastellec.workers.dev`, from `src/GrowthChart.jsx`), and `api.github.com` (from the Worker and unauthenticated GET in `scripts/check-upstream-contract.mjs`). `mkny13.github.io`, `localhost` and `127.0.0.1` appear only as allowed CORS origins in the Worker. No other hosts. |
| 4 | Subshell executions | `src/`, `worker/src/`, `.github/workflows/`, `test/security.test.js` | N/A | No `child_process`, `exec`, `spawn` in runtime code. CI runs only the fixed commands in `ci.yml` and `deploy.yml`, with no user input interpolated. |
| 5 | Worker permission boundary / denial list | `worker/src/index.js`, `test/worker.test.js` | Fixed in #10 | Origin allow-list, `X-App-Key` check, entry field allow-list, week/weight bounds, generic 502 on upstream errors, origin-gated CORS. |
| 6 | GitHub token scope | Cloudflare / GitHub settings | Accepted risk | Unverified by agents; owner check required. The fine-grained PAT should be limited to this repo with Contents read/write only (per the `wrangler.toml` comment). Agents cannot verify this. |
| 7 | GitHub Actions permissions | `.github/workflows/ci.yml`, `deploy.yml`, `upstream-contract.yml` | Accepted risk | `ci.yml`: `contents: read`. `deploy.yml`: `contents: read`, `pages: write`, `id-token` (write). `upstream-contract.yml`: `contents: read`. No secrets are used. Actions are pinned to major tags, not SHAs; Dependabot keeps them current (#9). |
| 8 | Dependency scan | `npm audit`, `ci.yml`, `.github/dependabot.yml` | Fixed in #70 | `npm audit --audit-level=high` reports 0 vulnerabilities. CI runs a standalone `npm audit --audit-level=high` step as a gate before verification in `ci.yml` (#70); Dependabot covers npm and GitHub Actions weekly. |
| 9 | XSS surface | `src/`, `test/security.test.js` | OK | No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function`. React escapes rendered values. |
| 10 | Personal data in the public repo | `data/weights.json` | OK | Holds only puppy weights by week. Commits to it come from the Worker. |
| 11 | Claude Code hooks (`.claude/hooks/*.py`, `.claude/settings.json`) | `.claude/hooks/`, `.claude/settings.json`, `test/security.test.js` | OK | `.claude/hooks/*.py` call `subprocess.run` with fixed argv lists (`["mahler", <verb>, "puppy-growth-chart"]`), no `shell=True`, and timeouts. `.claude/settings.json` PostToolUse hook runs `npx eslint --fix "${FILE}"` through a shell, but `FILE` is not set by Claude Code (hook input arrives on stdin JSON), so no tool input is interpolated (no injection path). |

## Re-run this audit

Run from the repo root.

Tracked file and code checks for rows 1, 3, 4, 8 and 9 are enforced mechanically by `test/security.test.js` (`npm test`) and CI (`.github/workflows/ci.yml`).

History checks (`git log`), which a test cannot cover cheaply:

```sh
# Row 1: no token patterns in git history
git log -p --all -S ghp_ --oneline                     # expect no output
git log -p --all -S github_pat_ --oneline              # expect no output
git log -p --all -G 'GITHUB_TOKEN[=]' --oneline          # expect no output
```

Row 3 helper: `grep -rnoE 'https?://[A-Za-z0-9./_-]+' src worker/src index.html scripts | sort -u`.
