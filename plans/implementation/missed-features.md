# Missed features and partly implemented behaviour

Features or behaviours that the specs or the legacy product had (or that a spec/design amendment asked for) and that are NOT implemented, or only partly. Consolidated from the "Missed features / gaps", "TODOs" and "Deviations" sections of the per-change notes (`<id>-notes.md` in this folder). Each row cites the source note.

Severity: high = user-visible loss or security/data risk; medium = degraded behaviour or misleading UI/config; low = polish, test ergonomics, dead code.
"Suggested owner" names the change (spec) that should fix it; changes are not re-opened automatically, so a follow-up task should be added to that change's `tasks.md` or a new small change.

## 1. Chat and agents (G, H, J, K, M)

| Id | Missing or partial | Source | Severity | Suggested owner / spec |
|---|---|---|---|---|
| MF-01 | No Stop button in the composer; E2E-H-05 aborts by reloading mid-stream. | v-notes Q3, H | medium | P (mc-app chat surface), E2E in V |
| MF-02 | `GEMINI_AGENT_MODEL_NAME` (the `agent` model tier, gemini-2.5-flash) is declared and defaulted but no code path uses it; the orchestrator is flat (model split of the legacy product not kept). | w-notes Q6, f-notes, h-notes | low | H (decide: remove key or restore split), F |
| MF-03 | Stripe menu lists 24 tool names but toolkit 0.7.12 has 21 tools; four names (`subscriptions.create`, `invoiceItems.read`, `paymentLinks.read`, `refunds.read`) switch nothing. | j-notes Q2 | medium | J |
| MF-04 | Stripe mutating calls have no confirmation step (legacy gap carried over; the prompt computed an unused `stripeUpdateTools` list that was removed). | h-notes gaps, j-notes gaps, w-notes gaps | medium | J / H prompts |
| MF-05 | Stripe toolkit is the old 0.7.12 (peer `ai ^4`), installed with `legacy-peer-deps`; 0.9.0 (hosted MCP) is not supported; Connect's build honouring `service/.npmrc` is unverified; dotted tool names (`customers.create`) untested live with Gemini. | j-notes spike 7.1, TODOs | medium | J |
| MF-06 | Legacy per-agent keyword routing table ("Keywords: product, order..., Prerequisites: fetch data first") was dropped from the preamble; routing quality may drop. Sources must carry a good one-line `description` and routing hints. Needs an E2E comparison with legacy. | h-notes gaps | medium | H, I-M sources |
| MF-07 | Sub-agent prompts are ported verbatim and stale ("You are a sub-agent... return the error to the main agent", "switch to the export agent"). Prompt cleanup pass not done. | h-notes gaps | low | H |
| MF-08 | Custom-view sessions get no `create_entity_link` and no commercetools source prompt fragment (legacy parity). | h-notes Q2 | low | H / S |
| MF-09 | A chat message or attachment above the global JSON body limit (100 kb) gets a 413; the stream route has no own limit. | h-notes Q3 | medium | H / C (body parser) |
| MF-10 | When the incoming message is an assistant message (auto-send after a tool result), the SDK continues that message and `appendMissing` skips the existing id, so continued content is not persisted (legacy blind spot). | h-notes gaps | medium | H |
| MF-11 | `analyzeQueryTask` legacy quirks kept: size never interpolated into the prompt, `args` renders `[object Object]` (OQ-H4, Q22 default). | h-notes gaps | low | H |
| MF-12 | AI SDK's default `console.error` on a provider error cannot be silenced (`ToolLoopAgent.stream()` has no `onError`). | h-notes gaps | low | H (upstream SDK) |
| MF-13 | No time-limit "Continue" chip; only a text notice plus `data-turn-status`. | h-notes Q5, owner-questions Q23 | low | P |
| MF-14 | Digest, suggestions and follow-up chips depend on work after the response closes; no fallback if Connect freezes CPU (R-G1). | g-notes Q1, w-notes gaps | medium | G (fallback: digest before stream close, 3 s cap) |
| MF-15 | `GET /session/all` returns at most 500 sessions per user (design said 2 000); no "all sessions of a user" read, so suggestions personalise only from plain (non custom-view) sessions. | g-notes Q2, Q3, gaps | low | G / E |
| MF-16 | `GET /messages?offset=` is implemented by reading `limit + offset` and slicing (no store offset). | g-notes gaps | low | E / G |
| MF-17 | `featureFlags` default is omitted rather than `null`; G registers no bootstrap contributor, so the digest is not inlined in `/auth/session`. | g-notes gaps | low | G / P |
| MF-18 | `ctx.hasTool` missing and `ToolSource.getPrompt` is synchronous: the composed-page prompt's Nimbus lookup section is gated by the kill switch (`config.nimbus.enabled`), not by real tool presence, so it can mention tools that failed to start. | m-notes gaps | low | H (pass merged tool names to `getPrompt`) / M |
| MF-19 | Babel `transformAsync` is CPU bound; the 10 s race cannot interrupt it (only a hang). A hard limit needs a worker thread; the 20 000 character cap bounds the cost. Per-request Babel memory (~90 MB) next to the Nimbus child is unmeasured. | m-notes gaps, TODOs | low | M |
| MF-20 | Composed-page validator accepts an arrow-component wrapper with a top-level `return`; "no import/export" depends on Babel parser error text. | m-notes gaps | low | M |
| MF-21 | Fallback Nimbus gateway (K tasks 9.1/9.2) not built; no behaviour under concurrent chat streams (CPU contention on 1 CPU) measured; footprint figures are macOS, not the Connect image. | k-notes TODOs | medium | K |
| MF-22 | Other tool sources (third-party MCP, Nimbus) are not wrapped in the tool-result offload pipeline; no spec says so. | cleanup-notes | low | L / H |
| MF-23 | Image agent cannot edit an earlier generated image unless `ImageUploader.toModelMessages` also converts files nested in `tool-imageGeneration` outputs; the image agent only applies the token guard. | h-notes deviations | medium | L / H |
| MF-24 | The Knowledge source's developer tips are added by the source; the commercetools source (I) must pass `''` or tips appear twice (caller contract, untested end to end). | j-notes gaps | low | I / J |

## 2. Identity (I)

| Id | Missing or partial | Source | Severity | Suggested owner / spec |
|---|---|---|---|---|
| MF-30 | Bind-time verdict `auth2` may be impossible with template-generated metadata (see Q-impl-01); no `force` flag or `registration_endpoint` fallback. | i-notes Q1 | high | I |
| MF-31 | Rebind (`PUT`) leaves old users' token records (stale revision, never read) instead of deleting and revoking. | i-notes Q2 | low | I |
| MF-32 | Login CSRF of the callback (OQ-I7) unchanged (legacy parity); the "no tool permitted" regex `NO_PERMITTED` is a placeholder until the real wording is seen. | i-notes gaps, TODOs | medium | I (live) |
| MF-33 | `SERVICE_BASE_PATH` constant does not exist in C; `/service` is a literal in `app.ts` and a copy in `identity-mcp/constants.ts`. | i-notes gaps | low | C / I |

## 3. Persistence, config, operations (C, D, E, N, U)

| Id | Missing or partial | Source | Severity | Suggested owner / spec |
|---|---|---|---|---|
| MF-40 | No instance id on `/service/status` (V design amendment); body is `status, service, version, persistence, authConfigured, adminConfigured`. | v-notes Q4 | low | C |
| MF-41 | Keys read by the service but not declared in `connect.yaml` (`LOG_HTTP`, `CACHE_*`, `MCP_HANDSHAKE_TIMEOUT_MS`, `PORT`, `NODE_ENV`, `PERSISTENCE_DRIVER`, `MC_AUTH_DISABLED`) cannot be set on Connect. | c-notes gaps, w-notes gaps | medium | C / B |
| MF-42 | `connect.mjs configure` accepts only provider keys, Google settings and `ADMIN_USER_IDS`; `LOG_LEVEL`, model names, chat budget and `ENCRYPTION_KEY` need a manual CLI redeploy; no plain `redeploy` command; empty-value clearing refused (U9). | w-notes gaps, v-notes Q5, u-notes TODOs | low | U |
| MF-43 | No hot reload of `ADMIN_USER_IDS`; a running instance keeps the old list until restart. | w-notes gaps | low | D / U |
| MF-44 | `X-Correlation-Id` is accepted but not echoed in the response. | w-notes gaps | low | C |
| MF-45 | No API to delete feedback or a user's data; session delete does not delete feedback. | w-notes gaps | medium | N / G (privacy decision Q-impl-37) |
| MF-46 | Create is an upsert: first write of a never-written object can lose a concurrent first writer; `SessionStore.create` conflict holds only sequentially. | e-notes G-E1 | medium | E |
| MF-47 | Purge cannot discover per-session or per-feedback containers whose parent object is already gone (no container listing). | e-notes gaps | low | E |
| MF-48 | Gateway timeout stops waiting but does not cancel the HTTP request (SDK `execute()` has no abort signal). | e-notes gaps | low | E |
| MF-49 | Numbers and booleans are written inline in predicates until `P-var-types` is known; empty-string payload storage not probed. | e-notes TODOs, deviations | low | E (live probes) |
| MF-50 | Backoffice list is ordered by `createdAt`, not last update; `offset=10000` unusable (store caps `offset+limit` at 10 000); feedback date filters use platform `createdAt`. | n-notes Q1, gaps | low | E / N |
| MF-51 | E's `FeedbackStore` helpers `FEEDBACK_CHUNK_BYTES`, `MAX_SNAPSHOT_BYTES`, `buildSnapshotChunks`, `reassembleSnapshot` (per-message layout, own limits) are unused by N and misleading; feedback container layout differs from the "snapshots" container named in docs. | n-notes gaps, cleanup-notes new gaps | low | E (delete or align) |
| MF-52 | Records without `snapshotSha256` read back as `snapshotIntact:false` (no migration). | n-notes gaps | low | N |
| MF-53 | `postDeploy` does not create the dataset or bucket itself beyond what `checkGcpAnalytics()` does; `service/scripts/check-gcp-cleanup.mjs` (E2E-L-07) and integration tests `tables.int.spec.ts` and the storage integration test were not written; `plans/evidence/L/` files not created. | u-notes gaps, l-notes TODOs | low | L / U |
| MF-54 | `connect.mjs` `Deployment` response fields beyond `status` and `applications[].applicationName/url` are assumed (`version`, `lastModifiedAt`, `MC_AUDIENCE` location); log ingestion lag can make the `post-deploy: FAILED` grep a false negative. | u-notes gaps | medium | U (rehearsal) |
| MF-55 | Lifecycle probe: 5xx reason text changed after the gateway rewrite; the runbook may quote the old text. | cleanup-notes new gaps | low | U / W |
| MF-56 | Legacy toolchain debt: ESLint 8 / typescript-eslint 5 end of life, `npm audit` findings untriaged, two `google-auth-library` copies, `@ai-sdk/anthropic`/`openai-compatible` present transitively. | c-notes gaps, f-notes gaps, h-notes TODOs | low | C (dependency hygiene) |
| MF-57 | msw 3.x API differs from msw 2 (specs copying msw 2 snippets need `onUnhandledFrame`); `platform-sdk ^8` / `ts-client ^4` kept (CQ1). | c-notes gaps | low | C |

## 4. Storage and analytics (L)

| Id | Missing or partial | Source | Severity | Suggested owner / spec |
|---|---|---|---|---|
| MF-60 | Binary passthrough of images through `/proxy/forward-to` (up to 10 MB, spike OQ-L7) not verified; private-image mode depends on it. | l-notes Q2, TODOs | high | L (live spike) |
| MF-61 | Dry-run `referencedTables` (OQ-L1) not verified; the conservative fallback extractor rejects comma joins. | l-notes Q1 | medium | L (live spike) |
| MF-62 | `sharp` on the Connect buildpack unverified (optional import falls back to no downscaling); `sharp` is `^0.35.5`, not exact. | l-notes TODOs | low | L |
| MF-63 | `public` image mode only works for a bucket the service creates; an existing private bucket is never changed. | w-notes gaps | low | L |
| MF-64 | Export supports CSV only (caps 50 000 rows / 5 MB); not stated in the legacy comparison. | w-notes gaps, l-notes | low | L |
| MF-65 | Cleanup hooks run before messages/session are deleted (spec task 5.1 says after). | l-notes gaps | low | G / L |

## 5. Frontends (O, P, Q, R, S)

| Id | Missing or partial | Source | Severity | Suggested owner / spec |
|---|---|---|---|---|
| MF-70 | composed-apps parser check: `mc-app` now uses `isUsableTranspiledCode` (Babel parser) but `composed-apps` still runs the old `hasReturnStatement` path; no drift check keeps the two copies (service and mc-app) of `isUsableTranspiledCode` aligned. | cleanup-notes new gaps, r-notes gaps | medium | R / M (add to `check-duplicates`) |
| MF-71 | Container key `shared-composed-pages` is a literal in `mc-app/src/constants.ts` and `composed-apps/src/constants.ts` (cross-build import impossible); only `mc-app` is tied to the shared fixture by test; `composed-apps` `parse.spec.ts` does not read the fixture. | cleanup-notes, r-notes gaps, o-notes TODOs | low | R / O |
| MF-72 | `mc-app/src/types/composed-page.ts` header still says "Current version: 4.0". | m-notes TODOs, cleanup-notes | low | P / M |
| MF-73 | Tool menu groups are always enabled; `McpProviderStatus` is not fed back into the menu (see Q-impl-45). | p-notes Q3, q-notes Q1 | medium | P / Q |
| MF-74 | Admin gate wraps `/backoffice` too: an admin who cannot connect their identity account cannot review. | q-notes Q4 | medium | Q |
| MF-75 | Backoffice UI: no date inputs (service supports `createdAtBefore/After`), `messages` flattened to a JSON string for alasql (queries changed from legacy), only `authorUserId` filter for feedback; `ConnectProvider` gate order, `useIdentityStatus`, `DetailLevelControl`, thread-list filters and query tab have no unit tests; alasql insert not run in jest. | q-notes gaps, TODOs, deviations | low | Q |
| MF-76 | `session.tsx`, `useNextPrompts` (P), session context and `useMcSession` error mapping (S) have no unit tests; covered only by E2E. | p-notes TODOs, s-notes TODOs | low | P / S |
| MF-77 | Pages app (`composed-apps`) is read-only: no delete or publish toggle, no `manage_discount_codes`, gravatar dropped from CSP (a generated page that shows a gravatar image is blocked); `fetchAllPages` helper is tested but not used by the hook; boolean variable `"false"` converts to `true` (shared contract behaviour). | r-notes deviations, gaps | low | R |
| MF-78 | `mc-view-app`: no chats drawer, tabs, feedback, queued prompts, config save; "New chat" button added; identity routes and image GETs do not carry the `customView` flag; `isAdmin` stored but never read; mc-app's message actions (copy/try again) kept. | s-notes deviations, gaps | low | S |
| MF-79 | Frontend `package.json` hygiene: jest 29.7.0 vs 30.2.0 mismatch earlier; `check-versions.mjs` covers only `@commercetools-frontend/*` (not `jest`, `@babel/core`, `@tabler/icons`); `check-frontend-leftovers.mjs` has no test; `useCurrentUser` keeps the `'anonymous'` e-mail fallback and a stale comment; `@types-extensions/json-stable-stringify` shim (renamed, private) is unused and should be deleted; leftover comments in `data-sources-context.tsx`, `humanize-tool.ts`. | o-notes gaps, q-notes TODOs, p-notes gaps | low | O / P |
| MF-80 | Frontend build fails without the Connect variables set (`custom-application-config.mjs`, "window is not defined"), also before the cleanup; `INITIAL_PROJECT_KEY`/`HOST_URI_PATH` use a `process.env ... || 'unset-dev-only'` workaround because Connect fails the build on any unset placeholder. | cleanup-notes, o-notes gaps | low | O |
| MF-81 | CSP completeness (`blob:`, `data:` for user attachments, fonts, no `unsafe-eval` on the view) unverified in a browser. | p-notes TODOs, s-notes Q3, o-notes TODOs | medium | O / P / S (live) |

## 6. E2E suite (V)

| Id | Missing or partial | Source | Severity | Suggested owner / spec |
|---|---|---|---|---|
| MF-90 | All 147 E2E cards are `Status: NOT RUN`; helpers `seed`, `cleanup`, `two-instance`, `make-bad-jwt`, `dev-up.sh` covered only by unit tests with fakes. | v-notes Summary, TODOs | high | V (needs Chrome, M3-M10) |
| MF-91 | No `data-testid` hooks in the frontends; selectors are accessible names; whether DevTools tools reach into the cross-origin `mc-view-app` iframe is unknown; gateway replay assumption (page `fetch` wrapper) unverified. | v-notes Q2, gaps | medium | V / P / Q / S |
| MF-92 | Seeds `large-snapshot` and `sessions-many` not written; `collect-evidence.sh` does not scan for secrets (no scrub pass). | v-notes TODOs | low | V |
| MF-93 | Card ids drifted from the V design (D, H, J, K, L, M, N, Q, U renumbered; design's traceability left as is; final ids in `e2e/03-traceability.md`). Amendment log (`plans/06-amendments-applied.md`) and manual step M8a were not recorded. | v-notes gaps | low | V / owner docs |
| MF-94 | No cards for removed items (`E2E-I-00` probe, change T). `E2E-L-07` records SKIPPED until the cleanup script exists. | v-notes deviations | low | V / L |

## 7. Documentation (W) and spec text errors

| Id | Missing or partial | Source | Severity | Suggested owner / spec |
|---|---|---|---|---|
| MF-100 | Docs partly written (r2-docs): "Using the assistant" guide (no screenshots), "adding a store" guide, Stripe pin note and known-issues note for Gemini schemas now exist. Still missing: screenshots, motion README handling, permission key names derived by `entryPointUriPathToPermissionKeys`, residency guidance, JWKS timeout/cache lifetime of the verification library. | w-notes TODOs, gaps, ledger | medium | W |
| MF-101 | Ledger rows partly absorbed. Written (r2-docs): analyzer window (10 messages), composed page caps (20 components, 10 data sources, 20 000 chars), export caps (50 000 rows, 5 MB) in a limits table of `docs/api.md`; V is linked from README and CONTRIBUTING. Still missing: platform facts PF1-PF8, K runbook smoke, V cards in docs. | w-notes TODOs, ledger | low | W |
| MF-102 | README quick start for the frontends (`yarn start`) never run (needs Merchant Center login); all deployed-behaviour statements unverified; 15 s cold start and 15 min deployment times are platform statements, not measurements. | w-notes Summary, gaps | medium | W (re-read after rehearsal) |
| MF-103 | Spec text defects found by agents. Corrected in r2-docs: glob test command, `UP` status, `{ links: [...] }` input, P 20.9 (201), V 3.1 audience (origin only), G contract rows 29 and 30 and the "rows 26, 27 and 29" text, B's `CTP_REGION` statement, F's `ai@7.0.136` and 16 KiB key limit, non-existent inbox files named in tasks of C and M; the D11 e-mail wording was already replaced by the user-id decision. Not corrected: "design interface names differ from E/F/G code" (no concrete list) and the `plans/02-target-architecture.md` key list (not an OpenSpec change). Original list: `node --test scripts/tests/` (A tasks 4.4, 5.6, V.1; B 5.2; U V.1; X; V) must be the glob form `scripts/tests/*.test.mjs`; `/service/status` returns `UP` not `ok`; entity link input is `{ links: [...] }`; P task 20.9 says 200 for feedback submit (it answers 201); V/U design D11 says admin is decided from the e-mail (it is the user id); V task 3.1 `MC_AUDIENCE=<tunnel>/service` (origin only is correct); G rest-api-contract lacks row for `GET /service/health` and `GET /service/status/nimbus`; "rows 26, 27 and 29" in G's contract text; design interface names differ from E/F/G code (`getModel` returns the model only etc.); `plans/02-target-architecture.md` service key list and B's `CTP_REGION` comment disagree; plan-amendment inbox files named in tasks do not exist. | a-notes, b-notes, c-notes, g-notes, h-notes, u-notes, v-notes, x-notes | low | owning changes (spec edit via `/opsx:update`) |
