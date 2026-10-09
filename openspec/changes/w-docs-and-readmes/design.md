## Context

Change W (`w-docs-and-readmes`), wave 9, needs C-S and U. Read `plans/00-overview.md` (R2, R5, R10), `plans/01-source-inventory.md` (rows on `ULTRA_PLAN.md`, `docs/how-to-present.md`, `docs/demo-script.md`, `docs/upstream/*`), the `commercetools-connect` skill `references/deployment-installation.md` Pattern 6 (the required connector README), `references/observability-operations.md` Pattern 5 and `references/service-applications.md` (fail-open/closed), and the three "unsupported" rules in change A.

## Explore findings

1. **Legacy documents are internal and demo-framed.** Router: `FEATURES.md` 701 lines, `ARCHITECTURE.md` 554, `docs/how-it-works.md` 251 (title "How the team-scoped Managed MCP demo works", companion of `docs/demo-script.md`), `docs/how-to-present.md` 131, `docs/demo-script.md` 193, `docs/models.md` 126, `docs/agentation-preview-annotations-plan.md` 671, `docs/upstream/managed-mcp-gemini-schema-incompatibility.md` ("to be filed with the Managed MCP Server team", mentions the origin repo). `ARCHITECTURE.md` contains tenant-isolation sections ("Multi-Tenant Isolation", "Testing against a real tenant locally"); `FEATURES.md` mentions Firestore/Cloud Run/Pub/Sub 28 times. Chat app: `FEATURES.md` top banner admits stale sections (an outdated permission scheme, Team MCP, ClientCredentials) and the root README is the unmodified `starter-typescript` text with "Architecture principles"; `mc-app/README.md` is the Custom Application starter README.
2. **Connect certification README contract** (`commercetools-connect` skill, `references/deployment-installation.md` Pattern 6): the README must state fail-open/closed stance per use case, the exact required scopes (`inheritAs.apiClient.scopes`), a configuration table of every `connect.yaml` key (standard and secured, meaning, required, default) and a poison-message/replay runbook. Production-readiness checklist items "Fail-open vs fail-closed documented" and "Poison-message / replay runbook" are in `SKILL.md` section "Operations". `connect.yaml` of a service-only connector registers no Subscription/Extension, so the poison/replay item is "not applicable" and must be said explicitly.
3. **Banner and wording rules from change A** (`specs/repo-compliance/spec.md`): "unsupported" appears in (1) every source header (`Freely available, AS IS and UNSUPPORTED. See LICENSE.`), (2) the first 15 lines of `README.md` in a banner, (3) `SUPPORT.md`; `CONTRIBUTING.md` repeats "no support commitment"; prose check forbids the words demo, POC, presales (`scripts/check-repo-rules.mjs --prose`); `scripts/internal-paths.json` lists `.claude/`, `CLAUDE.md` and the internal scripts as development-only (`plans/` and `openspec/` are published as scrubbed design documentation; the scrub is owned by change X).
4. **Docs input already recorded by earlier changes** (each change's "Docs to update" section, read 2026-10-08): C (run locally, config registry, `/service/status`, fail-fast, `MC_AUDIENCE`), D (the default View/Manage permission pair verified in the sandbox, `ADMIN_USER_IDS` admin resolution, `isAdmin` and `userId` bootstrap), G (REST table rows 1-25, digest flow, removed env flags), H (SSE row 19, chunk vocabulary, ToolSource registry diagram, budget timeline, `CHAT_REQUEST_BUDGET_MS`, `CHAT_FINALIZE_RESERVE_MS`, "writing a tool source" guide), I (identity routes, token refresh, admin-only binding), J (`GET /mcp/providers` row, provider key guidance and enablement rule, security notes), N (REST rows 20-25, 413 policy and limits, feedback object layout, audit events), O (per-app env table, forward-to, no permissions claim, config reference, check scripts), P (using the assistant, `data-ct-annotations` contract, Gravatar privacy, motion README), Q (setup steps, administrator access, the "Your user ID" line and non-admin experience, read-only provider status cards), R and S (per-app READMEs, scopes, locators), U (deployment inputs, verified behaviour U1-U7, two-phase diagram, `docs/deployment-runbook.md`), V (testing, E2E troubleshooting). Changes E, F, K, L, M also owe entries; W reads their tasks when archived.
5. **Name collision to settle:** plan 03/04 call the deployment doc `docs/deployment.md`; change U creates `docs/deployment-runbook.md`. Decision D3 resolves it.
6. **Platform docs to cite** (verified by earlier changes): Connect deployment behaviour and environments (5-minute request timeout, sandbox scale-to-zero ~15 s) https://docs.commercetools.com/connect/deployment-behavior-and-environments.md ; supported runtimes https://docs.commercetools.com/connect/supported-runtimes.md ; Custom Objects https://docs.commercetools.com/api/projects/custom-objects.md ; Merchant Center custom applications/views https://docs.commercetools.com/merchant-center-customizations/overview.md ; Connect certification https://docs.commercetools.com/connect/certification.md .
7. **FEATURES.md generation**: the legacy file says "Last generated: 2026-09-11 by feature-doc"; no `feature-doc` tool is available in this environment (not found among installed skills), so regeneration is a manual, code-derived rewrite where each bullet cites a file path.
8. **Screenshots**: evidence from changes P/Q/V sits in `plans/evidence/` (git-ignored; whether the folder is kept is decided by change X); docs may include selected PNGs copied to `docs/images/` after privacy review (no real e-mail addresses, project keys, customer data).

## Glossary

- **Connector README**: the root README that Connect certification reads; here the root `README.md`.
- **Fail-open / fail-closed**: whether a request proceeds (degraded) or is rejected when a dependency is down.
- **Generated block**: text between `<!-- gen:begin name -->` and `<!-- gen:end name -->` markers produced by a script and verified with `--check`.
- **Docs input ledger**: table mapping each earlier change's "Docs to update" bullet to a section of the final docs.
- **Scrub rules**: content prohibitions for published prose.
- **forward-to / gateway**, **Custom Object**, **Managed MCP**: see changes O, E, I glossaries.

## Source map

| Legacy file / source | New file | Verdict |
|---|---|---|
| chat app `README.md` (starter) | root `README.md` | CHANGE (rewrite) |
| router `ARCHITECTURE.md` | `docs/architecture.md` | CHANGE (single-tenant; drop tenant sections) |
| router `docs/how-it-works.md` | `docs/how-it-works.md` | CHANGE (remove demo framing and team-scoped narrative) |
| router and chat `FEATURES.md` | `FEATURES.md` (one file at root) | CHANGE (regenerate) |
| router `docs/models.md` | `docs/configuration.md` section "Models" | CHANGE (Vertex, no API key) |
| router `docs/upstream/*` | `docs/known-issues/managed-mcp-gemini-schemas.md` | CHANGE (scrub; keep only if still accurate; owner Q7-style decision RQ11) |
| router `docs/agentation-preview-annotations-plan.md` | not copied (plan text); facts go to `docs/how-it-works.md` section "Preview annotations" | DROP |
| router `docs/how-to-present.md`, `docs/demo-script.md`, `ULTRA_PLAN.md` | - | DROP |
| mc-app/composed-apps/mc-view-app starter READMEs | per-app `README.md` | CHANGE (R, S, P/O/Q supply content) |
| change U `docs/deployment-runbook.md` | kept as is; linked | KEEP |
| `plans/05-data-persistence.md` | `docs/architecture.md` section "Data model" | CHANGE |
| new | `docs/api.md`, `docs/configuration.md`, `docs/deployment.md`, `docs/permissions.md`, `docs/security.md`, `docs/operations.md`, `docs/troubleshooting.md`, `docs/privacy.md`, `SUPPORT.md`, `CONTRIBUTING.md`, `CHANGELOG.md` | NEW |

### Document-to-spec supply map (which spec supplies each section)

| Document / section | Supplied by |
|---|---|
| README: overview, layout, prerequisites | A, B, plans 00/02 |
| README: quick start (local) | C, F, O, V (dev-up) |
| README: configuration table | B (`connect.yaml`), C (registry), generated |
| README: required scopes | B, E, I, L, F (GCP roles), R, S, O |
| README: fail-open/closed | C, D, E, F, H, I, J, K, L (each dependency) |
| README: operations, poison/replay N/A | observability from C, U |
| docs/architecture.md: topology, data model | plans 02/05, C, E, H, K, U |
| docs/architecture.md: auth flow | D, O |
| docs/how-it-works.md: chat turn, budget, tool sources | H, J, K, L |
| docs/how-it-works.md: digest, suggestions | G |
| docs/how-it-works.md: identity MCP | I |
| docs/how-it-works.md: composed pages | M, R, P |
| docs/how-it-works.md: custom view | S |
| docs/how-it-works.md: preview annotations | P |
| docs/api.md: auth/session | D |
| docs/api.md: sessions, messages, tools, prompt, suggestions | G |
| docs/api.md: stream | H |
| docs/api.md: managed-mcp-identity | I |
| docs/api.md: mcp/providers (read-only) | J |
| docs/api.md: feedback, backoffice | N |
| docs/configuration.md (incl. provider keys) | B, C, D, E, F, H, J, K, L, U (generated) |
| docs/deployment.md | U, B |
| docs/permissions.md (app access, `ADMIN_USER_IDS`, finding your user ID, non-admin experience) | D, O, Q |
| docs/security.md (incl. provider credentials in `securedConfiguration`, what is not trusted) | E (encryption), D, I, J, N, Q |
| docs/operations.md (incl. data retention: kept forever, how to delete) | C, U, H (budget), E (Q13, Q25) |
| docs/troubleshooting.md | all changes' Watch-out and Risks, V |
| docs/privacy.md | P (Gravatar), N (transcripts, display-only `userLabel`), I (identity tokens stored encrypted), G (host URL in flags, S) |
| FEATURES.md | every feature change |
| SUPPORT.md / CONTRIBUTING.md | A (stubs), V (E2E card rules), H (tool source guide), O (check scripts) |

## Decisions

**D1. Root README is the connector README; details live in `docs/`.** Alternatives: (a) short README + all certification content in docs - rejected: the certification reviewer and the Connect marketplace page read the repository root; (b) everything in README - rejected: unreadable. Chosen: README holds the four certification items (config table generated, scopes table, fail-open/closed table, poison/replay statement) in compact form and links to the full pages.

**D2. Generated tables with drift checks.** `scripts/docs/gen-config-table.mjs` reads `connect.yaml` and writes the configuration, scopes and secured/standard tables between `<!-- gen:begin NAME -->` / `<!-- gen:end NAME -->` markers in `README.md` and `docs/configuration.md`; `--check` fails on drift. YAML parsing: use the YAML package already installed by change U's scripts (`scripts/connect`) if present; otherwise write the script against the `service` dependency tree; the choice is made in task 2.1 after reading what B, C and U installed. Alternative: hand-written tables - rejected (drift).

**D3. Deployment doc split.** `docs/deployment.md` = concepts and ordered manual steps (what/why, regions, sandbox vs production, rollback decisions, scopes), `docs/deployment-runbook.md` (change U) = commands. Alternative: rename U's file - rejected: its tests and tasks already reference it. Rule: commands only in the runbook (spec scenario).

**D4. Fail-open/closed table drafted from specs, verified by reading code.** Draft (to be verified in task 6.1; each row cites the owning spec):

| Dependency | When unavailable | Stance (draft) | Timeout budget |
|---|---|---|---|
| Merchant Center JWKS (gateway keys) | cannot verify tokens -> 503 for authenticated routes; cached keys used until their TTL | closed | per change D |
| Custom Objects (commercetools API) | sessions/settings routes fail 5xx; chat turn refuses to start; `/service/status` stays UP | closed | per change E |
| Vertex AI Gemini | chat turn ends with a visible error; digest/suggestions fall back to static defaults | closed for chat, open for suggestions/digest | per change F/H |
| `ADMIN_USER_IDS` configuration | empty or unset: nobody is admin (startup warning, `adminConfigured:false`); non-admin users get 403 `ADMIN_REQUIRED` | closed (admin is never granted without a listed user id) | per change D |
| Identity Managed MCP | commercetools tools unavailable; chat continues with other sources; message states reconnect | open (degraded) | per change I |
| Knowledge MCP, Contentstack, Algolia, Stripe | provider tools omitted for the turn | open (best effort) | per change J |
| Embedded Nimbus MCP | Nimbus agent tools omitted; child respawn | open | per change K |
| BigQuery offload | large tool results returned truncated with note, query tools error | open (degraded) | per change L |
| Cloud Storage (images) | image generation returns an error part; an image that cannot be streamed shows an error placeholder | closed for that tool | per change L |
| 5-minute request limit | graceful finish notice, turn persisted | closed with message | budget 270 s |
No commerce path is affected because no API Extension or Subscription is registered: orders, carts and checkout never depend on this connector.

**D5. Poison/replay statement.** Text: "This connector contains only a `service` application and Merchant Center frontends. It registers no Subscription, API Extension or scheduled job, receives no commercetools messages and therefore has no redelivery, dead-letter or replay behaviour. Recovery paths: ..." in README and `docs/operations.md`.

**D6. Scrub rules** (checked by `check-repo-rules.mjs --prose` plus `scripts/docs/check-docs-claims.mjs --scrub`): forbidden words demo, POC, presales (word boundary); customer or program names from `scripts/internal/leak-patterns.json`; tunnel hosts (`ngrok`, `trycloudflare`); `*.run.app`; real project keys (pattern from the leak list); e-mail addresses other than `@example.com` placeholders; links containing `plans/`, `openspec/`, `.claude/`, `CLAUDE.md`, `file://`, or an absolute path under a user home directory; the word "tenant" except in `CHANGELOG.md`; emojis; sentences like "we are excited"; any statement not backed by code (claims-ledger style: each architectural claim cites a path).

**D7. FEATURES.md as code-derived inventory.** Structure: Repository shape; Authentication and permissions; Persistence; Chat service; Agents and tool sources; Identity MCP; Frontends (mc-app, composed-apps, mc-view-app); Backoffice and feedback; Deployment; Testing. Each bullet: statement + `path` citation. Verified by `check-docs-claims.mjs --citations` (paths exist).

**D8. Screenshots**: at most eight, from evidence, named `docs/images/<topic>.png`, reviewed for personal data; alt text required.

**D10. Administrator access documentation.** Written once in `docs/permissions.md` and summarised in README ("Administrator access") and `docs/security.md`. Content: (1) Admin means the user's Merchant Center user id (the `sub` of the signed gateway token, verified by the service) is listed in the Connect configuration `ADMIN_USER_IDS` (comma-separated, optional, standard configuration; empty or unset means nobody is admin, the service logs `ADMIN_USER_IDS is empty: no administrator` at start and `/service/status` reports `adminConfigured:false`; an invalid entry makes the service fail at startup naming the position); (2) how to find your user ID: every signed-in user sees a read-only "Your user ID" line (Settings > About in the main app, panel footer in the view app); the first-administrator bootstrap is deploy, open the app, read the line, `node scripts/connect/connect.mjs configure ADMIN_USER_IDS=<id>` (redeploy), refresh; (3) the non-admin experience (admin pages and nav hidden, "Administrator access required" notice, 403 `ADMIN_REQUIRED` on admin routes, chat and sessions work, own identity connect works once an administrator bound a server); (4) what is NOT trusted: any e-mail, label or flag sent by the browser (header, body, query, `userEmail`, `isAdmin`); `isAdmin` comes only from the service; (5) `userLabel` is a display-only, unverified label sanitised by the service, shown as text marked "(unverified)" in the backoffice; (6) there is no Merchant Center permission group for administrators: the Custom Application has only its default View and Manage permission pair, which controls access to the app, not administrator rights; (7) how to add or remove an administrator: change `ADMIN_USER_IDS` with `configure` and redeploy (takes effect when the instances restart; a comma-separated list is passed as one value). Troubleshooting entries: "nobody is admin because ADMIN_USER_IDS is empty" and "I am not shown as administrator" (check the id on the "Your user ID" line against the configured value, redeploy, refresh).

**D11. Data retention statement.** `docs/operations.md` section "Data retention" and `docs/privacy.md`: chat messages and feedback are kept until an operator deletes them; there is no automatic deletion, expiry or cleanup job; request body cap 10 MiB and snapshot cap 8 MiB limit size, not age. How an operator deletes data: delete a session in the app (removes its messages), or delete Custom Objects of the containers listed in `docs/architecture.md` with the Merchant Center Custom Objects view or `DELETE /{projectKey}/custom-objects/{container}/{key}` using an API client with `manage_project`; deleting the container's objects for one user removes that user's data.

**D9. Known-issues doc for Gemini schema normalisation.** Keep a scrubbed, shortened `docs/known-issues/managed-mcp-gemini-schemas.md` only if change H's `json-schema.utils` still needs it; else drop (RQ11 default: keep short factual note, remove "to be filed" language and internal repository names).

## Risks / Trade-offs

- **R1 Docs drift** after v1: mitigated by generated tables and the three check scripts, listed in CONTRIBUTING.
- **R2 Wrong claims** (fail-open/closed) copied from plans instead of code: mitigated by task 6.1 reading each handler.
- **R3 Leakage of internal wording** from legacy docs: write fresh text; do not copy paragraphs.
- **R4 Connect certification reviewer expects `shared/`** (skill checklist) - README explains why Merchant Center apps duplicate five small files and guard them (O, R, S).
- **R5 Late changes** to routes after W: the API drift check catches it.
- **R6 Screenshots** may contain personal data.

## Open questions

- **RQ10** (owner, mirrored in questions inbox): maintainer contact and discussion location for `SUPPORT.md` (default: GitHub Issues disabled? / Discussions of the repository, no SLA).
- **RQ11** (owner): keep the scrubbed known-issues note about Managed MCP Gemini schema incompatibility (default keep) or drop.
- Which file is the final name for U's runbook (read from the archived change).
- Whether `CHANGELOG.md` should exist at v1 (default: yes, single `0.1.0` entry) - Z decides the version.

## Changelog

- 2026-10-09 (owner decision Q4): docs inputs from J/Q/U now describe provider credentials as Connect configuration (seven keys, enablement rule, `configure`), `docs/api.md` documents the read-only `GET /mcp/providers`, and `docs/security.md` no longer mentions write-only secrets in the browser.
- 2026-10-09 (owner decision Q9): docs inputs from B/F/L/U now describe the Google Cloud settings (all optional with defaults, single SA key, IAM role options) and the private-by-default image model (`GET /files/...` streaming endpoint, no signed URLs) in `docs/configuration.md`, `docs/security.md` and `docs/api.md`; the Cloud Storage row above now reads: image generation or image display returns an error part for that image only.
- 2026-10-09 (owner decision: admin = `ADMIN_USER_IDS` only): docs describe `ADMIN_USER_IDS`, how to find your own user id ("Your user ID" line) and the first-administrator bootstrap, the fail-closed empty list, the non-admin experience, what is not trusted (browser e-mail, label, flags), the display-only `userLabel` and the absent permission group (D10); the old permission-group docs are removed; the stale-vocabulary grep no longer lists the e-mail model; the fail-open table has a new `ADMIN_USER_IDS` row; troubleshooting adds the empty-list and not-shown-as-admin entries; `plans/` and `openspec/` are published as scrubbed design documentation (scrub owned by change X).
