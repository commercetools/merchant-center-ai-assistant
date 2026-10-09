## Why

Every later backend spec (D auth, E persistence, F Vertex, G..N features) needs the same foundation: an Express app mounted where Connect routes traffic, a validated configuration object, a logger, an error contract, a request context and a build/test toolchain that the Connect CLI can run. The legacy router has this shell but it is entangled with tenancy (project middleware, region matrix, Firestore bootstrap, `dotenv`, log-only config audit). This change ports the shell, removes the tenancy parts, and defines the **`AppConfig` contract** every other spec consumes.

- Change ID: **C** `c-service-foundation`
- Needs: **B** `b-connect-skeleton` (the `service/` folder and `connect.yaml` entry exist and `commercetools connect validate` is green with a stub). Wave 2; unblocks D, E, F (wave 3).

## What Changes

- Create the runnable `service/` application: `src/app.ts`, `src/index.ts`, `src/routes/service.route.ts`, `GET /service/status` (+ `/service/health` alias), 404 handler, error middleware, request-context middleware (AsyncLocalStorage), log-URL sanitiser, logger, `CustomError`, in-memory cache layer.
- Add `readConfiguration()` (`src/config/`): reads `process.env` exactly once, validates, and returns a frozen, typed `AppConfig`; the process refuses to start (names every bad key, never prints values) when it is invalid. Replaces `startup-checks.ts` (log-only) and every direct `process.env` read.
- Define the **AppConfig contract**: section layout, env-key table with owning spec, rules for later specs to add keys.
- Add the **`providers` configuration section** (Contentstack, Algolia, Stripe keys from Connect configuration, owner decision Q4): per-provider `configured`/`enabled`/`missingKeys` status and startup warnings; format validation is completed by change J.
- Add the commercetools API client factory (`getApiRoot()`: `@commercetools/ts-client@^4` + `@commercetools/platform-sdk@^8`, built once) used by E and the post-deploy scripts.
- Define dependency list with pinned versions, `tsconfig`, ESLint, Jest (ESM mode for AI SDK v7), `.nvmrc`/`engines`, and how `commercetools connect application build|test|start` and `connect validate` run it.
- **Removed vs legacy (not ported):** project/tenant middleware (`validateProject`), `projects/{key}` types, region matrix (`REGION_TO_CLOUD_IDENTIFIER` is reduced to a one-region mapping), Firestore initialisation, `dotenv` import in app/index, the legacy widget bootstrap route, `health` branding `multitenant-ai-router`, `PROJECT_CACHE_*` and `FEATURE_REQUEST_CACHE` flags.
- Parse and validate the optional `ADMIN_USER_IDS` allowlist into `auth.adminUserIds` (comma-separated Merchant Center user ids; max 50, trimmed, de-duplicated, case-sensitive; invalid entries fail startup naming the position, never the value); an empty list means nobody is an administrator and logs a startup warning; `/service/status` exposes `adminConfigured` (boolean only). Administrators are identified by user id (decision 2026-10-09); no permission-name key is read.
- **BREAKING (vs legacy):** boot now fails fast on invalid config (legacy only logged).

## Capabilities

### New Capabilities
- `service-runtime-shell`: Express app, base-path mounting at `/service`, `/service/status`, error and 404 contract, request context, safe request logging, in-memory cache semantics.
- `service-configuration`: `readConfiguration()` fail-fast behaviour, the `AppConfig` shape, secret hygiene, environment rules (dev/test/production), how other specs extend it.
- `service-build-tooling`: dependency pins, TypeScript/ESLint/Jest setup, scripts, Node version, Connect CLI commands, no committed `.env`.

### Modified Capabilities
<!-- none: no specs archived yet -->

## Impact

- New code: everything under `service/` except features owned by D..N. Touches `service/package.json`, `tsconfig.json`, `.eslintrc.cjs`, `jest.config.cjs`.
- `connect.yaml` (owned by B): this change **requires** the keys listed in design.md section "Env-key registry" to exist for the `service` application; any gap is recorded in `plans/questions-inbox/CDEF-plan-amendments.md` for B.
- Downstream contracts: `AppConfig`, `logger`, `CustomError`, `getApiRoot()`, `getContext()`, `cache`.

## Out of scope

- Authentication (D), persistence (E), GCP/Vertex (F), any feature route (G..N), `connect.yaml` authoring (B), deploy scripts and `postDeploy`/`preUndeploy` (U), docs (W).
- A readiness endpoint that calls third parties (liveness only; deeper checks are in F/E post-deploy checks).
- Redis or any shared cache (cache stays in-memory and is an optimisation only, plan decision D2).

## Legacy source

Read-only, absolute paths:
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/app.ts`, `index.ts`
- `.../service/src/context/request-context.ts`, `middleware/context.middleware.ts`, `middleware/error.middleware.ts`, `middleware/project.middleware.ts` (DROP)
- `.../service/src/utils/logger.utils.ts`, `log-url.utils.ts`, `startup-checks.ts`, `region.ts`
- `.../service/src/errors/custom.error.ts`, `cache/*`, `controllers/health.controller.ts`, `routes/health.route.ts`, `routes/service.route.ts`
- `.../service/package.json`, `tsconfig.json`, `jest.config.cjs`, `.eslintrc.cjs`, `.prettierrc`, `.nvmrc`, `.env.example`
- `.../service/tests/wire/ui-message-stream.spec.ts` (jest ESM pattern reference)
