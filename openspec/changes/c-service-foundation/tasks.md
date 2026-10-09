## 0. Read first

- [x] 0.1 Read, in this order: `proposal.md`, `design.md` (especially **Env-key registry** and Decisions D1-D9), the three files in `specs/`, `plans/02-target-architecture.md` (section 4 "cross-cutting rules") and the Connect skill reference `~/.claude/plugins/cache/commercetools/commercetools/0.47.0/skills/commercetools-connect/references/project-structure.md` (Patterns 2, 4, 6).
- [x] 0.2 Read the legacy files you will copy from (read-only, never edit): `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/{app.ts,index.ts,context/request-context.ts,middleware/context.middleware.ts,middleware/error.middleware.ts,utils/logger.utils.ts,utils/log-url.utils.ts,errors/custom.error.ts,cache/memory-cache.ts,cache/index.ts,utils/region.ts}` and `.../service/{package.json,tsconfig.json,jest.config.cjs,.eslintrc.cjs}`.

You should now be able to explain: (a) why the router is mounted at `/service` and what happens if it is not; (b) why `MC_AUDIENCE` is optional at boot but required per request (D2); (c) why the feedback body parser must be registered before the global one; (d) why nothing except `src/config/` may touch `process.env`.

## 1. Setup

- [ ] 1.1 Confirm spec B is merged: `ls service connect.yaml` -> both exist; `commercetools connect validate` exits 0. If not, STOP (this spec needs B).
- [x] 1.2 Create the branch and check tools.
  ```bash
  git checkout -b spec/c-service-foundation
  node --version      # expect v22.x (or v24.x)
  npm --version       # expect 10.x or newer
  commercetools --version   # expect a version string; if missing: npm install -g @commercetools/cli
  ```
- [x] 1.3 Record the CLI flags you will use (they change between versions).
  ```bash
  commercetools connect application build --help
  commercetools connect application test --help
  commercetools connect application start --help
  ```
  **Done when:** you wrote the exact flag for "application name" in a comment at the top of `service/README.dev.md` (create it; it is deleted by spec W if superseded).

## 2. Toolchain

- [x] 2.1 Create `service/package.json` and install dependencies.
  **Why:** Connect builds the folder independently; pins are part of the contract (spec `service-build-tooling`).
  **Where:** `service/package.json` (new). Copy scripts/devDeps shape from legacy `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/package.json`.
  **How:**
  1. `cd service && npm init -y`, then set `name` `@commercetools-labs/ai-assistant-service`, `private: true`, `license: MIT`, `engines: { "node": ">=22 <25" }`, remove `main`.
  2. Install runtime deps:
     ```bash
     npm install @commercetools/platform-sdk@^8 @commercetools/ts-client@^4 \
       @commercetools-backend/express@^27.9.6 @commercetools-backend/loggers@^27.9.6 \
       express@^4.21 body-parser@^1.20 uuid@^13 zod@^4.1 ai@7.0.92 @ai-sdk/mcp@^2.0.44
     ```
  3. Install dev deps: `npm install -D typescript@^5.6 @types/node@^22 @types/express@^4 @types/jest @types/supertest @tsconfig/recommended jest@^29 ts-jest@^29 @jest/globals supertest msw rimraf tsx eslint@^8 @typescript-eslint/parser@^5 @typescript-eslint/eslint-plugin@^5 prettier@^3`.
  4. Scripts block:
     ```json
     "scripts": {
       "build": "rimraf ./build && tsc",
       "gcp-build": "npm run build",
       "start": "node build/index.js",
       "start:dev": "tsx watch --env-file=.env.local src/index.ts",
       "typecheck": "tsc --noEmit",
       "lint": "eslint . --ext .ts",
       "test": "NODE_OPTIONS=--experimental-vm-modules jest",
       "connector:post-deploy": "node -e \"console.log('post-deploy: implemented by spec U')\"",
       "connector:pre-undeploy": "node -e \"console.log('pre-undeploy: implemented by spec U')\""
     }
     ```
  **Done when:** `ls service/package-lock.json` exists and `ls service/yarn.lock` fails; `npm ls @commercetools/platform-sdk` shows `8.x`, `@commercetools/ts-client` shows `4.x`.
  **Watch out:** a `yarn.lock` makes Connect use Yarn (docs: supported-runtimes). Never run `yarn` here. Do not install `dotenv`, `@google-cloud/firestore`, `openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `clinic`.

- [x] 2.2 TypeScript, ESLint, Prettier, Jest configs.
  **Where:** `service/tsconfig.json`, `service/.eslintrc.cjs`, `service/.prettierrc`, `service/jest.config.cjs`, `service/.nvmrc` (content `22`). Copy from the legacy files named in 0.2.
  **How:**
  1. `tsconfig.json`: copy legacy; keep `extends @tsconfig/recommended`, `outDir ./build`, `rootDir ./src`, `resolveJsonModule`, `inlineSourceMap`; add `"strict": true`, `"include": ["src"]`, keep `tests` excluded (Jest has its own tsconfig override).
  2. `.eslintrc.cjs`: copy legacy and add
     ```js
     overrides: [
       { files: ['src/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'error' } },
       { files: ['src/**/*.ts'], excludedFiles: ['src/config/**/*.ts'], rules: {
           'no-restricted-properties': ['error',
             { object: 'process', property: 'env', message: 'Read configuration through readConfiguration() (src/config).' }] } },
     ],
     ```
  3. `jest.config.cjs`: copy legacy unchanged (ESM mode explanation is in its header comment); set `testMatch: ['**/tests/**/*.spec.ts']`.
  **Done when:** `cd service && npx tsc --noEmit` exits 0 on an empty `src/index.ts` containing `export {};` and `npx eslint . --ext .ts` exits 0.
  **Watch out:** the ESM Jest mode needs `NODE_OPTIONS=--experimental-vm-modules` (already in the `test` script).

- [x] 2.3 Env files and ignores.
  **Where:** `service/.env.example` (new), root `.gitignore` (append, spec A owns the file but you may append these lines).
  **How:** `.env.example` lists every key of the Env-key registry (design.md) with empty values and a one-line comment; **no real values, no project ids**. Append `service/.env*` and `!service/.env.example` to `.gitignore`.
  **Done when:** `git check-ignore service/.env.local` prints the path and `git check-ignore service/.env.example` prints nothing.

## 3. Configuration

- [x] 3.1 `Secret<T>` holder and the config core.
  **Why:** one validated entry point, secrets never serialised.
  **Where:** `service/src/config/secret.ts`, `service/src/config/index.ts`, `service/src/config/types.ts` (all new). No legacy equivalent (legacy: `startup-checks.ts`).
  **How:**
  ```ts
  // secret.ts
  export class Secret<T> {
    constructor(private readonly v: T) {}
    reveal(): T { return this.v; }
    toJSON(): string { return '[secret]'; }
    toString(): string { return '[secret]'; }
    [Symbol.for('nodejs.util.inspect.custom')](): string { return '[secret]'; }
  }
  // types.ts
  export interface SectionResult<T> { value?: T; errors: string[] }
  export type SectionParser<T> = (env: NodeJS.ProcessEnv, ctx: { nodeEnv: NodeEnv }) => SectionResult<T>;
  // index.ts
  let cached: Readonly<AppConfig> | undefined;
  export function readConfiguration(env: NodeJS.ProcessEnv = process.env): Readonly<AppConfig> { ... }
  export function resetConfigurationForTests(): void { cached = undefined; }
  ```
  `readConfiguration` computes `nodeEnv` first (default `production`; reject values outside `development|test|production`), runs every parser in `SECTIONS`, collects all `errors`, throws `new Error('Invalid environment configuration: ' + errors.join('; '))`, otherwise deep-freezes (`Object.freeze` recursively, skipping `Secret`) and caches. Error strings are always `KEY: rule` - never include the value.
  **Done when:** unit test `tests/unit/config.core.spec.ts` passes: two problems reported together, no value leaked, second call returns the same object.
  **Watch out:** `process.env` reads are allowed only in `src/config/` (the lint rule from 2.2). Pass `env` as a parameter so tests never mutate the real `process.env`.

- [x] 3.2 `server` and `cache` sections.
  **Where:** `service/src/config/sections/server.ts`, `.../cache.ts` (new). Legacy sources: `src/index.ts` (PORT), `src/utils/logger.utils.ts`, `src/app.ts` (`LOG_HTTP`, `FEEDBACK_BODY_LIMIT`), `src/cache/memory-cache.ts`, `src/cache/mcp-tools.cache.ts:12-33`.
  **How:** implement per the registry table: `server { nodeEnv, port, logLevel: 'error'|'warn'|'info'|'debug'|'verbose', logHttp, feedbackBodyLimit }`, `cache { maxEntries, sweepMs, mcpToolsTtlMs, mcpHandshakeTimeoutMs }`. Parse integers with a helper `int(env, key, default, {min})`; non-numeric -> `KEY: must be an integer >= min`.
  **Done when:** table-driven test (`tests/unit/config.server-cache.spec.ts`) covers defaults and each bad value.
  **Watch out:** `NODE_ENV` is unset in Connect; default to `production` so production-only guards apply by default.

- [x] 3.3 `ctp` section and region mapping.
  **Where:** `service/src/config/region.ts`, `service/src/config/sections/ctp.ts` (new). Legacy: `src/utils/region.ts` (copy only the five-entry map and `cloudIdentifierToRegion`).
  **How:**
  ```ts
  const API_REGION_TO_MC: Record<string, McCloudIdentifier> = {
    'us-central1.gcp': 'gcp-us', 'europe-west1.gcp': 'gcp-eu', 'australia-southeast1.gcp': 'gcp-au',
    'eu-central-1.aws': 'aws-eu', 'us-east-2.aws': 'aws-us',
  };
  ```
  Section requires `CTP_PROJECT_KEY`, `CTP_REGION`; requires `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_SCOPE`, `CTP_API_URL`, `CTP_AUTH_URL` unless `PERSISTENCE_DRIVER=memory` (read that raw key only to decide; the persistence section validates it). URLs must start with `https://`. Wrap the secret in `Secret`.
  **Done when:** `tests/unit/config.ctp.spec.ts`: region mapping, unknown region, memory driver relaxes credentials, secret not printed by `JSON.stringify`.
  **Watch out:** do not declare the `CTP_*` credential keys in `connect.yaml` `configuration` (they are injected through `inheritAs.apiClient`); only `CTP_REGION` is declared.

- [x] 3.4 Placeholder sections for D, E, F so the shape compiles.
  **Why:** `AppConfig` must be complete for parallel work (contract).
  **Where:** `service/src/config/sections/{auth,persistence,gcp,llm}.ts`.
  **How:** each exports a parser returning the final **type** from spec D/E/F's design (for `gcp`: `serviceAccount?`, `projectId?`, `vertexLocation`, `bigquery: { datasetId, location }`, `bucket: { name?, location }`, `imageUrlMode: 'private'|'public'`; all with defaults, see change F) (copy the interface names from design.md of those specs once they exist) with permissive parsing: all keys optional strings, `errors: []`. Add a header comment `// OWNED BY SPEC D - replace body, keep the exported type`. Register all in `SECTIONS`.
  **Done when:** `npm run typecheck` passes; `readConfiguration({NODE_ENV:'test',CTP_PROJECT_KEY:'p',CTP_REGION:'us-central1.gcp',PERSISTENCE_DRIVER:'memory'})` returns an object with keys `server ctp auth persistence gcp llm cache` (`providers` is added by task 3.5; `auth.adminUserIds` by task 3.6).
  **Watch out:** D/E/F will each replace one file; do not put logic here beyond the production guards listed in the spec (`MC_AUTH_DISABLED` and `PERSISTENCE_DRIVER=memory` refused in production) - those two guards DO belong here as tested code.

- [x] 3.5 `providers` section (Contentstack, Algolia, Stripe from Connect configuration).
  **Why:** owner decision Q4 - provider credentials are `securedConfiguration`/`standardConfiguration`, not UI input and not Custom Objects; every module still reads config only through `readConfiguration()`.
  **Where:** `service/src/config/sections/providers.ts`, `service/src/config/provider-status.ts` (new); register in `SECTIONS`.
  **How:** export the final types so change J only fills in validation:
  ```ts
  export type ProviderName = 'contentstack' | 'algolia' | 'stripe';
  export interface ProviderStatus { provider: ProviderName; configured: boolean; enabled: boolean; missingKeys: string[] }
  export interface ProvidersConfig {
    contentstack?: { apiKey: Secret<string>; managementToken: Secret<string>; branch?: string; region: string };
    algolia?: { url: Secret<string> };
    stripe?: { secretKey: Secret<string>; connectedAccountId?: string };
    status: ProviderStatus[];
    warnings: string[];                                  // key names only, never values
  }
  ```
  Presence rules: trim values, treat empty as unset; a provider object is present (enabled) only when all required keys are set (`CONTENTSTACK_API_KEY` + `CONTENTSTACK_MANAGEMENT_TOKEN`; `ALGOLIA_MCP_URL`; `STRIPE_SECRET_KEY`); some-but-not-all required keys -> warning `PROVIDER contentstack disabled: missing CONTENTSTACK_MANAGEMENT_TOKEN` and the key in `missingKeys`; `CONTENTSTACK_REGION` defaults to `na` (value is validated in change J). The section never adds to `errors` (providers are optional). Add `.env.example` lines for the 7 keys, empty, with a comment each.
  **Done when:** `tests/unit/config.providers.spec.ts`: nothing set -> 3 disabled, no warnings; Stripe key only -> enabled; Contentstack partial -> disabled + warning + `missingKeys`; `JSON.stringify(config)` shows `[secret]` for all four secret fields and contains none of the test values; `npx jest tests/unit/config.providers.spec.ts` green.
  **Watch out:** never put a value into a warning or error string; do not read the keys anywhere else (change J consumes `config.providers`).

- [x] 3.6 `ADMIN_USER_IDS` parsing (`auth.adminUserIds`).
  **Why:** owner decision 2026-10-09: an administrator is a user whose Merchant Center user id (from the signed gateway token, change D) is in this allowlist; a typo must stop the boot instead of silently removing an administrator.
  **Where:** `service/src/config/admin-user-ids.ts` (new, pure), called from `service/src/config/sections/auth.ts` (the placeholder from 3.4; D later replaces the rest of that file but keeps this call); test `service/tests/unit/config.admin-user-ids.spec.ts`.
  **How:** `export function parseAdminUserIds(raw: string | undefined): { value: readonly string[]; errors: string[] }` following design D11: `raw?.trim()` empty -> `{ value: [], errors: [] }`; split on `/[,;\s]+/`, drop empty segments; count > 50 -> `['ADMIN_USER_IDS: at most 50 entries']`; for each entry at 1-based position `n` test `/^[A-Za-z0-9._:-]{1,128}$/`, else push `ADMIN_USER_IDS: entry ${n} is not a valid user id`; de-duplicate with a `Set` keeping first position; `Object.freeze` the array. The `auth` placeholder maps `errors` into its `SectionResult` and sets `value.adminUserIds`. At the end of startup in `src/index.ts` (task 4.5) log `ADMIN_USER_IDS is empty: no administrator` at `warn` when the list is empty.
  **Done when:** `npx jest tests/unit/config.admin-user-ids.spec.ts` is green with cases: unset, whitespace-only, trailing comma, semicolons and newlines, duplicates, case-sensitivity (`Abc` and `abc` both kept), entry 2 invalid (message contains `entry 2`, does not contain the entry text), an e-mail address rejected, 50 entries accepted, 51 rejected, 129 characters rejected; and one `readConfiguration({... ADMIN_USER_IDS: 'a@b', LOG_LEVEL: 'loud'})` case proving aggregated reporting without echoing `a@b`.
  **Watch out:** never put the entry text in an error message or a log; do not read `ADMIN_USER_IDS` outside `src/config/`; do not add an `ADMIN_PERMISSION_KEY` or any permission-name key. A comma-separated value is one string key for Connect; the CLI behaviour with commas is rehearsed in change U (Connect docs only say values are plain strings, CLI format `{key}={value}`).

## 4. Runtime shell

- [x] 4.1 Errors, logger, URL sanitiser.
  **Where:** `service/src/errors/custom.error.ts`, `service/src/utils/log-url.utils.ts` (copy verbatim from legacy, add SPDX header), `service/src/utils/logger.utils.ts`.
  **How:** logger:
  ```ts
  import { createApplicationLogger, rewriteFieldsFormatter } from '@commercetools-backend/loggers';
  import { format } from 'winston';   // available transitively; add `winston` to dependencies if the compiler complains
  const withCorrelation = format((info) => { const id = getContext()?.correlationId; if (id) info.correlationId = id; return info; });
  export const logger = createApplicationLogger({ level: logLevel(), json: true, formatters: [withCorrelation()] });
  ```
  `logLevel()` calls `readConfiguration().server.logLevel` lazily (logger is imported before config exists in tests: fall back to `info` when config is not yet readable).
  **Done when:** `tests/unit/log-url.spec.ts` (port of redaction cases) passes; logging inside a fake context contains `correlationId`.
  **Watch out:** the logger module must not throw if configuration is invalid - `index.ts` needs it to report that very error.

- [x] 4.2 Request context and middleware.
  **Where:** `service/src/context/request-context.ts`, `service/src/middleware/context.middleware.ts`. Legacy: same names (remove `project`).
  **How:** `RequestContext { requestId: string; correlationId: string; user?: RequestUser; session?: unknown }` - `RequestUser` is declared by spec D; until then `export type RequestUser = { userId: string; projectKey: string; isAdmin: boolean }` in `src/types/request.types.ts` (D will own/replace it). Middleware: `const requestId = uuidv4(); const correlationId = (req.header('x-correlation-id') ?? requestId).slice(0,128);`. Keep `getContext/setUserInContext/setSessionInContext` helpers.
  **Done when:** `tests/unit/context.spec.ts`: header honoured, isolation between two concurrent requests (use `Promise.all` with two supertest calls to a route that awaits `setTimeout`).

- [x] 4.3 Error middleware.
  **Where:** `service/src/middleware/error.middleware.ts` (copy legacy `.../middleware/error.middleware.ts`).
  **How:** keep three branches; fix `messge` -> `message`; read `isDevelopment` from `readConfiguration().server.nodeEnv`.
  **Done when:** `tests/unit/error.middleware.spec.ts` covers the three scenarios in `specs/service-runtime-shell/spec.md` (custom 403, 413 from body-parser, opaque 500 in production).

- [x] 4.4 Cache layer.
  **Where:** `service/src/cache/{cache.types,memory-cache,index}.ts` (copy legacy). Remove `CACHE_NS.PROJECT`. Constructor takes `{maxEntries, sweepMs}` from config instead of `process.env`.
  **Done when:** `tests/unit/memory-cache.spec.ts`: expiry, FIFO eviction at capacity, `deletePrefix` namespace scoping, `clearNamespace`, `stats`.
  **Watch out:** `setInterval(...).unref()` so Jest/Node can exit; skip the timer when `nodeEnv==='test'`.

- [x] 4.5 Status route, service router, `app.ts`, `index.ts`.
  **Where:** `service/src/controllers/status.controller.ts`, `src/routes/status.route.ts`, `src/routes/service.route.ts`, `src/app.ts`, `src/index.ts`. Legacy: `app.ts`, `index.ts`, `routes/service.route.ts`, `controllers/health.controller.ts`.
  **How:**
  1. `app.ts` exports `createApp(config: AppConfig): Express` (testable; legacy exported a singleton). Order: `initRequestContext` -> optional `LOG_HTTP` tracer -> **feedback body parser on `/service/feedback/submit`** with `config.server.feedbackBodyLimit` -> `bodyParser.json()` -> `urlencoded` -> debug logger -> `app.use('/service', serviceRouter)` -> `app.use('*', () => { throw new CustomError(404, 'Path not found.') })` -> `errorMiddleware`. Keep `app.disable('x-powered-by')`. No CORS.
  2. `status.route.ts`: `router.get('/status', status); router.get('/health', status);` Body: `{ status: 'UP', service: 'ai-assistant', version, persistence: config.persistence.driver, authConfigured: Boolean(config.auth.mcAudience) || config.auth.authDisabled, adminConfigured: config.auth.adminUserIds.length > 0 }`. Read `version` from `package.json` via `resolveJsonModule`.
  3. `service.route.ts`: `serviceRouter.use('/', statusRouter);` with a comment `// D..N mount their routers here`.
  4. `index.ts`: `try { config = readConfiguration() } catch (e) { logger.error(String((e as Error).message)); process.exit(1) } app.listen(config.server.port)`; log "listening" at info; handle `SIGTERM` by `server.close()` then exit 0 (Connect stops instances with SIGTERM).
  **Done when:** `tests/wire/status.spec.ts` (supertest on `createApp(testConfig)`) passes: `/service/status` 200 with `adminConfigured` false/true depending on `ADMIN_USER_IDS` (and never containing an id), `/service/health` 200, `/status` 404, body contains no secret.
  **Watch out:** a handler throwing inside `app.use('*')` must be sync; legacy relies on Express catching it. Do not import `dotenv` anywhere.

- [x] 4.6 commercetools API client factory.
  **Why:** E and `postDeploy` need one `apiRoot`; skill Pattern 4.
  **Where:** `service/src/client/build.client.ts`, `service/src/client/create.client.ts`.
  **How:**
  ```ts
  export function buildClient(cfg: CtpConfig) {
    return new ClientBuilder()
      .withProjectKey(cfg.projectKey)
      .withClientCredentialsFlow({ host: cfg.authUrl, projectKey: cfg.projectKey,
        credentials: { clientId: cfg.clientId, clientSecret: cfg.clientSecret.reveal() }, scopes: cfg.scope.split(' ') })
      .withHttpMiddleware({ host: cfg.apiUrl, enableRetry: true,
        retryConfig: { maxRetries: 3, retryDelay: 200, backoff: true, maxDelay: 5000 } })
      .withLoggerMiddleware()   // remove if it logs bodies: verify in the test
      .build();
  }
  let root: ByProjectKeyRequestBuilder | undefined;
  export const getApiRoot = () => (root ??= createApiBuilderFromCtpClient(buildClient(readConfiguration().ctp)).withProjectKey({ projectKey: readConfiguration().ctp.projectKey }));
  ```
  **Done when:** `tests/unit/api-root.spec.ts` with msw: one token request for two `getApiRoot().get().execute()` calls; a 503 is retried.
  **Watch out:** no `concurrentModificationMiddleware` (spec `service-configuration`); `CTP_SCOPE` can be space- or comma-separated: normalise. Check the real option names against the installed `@commercetools/ts-client` typings before copying the snippet.

## 5. Gates

- [x] 5.1 Forbidden-content gate script.
  **Where:** `service/scripts/check-foundation.mjs` (new) plus npm script `check:foundation`.
  **How:** exits 1 if `package.json` contains any forbidden dependency (list in the spec), if `src/` matches `/tenant|firestore|validateProject|dotenv/i`, or if `service/yarn.lock` exists. Prints each offending file:line.
  **Done when:** `npm run check:foundation` exits 0, and exits 1 after temporarily adding `import 'dotenv'` to a scratch file (revert it).

## 6. Connect integration

- [x] 6.1 Smoke-test the built output.
  **Where:** `service/scripts/smoke-start.mjs` (new).
  **How:** spawn `node build/index.js` with a minimal env (`NODE_ENV=development PORT=18080 CTP_PROJECT_KEY=p CTP_REGION=us-central1.gcp PERSISTENCE_DRIVER=memory`), poll `http://127.0.0.1:18080/service/status` for up to 10 s, assert 200 and `status:"UP"`, kill the child; second run with `CTP_REGION` unset asserts exit code 1 within 5 s and a message containing `CTP_REGION`.
  **Done when:** `npm run build && node scripts/smoke-start.mjs` prints `smoke OK` (exit 0).
  **Watch out:** this is what catches CJS/ESM drift (design R3); Jest alone would not.

- [ ] 6.2 Run through the Connect CLI.
  ```bash
  cd <repo root>
  commercetools connect application build --help   # reuse the flag you recorded in 1.3
  commercetools connect application build  <flags for service>     # expect exit 0
  commercetools connect application test   <flags for service>     # expect exit 0, jest summary
  commercetools connect validate                                    # expect exit 0
  ```
  **Done when:** all three exit 0; paste the commands (not outputs) into `service/README.dev.md`.
  **Watch out:** if `validate` complains about keys, the gap belongs to B - add it to `plans/questions-inbox/CDEF-plan-amendments.md` instead of editing `connect.yaml` here.

## Last: Verification

- [x] V.1 Tests to add (all must pass with `cd service && npm test`):
  `tests/unit/config.core.spec.ts`, `tests/unit/config.server-cache.spec.ts`, `tests/unit/config.ctp.spec.ts`, `tests/unit/config.providers.spec.ts`, `tests/unit/config.admin-user-ids.spec.ts`, `tests/unit/config.guards.spec.ts` (production refuses `MC_AUTH_DISABLED=true` and `PERSISTENCE_DRIVER=memory`), `tests/unit/log-url.spec.ts`, `tests/unit/context.spec.ts`, `tests/unit/error.middleware.spec.ts`, `tests/unit/memory-cache.spec.ts`, `tests/unit/api-root.spec.ts`, `tests/wire/status.spec.ts`, `tests/wire/app-shell.spec.ts` (404 shape, 413 on oversized JSON, feedback parser ordering: a 5 MB JSON to `/service/feedback/submit` passes the parser, to any other path returns 413).
- [x] V.2 `npm run typecheck && npm run lint && npm run check:foundation && npm run build && node scripts/smoke-start.mjs`.
- [ ] V.3 `commercetools connect application build|test` and `commercetools connect validate` exit 0 (task 6.2).
- [x] V.4 Chrome E2E: none for this spec (no UI). Evidence: a text file `plans/evidence/c/status.txt` with the `curl -i http://127.0.0.1:8080/service/status` output (git-ignored).
- [ ] V.5 Definition of Done (`plans/04-workflow.md` section 4): SPDX headers (`node scripts/spdx-check.mjs` from spec A), no `console.log`, no `any`, no tenant words.

## Docs to update (for spec W)

- README "Run the service locally" (`start:dev`, `.env.local`, `--env-file`, no dotenv).
- Configuration reference: generate the Env-key registry table from `src/config/sections/*` (keys, defaults, secured vs standard).
- Architecture page: `/service` mount, liveness `/service/status`, fail-fast boot, `MC_AUDIENCE` two-phase explanation (link D, U).
- Troubleshooting: "service exits at start with `Invalid environment configuration`" -> read the key list, values are never printed.
