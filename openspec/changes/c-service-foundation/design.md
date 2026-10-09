## Context

Change C of the A..Z plan (`plans/03-spec-dependency-map.md`). It turns the empty `service/` stub from B into the runnable, tested shell that D, E and F extend in parallel. The legacy router already has a good shell; the work is (1) deleting tenancy, (2) replacing log-only config auditing with a typed fail-fast `AppConfig`, (3) making the build/test toolchain Connect-conformant, and (4) fixing the contract so three specs can work simultaneously without colliding.

## Explore findings

Facts verified on 2026-10-08. `L:` = legacy file under `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/`.

**Legacy shell**
- F1. `src/app.ts` imports `dotenv` and calls `dotenv.config()` (L: `src/app.ts:1-2`), initialises Firestore inside a swallow-all try/catch (`:16-23`), mounts a feedback-only large body parser **before** the global one on the full path `/service/feedback/submit` (`:63-66`; comment `:54-62` explains body-parser's `req._body` short-circuit - this ordering is load-bearing), then global `bodyParser.json()` + `urlencoded`, a debug request logger that redacts `authorization` (`:73-81`), `app.use('/service', ServiceRoutes)` (`:84`), a `*` 404 that throws `CustomError(404,'Path not found.')` (`:87-89`), `errorMiddleware` last (`:92`). No CORS (traffic is server-to-server from the MC gateway, comment `:48-52`).
- F2. `src/index.ts` binds `Number(process.env.PORT) || 8080` and only *logs* missing config via `reportMissingConfiguration()` (L: `src/index.ts:12-17`, `src/utils/startup-checks.ts:34-53`; it audits only `ENCRYPTION_KEY` and `MC_AUDIENCE`).
- F3. Request context is an `AsyncLocalStorage<{requestId, project?, session?}>` (L: `src/context/request-context.ts`), established first by `initRequestContext` using `uuid.v4()` (`src/middleware/context.middleware.ts`). Logger does not read the context today.
- F4. Error middleware has three branches: `CustomError` -> `{message, errors, stack?}`; 4xx passthrough for body-parser errors -> `{success:false, error:type, message}`; else 500 with a typo `messge` in development (L: `src/middleware/error.middleware.ts:28-82`). Fix the typo when porting.
- F5. `requestUrlForLog` redacts `code,state,token,access_token,refresh_token,id_token,client_secret,code_verifier,assertion` (L: `src/utils/log-url.utils.ts:29-39`); needed because the identity OAuth callback carries `?code=`.
- F6. Cache: `CacheStore` interface + `MemoryCache` (Map, lazy expiry, FIFO eviction at `CACHE_MAX_ENTRIES` (5000), `setInterval(...).unref()` sweep except `NODE_ENV=test`) (L: `src/cache/memory-cache.ts`). `CACHE_NS` includes `PROJECT` (tenancy, drop) and `MCP_IDENTITY_TOOLS`. `src/cache/mcp-tools.cache.ts` (436 lines) is MCP-specific and reads `MCP_TOOLS_TTL_MS` (default 30 min), `MCP_HANDSHAKE_TIMEOUT_MS` (10 s), `FEATURE_REQUEST_CACHE`, `MCP_TOOL_LIST_AUDIT` directly from `process.env` (`:12-36`, `:181`).
- F7. The only tenancy parts of the shell: `middleware/project.middleware.ts` (`validateProject`, reads `projects/{key}` from Firestore, `lastAccessedAt` debounce), `RequestContext.project`, `CACHE_NS.PROJECT`, `PROJECT_CACHE_TTL_MS`, `PROJECT_LAST_ACCESSED_DEBOUNCE_MS`, and `utils/region.ts` (a 5-region matrix; `regionToCloudIdentifier` maps `gcp-us` -> `us-central1.gcp`). The inverse mapping is still needed to derive the MC issuer from `CTP_REGION`.
- F8. Health: `GET /service/health` returns `{status:'healthy', timestamp, service:'multitenant-ai-router'}` (L: `src/controllers/health.controller.ts`). Connect convention is `/status` -> `{status:'UP'}`.
- F9. Environment variables read by the whole legacy service (grep `process.env.`): `GEMINI_API_KEY GCP_PROJECT_ID GCP_SERVICE_ACCOUNT_* FEATURE_REQUEST_CACHE OPENAI_API_KEY CLAUDE_API_KEY ANTHROPIC_* NODE_ENV MC_CLOUD_IDENTIFIER MC_AUDIENCE GEMINI_MODEL_NAME GEMINI_LITE_* ENCRYPTION_KEY PROJECT_* PORT NIMBUS_MCP_* MCP_TOOLS_TTL_MS MCP_TOOL_LIST_AUDIT MCP_HANDSHAKE_TIMEOUT_MS MC_AUTH_DISABLED LOG_LEVEL LOG_HTTP IDENTITY_* GCP_FIRESTORE_DATABASE_ID GCP_BUCKET_NAME GCP_BIGQUERY_* FEEDBACK_BODY_LIMIT CACHE_*`.
- F10. Toolchain: TypeScript extends `@tsconfig/recommended` (CommonJS output to `build/`, `rootDir src`, tests excluded); Jest runs in **ESM mode** (`ts-jest/presets/default-esm`, `NODE_OPTIONS=--experimental-vm-modules`) because `ai@7` and `@ai-sdk/*@4` are ESM-only while the service itself compiles to CJS and relies on Node 22 `require(esm)` (L: `jest.config.cjs:1-30`). ESLint 8 + `@typescript-eslint` 5 with `no-console: error`. Legacy `package.json` pins `@commercetools/platform-sdk ^4`, `ts-client ^4.1`, `@commercetools-backend/express ^27.9.6`, `@commercetools-backend/loggers ^21.19.0`, `ai 7.0.92`, `@ai-sdk/mcp ^2.0.44`, `express ^4.18`, `zod ^4.1.12`, Yarn 1.

**Platform facts (documentation)**
- P1. Connect applications run Node.js **v22 or v24**; if `yarn.lock` is present in the repository root Yarn is used, otherwise npm - https://docs.commercetools.com/connect/supported-runtimes.md . Consequence: the service folder must not contain a stray `yarn.lock` unless we mean it; we choose npm.
- P2. Service applications: HTTP only, request times out after **5 minutes**, scale automatically; sandbox deployments scale to zero and need ~15 s to boot; resources are 1 CPU / 512 MB; applications must be stateless - https://docs.commercetools.com/connect/deployment-behavior-and-environments.md , https://docs.commercetools.com/connect/best-practices.md .
- P3. The deployment URL is `{connect-provided-url}/{endpoint}`, e.g. `https://service-XYZ.europe-west1.gcp.commercetools.app/service`; `endpoint` allows letters, digits, `_`, `-` and an optional leading `/` - https://docs.commercetools.com/connect/development.md .
- P4. With `inheritAs.apiClient.scopes`, Connect injects `CTP_API_URL, CTP_AUTH_URL, CTP_CLIENT_ID, CTP_PROJECT_KEY, CTP_CLIENT_SECRET, CTP_SCOPE` and these keys should **not** also be declared in `configuration` - https://docs.commercetools.com/connect/modify-connector.md and the skill's `references/security.md` (Pattern 3). `CTP_REGION` is **not** in that list: the official template declares it as a `standardConfiguration` key (`https://docs.commercetools.com/connect/development.md`, `connect.yaml` sample), so we declare it.
- P5. Pins required by the skill (`references/connect-cli.md` Step 3): `@commercetools/platform-sdk@^8`, `@commercetools/ts-client@^4`. Verified on npm 2026-10-08: `^8` resolves to 8.27.0 and `^4` to 4.10.0 although majors 9.6.0 / 5.1.0 exist. We follow the skill (minimum supported = pin), see Decision D6.
- P6. `@commercetools-backend/loggers@27.9.6` exists on npm; `createApplicationLogger(options?: {level?, silent?, json?, formatters?})` returns a winston logger; `rewriteFieldsFormatter` is exported for field redaction (checked in the installed 21.25.2 type declarations `dist/declarations/src/types.d.ts`).
- P7. Skill patterns to follow: mount router at the endpoint base and keep `/status` open (`references/project-structure.md` Pattern 2); `readConfiguration()` validated once, thrown at start (Pattern 6); structured JSON logs with `X-Correlation-ID` (`references/observability-operations.md` Pattern 1-2); errors hide stack traces outside development (`references/security.md` Pattern 5); tests with supertest + msw `onUnhandledRequest: 'error'` run through `commercetools connect application test` (`references/testing.md`); build `apiRoot` once, never per request (Pattern 4).
- P8. `commercetools connect application build|start|test` and `connect validate` are the CLI entry points (`references/connect-cli.md` Step 4). Exact flags are not stable: verify with `--help` (task 1.3 records the result).

## Glossary

- **Connect application**: one deployable unit declared under `deployAs` in `connect.yaml`; here `service` (an Express app).
- **Endpoint**: the URL path prefix Connect routes to the application (`/service`); the Express router must be mounted at the same path.
- **`AppConfig`**: the typed, validated, frozen object returned by `readConfiguration()`; the only way code sees environment variables.
- **Section**: one slice of `AppConfig` (`server`, `ctp`, ...) with its own parser file, so specs C/D/E/F can edit different files.
- **Standard / secured configuration**: Connect env vars declared in `connect.yaml`; secured values are write-only and encrypted at rest by the platform.
- **inheritAs.apiClient**: `connect.yaml` block making Connect generate a scoped API client and inject `CTP_*` credentials.
- **Request context**: per-request data stored in `AsyncLocalStorage` so deep code can read the correlation id/user without parameter threading.
- **Liveness**: "process is up" probe (`/status`); distinct from readiness (dependencies reachable), which is not exposed here.

## Source map

| Legacy file (under `.../service/`) | New file (under `service/`) | Verdict |
|---|---|---|
| `src/app.ts` | `src/app.ts` | CHANGE: drop dotenv + Firestore init, mount `/service`, config-driven body limits, `LOG_HTTP` from config |
| `src/index.ts` | `src/index.ts` | CHANGE: `readConfiguration()` first, exit(1) on error |
| `src/utils/startup-checks.ts` | `src/config/index.ts` + `src/config/sections/*` | CHANGE: log-only audit becomes fail-fast validation |
| `src/context/request-context.ts` | `src/context/request-context.ts` | CHANGE: remove `project`, add `correlationId`, `user` |
| `src/middleware/context.middleware.ts` | `src/middleware/context.middleware.ts` | KEEP + correlation id |
| `src/middleware/error.middleware.ts` | `src/middleware/error.middleware.ts` | KEEP (fix `messge` typo) |
| `src/middleware/project.middleware.ts` | - | DROP (tenancy) |
| `src/utils/logger.utils.ts` | `src/utils/logger.utils.ts` | CHANGE: level from config, `json: true`, correlation id formatter |
| `src/utils/log-url.utils.ts` | `src/utils/log-url.utils.ts` | KEEP |
| `src/errors/custom.error.ts` | `src/errors/custom.error.ts` | KEEP |
| `src/cache/cache.types.ts`, `memory-cache.ts`, `index.ts` | `src/cache/*` | KEEP (limits from config; drop `PROJECT` namespace) |
| `src/cache/mcp-tools.cache.ts` | (spec J / I) | DEFER: MCP-specific, ported with its first consumer; reads TTLs from `AppConfig.cache` |
| `src/controllers/health.controller.ts`, `routes/health.route.ts` | `src/controllers/status.controller.ts`, `src/routes/status.route.ts` | CHANGE: `/status` + `/health` alias, `UP` body |
| `src/routes/service.route.ts` | `src/routes/service.route.ts` | CHANGE: only status router now; D..N add theirs; drop `/gecx/config` |
| `src/utils/region.ts` | `src/config/region.ts` | CHANGE: keep API-region <-> MC cloud-identifier mapping only; MCP URL helpers move to spec I |
| `src/types/service.types.ts` (`Project`, `AuthenticatedRequest`) | `src/types/request.types.ts` | CHANGE: `AuthenticatedRequest` defined by D; `Project` DROP |
| `package.json`, `tsconfig.json`, `jest.config.cjs`, `.eslintrc.cjs`, `.prettierrc`, `.nvmrc`, `.env.example` | same names | CHANGE (pins, scripts, rules; see tasks) |
| `LICENSE`, `firestore.indexes.json`, `scripts/*`, `clinic` scripts | - | DROP |
| - | `src/config/**`, `src/client/{build.client,create.client}.ts` | NEW |

## Decisions

### D1. Fail-fast `readConfiguration()` with sectioned parsers
Every section parser returns `{ value, errors[] }`; `readConfiguration()` concatenates errors and throws once. Parsers use `zod` schemas for shape but format messages themselves as `KEY: rule` (zod issue messages can echo the offending input; we never print inputs).
- Alternatives: (a) keep log-only audit - rejected, a service that cannot decrypt tokens or verify sessions but reports healthy is the legacy failure mode; (b) one giant schema file - rejected, D/E/F would conflict in the same file; (c) `envalid`/`env-var` library - rejected, an extra dependency for 100 lines of code and no control over message hygiene.

### D2. `MC_AUDIENCE` is optional at boot
The service URL is only known after the first deploy (plan D8). Making `MC_AUDIENCE` required would make the first deploy fail and the URL could never be learned (chicken-and-egg). So `auth.mcAudience` is optional in `AppConfig`; **spec D fails closed per request** when it is absent, and `/service/status` reports `authConfigured:false`. The two-phase procedure (deploy, read `CONNECT_SERVICE_URL`, `redeploy --configuration MC_AUDIENCE=<origin>`) is owned by U; D documents the value format.
- Alternative: derive it at runtime from `CONNECT_SERVICE_URL`. Verified in docs only for `postDeploy`/`preUndeploy` scripts (https://docs.commercetools.com/connect/automation-scripts.md), not for the running app - so D treats it as an optional hint (`process.env.CONNECT_SERVICE_URL` read inside the `auth` section) but never relies on it.

### D3. One region key, derive the rest
Service config takes `CTP_REGION` in API spelling (`us-central1.gcp`, as in the Connect template) and derives `mcCloudIdentifier` (`gcp-us`) for the MC gateway issuer. Legacy had two independent variables (`MC_CLOUD_IDENTIFIER` + project region) that could disagree. `MC_CLOUD_IDENTIFIER` stays as an *optional override* owned by D.
- Alternative: take `CLOUD_IDENTIFIER` as plan 02 lists for the service. Rejected: duplicates information already in `CTP_REGION`. Recorded as an amendment for B.

### D4. Local dev uses `node --env-file`, no `dotenv`
Node 22 supports `--env-file`. `start:dev` is `tsx watch --env-file=.env.local src/index.ts`. Prevents a prod code path that reads a file, and removes a dependency. Alternative: `dotenv` imported only in `scripts/dev.ts` - rejected, more moving parts.

### D5. Logger: JSON, level from config, correlation id injected
`createApplicationLogger({ level, json: true, formatters: [correlationFormat, rewriteFieldsFormatter(...)] })`; the custom format reads `getContext()?.correlationId`. Alternative `logger.child()` per request - rejected because deep modules import the singleton logger and would need it threaded.

### D6. Follow the skill's pins literally (`platform-sdk ^8`, `ts-client ^4`)
Newer majors exist (9.6.0 / 5.1.0) but the skill defines `^8`/`^4` as the supported baseline and Connect docs/templates were written against them. We will bump only through a deliberate change after checking the Connect templates. `ai` stays at exactly `7.0.92` (legacy-proven; v7 is a fast-moving line) and is bumped by a deliberate change.

### D7. Keep Express 4 and CommonJS output
Express 5.2 exists but `@commercetools-backend/express@27.9.6` declares `express ^4.21.2` and the whole legacy shell is Express 4; the migration is not a goal. CJS output with Node 22 `require(esm)` is proven by the legacy service; Jest stays in ESM mode (F10).

### D8. `mcp-tools.cache.ts` is not ported here
It is 436 lines of MCP-specific logic with identity-mode branches; porting it in C would drag I/J concerns into the foundation. C provides the generic cache and the config keys (`cache.mcpToolsTtlMs`, `cache.mcpHandshakeTimeoutMs`); J/I port the file. Recorded in plan amendments.

### D9. Status route is liveness only
Per the skill, liveness is unauthenticated, cheap and leaks nothing. `authConfigured` and `persistence` are booleans/enums, not values. A readiness route that touches Custom Objects/Vertex is intentionally left to the `postDeploy` check (spec U/F/E) so an outage of a third party cannot make Connect restart the service.

### Env-key registry (contract for B and all backend specs)

Legend: **inj** = injected by Connect via `inheritAs.apiClient` (do not declare), **std** = `standardConfiguration`, **sec** = `securedConfiguration`, **opt** = optional.

| Key | Section | connect.yaml | Required | Default | Owner |
|---|---|---|---|---|---|
| `NODE_ENV` | server | - (platform) | no | `production` | C |
| `PORT` | server | - | no | `8080` | C |
| `LOG_LEVEL` | server | std | no | `info` | C |
| `LOG_HTTP` | server | std | no | `false` | C |
| `FEEDBACK_BODY_LIMIT` | server | std | no | `25mb` | C (value revisited by N) |
| `CTP_PROJECT_KEY` | ctp | inj | yes | - | C |
| `CTP_CLIENT_ID` / `CTP_CLIENT_SECRET` / `CTP_SCOPE` | ctp | inj | yes (unless memory driver) | - | C |
| `CTP_API_URL` / `CTP_AUTH_URL` | ctp | inj | yes (unless memory driver) | - | C |
| `CTP_REGION` | ctp | std | yes | - | C |
| `CACHE_MAX_ENTRIES`, `CACHE_SWEEP_MS` | cache | std (opt) | no | `5000`, `60000` | C |
| `MCP_TOOLS_TTL_MS`, `MCP_HANDSHAKE_TIMEOUT_MS` | cache | std (opt) | no | `1800000`, `10000` | C (consumed by J/I) |
| `MC_AUDIENCE`, `MC_AUTH_DISABLED`, `MC_CLOUD_IDENTIFIER`, `MC_APP_ENTRY_POINT_URI_PATH` | auth | std | `MC_AUDIENCE` optional at boot | see D | D |
| `ADMIN_USER_IDS` | auth (`auth.adminUserIds: readonly string[]`) | std (opt) | no | empty (nobody is admin) | C (parsing and validation; D uses it) |
| `ENCRYPTION_KEY` (sec), `ENCRYPTION_KEY_PREVIOUS` (sec, opt), `PERSISTENCE_DRIVER`, `PERSISTENCE_CONCURRENCY` | persistence | sec/std | key required | `custom-objects`, `8` | E |
| `GCP_SA_KEY_BASE64` (sec) | gcp | sec | yes (production) | - | F |
| `GCP_PROJECT_ID` | gcp | std (opt) | no | `project_id` of the SA key | F |
| `GCP_VERTEX_LOCATION` | gcp | std | no | `us-central1` | F |
| `GCP_BIGQUERY_DATASET_ID`, `GCP_BIGQUERY_LOCATION` | gcp | std | no | `aiassistant`, `us-central1` | F |
| `GCP_BUCKET_NAME`, `GCP_BUCKET_LOCATION` | gcp | std (opt) | no | `<gcp project id>-ai-assistant-images`, `us-central1` | F |
| `IMAGE_URL_MODE` | gcp | std | no | `private` (or `public`) | F (consumed by L) |
| `GEMINI_MODEL_NAME`, `GEMINI_LITE_MODEL_NAME`, `GEMINI_IMAGE_MODEL_NAME`, `GEMINI_LITE_THINKING_LEVEL` | llm | std | no | see F | F |
| `CONTENTSTACK_API_KEY` (sec), `CONTENTSTACK_MANAGEMENT_TOKEN` (sec) | providers | sec | no (optional provider; both or neither) | - | C (validated by J) |
| `CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION` | providers | std (opt) | no | -, `na` | C (validated by J) |
| `ALGOLIA_MCP_URL` (sec: the URL may embed a key) | providers | sec | no | - | C (validated by J) |
| `STRIPE_SECRET_KEY` (sec) | providers | sec | no | - | C (validated by J) |
| `STRIPE_CONNECTED_ACCOUNT_ID` | providers | std (opt) | no | - | C (validated by J) |
| `IDENTITY_*`, `NIMBUS_*`, others | integrations | per spec | per spec | per spec | I, K, ... |

## Risks / Trade-offs

- R1. **Connect may not set `PORT`.** Legacy comment says Cloud Run injects it. Unverified for Connect; mitigated by default 8080 (Cloud Run-compatible buildpacks usually use `PORT` or 8080). Verified during task 6.2 on a sandbox deployment (spec U).
- R2. **`gcp-build` vs `build`.** Connect builds with managed buildpacks we cannot configure (P1); legacy used `gcp-build: tsc`. We keep both scripts pointing at the same command. Verified via `commercetools connect application build`.
- R3. **ESM/CJS drift.** If a dependency flips to ESM-only in a minor, `require(esm)` could break at runtime but Jest (ESM) would still pass. Mitigation: task 6.1 runs the *built* `node build/index.js` smoke test (`scripts/smoke-start.mjs`), not only Jest.
- R4. **Strict ESLint `no-explicit-any` will fail ported code.** Accepted: porting specs must type their boundaries (project rule 3). Lint is scoped to `src/`; tests may use `any` sparingly via `@ts-expect-error` comments.
- R5. **Config registry contention** between D/E/F. Each edits only its own section file plus one registry line; if two branches touch the registry the merge conflict is trivial but must be resolved by keeping both lines.
- R6. **Sandbox scale-to-zero**: first request takes ~15 s (P2); status endpoint and boot work must stay light (no network at boot).

## Migration Plan

No data. Copy files from the legacy repo (read-only), edit, test. Execute tasks in order; each task is one commit. After merge, D/E/F start in parallel branches `spec/d`, `spec/e`, `spec/f`.

## Open questions

- Q-C1. Does Connect inject `PORT`, and which? Default 8080 for now. Verify during first sandbox deploy (U). Not owner-only.
- Q-C2. Is a request body of 25 MB accepted by the Connect ingress? Unknown; affects `FEEDBACK_BODY_LIMIT` (spec N verifies; see CQ in `plans/questions-inbox/CDEF-questions.md`).
- Q-C3. May we bump `platform-sdk`/`ts-client` to the newest majors (9.x/5.x)? Default: no (follow skill). Open for the maintainers (Connect skill guidance).

### D10. Third-party provider keys live in a `providers` section (owner decision Q4)
Contentstack, Algolia and Stripe credentials are Connect deployment configuration (secrets in `securedConfiguration`, non-secrets in `standardConfiguration`), read once here like every other key. A provider is **enabled iff all of its required keys are set and valid** (Contentstack: `CONTENTSTACK_API_KEY` + `CONTENTSTACK_MANAGEMENT_TOKEN`; Algolia: `ALGOLIA_MCP_URL`; Stripe: `STRIPE_SECRET_KEY`). A partial or invalid set never fails startup (providers are optional): the section returns `warnings` (key names only, never values), the provider is disabled, and `providers.status` carries `{ provider, configured, enabled, missingKeys[] }` for the read-only `GET /service/mcp/providers` endpoint (change J). Change C ships presence-only logic and the final exported types; change J replaces the validators (zod formats, Contentstack region, Algolia SSRF guard) inside the same section file. Alternative: fail fast on partial sets - rejected: one typo in an optional integration must not take the whole assistant down.

### D11. `ADMIN_USER_IDS` is parsed and validated in C, used by D (owner decision 2026-10-09)
Administrators are identified by their Merchant Center user id, which change D verifies from the signed gateway token (`sub`) and compares with the allowlist `ADMIN_USER_IDS`. The `auth` section file belongs to spec D, but the parser `parseAdminUserIds(raw)` lives in `src/config/admin-user-ids.ts` (owned by C, pure, unit-tested) and the `auth` placeholder calls it, so D replaces the rest of the section without touching the rules. Rules: unset or whitespace-only means `[]` (nobody is admin); split on `,` (a `;` or whitespace/newline between entries is tolerated as a separator, so a value pasted from a list works); each entry trimmed; empty segments are ignored; at most 50 entries; entries are de-duplicated preserving first position and compared exactly (case-sensitive, ids are opaque); an entry is syntactically valid when it matches `/^[A-Za-z0-9._:-]{1,128}$/` (this rejects e-mail addresses, quotes and angle brackets, which catches an owner pasting an e-mail by mistake). Any violation is a configuration error of the form `ADMIN_USER_IDS: entry <n> is not a valid user id` (n = 1-based position) or `ADMIN_USER_IDS: at most 50 entries`; the entry text is never echoed. The value is not a secret (it is `standardConfiguration`) but is never logged by the config module. When the list is empty the service logs once at startup `ADMIN_USER_IDS is empty: no administrator` at `warn` (fail closed, the admin surfaces stay hidden) and `/service/status` reports `adminConfigured: false`; the list itself is never exposed. A comma-separated value is one string configuration key: Connect documents configuration values as plain strings that act like environment variables and the CLI format as `{key}={value}`; comma splitting by the CLI is not documented, so change U rehearses `--configuration ADMIN_USER_IDS=a,b` and checks the deployed value. Alternatives rejected: ignoring invalid entries with a warning (a typo would silently remove an administrator); an e-mail allowlist (the gateway token has no e-mail and no trustworthy e-mail source exists).

## Changelog

- 2026-10-09 (owner decision Q9): env-key registry `gcp` rows split: every Google Cloud key is optional with a default and configurable through `connect.yaml`; `GCP_LOCATION` renamed `GCP_VERTEX_LOCATION`; new `GCP_BUCKET_LOCATION` and `IMAGE_URL_MODE`; `AppConfig.gcp` shape is `{ serviceAccount?, projectId?, vertexLocation, bigquery: { datasetId, location }, bucket: { name?, location }, imageUrlMode }` (owned by F; C's placeholder section only needs these field names).
- 2026-10-09 (owner decision Q4): added the `providers` section, the five provider keys to the Env-key registry and task 3.5; `config.providers` secrets use `Secret<T>`.
- 2026-10-09 (owner decision: admin by user id): added D11 and the `ADMIN_USER_IDS` registry row (`auth.adminUserIds`), task 3.6, the spec requirement `Administrator user id allowlist`, the startup warning for an empty list and `adminConfigured` on `/service/status`; `RequestUser` placeholder is `{ userId, projectKey, isAdmin }` (no `permissions[]`); C never had an `ADMIN_PERMISSION_KEY` row and none may be added; task 3.5 sits under section 3.
