## 0. Read first

- [x] 0.1 Read `proposal.md`, `design.md` (Explore findings, D1-D9 and the supply map) and `specs/project-documentation/spec.md`.
- [x] 0.2 Read every earlier change's "Docs to update" section: `grep -n -A12 -i "docs to update" openspec/changes/*/tasks.md openspec/changes/archive/*/tasks.md`. Build the docs input ledger (task 1.2).
- [x] 0.3 Read the Connect skill pages: `/Users/behnam/.claude/plugins/marketplaces/commercetools/skills/commercetools-connect/references/deployment-installation.md` (Pattern 6 required README), `observability-operations.md` (Pattern 5), `service-applications.md` (fail-open/closed).
- [ ] 0.4 Read the legacy docs for facts only (do not copy prose): `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/FEATURES.md`, `ARCHITECTURE.md`, `docs/how-it-works.md`, `docs/models.md` and `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/FEATURES.md`.
- [x] 0.5 Read the rules from change A: banner, `SUPPORT.md`, `scripts/check-repo-rules.mjs --prose`.

You should now be able to explain: (a) what a Connect certification reviewer looks for in the README, (b) why this connector has no poison-message runbook and how to say so, (c) which sections are generated and which are written, (d) the scrub rules.

## 1. Setup

- [ ] 1.1 Branch, prerequisites, baseline.
  **Why:** W documents what exists; verify the tree.
  **Where:** `/Users/behnam/code/commercetools-labs/ai-assistant`.
  **How:** `git switch -c spec/w-docs-and-readmes`; `ls connect.yaml service mc-app composed-apps mc-view-app docs scripts e2e`; `ls openspec/changes/archive | wc -l` (should list C-V); `node scripts/check-repo-rules.mjs --prose; echo $?`.
  **Done when:** directories exist; baseline prose check exit code recorded.
  **Watch out:** if a feature change is not archived, stop; documenting a plan is a bug.

- [x] 1.2 Build the docs input ledger.
  **Why:** nothing from earlier "Docs to update" lists may be lost.
  **Where:** scratch file `plans/evidence/w/ledger.md` (internal; not published).
  **How:** one row per bullet: source change, bullet text, target document+section, status (todo/done). Start from the lists summarised in design Explore finding 4, then add E, F, K, L, M, X.
  **Done when:** row count equals the bullet count (`grep -c` the lists); every row has a target.
  **Watch out:** the ledger is the checklist for task 8.2.

## 2. Documentation tooling

- [x] 2.1 `scripts/docs/gen-config-table.mjs`.
  **Why:** configuration reference must not drift (spec "Configuration reference").
  **Where:** `scripts/docs/gen-config-table.mjs` (headered).
  **How:** 1. Decide YAML reader (see design D2). 2. Parse `connect.yaml`: for each `deployAs` entry list `standardConfiguration` and `securedConfiguration` keys with `description`, `required`, `default`, plus `inheritAs.apiClient.scopes`. 3. Output markdown tables: per-application config table; scopes table (service scopes with a reason column read from a small sidecar `docs/scope-reasons.json` keyed by scope); 4. Replace text between markers in the files given by `--files README.md docs/configuration.md`; `--check` compares without writing. 5. Add unit tests `scripts/docs/gen-config-table.test.mjs` run with `node --test`.
  **Done when:** `node scripts/docs/gen-config-table.mjs --check README.md docs/configuration.md` exits 0 after generation and non-zero after editing one description in `connect.yaml`.
  **Watch out:** never print secret defaults; secured keys have no example value.

- [x] 2.2 `scripts/docs/check-links.mjs`.
  **Why:** broken or internal links.
  **Where:** `scripts/docs/check-links.mjs`.
  **How:** walk `README.md`, `*/README.md`, `docs/**/*.md`, `SUPPORT.md`, `CONTRIBUTING.md`, `FEATURES.md`; check relative link targets exist and anchors (`#heading`, GitHub slug rules) exist; fail on links containing `plans/`, `openspec/`, `.claude`, `file://`, or an absolute path under a user home directory; external http(s) links are not fetched (offline) but listed with `--list-external`.
  **Done when:** a deliberately broken link makes it exit 1 and prints file:line.
  **Watch out:** headings with backticks and punctuation slugify differently.

- [x] 2.3 `scripts/docs/check-api-doc.mjs`.
  **Why:** `docs/api.md` must match routes.
  **Where:** `scripts/docs/check-api-doc.mjs`.
  **How:** extract `router.(get|post|put|patch|delete)('...')` and mount points from `service/src/routes/**` and `service/src/app.ts` with regexes (handle template literals only if used); extract the table rows from `docs/api.md` (columns Method, Path); diff both sets; print missing/extra.
  **Done when:** exit 0 on the final tree; removing one row prints that route and exits 1.
  **Watch out:** path params (`:id`) must be normalised; the `/service` prefix is added.

- [x] 2.4 `scripts/docs/check-docs-claims.mjs`.
  **Why:** certification content and scrub rules machine-checked.
  **Where:** `scripts/docs/check-docs-claims.mjs`.
  **How:** modes `--certify` (README has headings "Configuration", "Administrator access", "Required scopes", "Fail-open and fail-closed behaviour", "Poison messages and replay"; tables non-empty; every `connect.yaml` key appears in README or docs/configuration.md), `--citations` (each `##` section of architecture/how-it-works/FEATURES contains a backticked path that exists or a docs URL), `--scrub` (design D6 patterns; patterns file read from `scripts/internal-paths.json`/leak list if present, plus built-ins), `--stale` (FEATURES/README/docs grep for tenant|firestore|team mcp|data warehouse|g[e]cx|anthropic|openai|assistant-admin|permission group|cloud run|pub/sub; `ADMIN_USER_IDS` is NOT stale vocabulary).
  **Done when:** unit tests `check-docs-claims.test.mjs` cover one pass and one failure per mode.
  **Watch out:** the allowed exception: the word "tenant" in `CHANGELOG.md`.

## 3. Root README

- [x] 3.1 Write `README.md`.
  **Why:** connector README for certification (supply: A banner; B layout; C quick start; D/E/I/L/F scopes; all for fail-open/closed).
  **Where:** `README.md` (keep the banner block from change A verbatim as first block).
  **How:** headings in this order: banner; Overview; What it is not; Architecture at a glance (one Mermaid diagram from `plans/02` section 3, rewritten); Repository layout (table of folders); Prerequisites (Node 22, Yarn 1 for frontends, npm for service, Connect CLI, Merchant Center project, Google Cloud service account roles); Quick start (local) (from C and V `dev-up.sh`); Deployment summary (5 commands from U + link); Configuration (generated block `gen:begin config`, includes the `ADMIN_USER_IDS` row); Administrator access (short: `ADMIN_USER_IDS`, how to find your user ID, fail-closed default, non-admin experience, link to `docs/permissions.md`); Required scopes (generated block `gen:begin scopes` + GCP roles + MC permissions); Fail-open and fail-closed behaviour (table from design D4, verified in 6.1); Operations (health `/service/status`, logs, correlation id, data retention: kept until an operator deletes it, no automatic deletion); Poison messages and replay (statement D5); Testing (jest, Chrome playbooks); Contributing; Support; License.
  **Done when:** `node scripts/docs/check-docs-claims.mjs --certify` exits 0 and `head -15 README.md | grep -ci unsupported` prints at least 1.
  **Watch out:** no screenshots in README; no marketing words; no `plans/` links.

## 4. Architecture, how it works, API

- [x] 4.1 `docs/architecture.md`.
  **Why:** the shape of the system.
  **Where:** `docs/architecture.md`.
  **How:** sections: Topology (Mermaid from plans/02, text-fixed); Applications (table: type, folder, endpoint/entry point, config); Data model (table from plans/05 as built in change E - read the final container list from `service/src/persistence`); Authentication flow (forward-to, JWT verification, audience policy, project guard, admin resolution from the gateway token's user id and `ADMIN_USER_IDS`; supply D, O); Stateless design (what is cached, what is persisted; supply C, E); Request time budget (supply H); Security boundaries; Dependencies (list used by the fail-open table); Decisions (bullet list of D1-D13 from plans/00, each one line with citation).
  **Done when:** `check-docs-claims.mjs --citations docs/architecture.md` exits 0.
  **Watch out:** no tenant vocabulary; no references to Firestore/Cloud Run as current.

- [x] 4.2 `docs/how-it-works.md`.
  **Why:** the mechanisms, cited.
  **Where:** `docs/how-it-works.md`.
  **How:** sections: A chat turn end to end (supply H, G); Sessions, digest and suggestions (G); Tool sources and agents (H, J, K, L); Identity-mode Managed MCP (I); Composed pages (M, R, P); Preview annotations (P); The Custom View and entity context (S); Persistence and concurrency (E); Time budget (H). Use the structure of the demo-how-it-works skill (what we built, the mechanism, where it runs) but drop all presentation framing. Every section cites paths.
  **Done when:** citations check passes; no word "demo".
  **Watch out:** legacy `how-it-works.md` is a team-scoped demo narrative - do not port.

- [x] 4.3 `docs/api.md`.
  **Why:** REST contract reference (supply D, G, H, I, J, N).
  **Where:** `docs/api.md`.
  **How:** conventions (base path `/service`, envelope `{success,data|error}`, auth header, correlation id, error codes, body limits and 413 policy from N); one table for all routes (Method, Path, Auth, Admin, Purpose, Request, Response, Errors); then per-area subsections. Copy rows 1-25 and row 28 (`GET /files/:sessionId/:fileName`, binary image stream, owner or admin, `Cache-Control: private, no-store`) from change G `specs/rest-api-contract/spec.md`, add D `/auth/session` (documents `userId` and `isAdmin`, no e-mail, no permissions array), `ADMIN_REQUIRED` 403 on admin routes, H SSE (chunk vocabulary), I routes, J `GET /mcp/providers` (read-only, names and booleans; state there is no configuration write API), N feedback/backoffice rows. SSE section documents `data-turn-status`/`data-keepalive`.
  **Done when:** `node scripts/docs/check-api-doc.mjs` exits 0.
  **Watch out:** query parameter `customView` semantics (S, G); no secrets in examples.

## 5. Reference and operations documents

- [x] 5.1 `docs/configuration.md` (generated tables + hand-written notes).
  **Where:** `docs/configuration.md`.
  **How:** insert markers, run `gen-config-table.mjs`; hand-write: how config reaches each app (Connect injects `CTP_*`), `GCP_SA_KEY_BASE64` creation (`base64 < key.json | tr -d '\n'`, supply F), a "Google Cloud" section (F, L, U; owner decision Q9: every Google setting is optional and configurable in `connect.yaml`: `GCP_PROJECT_ID` default = the key's `project_id`, `GCP_VERTEX_LOCATION` `us-central1`, `GCP_BIGQUERY_DATASET_ID` `aiassistant`, `GCP_BIGQUERY_LOCATION` `us-central1`, `GCP_BUCKET_NAME` `<project>-ai-assistant-images`, `GCP_BUCKET_LOCATION` `us-central1`, `IMAGE_URL_MODE` `private` | `public`; one service-account key serves Vertex, BigQuery and Cloud Storage; the IAM roles table: `roles/aiplatform.user`, `roles/bigquery.dataEditor` + `roles/bigquery.jobUser`, and either `roles/storage.admin` on the project (the service creates the bucket on first use) or `roles/storage.objectAdmin` on a bucket you pre-create (least privilege); how to pre-create the dataset and bucket; `private` vs `public` image modes and the files endpoint), `ENCRYPTION_KEY` generation and rotation limits (E), a "Third-party providers" section (J, U: the seven keys `CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION` (default `na`), `ALGOLIA_MCP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_CONNECTED_ACCOUNT_ID`; which are secured; enabled iff the required keys are set and valid, a partial set logs a startup warning and disables the provider; how to set or rotate them with `node scripts/connect/connect.mjs configure KEY=VALUE` / `--configuration`, which needs a configuration redeploy; read-only status cards in Settings), models (from legacy `docs/models.md`, Vertex ids per F), budget variables (H), frontend env contract (O), CSP list and why (O, R, S).
  **Done when:** `--check` passes.
  **Watch out:** show fake values only.

- [x] 5.2 `docs/deployment.md`.
  **Where:** `docs/deployment.md`.
  **How:** from change U: prerequisites with manual-step ids (M4, M6, M7, M9); order of operations; regions; sandbox vs production; connector README requirement; rollback; link to `docs/deployment-runbook.md` for commands; scopes pointer.
  **Done when:** `grep -c "commercetools connect " docs/deployment.md` prints 0.
  **Watch out:** read the final runbook file name in the archived change U.

- [x] 5.3 `docs/permissions.md` (app access and administrator access).
  **Why:** operators must know who is an administrator and why a user is not (design D10).
  **Where:** `docs/permissions.md`.
  **How:** sections: Access to the apps (the default View and Manage permission pair of each Custom Application, verified in change D; assign via a Merchant Center Team; this controls access to the app and the gateway only, the former administrator permission group is REMOVED); Administrator access (`ADMIN_USER_IDS` rules, fail-closed when empty, set and rotate with `node scripts/connect/connect.mjs configure ADMIN_USER_IDS=...`, redeploy); Finding your user ID (the "Your user ID" line, first-administrator bootstrap); Non-admin experience (what is hidden, the "Administrator access required" notice, what still works); What is not trusted (browser e-mail, label or `isAdmin` in header, body or query; the gateway token has no e-mail); Display label (`userLabel`, unverified, sanitised, text only); Audit (`audit.admin_action` log lines carry the user id, never the e-mail). Supply D, O, Q.
  **Done when:** file exists with citations; `grep -ciE "assistant-admin|permission group" docs/permissions.md` prints 0.
  **Watch out:** show only fake addresses and ids (`admin@example.com`, `user-id-a`); never document a Merchant Center permission string for admin.

- [x] 5.4 `docs/security.md`.
  **Why:** security model in one place.
  **Where:** `docs/security.md`.
  **How:** (supply E, D, I, J, N, Q) secrets only in `securedConfiguration` (including the third-party provider credentials `CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `ALGOLIA_MCP_URL`, `STRIPE_SECRET_KEY`, which never reach the browser, Custom Objects or logs; `GET /mcp/providers` returns names and booleans only); image privacy (Q9: with the default `IMAGE_URL_MODE=private` the bucket and objects are never public, there are no signed URLs, and images are readable only through the authenticated `GET /service/files/:sessionId/:fileName` of the session owner or an admin; an unauthenticated bucket URL answers 403; `public` mode makes every generated image world-readable and is not recommended; the bucket-creating role `roles/storage.admin` is broader than the runtime needs - use a pre-created bucket with `roles/storage.objectAdmin` where policy requires); identity tokens encrypted in Custom Objects; admin gating by `ADMIN_USER_IDS` decided by the service on every request (UI hiding is cosmetic; empty list fails closed); the service never returns an e-mail to the browser and never trusts one; backoffice exposes transcripts and is admin-only with audit log lines; generated code runs in the browser origin (R, P) and why CSP has `unsafe-eval`; prompt injection from third-party content (J); data retention pointer; SSRF notes for Algolia URL (J); reporting vulnerabilities (SUPPORT).
  **Done when:** file exists with citations.
  **Watch out:** do not publish internal threat models or customer names.

- [x] 5.5 `docs/operations.md` and `docs/privacy.md`.
  **Where:** both files.
  **How:** operations: health, logs and correlation ids (C), log levels, what is never logged, retention (E, Q13, Q25), backup/restore story (Custom Objects), scaling and cold start (U), capacity limits (512 MB, 1 CPU), **Data retention** (design D11: messages and feedback kept until an operator deletes them, no automatic deletion or cleanup job, how to delete Custom Objects), **fail-open/closed table** (full version), **Poison messages and replay** (D5 text) and recovery paths. Privacy: Gravatar request (P, disclosure stays), transcripts stored with no automatic deletion (G, N), the verified admin e-mail stored encrypted (I), the display-only `userLabel` (N), host URL in `customView` flag (S), Vertex AI data handling pointer.
  **Done when:** both exist; the table has one row per dependency in `docs/architecture.md`.
  **Watch out:** claims verified in 6.1.

- [x] 5.6 `docs/troubleshooting.md`.
  **Where:** `docs/troubleshooting.md`.
  **How:** collect all "Watch out", "Risks" and troubleshooting bullets from change tasks/designs (C env exit incl. invalid `ADMIN_USER_IDS` position message, D 401/403, `ADMIN_REQUIRED` 403, "nobody is admin because ADMIN_USER_IDS is empty", "I am not shown as administrator", S invalid_scope prefix rule, I popup/DCR, H 5-minute cut, E limits, F credentials, U cold start/postDeploy, V E2E). Table: Symptom, Likely cause, Fix, Where to look (log key or endpoint).
  **Done when:** at least the entries listed in the spec exist (including the two administrator-access entries).
  **Watch out:** no stack traces with internal paths.

## 6. Verify claims against the code

- [x] 6.1 Verify the fail-open/closed table and the scopes list.
  **Why:** certification evidence must be true.
  **Where:** `service/src/**`, `connect.yaml`, `*/custom-*-config.mjs`.
  **How:** for each row open the handler (grep for the dependency client), note the behaviour (error path, fallback, timeout constant), update the table; compare scopes with `inheritAs.apiClient.scopes` and `oAuthScopes`; list differences as bugs in the open-items register for change Z.
  **Done when:** every row cites a file path in a comment column hidden in the source or in the ledger; no unverified row.
  **Watch out:** a row you cannot verify stays out of the docs.

## 7. FEATURES.md, per-app READMEs, support documents

- [x] 7.1 Regenerate `FEATURES.md`.
  **Why:** code-derived inventory (design D7).
  **Where:** `FEATURES.md`.
  **How:** per section list features with `path` citations by reading code; use the legacy two FEATURES files as a checklist of what to look for; drop stale parts; add "Last updated" with the release version.
  **Done when:** `check-docs-claims.mjs --citations --stale FEATURES.md` exits 0.
  **Watch out:** two legacy files merge into one; avoid copying text.

- [x] 7.2 Per-app READMEs.
  **Where:** `service/README.md`, `mc-app/README.md`; check `composed-apps/README.md`, `mc-view-app/README.md`.
  **How:** each: what it is; config keys (link to generated table); scopes/permissions; local run; tests; fail-open/closed note; link to root docs. mc-app also lists the Custom Application registration (M6) and routes; service lists scripts and env.
  **Done when:** four READMEs, none containing the starter template text (`grep -il "starter" */README.md` empty).
  **Watch out:** do not rewrite R and S content, only add a link footer.

- [x] 7.3 `SUPPORT.md`, `CONTRIBUTING.md`, `CHANGELOG.md`.
  **Where:** root files.
  **How:** SUPPORT keeps the unsupported statement and says where to discuss (owner answer RQ10); CONTRIBUTING: setup, checks list (spec), how to add a tool source (H guide), how to add an E2E card (V), pull request rules, no support commitment; CHANGELOG: `0.1.0 - initial release` (version from Z).
  **Done when:** `grep -il unsupported SUPPORT.md` prints the file; CONTRIBUTING lists all checks.
  **Watch out:** CONTRIBUTING must not mention internal planning folders.

- [ ] 7.4 Screenshots (optional, at most eight).
  **Where:** `docs/images/`.
  **How:** pick from `plans/evidence/{P,Q,R,S}/`; crop; check for e-mail/project key; reference with alt text from README/how-it-works.
  **Done when:** each image referenced exactly once; `check-links.mjs` passes.
  **Watch out:** remove any real user name.

## 8. Quality gates

- [x] 8.1 Run all checks.
  **How:** `node scripts/docs/gen-config-table.mjs --check README.md docs/configuration.md && node scripts/docs/check-links.mjs && node scripts/docs/check-api-doc.mjs && node scripts/docs/check-docs-claims.mjs --certify --citations --scrub --stale && node scripts/check-repo-rules.mjs --prose && node scripts/spdx-check.mjs`.
  **Done when:** all exit 0.
  **Watch out:** fix text, do not weaken checks.

- [x] 8.2 Ledger closure.
  **How:** every row of the docs input ledger is `done`; list rows deferred with reason in `plans/evidence/w/ledger.md`.
  **Done when:** zero `todo` rows.
  **Watch out:** deferred rows go to Z's open-items register.

## 9. Verification

- Unit tests: `node --test scripts/docs/` (four test files above).
- Chrome scenarios: none created by W; **E2E-V-08** (service gates) runs the doc checks; a fresh-reader walk-through: follow the README quick start from a clean clone and note any broken step (record in `plans/evidence/w/walkthrough.md`).
- `openspec validate w-docs-and-readmes --strict`.

## 10. Docs to update

- This change is the docs change. After it, record in change Z's open-items register: unresolved ledger rows, unverified claims, screenshots still missing.
