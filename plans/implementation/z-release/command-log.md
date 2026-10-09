# Change Z: command log (run 2026-10-09 on the development tip, Node 22.21)

Every row is a command that was actually run for this change. Raw outputs were kept in the git-ignored
`plans/evidence/z/logs/`; this table is the tracked summary. Frontends were run with the values of their
`.env.example` exported (`set -a; . ./.env.example; set +a`). No credentials, Docker, Connect deployment,
Chrome session or scratch project was available.

| Id | Command (working directory) | Exit | Result |
|---|---|---|---|
| C1 | `npm ci`, `npm run build`, `npm test`, `npm run lint` (service) | 0 | 170 suites, 1533 tests pass; lint 0 errors, 55 warnings |
| C2 | `commercetools connect application build` and `... test` (service) | 0 | build ok; "Connect application tests ran successfully" |
| C3 | `yarn install --frozen-lockfile`, `yarn typecheck`, `yarn lint`, `yarn test`, `yarn build` (mc-app) | 0 | 10 suites, 45 tests pass |
| C4 | same five commands (composed-apps) | 0 | 4 suites, 25 tests pass |
| C5 | same five commands (mc-view-app) | 0 | 4 suites, 24 tests pass |
| C6 | `npm ci` (scripts) | 0 | ok |
| C7 | `node --test scripts/tests/*.test.mjs scripts/docs/*.test.mjs scripts/release/*.test.mjs` | 0 | 187 tests pass |
| C8 | `node --test scripts/internal/tests/*.test.mjs` | 0 | 24 tests pass |
| C9 | `node scripts/spdx-check.mjs`, `check-repo-rules.mjs`, `check-connect-layout.mjs`, `check-duplicates.mjs`, `check-versions.mjs`, `check-frontend-leftovers.mjs` | 0 each | all ok (27 duplicate groups, version 27.9.6, 4 applications) |
| C10 | `node scripts/docs/gen-config-table.mjs --check README.md docs/configuration.md`, `check-links.mjs`, `check-api-doc.mjs` | 0 each | ok (21 files, 37 routes) |
| C11 | `node scripts/docs/check-docs-claims.mjs --certify --citations --scrub --stale` | 1 | 3 problems, all `SCRUB-INTERNAL` in `e2e/README.md` (mentions of the internal evidence and implementation folders). The same command with `--certify --citations --stale` only exits 0; `--scrub` alone exits 1 with the same 3. |
| C12 | `node scripts/e2e/extract-scenario-ids.mjs --lint --dangling --trace --tiers` | 0 | 147 cards, 132 ids dangling-free, 41 mapped features, tiers ok |
| C13 | `openspec validate --all --strict` | 0 | 24 passed, 0 failed |
| C14 | `node scripts/release/acceptance.mjs --versions 0.1.0` | 0 | all four `package.json` and the first CHANGELOG heading are 0.1.0 |
| C15 | `node scripts/release/check-tasks-shape.mjs` | 1 | 24 files, 774 tasks, 172 errors, 378 warnings (see `open-items.md`, item Z-01) |
| C16 | `node scripts/release/acceptance.mjs --check` | 1 | no change is archived; every verdict is PARTIAL (no PASS) |
| C17 | `commercetools connect validate` | 2 | Docker daemon not running (manual step M14): NOT VERIFIED |
| C18 | `grep -nE "applicationType: (event\|job)" connect.yaml` | 1 (no match) | no event or job application declared (static half of the not-applicable proof; the live half needs a deployment) |
| C19 | `grep -rniE "assistant-admin\|permission group" connect.yaml */custom-*-config.mjs README.md docs` | no hit that grants anything | one comment in the view config saying "no permission group" |
| C20 | `grep -rilE firestore service/src service/package.json` | no match | R7 static proof |
| C21 | find for a `workflows` folder outside `node_modules` | no match | R6 static proof |
| C22 | `grep -nE "platform-sdk\|ts-client" service/package.json` | 0 | `^8.27.0` and `^4.10.0` |
| C23 | `node scripts/docs/check-docs-claims.mjs --certify --citations --scrub --stale` (after r2-docs) | 0 | `--scrub` green after the three `e2e/README.md` lines were rewritten; the new guides pass the same checks |
| C24 | `node --test scripts/tests/*.test.mjs scripts/docs/*.test.mjs scripts/internal/tests/*.test.mjs scripts/release/*.test.mjs` (after r2-docs) | 0 | 220 tests, 220 pass, 0 fail (includes the new `e2e-seeds` tests) |
| C25 | `openspec validate --all --strict` (after r2-docs) | 0 | 24 passed, 0 failed |

Not run (each blocked by the manual step in brackets): `connect validate` (M14), any `connect.mjs` command
against Connect (M4, M16), sandbox deployment and `/service/status` (M6, M7, M15), live Custom Object
probes (M3), live Vertex smoke (M5), Chrome E2E regression (M8, M10), anonymous clone of the public tag (M1,
M13), the gate on the final single commit (M12), rollback rehearsal (M15).
