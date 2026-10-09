# Traceability: plans/01 features to scenario ids

Every KEEP and CHANGE row of `plans/01-source-inventory.md` maps to at least one scenario card here.
`node scripts/e2e/extract-scenario-ids.mjs --trace` fails when a row has no id, an id has no card, the
number of mapped rows differs from the number of KEEP/CHANGE rows in plans/01, or a plans/01 row is
missing from the table. The feature column repeats the first column of plans/01 verbatim (regenerate
the skeleton with `--inventory`). DROP rows have no scenario of their own; their absence is checked by
`E2E-V-11` and `E2E-V-08`.

Ids follow the owning changes' own lists (the ids that other changes wrote into their `tasks.md` win
over the defaults of the V design). Where a default of the design moved, the card says so in its
`Spec:` line and in the playbook header: D-04 to D-06 (verifier negatives, admin matrix, startup
guards), J (provider status is J-02, J-03), K-05 (respawn), L (image cards are L-04 to L-08), M (M-01 to
M-06), N (N-01 to N-06), Q (Q-01 to Q-16), U-04 to U-06 (two-phase, idempotent redeploy, undeploy).

| # | Feature (plans/01) | Owner spec | Scenario ids |
|---|---|---|---|
| 1 | Express app, `/service` base path, error middleware, request context (AsyncLocalStorage), logger | C | E2E-C-01, E2E-V-08 |
| 2 | Boot-time config audit (`startup-checks.ts`) | C | E2E-C-02, E2E-F-02, E2E-D-06 |
| 3 | Merchant Center session auth (`mc-session.middleware`, `createSessionAuthVerifier`, JWKS, audience policy) | D | E2E-D-01, E2E-D-03, E2E-D-04, E2E-V-02, E2E-O-02 |
| 4 | `POST /auth/session` bootstrap | D | E2E-D-01, E2E-O-01, E2E-O-03, E2E-O-06 |
| 5 | `MC_AUTH_DISABLED` dev bypass | D | E2E-D-06 |
| 6 | Admin allowlist `ADMIN_EMAILS` + `?userEmail=` trust | D | E2E-D-02, E2E-D-05, E2E-V-03, E2E-V-12, E2E-V-13, E2E-O-03, E2E-G-06, E2E-Q-15 |
| 7 | Session ownership by `userId` / `userEmail` | D, G | E2E-G-01, E2E-G-02, E2E-V-12, E2E-N-06 |
| 8 | AES-256-GCM `crypto.utils` + legacy layouts | E | E2E-E-01, E2E-I-03, E2E-V-10 |
| 9 | Sessions CRUD, messages, last-session, paginated messages | G | E2E-G-01, E2E-G-02, E2E-P-04, E2E-P-05, E2E-P-06, E2E-P-13 |
| 10 | Session digest (title/description/icon/summary/nextPrompts) | G | E2E-G-03, E2E-P-04, E2E-P-08 |
| 11 | Prompt suggestions (`/suggestions`, cache per user) | G | E2E-G-04, E2E-P-01 |
| 12 | Feature flags via query (`customView`) | G, S | E2E-G-07, E2E-S-02, E2E-H-06 |
| 13 | Per-session tools menu (`/session/:id/tools`, disabled-tools negative list) | G | E2E-G-05, E2E-P-07, E2E-J-01 |
| 14 | System prompt + tool-call-log mode endpoints | G | E2E-G-06, E2E-G-08, E2E-Q-06, E2E-Q-07 |
| 15 | Chat stream endpoint (`/ai-chat/:id/message/stream`), orchestrators (singleton, custom-view), subagent tool, query analyzer, prompts | H | E2E-H-01, E2E-H-03, E2E-H-04, E2E-H-05, E2E-P-02, E2E-P-03, E2E-V-06 |
| 16 | 8 functional agents + image generation | H, J, K, L | E2E-H-02, E2E-J-01, E2E-J-05, E2E-K-02, E2E-L-01, E2E-L-04, E2E-M-01 |
| 17 | `visualize_data`, `export_data`, `create_entity_link` tools | H | E2E-H-02, E2E-L-03, E2E-P-10 |
| 18 | `create_composed_page` tool (Babel transpile, v5.0 schema) | M | E2E-M-01..M-06, E2E-P-11 |
| 19 | Gemini JSON-schema normalisation / hoisting (`json-schema.utils`) and tool-schema debug | H | E2E-H-02, E2E-F-01, E2E-V-08 |
| 20 | Provider modules `gemini*.ts` | F | E2E-F-01, E2E-F-03 |
| 21 | Identity-mode Managed MCP (`ct-identity.mcp`, `identity-mcp-auth.provider`, discovery, connection service, controller/routes) | I | E2E-I-01..I-07, E2E-I-05b, E2E-Q-01, E2E-Q-03, E2E-V-05 |
| 22 | commercetools Knowledge MCP + developer-tips prompt | J | E2E-J-01, E2E-J-06 |
| 23 | Contentstack tools (1739 lines), Algolia MCP, Stripe toolkit (+ `legacy-tool-schema`) | J | E2E-J-02, E2E-J-03, E2E-J-04, E2E-J-05, E2E-Q-08, E2E-Q-14 |
| 24 | Nimbus MCP client (`nimbus.mcp`, `nimbus.batch`) + `nimbus-mcp-gateway/` | K | E2E-K-01..K-05 |
| 25 | BigQuery offload (`tool-result-pipeline`, `bigquery.service/utils`), `query_aggregated_data`, `get_table_info` | L | E2E-L-01, E2E-L-02, E2E-L-07 |
| 26 | GCS image upload (`gcs.service`, `file.utils`) | L | E2E-L-04, E2E-L-05, E2E-L-06, E2E-L-08, E2E-P-15 |
| 27 | Feedback submit/fetch (chunked snapshots 800 KB) | N | E2E-N-01, E2E-N-02, E2E-N-03, E2E-N-06, E2E-P-09 |
| 28 | Backoffice (`is-admin`, threads, thread detail) | N | E2E-N-04, E2E-N-05, E2E-Q-10, E2E-Q-11 |
| 29 | In-memory cache layer (`cache/*`) | C | E2E-V-04, E2E-V-09 |
| 30 | Jest wire tests (`service/tests/wire/*`) | all | E2E-V-08 |
| 31 | `mc-app` | O, P, Q | E2E-O-01, E2E-P-01, E2E-P-02, E2E-Q-09 |
| 32 | `composed-apps` | O, R | E2E-R-01, E2E-R-02, E2E-R-08 |
| 33 | `mc-view-app` | O, S | E2E-S-01, E2E-S-02, E2E-S-10 |
| 34 | `forward-to.ts` (identical ×3) | O | E2E-O-02, E2E-V-08 |
| 35 | Chat surface, composer, parts renderers, tool-steps, charts, follow-up chips, typing indicator, motion | P | E2E-P-01..P-15 |
| 36 | Annotation / agentation preview feature (latest upstream commits) | P | E2E-P-12, E2E-H-08 |
| 37 | Identity MCP "Connect my account" setup page | Q, I | E2E-Q-03, E2E-Q-04, E2E-I-03, E2E-S-05 |
| 38 | Configuration panel: tool-call logs, system prompt, MCP providers | Q | E2E-Q-06, E2E-Q-07, E2E-Q-08, E2E-Q-09, E2E-G-06, E2E-G-08 |
| 39 | Backoffice (thread list, alaSQL query threads, feedback list/detail) | Q | E2E-Q-10..Q-13, E2E-N-05 |
| 40 | Composed pages (custom object `shared-composed-pages`, Babel renderer, data sources) | M, P, R | E2E-R-01..R-09, E2E-P-11, E2E-M-05 |
| 41 | Dead i18n (`extract-intl`, empty en/de) | O | E2E-O-01, E2E-O-04 |

## Additional requirements (not rows of plans/01)

These come from the requirements R1 to R10 of `plans/00-overview.md` and from the cross-cutting cards of
change V; they are listed so that no scenario is orphaned.

| # | Requirement | Owner spec | Scenario ids |
|---|---|---|---|
| X1 | Auth and bootstrap error gates (reauthentication dialog, retry) | O, P, S | E2E-O-05, E2E-V-02, E2E-S-07 |
| X2 | Stateless service: sessions, settings and identity survive restarts and multiple instances (R7, D1, D2) | E | E2E-V-04, E2E-V-05, E2E-E-03 |
| X3 | Connect deployment: apps load, two-phase deploy, postDeploy, undeploy (R2, R6) | U | E2E-U-01..E2E-U-06, E2E-V-09 |
| X4 | Dropped features are absent (team MCP, data warehouse, credential CRUD) | P, Q | E2E-V-11 |
| X5 | Secrets never in the browser or in logs | E, J | E2E-V-10, E2E-J-02, E2E-Q-14 |
| X6 | The non-admin experience: read-only status, no admin surface, notice | D, Q | E2E-V-03, E2E-Q-02, E2E-Q-09, E2E-Q-10 |
| X7 | Own user ID and administrator bootstrap through ADMIN_USER_IDS | D, P, S | E2E-V-13, E2E-P-16, E2E-S-12, E2E-Q-16, E2E-O-06 |
| X8 | Forged e-mail, label or header never grants admin or ownership | D, N, Q | E2E-V-12, E2E-D-02, E2E-N-04, E2E-Q-15 |
| X9 | Test framework itself: preflight, cleanup, gates | V | E2E-V-01, E2E-V-07, E2E-V-08 |
