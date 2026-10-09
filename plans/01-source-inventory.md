# 01 — Source inventory: KEEP / CHANGE / DROP

Derived from the sources' own `FEATURES.md` / `ARCHITECTURE.md` **and** from reading code (2026-10-08). Paths are relative to the source repos:
`R/` = `multitenant-ai-assistant-router/`, `C/` = `multitenant-chat-app/`.
"Spec" = owning spec letter in [03-spec-dependency-map.md](./03-spec-dependency-map.md).

## 1. Backend (`R/service`, Express 4 / Node 22 / AI SDK v7)

| Feature | Verdict | What changes | Spec |
|---|---|---|---|
| Express app, `/service` base path, error middleware, request context (AsyncLocalStorage), logger | KEEP | Config via validated `readConfiguration()` (Connect pattern); no `dotenv` reliance in prod; `GET /service/status` health alias | C |
| Boot-time config audit (`startup-checks.ts`) | CHANGE | Becomes fail-fast env validation naming each missing key | C |
| Merchant Center session auth (`mc-session.middleware`, `createSessionAuthVerifier`, JWKS, audience policy) | KEEP | Reject any `projectKey` ≠ `CTP_PROJECT_KEY`; audience from Connect service URL | D |
| `POST /auth/session` bootstrap | CHANGE | No project auto-registration; returns `{projectKey, userId, isAdmin, identityMcpConfigured, identityUserConnected}` (no permissions) | D |
| `MC_AUTH_DISABLED` dev bypass | KEEP (guarded) | Refuse to start if `NODE_ENV=production` | D |
| `validateProject`, `projects/{key}` doc, `getAllProjects`, region matrix, `lastAccessedAt`, `isActive`, project cache | DROP | Replaced by a single **settings** object (system prompt, tool-call-logs, identity MCP binding) | E |
| Admin allowlist `ADMIN_EMAILS` + `?userEmail=` trust | CHANGE | Replaced by `ADMIN_USER_IDS` (Merchant Center user ids) matched against the verified gateway JWT user id; never against client input (D6) | D |
| Session ownership by `userId` / `userEmail` | KEEP | Verified `userId` only; drop trusting `?userEmail=` | D, G |
| Firestore (`firestore.utils.ts`, 2138 lines), indexes JSON, index script | DROP | Replaced by repository over Custom Objects | E |
| AES-256-GCM `crypto.utils` + legacy layouts | CHANGE | Keep AES-GCM, drop legacy layouts, key from `ENCRYPTION_KEY` (secured config) | E |
| Sessions CRUD, messages, last-session, paginated messages | KEEP | New storage | G |
| Session digest (title/description/icon/summary/nextPrompts) | KEEP | New storage; still never awaited on the stream | G |
| Prompt suggestions (`/suggestions`, cache per user) | KEEP | Cache = Custom Object | G |
| Feature flags via query (`customView`) | KEEP | — | G |
| Per-session tools menu (`/session/:id/tools`, disabled-tools negative list) | KEEP | — | G |
| System prompt + tool-call-log mode endpoints | KEEP | Stored in settings object | G |
| `migrate-session-tools`, `backfill-session-digests` scripts | DROP | One-off migrations for the old data | — |
| Chat stream endpoint (`/ai-chat/:id/message/stream`), orchestrators (singleton, custom-view), subagent tool, query analyzer, prompts | KEEP | 5-min budget guard (D13) | H |
| 8 functional agents + image generation | KEEP | Provider swap to Vertex (D4) | H, F |
| `visualize_data`, `export_data`, `create_entity_link` tools | KEEP | — | H |
| `create_composed_page` tool (Babel transpile, v5.0 schema) | KEEP | — | M |
| Gemini JSON-schema normalisation / hoisting (`json-schema.utils`) and tool-schema debug | KEEP | Pure code, wire tests ported | H |
| Provider modules `gemini*.ts` | CHANGE | `createVertex({googleAuthOptions:{credentials}})`; `countTokens` via Vertex | F |
| `anthropic.ts`, `CLAUDE_API_KEY`, `OPENAI_API_KEY`, `openai` dependency | DROP | Imported by nothing | F |
| Identity-mode Managed MCP (`ct-identity.mcp`, `identity-mcp-auth.provider`, discovery, connection service, controller/routes) | KEEP | Tokens, PKCE state, binding → encrypted Custom Objects; PKCE state must work across instances | I |
| Legacy credential-mode `managed-mcp` / team-MCP code, `x-mc-team-id`, `verify:mcp-isolation` | DROP | Already removed from runtime upstream | I |
| commercetools Knowledge MCP + developer-tips prompt | KEEP | — | J |
| Contentstack tools (1739 lines), Algolia MCP, Stripe toolkit (+ `legacy-tool-schema`) | KEEP | Config CRUD (`/mcp/configs`) DROPPED: credentials are Connect configuration (`CONTENTSTACK_*`, `ALGOLIA_MCP_URL`, `STRIPE_*`, Q4 DECIDED); read-only `GET /mcp/providers` status instead | J |
| Nimbus MCP client (`nimbus.mcp`, `nimbus.batch`) + `nimbus-mcp-gateway/` | CHANGE | Embedded stdio child, no HTTP gateway (D3) | K |
| BigQuery offload (`tool-result-pipeline`, `bigquery.service/utils`), `query_aggregated_data`, `get_table_info` | KEEP | SA from `GCP_SA_KEY_BASE64`; read-only SQL guard + `maximumBytesBilled` (hardening); dataset per deployment | L |
| GCS image upload (`gcs.service`, `file.utils`) | KEEP | SA from base64; bucket from config (default `<project>-ai-assistant-images`, created on first use when permitted); private by default, images streamed through `GET /service/files/...`, no signed URLs, `IMAGE_URL_MODE=public` opt-in (Q9) | L |
| Feedback submit/fetch (chunked snapshots 800 KB) | CHANGE | Chunk size/limits re-derived from Custom Object limits (verify in spec) | N |
| Backoffice (`is-admin`, threads, thread detail) | CHANGE | Single project; admin-only (`requireAdmin`), audit log lines; unverified display-only `userLabel` | N |
| legacy per-tenant widget bootstrap endpoint (`GET` config route) | DROP | DECIDED 2026-10-09 (Q7): dropped | — |
| In-memory cache layer (`cache/*`) | KEEP | — | C |
| Jest wire tests (`service/tests/wire/*`) | KEEP | Ported, extended (repo layer, auth, persistence) | per spec |
| `clinic` profiling scripts, `.connect/*` build logs, `LICENSE` in service/ | DROP | Root `LICENSE` instead | A |
| `ULTRA_PLAN.md`, `docs/how-to-present.md` (internal), `docs/demo-script.md`, `docs/upstream/*` | DROP / rewrite | Internal/demo framing is a gate WARN; keep upstream Gemini-schema report only if scrubbed | W |

## 2. `nimbus-mcp-gateway` (`R/nimbus-mcp-gateway`)

Streamable-HTTP proxy for the stdio-only `@commercetools/nimbus-mcp` (pinned `3.5.1`), shared-secret auth, `/healthz`, `/readyz`, crash/wedge recovery, Dockerfile.
**CHANGE (D3):** keep the *behaviours that matter* — one long-lived child, respawn on close, recycle after 3 timeouts, stderr piped to logs, 7-tool readiness check — as a small in-process module (`service/src/nimbus/`). Delete HTTP, secret, Dockerfile. → spec K.

## 3. Frontends (`C/`)

| Package | Type | Version drift | Verdict | Spec |
|---|---|---|---|---|
| `mc-app` | MC Custom Application "AI Assistant" | 27.9.6 | KEEP, remove tenancy/team code, nimbus typegen scripts | O, P, Q |
| `composed-apps` | MC Custom Application "AI Assistant Pages" | 25.1.0 | KEEP, bump to 27.9.6 | O, R |
| `mc-view-app` | MC Custom View (CustomPanel, 65 locators) | 27.9.6 in package.json (FEATURES says 26.1) | KEEP | O, S |

| Frontend feature | Verdict |
|---|---|
| `forward-to.ts` (identical ×3) | KEEP — duplicated deliberately (no shared build). A script `scripts/check-duplicates.mjs` (spec O) fails if the copies drift |
| Chat surface, composer, parts renderers, tool-steps, charts, follow-up chips, typing indicator, motion | KEEP |
| Annotation / agentation preview feature (latest upstream commits) | KEEP — verify it is complete in source (spec P explore) |
| Identity MCP "Connect my account" setup page | KEEP |
| Team MCP drawer, `use-mc-teams`, `contexts/team.tsx`, `x-mc-team-id` | DROP |
| Configuration panel: tool-call logs, system prompt, MCP providers | KEEP (admin-gated by `ADMIN_USER_IDS`) |
| Configuration panel: **Data Warehouse (BETA)** toggle + `use-bigquery` `data-warehouse/query` | DROP (warehouse removed upstream; composed pages GraphQL-only) |
| Backoffice (thread list, alaSQL query threads, feedback list/detail) | KEEP, single-project |
| Composed pages (custom object `shared-composed-pages`, Babel renderer, data sources) | KEEP — container renamed `ai-assistant-composed-pages`? **No: keep `shared-composed-pages`** for compatibility unless Q-answer says otherwise (decided in spec M) |
| `.env` files committed with real IDs / dead ngrok URL | DROP — `.env.example` only |
| Starter leftovers (`helpers.ts`, `types.ts`, `types/generated/ctp.ts`, `test-utils`, `core.json` Channels strings) | DROP |
| `netlify.toml`, root `yarn.lock` stub | DROP |
| Dead i18n (`extract-intl`, empty en/de) | CHANGE — keep minimal i18n wiring required by app-kit, drop unused scripts |
| `console.log` leftovers | DROP (Connect skill: use the logger/none) |

## 4. Things copied nowhere (internal / customer / demo)

`.env`, `docs/how-to-present.md`, `ULTRA_PLAN.md`, `.claims-ledger.json`, `docs/.drive-docs`, any `multiplatform-us-store` string. Spec X's gate will fail if one slips through.
