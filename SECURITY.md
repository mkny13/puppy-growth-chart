# Security

## How to report a problem

Open a GitHub issue on this repo. Do not paste secrets, tokens or the `APP_KEY` value into it.

## Audit baseline

Audited on the branch after #9 (dependency upgrades, CI audit gate, Dependabot) and #10
(Worker hardening) merged. Surface: Vite/React SPA on GitHub Pages, plus the Cloudflare Worker
`worker/src/index.js` that commits `data/weights.json` through GitHub's Contents API. There is
no other backend and no Python.

| # | Item | Where checked | Result | Note |
|---|------|---------------|--------|------|
| 1 | Credential boundaries / `.env` leaks | `git ls-files`, `.gitignore`, git history | OK | No `.env*` file is tracked; `.gitignore` covers `.env` and `.env.*`. No `ghp_`, `github_pat_` or `GITHUB_TOKEN=` in tracked files or in any commit in history. `GITHUB_TOKEN` exists only as a Cloudflare secret. |
| 2 | Shared `APP_KEY` in `src/GrowthChart.jsx` | `src/GrowthChart.jsx`, `AGENTS.md` | Accepted risk | Public by design (it ships in the bundle), so it is not a secret boundary. Anyone can read and write weights through the Worker. Impact is bounded by the origin check, entry allow-list and value bounds from #10. If abused: the owner rotates `APP_KEY` (Cloudflare secret and frontend) and/or adds Cloudflare rate limiting. |
| 3 | Unpooled / hard-coded URLs | `src/`, `worker/src/`, `index.html` | OK | External hosts contacted: the Worker (`puppy-growth-sync.mkastellec.workers.dev`, from `src/GrowthChart.jsx`) and `api.github.com` (from the Worker). `mkny13.github.io`, `localhost` and `127.0.0.1` appear only as allowed CORS origins in the Worker. No other hosts. |
| 4 | Subshell executions | `src/`, `worker/src/`, `.github/workflows/` | N/A | No `child_process`, `exec`, `spawn` in runtime code (grep below). CI runs only the fixed commands in `ci.yml` and `deploy.yml`, with no user input interpolated. |
| 5 | Worker permission boundary / denial list | `worker/src/index.js`, `test/worker.test.js` | Fixed in #10 | Origin allow-list, `X-App-Key` check, entry field allow-list, week/weight bounds, generic 502 on upstream errors, origin-gated CORS. |
| 6 | GitHub token scope | Cloudflare / GitHub settings | Accepted risk | Unverified by agents; owner check required. The fine-grained PAT should be limited to this repo with Contents read/write only (per the `wrangler.toml` comment). Agents cannot verify this. |
| 7 | GitHub Actions permissions | `.github/workflows/ci.yml`, `deploy.yml` | Accepted risk | `ci.yml`: `contents: read`. `deploy.yml`: `contents: read`, `pages: write`, `id-token: write`. No secrets are used. Actions are pinned to major tags, not SHAs; Dependabot keeps them current (#9). |
| 8 | Dependency scan | `npm audit`, `ci.yml`, `.github/dependabot.yml` | Fixed in #9 | `npm audit --audit-level=high` reports 0 vulnerabilities. CI runs the audit as a gate; Dependabot covers npm and GitHub Actions weekly. |
| 9 | XSS surface | `src/` | OK | No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function`. React escapes rendered values. |
| 10 | Personal data in the public repo | `data/weights.json` | OK | Holds only puppy weights by week. Commits to it come from the Worker. |

## Re-run this audit

Run from the repo root.

```sh
# Row 1: no tracked .env files; no token patterns in tracked files or history
git ls-files | grep -E '(^|/)\.env'                    # expect no output
git ls-files | xargs grep -lE 'ghp_|github_pat_|GITHUB_TOKEN='   # expect no output
git log -p --all -S ghp_ --oneline                     # expect no output
git log -p --all -S github_pat_ --oneline              # expect no output
git log -p --all -S 'GITHUB_TOKEN=' --oneline          # expect no output

# Row 4: no subprocess use in runtime code
grep -rnE 'child_process|exec\(|execSync|spawn' src worker/src   # expect no output

# Row 8: dependency scan
npm audit --audit-level=high                           # expect: found 0 vulnerabilities

# Row 9: XSS sinks
grep -rnE 'dangerouslySetInnerHTML|innerHTML|eval\(|new Function' src   # expect no output
```

Row 3 helper: `grep -rnoE 'https?://[A-Za-z0-9./_-]+' src worker/src index.html | sort -u`.
