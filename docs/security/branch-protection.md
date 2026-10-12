# Branch protection for `main`

`main` deploys to production (GitHub Pages), so it is protected with classic branch protection.

## Policy

| Setting | Value | Why |
| --- | --- | --- |
| Required status check | `verify` (the job in `.github/workflows/ci.yml`: lint, tests, build) | Nothing merges unless CI is green. |
| Squash merge | enabled | Mahler's conductor ships by squash merge. |
| Enforce for admins | off | The Cloudflare Worker commits `data/weights.json` straight to `main` with a PAT; it must keep working. |
| Required PR reviews | none | The conductor merges automatically on green CI. |
| Push restrictions | none | Same reason as the Worker. |

## Read back

```sh
gh api repos/mkny13/puppy-growth-chart/branches/main/protection \
  --jq '{checks: .required_status_checks.contexts, enforce_admins: .enforce_admins.enabled}'
gh api repos/mkny13/puppy-growth-chart --jq .allow_squash_merge
```

## Re-apply

```sh
echo '{"required_status_checks":{"strict":false,"contexts":["verify"]},"enforce_admins":false,"required_pull_request_reviews":null,"restrictions":null}' |
  gh api -X PUT repos/mkny13/puppy-growth-chart/branches/main/protection --input -
```

Do not enable "enforce for admins", required reviews or push restrictions without first checking that the Worker's weight saves still land.
