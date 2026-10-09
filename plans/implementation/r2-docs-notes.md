# Housekeeping notes: spec text, task ticks, docs, e2e seeds (r2-docs)

Work package on OpenSpec artifacts, docs and e2e playbooks, started from the `develop` tip. No file under `service/`, `mc-app/`, `composed-apps/` or `mc-view-app/` was edited. Nothing was run against Connect, Merchant Center, Google or a scratch project; all statements below are about the repository and its offline checks.

## Done per item

- **TA-01 (glob form).** `node --test scripts/tests/` and the directory forms of `scripts/internal/tests/`, `scripts/docs/` and `scripts/release/` replaced by `*.test.mjs` globs in the tasks (A, B, U, W, X, Z), the X spec and the Z design.
- **TA-42 / MF-103 (spec text).** Corrected: `/service/status` answers `UP` (B tasks and spec, U tasks); entity link tool input `{ links: [...] }` (H task 6.1); P task 20.9 now 201; V task 3.1 sets `MC_AUDIENCE` to the tunnel origin only; G's rest-api-contract spec gained rows 29 (`GET /health`) and 30 (`GET /status/nimbus`), the status row shows the real body and the "rows 26, 27 and 29" text is fixed (also in G tasks); B's `CTP_REGION` statement (it is declared as a required standard key, `MC_CLOUD_IDENTIFIER` replaces the stale `CLOUD_IDENTIFIER` in the service key list); F: `ai@7.0.136` and the 16 KiB key limit (task snippet used 24 000); K design records the pin; the `questions-inbox` files named in C and M tasks (they do not exist) point at the notes files. The "D11 admin from the e-mail" wording was already replaced by the user-id decision in the current V and U text.
- **TA-13, TA-11 (partly).** F text done; Appendix A note added to the tasks of G, I and N and E's V.5 reworded.
- **TA-43 (ticks).** Ticked with a note: reading tasks judged unnecessary because the implementation and its tests exist (B 1.2, D 0.2 and 0.3, G 0.3, H 0.3 and 0.4, N 0.2 to 0.4, O 0.3, Q 0.3, S 0.3 and 0.5, V 0.4 and 0.5, W 0.4: "not needed: verified from code and tests"); branch tasks (E 1.2, V 1.1, W 1.1: work happens on the harness branch); N 1.1 (prerequisites exist in the tree, verified by listing them); E V.5 and M 7.3 (work now exists); C V.5 (spdx, repo-rules and foundation checks pass). Counts per change were regenerated in `z-release/acceptance.md` with `scripts/release/acceptance.mjs --table`.
- **TA-38.** Runbook wording: probe failures end with `(HTTP <status>)` or `(commercetools unavailable)` for 5xx and timeouts. The "Verified behaviour" table stays open (no rehearsal).
- **TA-40.** New `docs/using-the-assistant.md` (labels taken from the source; no screenshots) and `docs/adding-a-store.md`; limits table in `docs/api.md` (history 20, analyzer window 10, steps 50, export 50,000 rows and 5 MB Base64, composed page 20/10/20,000, offload 20,000 rows/20 MB, query caps); the analyzer window sentence in `docs/how-it-works.md`; "Stripe toolkit version" section in `docs/configuration.md` (pin `0.7.12`, `overrides`); "Known issues" section in `docs/operations.md` (Managed MCP tool schemas that Gemini rejects, in neutral wording, plus Stripe and cold-start pointers); cold-start wording made generic in operations, deployment, runbook and troubleshooting (no figure; none was measured). README links the two guides.
- **TA-41.** Package-name table in `docs/architecture.md`; `e2e/README.md` linked from README (layout table and Testing) and CONTRIBUTING.
- **TA-39.** `scripts/e2e/seed.mjs` gained `sessions-many` and `large-snapshot` with definitions in `e2e/fixtures/seeds/`; `scripts/e2e/scrub-evidence.mjs` is called by `collect-evidence.sh` (redacts authorization and cookie values, bearer tokens, JWTs, provider keys, non-example e-mail addresses, deployed and tunnel hosts; refuses with exit 2 and removes a freshly created evidence folder on a private key block); tests in `scripts/tests/e2e-seeds.test.mjs` (9 tests); the three internal-path lines of `e2e/README.md` rewritten (`check-docs-claims --scrub` is green).
- **Step 6 (z-release and index).** `open-items.md` (Z-05, Z-08, V-stale-text, V-manual, W-todos, W-ledger-C, W-Q3), `readiness.md`, `release-log.md`, `handover.md`, `command-log.md` (C23 to C25), regenerated `acceptance.md`, and the index `README.md`, `todos.md`, `missed-features.md`, `questions.md` updated. The publication state is stated as the dry-run result of `scrubfix-notes.md` (0 NEEDS-HUMAN, 0 leak BLOCK, gate CLEAR on a copy); no live verification is claimed.

## Skipped and why

- Ticks left open: everything that needs Docker, Connect, a deployment, Google, Chrome or the owner (sections b to d of `todos.md`), the Definition-of-Done and `/opsx:verify clean` items, X and Z tasks that need the final archived tree, and the N lines "rows 20-25 active in G's contract test" and the N unit-test list (see gaps).
- TA-13 Appendix A results table, TA-11 Appendix C, TA-38 verified-behaviour table: wait for live probes and a rehearsal.
- TA-39: M8a text and the amendment list (`plans/06-amendments-applied.md` and the manual-steps amendments do not exist in the tree); optional `redeploy` command.
- TA-40: optional generated "read but not declared" table; screenshots for the assistant guide.
- MF-103: "design interface names differ from E/F/G code" (no concrete list; the F design matches the code) and the key list in `plans/02-target-architecture.md` (not an OpenSpec change).

## New gaps

- `service/tests/contract/routes.spec.ts` still carries `pendingUntil: 'N'` on rows 20-25 although N is implemented, and it lists health and nimbus status only as `EXTRA_ALLOWED`; align with the corrected G spec (service owner; I did not touch `service/`).
- `docs/using-the-assistant.md` was written from source labels and the E2E cards, not from a running application; it needs a re-read against the real UI.
- The published package names in `docs/architecture.md` follow the description in Q-impl-60 and are unconfirmed.
- `service/.npmrc` named in earlier notes (TA-22) does not exist; the Stripe note documents the `overrides` in `service/package.json` instead.
- The evidence scrub pass is pattern based; it does not know about customer names or private token lists (those belong to the publication gate).
