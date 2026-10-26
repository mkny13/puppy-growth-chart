# Test Suite Health & Flakiness Audit

Audit performed as part of issue #65 to inspect test isolation, flakiness, execution time, and upstream contract validity for `puppy-growth-chart`.

## Findings

Audit of the test files (`test/worker.test.js`, `test/sync.test.js`, `test/growth.test.js`, `test/weights.test.js`) across categories (a)–(e):

| File | Category | Finding / Issue | Fix / Status |
| --- | --- | --- | --- |
| `test/worker.test.js` | (a) Spies/stubs/globals unrestored on failure | In "does not leak GitHub error text in the 502", `spy.mockRestore()` was invoked only after assertions. A failed assertion leaked the `console.error` spy into later tests. `vi.stubGlobal('fetch', fetchMock)` also relied on manual cleanup. | Configured `restoreMocks: true` and `unstubGlobals: true` in `vitest.config.js`. Removed manual `spy.mockRestore()` and redundant `afterEach(() => vi.unstubAllGlobals())`. |
| `test/worker.test.js` | (b) Tests that cannot fail | None | No issue found. All 42 tests contain direct assertions and all async requests are properly awaited. |
| `test/worker.test.js` | (c) Real clock or timezone dependence | None | No issue found. Output timestamps are validated with `Number.isNaN(Date.parse(out.updated))` without depending on local timezone or system time. |
| `test/worker.test.js` | (d) `.only`, `.skip`, or `.todo` | None | No issue found. All tests active. |
| `test/worker.test.js` | (e) Unhandled rejections or hanging processes | None | No issue found. Promises are cleanly awaited and handled. |
| `test/sync.test.js` | (a) Spies/stubs/globals unrestored on failure | None | No issue found. Only local `vi.fn()` mock functions created per test case; no global stubs or module spies. |
| `test/sync.test.js` | (b) Tests that cannot fail | None | No issue found. Async rejection tests correctly await expectations (`await expect(...).rejects.toThrow(...)`). |
| `test/sync.test.js` | (c) Real clock or timezone dependence | None | No issue found. Uses fixed ISO date string `"2026-01-01"`. |
| `test/sync.test.js` | (d) `.only`, `.skip`, or `.todo` | None | No issue found. All 6 tests active. |
| `test/sync.test.js` | (e) Unhandled rejections or hanging processes | None | No issue found. All promise chains awaited. |
| `test/growth.test.js` | (a) Spies/stubs/globals unrestored on failure | None | No issue found. Pure mathematical and SVG path logic; no mocks or spies used. |
| `test/growth.test.js` | (b) Tests that cannot fail | None | No issue found. Loops iterate over non-empty arrays with direct assertions. |
| `test/growth.test.js` | (c) Real clock or timezone dependence | None | No issue found. Uses fixed calendar dates (`new Date(2026, 1, 16)`, `new Date(2026, 1, 23)`, `new Date(2026, 0, 5)`). No unseeded `new Date()` calls. |
| `test/growth.test.js` | (d) `.only`, `.skip`, or `.todo` | None | No issue found. All 38 tests active. |
| `test/growth.test.js` | (e) Unhandled rejections or hanging processes | None | No issue found. All test cases are synchronous. |
| `test/weights.test.js` | (a) Spies/stubs/globals unrestored on failure | None | No issue found. Read-only validation of static JSON; no mocks or spies used. |
| `test/weights.test.js` | (b) Tests that cannot fail | None | No issue found. Assertions execute against entries in `data/weights.json`. |
| `test/weights.test.js` | (c) Real clock or timezone dependence | None | No issue found. `Date.parse(data.updated)` validates static timestamp from JSON file. |
| `test/weights.test.js` | (d) `.only`, `.skip`, or `.todo` | None | No issue found. All 5 tests active. |
| `test/weights.test.js` | (e) Unhandled rejections or hanging processes | None | No issue found. Pure synchronous assertions. |

## Execution Timings (Before vs After)

Initial baseline timings (3 consecutive runs + 1 shuffled run) compared with timings after isolation settings, fixture integration, and new upstream contract test:

| Test File | Before (Avg / Shuffle) | After (Avg / Shuffle) |
| --- | --- | --- |
| `test/worker.test.js` | 46ms / 65ms | 69ms / 55ms |
| `test/sync.test.js` | 7ms / 6ms | 10ms / 5ms |
| `test/growth.test.js` | 10ms / 13ms | 22ms / 18ms |
| `test/weights.test.js` | 6ms / 5ms | 6ms / 5ms |
| `test/toolchain.test.js` | 20ms / 16ms | 39ms / 12ms |
| `test/docs.test.js` | 3ms / 3ms | 3ms / 5ms |
| `test/canary.test.js` | 32ms / 31ms | 36ms / 34ms |
| `test/upstream-contract.test.js` (new) | N/A | 5ms / 5ms |
| **Total Suite Wall Clock** | **340–380ms (shuffle: 400ms)** | **350–420ms (shuffle: 344ms)** |

Across all runs and shuffle seeds, no tests showed order-dependent or flaky failures.

## Upstream API Contract & Fixture

- **Fixture Source:** `test/fixtures/github-contents-get.json` is constructed from GitHub's official REST API documentation for "Get repository content" (file resource: `GET /repos/{owner}/{repo}/contents/{path}`). It includes all 12 documented top-level fields: `type`, `encoding`, `size`, `name`, `path`, `content`, `sha`, `url`, `git_url`, `html_url`, `download_url`, `_links`.
- **Worker Testing Against Real Shape:** `test/worker.test.js` builds mocked GitHub responses by spreading `test/fixtures/github-contents-get.json` in `ghFile()`, ensuring the Worker's parsing logic is tested against the complete upstream schema rather than a truncated mock.
- **Contract Verification:**
  - `scripts/check-upstream-contract.mjs` exports `checkShape(actual, fixture)` to detect missing keys, mismatched JSON types, invalid base64 encoding, and unparseable JSON content without an `entries` array.
  - `test/upstream-contract.test.js` validates `checkShape` offline against the fixture and mutations.
  - `.github/workflows/upstream-contract.yml` runs weekly on schedule and via `workflow_dispatch` without secrets, calling unauthenticated GET on the public repository contents URL (`https://api.github.com/repos/mkny13/puppy-growth-chart/contents/data/weights.json?ref=main`).

### Known Gap
- **Unchecked `PUT` Response Shape:** Checking the GitHub Contents API `PUT /repos/{owner}/{repo}/contents/{path}` response shape requires a personal access token with repository write permissions and writes a commit to the repository. It cannot be run unauthenticated or in offline CI without mutating repository state. Therefore, only the unauthenticated `GET` shape is checked on schedule.
