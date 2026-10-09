## 0. Read first

- [x] 0.1 Read `proposal.md`, `design.md` (Explore findings F1-F11, P1-P3; Decisions D1-D8), and the three specs in `specs/`.
- [ ] 0.2 Read the legacy files (read-only): `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/middleware/{mc-session,admin,session,user-email}.middleware.ts` (admin.middleware.ts only to see what NOT to do), `src/controllers/mc-auth.controller.ts`, `src/routes/mc-auth.route.ts`, `tests/wire/mc-gateway-auth.spec.ts`.
- [ ] 0.3 Read the MC docs: https://docs.commercetools.com/merchant-center-customizations/concepts/integrate-with-your-own-api.md (sections "Validate the JSON Web Token", "Configure the audience policy"; note that the token has no e-mail but a signed `sub`).
- [x] 0.4 Skim the library you will call: `service/node_modules/@commercetools-backend/express/dist/commercetools-backend-express.esm.js` (lines 143-203) after installing it in C.

You should now be able to explain: (a) what a forward-to JWT proves and what it does not (it is an identity assertion, not a commercetools API token); (b) why the audience includes the request path; (c) why an unverified `?userEmail=` (or any browser-sent e-mail) can never prove anything and why the gateway JWT has no e-mail; (c2) why admin = the verified `sub` listed in `ADMIN_USER_IDS` (design D1) and how an administrator learns their own user id (bootstrap `userId`, shown by the frontends); (d) why `MC_AUDIENCE` cannot be required at boot; (e) why a wrong-project token is 403 and a bad token 401.

## 1. Setup

- [x] 1.1 Confirm spec C is merged: `ls service/src/config/index.ts service/src/app.ts` exist and `cd service && npm test` is green. If not, STOP.
- [x] 1.2 Branch and test dependency.
  ```bash
  git checkout -b spec/d-mc-session-auth
  cd service && npm install -D jose@^5 msw     # jose is already a transitive dep of @commercetools-backend/express; pin the same major (^5.10)
  npm ls jose                                  # expect a single jose 5.x
  ```
  **Done when:** `npm ls jose` lists one version; `npm test` still green.

## 2. Configuration section and types

- [x] 2.1 Replace the placeholder `auth` section.
  **Why:** fail-fast, typed auth config (specs `mc-session-verification`, `mc-admin-authorization`).
  **Where:** `service/src/config/sections/auth.ts` (exists as a placeholder from spec C task 3.4 - keep the exported type name `AuthConfig`).
  **How:**
  ```ts
  export interface AuthConfig {
    mcAudience?: string;                 // origin only, e.g. https://service-abc.us-central1.gcp.commercetools.app
    authDisabled: boolean;               // dev bypass; refused when nodeEnv === 'production'
    issuerCloudIdentifier: McCloudIdentifier; // default = ctp.mcCloudIdentifier, override MC_CLOUD_IDENTIFIER
    entryPointUriPath: string;           // MC_APP_ENTRY_POINT_URI_PATH, default 'ai-assistant', /^[a-z0-9][a-z0-9_-]*$/
    adminUserIds: ReadonlySet<string>;   // ADMIN_USER_IDS, trimmed + de-duplicated, case kept, max 50
  }
  ```
  Rules: `MC_AUDIENCE` if present must parse with `new URL()`, protocol `https:` (or `http:` only when `nodeEnv!=='production'`), `pathname === '/'`, no search/hash; store `url.origin`. `MC_AUTH_DISABLED` accepts exactly `true`/`false`; `true` with `nodeEnv==='production'` -> error `MC_AUTH_DISABLED: must not be enabled in production`. `ADMIN_USER_IDS`: split on `,` (tolerate `;` and surrounding whitespace), trim, drop empties and duplicates, keep case; an entry with internal whitespace/control characters or longer than 128 characters, or more than 50 entries -> error `ADMIN_USER_IDS: entry <n> is not a valid user id` (position only, never the value). Read `ctp.mcCloudIdentifier` from the already-parsed ctp section (the parser receives a `ctx.partial` object - extend `SectionParser`'s `ctx` in `config/types.ts` if C did not). Log `adminUserIds.size` once at boot, never the ids; when the set is empty log once at `warn`: `ADMIN_USER_IDS is empty: no administrator`.
  **Done when:** `tests/unit/config.auth.spec.ts` passes: origin-only enforcement (path rejected), default and override issuer, bypass refused in production, missing audience allowed, `ADMIN_USER_IDS` normalisation (spec example `" u1, u2 ;u1,, "` gives `{u1,u2}`), invalid entry names position 2 and not the value, 51 entries rejected, empty/unset gives an empty set and the boot warning.
  **Watch out:** never log the audience value as a secret - it is public - but do log it once at boot at `info` to ease debugging. The user ids are personal data: never log them.

- [x] 2.2 `isAdminUser` helper.
  **Why:** the service, not the browser, decides who is admin (spec `mc-admin-authorization`, design D1).
  **Where:** `service/src/auth/admin.ts` (new).
  **How:**
  ```ts
  export function parseAdminUserIds(raw: string | undefined): ReadonlySet<string>   // rules of task 2.1; throws a ConfigError with the position only
  export function isAdminUser(userId: string, adminUserIds: ReadonlySet<string>): boolean   // adminUserIds.has(userId), exact and case-sensitive
  ```
  `config/sections/auth.ts` calls `parseAdminUserIds`. The helper is synchronous, takes only the verified `userId`, and does no I/O.
  **Done when:** `tests/unit/admin.spec.ts` covers every scenario of spec `mc-admin-authorization`: listed id, unlisted id, look-alikes (`U-ADMIN-1`, `u-admin-1x`), empty set, parsing (whitespace, `;`, duplicates, empty entries), invalid entry, 51 entries.
  **Watch out:** never read an id or e-mail from the request; the signature takes only the verified `userId` on purpose. Do not export the set.

- [x] 2.3 Request types.
  **Why:** one typed user contract; no permissions list.
  **Where:** `service/src/types/request.types.ts` (created by C with a provisional `RequestUser`; you now own it).
  **How:**
  ```ts
  export interface RequestUser { userId: string; projectKey: string; isAdmin: boolean }
  export interface AuthenticatedRequest extends Request { user: RequestUser }   // set by verifyMcSession
  export const LEGACY_IDENTITY_QUERY_KEYS = ['userEmail', 'userId', 'projectKey'] as const;
  ```
  **Done when:** `npm run typecheck` passes; the context type in `request-context.ts` uses `RequestUser`.

## 3. Middleware

- [x] 3.1 `verifyMcSession` - real verification path.
  **Why:** the heart of the spec.
  **Where:** `service/src/middleware/mc-session.middleware.ts` (new); legacy `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/middleware/mc-session.middleware.ts`.
  **How:**
  1. `createVerifier(auth: AuthConfig)` returns `createSessionAuthVerifier({ audience: auth.mcAudience!, issuer: auth.issuerCloudIdentifier, audiencePolicy: 'forward-url-full-path', inferIssuer: false })`. Build it **once** (module-level lazy singleton keyed on the config object) so the JWKS cache is reused.
  2. Handler order: (a) bypass branch if `auth.authDisabled` (task 3.2); (b) no audience -> `next(new CustomError(401, 'Service is not configured for authentication'))`; (c) `try { await verify(req) } catch { warn once/min; return next(new CustomError(401, 'Missing or invalid Merchant Center session')) }`; (d) read `req.session` (`{userId, projectKey}`; the library's optional permissions field is ignored); missing -> 401 `Merchant Center session is incomplete`; (e) project guard (3.2); (f) `req.user = toRequestUser(session)`; `setUserInContext(req.user)`; `res.setHeader('Vary','Authorization'); res.setHeader('Cache-Control','no-store')`; `next()`.
  3. `toRequestUser`: `isAdmin = isAdminUser(session.userId, config.auth.adminUserIds)`; ignore any permissions field of the session object. `createApp(config)` needs no admin dependency: tests change the allowlist through the config object.
  4. Log the failure with `logger.warn('MC session verification failed', { reason: (e as Error).message })` - the library's messages (`Missing "X-MC-API-Cloud-Identifier" header`, `signature verification failed`, `unexpected "aud" claim value`) are safe to log and tell you what is wrong; never log the token.
  **Done when:** `tests/wire/mc-session-auth.spec.ts` "valid token" and "rejection matrix" (task 5.2) pass.
  **Watch out:** `req.originalUrl` includes the `/service` prefix - the audience is `MC_AUDIENCE + /service/auth/session`, so the frontend `uri` must be built from the same origin and path. Do NOT use `app.use('/service', ...)`-relative `req.url`. Accept only `Bearer ` tokens; the library tolerates a raw token - do not add leniency.

- [x] 3.2 Single-project guard and development bypass.
  **Where:** same file; helper `service/src/auth/project-guard.ts`.
  **How:**
  ```ts
  if (session.projectKey !== config.ctp.projectKey)
    return next(new CustomError(403, 'This assistant is not available for the requested project'));
  ```
  Bypass branch (only reachable when `config.auth.authDisabled`, which config forbids in production):
  ```ts
  const userId = headerOf(req, 'x-dev-user-id') || 'dev-user';
  const isAdmin = headerOf(req, 'x-dev-admin') === 'true';   // only consulted here, behind the bypass guard
  req.user = { userId, projectKey: config.ctp.projectKey, isAdmin };
  ```
  Log the bypass warning once at boot from `index.ts` (add `if (config.auth.authDisabled) logger.warn('MC_AUTH_DISABLED=true ...')`), `debug` per request. Also expose `adminConfigured: config.auth.adminUserIds.size > 0` on `GET /service/status` (change C's status handler; boolean only).
  **Done when:** tests in 5.3 pass (foreign project 403 with neither key in body; bypass identity and `x-dev-admin`; query params ignored; `x-dev-admin` ignored when the bypass is off).
  **Watch out:** the guard compares strings exactly - project keys are case-sensitive in commercetools.

- [x] 3.3 `requireAdmin`.
  **Why:** one gate for every admin route (spec `mc-admin-authorization`).
  **Where:** `service/src/middleware/require-admin.middleware.ts` (new).
  **How:**
  ```ts
  export const requireAdmin: RequestHandler = (req, _res, next) => {
    const user = (req as Partial<AuthenticatedRequest>).user;
    if (!user) return next(new CustomError(401, 'Authentication required'));
    if (!user.isAdmin) return next(new CustomError(403, 'Access denied: administrator access required', { code: 'ADMIN_REQUIRED' }));
    next();
  };
  export function auditAdminAction(req: AuthenticatedRequest, route: string, outcome: 'ok' | 'failed') {
    logger.info('audit.admin_action', { userId: req.user.userId, route, outcome });   // never an e-mail
  }
  ```
  Extend C's error envelope if `CustomError` cannot carry a `code`.
  **Done when:** `tests/wire/mc-admin.spec.ts`: admin passes; non-admin with `?userEmail=admin@x&userId=<listed id>`, header `x-admin-email: admin@x` and body `{"userLabel":"admin@x","userId":"<listed id>"}` gets 403 `ADMIN_REQUIRED` (forged scenario); missing user gets 401; a gateway token that carries a permissions claim does not create admin; `auditAdminAction` output has `userId` and no e-mail.

- [x] 3.4 Ownership rule.
  **Where:** `service/src/auth/ownership.ts` (new); legacy logic in `.../middleware/session.middleware.ts:50-77` (drop the e-mail branch).
  **How:** `export const isOwner = (session: { userId?: string }, user: Pick<RequestUser,'userId'>) => Boolean(session.userId) && session.userId === user.userId;`
  **Done when:** `tests/unit/ownership.spec.ts`: different user false; missing owner false for everyone; same user true.
  **Watch out:** G must return 404 (not 403) for someone else's session; note it in your PR description for G.

## 4. Bootstrap endpoint

- [x] 4.1 Contributor registry.
  **Where:** `service/src/auth/bootstrap-registry.ts` (new).
  **How:**
  ```ts
  type Contributor = (req: AuthenticatedRequest) => Promise<Record<string, unknown>>;
  const contributors = new Map<string, Contributor>();
  export function registerBootstrapContributor(name: string, fn: Contributor) {
    if (contributors.has(name)) throw new Error(`bootstrap contributor already registered: ${name}`);
    contributors.set(name, fn);
  }
  export async function runContributors(req: AuthenticatedRequest) {
    const settled = await Promise.allSettled([...contributors].map(async ([n, f]) => [n, await f(req)] as const));
    const out: Record<string, unknown> = {};
    for (const s of settled) {
      if (s.status === 'rejected') { logger.warn('bootstrap contributor failed', { error: String(s.reason) }); continue; }
      for (const [k, v] of Object.entries(s.value[1])) {
        if (k in out) throw new Error(`bootstrap key collision: ${k}`);
        out[k] = v;
      }
    }
    return out;
  }
  export const resetBootstrapContributorsForTests = () => contributors.clear();
  ```
  **Done when:** `tests/unit/bootstrap-registry.spec.ts`: merge, failure omitted, key collision throws, duplicate name throws.
  **Watch out:** reserve core keys (`projectKey`, `userId`, `isAdmin`) - a contributor returning them is a collision.

- [x] 4.2 Controller, route, mount.
  **Where:** `service/src/controllers/mc-auth.controller.ts`, `service/src/routes/mc-auth.route.ts`, edit `service/src/routes/service.route.ts` (add `serviceRouter.use('/auth', mcAuthRouter);`). Legacy: `.../controllers/mc-auth.controller.ts`, `.../routes/mc-auth.route.ts`.
  **How:** route `mcAuthRouter.post('/session', verifyMcSession, bootstrapSession)`. Controller returns `{ success: true, data: { projectKey, userId, isAdmin, ...await runContributors(req) } }` using only `req.user` (never `req.body`); 500 path uses the legacy envelope `{ success:false, error:'Failed to establish session' }`.
  **Done when:** `tests/wire/mc-bootstrap.spec.ts` passes (exact payload; 401 before contributors; body fields not echoed).
  **Watch out:** the legacy test asserts the payload with `toEqual` on purpose (first-paint critical path); keep that style so new fields need a conscious test change.

## 5. Tests with the real verifier

- [x] 5.1 JWT test kit.
  **Where:** `service/tests/helpers/mc-jwt.ts` (new).
  **How:** with `jose`: `generateKeyPair('RS256')`, export public JWK with `kid`; msw handler `http.get('https://mc-api.us-central1.gcp.commercetools.com/.well-known/jwks.json', ...)`; `signToken({ aud, iss, sub, projectKey, extraClaims, expiresIn, alg, key })` that sets the public claim `${iss}/claims/project_key` (name verified in F10) and optionally arbitrary extra claims (used to prove that a permissions claim is ignored). Export `GATEWAY_HEADERS = { 'x-mc-api-cloud-identifier': 'gcp-us', 'x-mc-api-forward-to-version': 'v2' }`. Start msw with `onUnhandledRequest: 'error'`.
  **Done when:** a smoke test signs a token, verifies through the real library via `createApp(testConfig)` and gets 200.
  **Watch out:** `createRemoteJWKSet` caches keys per issuer for the process lifetime; in the "different key" case sign with a second key pair (same `kid` is fine) instead of swapping the JWKS response mid-run. For HS256 / `alg:none`, craft the token manually (`base64url(header).base64url(payload).`).

- [x] 5.2 Rejection matrix (parameterised).
  **Where:** `service/tests/wire/mc-session-auth.spec.ts`.
  **How:** `describe.each` over: missing header, malformed (`Bearer abc`), `alg none`, HS256 with a shared secret, wrong key, wrong issuer (`iss` of the EU gateway), wrong audience (other path), wrong audience (other origin), expired (`exp` in the past), no marker headers, no `MC_AUDIENCE` (separate case, message differs) - each expects 401 and the generic message (except the no-audience case) and asserts the handler spy was **not** called.
  **Done when:** all rows pass and a final "valid token accepted" row passes.

- [x] 5.3 Guard, admin, bypass tests.
  **Where:** `tests/wire/mc-session-auth.spec.ts` (guard), `tests/wire/mc-admin.spec.ts`, `tests/wire/mc-bypass.spec.ts`.
  **How:** cover every scenario in the three specs (foreign project 403 and body has neither key; incomplete session 401; admin through `ADMIN_USER_IDS` in the test config: token `sub` listed -> `isAdmin:true`, not listed -> false, empty list -> false for everyone and `/status.adminConfigured:false`; forged e-mail/label/header/body/query -> 403 `ADMIN_REQUIRED`; permissions claim ignored; bypass headers incl. `x-dev-admin`; query params ignored; `readConfiguration` refuses bypass in production - reuse C's config tests style).
  **Done when:** `npm test -- mc-` is green.

- [x] 5.4 Bootstrap tests.
  **Where:** `tests/wire/mc-bootstrap.spec.ts` (+ unit tests from 4.1). Port the intent of legacy tests `reports readiness ... issues no token` and `never touches ... for a request that bypassed the gateway` (legacy file lines 317-387) but with the new payload.

## 6. Gates

- [x] 6.1 Grep gate and docs for U/O.
  **Where:** extend `service/scripts/check-foundation.mjs` (from C) with: no match for `validateAdmin|validateUserEmail|req\.query\.userEmail|user_permissions|userPermissions|x-dev-permissions` anywhere in `src/`, and no match for `ADMIN_USER_IDS|adminUserIds` outside `src/config/sections/auth.ts`, `src/auth/admin.ts`, `src/middleware/mc-session.middleware.ts`, `src/index.ts`, the status handler, tests (the allowlist is only ever compared inside `isAdminUser`), and no match for `ADMIN_EMAILS|verified-?email` anywhere in `src/`; `MC_AUTH_DISABLED` / `x-dev-admin` only in `src/config/sections/auth.ts`, `src/middleware/mc-session.middleware.ts`, tests.
  **Done when:** `npm run check:foundation` exits 0; adding `req.query.userEmail` to a scratch file makes it exit 1 (revert).
  Record documentation needs in "Docs to update" below (spec W writes the docs).

## 7. Live verification (needs the sandbox and change I; run during spec V/U; do not block merge)

- [x] 7.1 Add a debug-only log of the admin decision inputs (never the token, never any e-mail): `logger.debug('MC session admin check', { userId, allowlistSize, isAdmin })`.
  **Done when:** with `LOG_LEVEL=debug` a test request prints it.
- [ ] 7.2 When the first sandbox deployment exists (spec U) with the two scratch-project users (user A whose user id is in `ADMIN_USER_IDS`, user B who is not; manual step M10), call `POST /service/auth/session` as each. Scenario ids: `E2E-D-01` (with `ADMIN_USER_IDS` empty user A gets `isAdmin:false` and sees `userId`; after `configure ADMIN_USER_IDS=<A's id>` and a redeploy A gets `true`), `E2E-D-02` (user B stays `false`; a forged `userLabel`/e-mail/header does not change it), `E2E-D-03` (project mismatch cannot be produced from the UI - covered by wire test only).
  **Watch out:** the user id to configure is read from the app's "Your user ID" line (or the bootstrap response), never guessed.

## Last: Verification

- [x] V.1 Unit/wire tests (all under `cd service && npm test`): `tests/unit/config.auth.spec.ts`, `tests/unit/admin.spec.ts`, `tests/unit/ownership.spec.ts`, `tests/unit/bootstrap-registry.spec.ts`, `tests/wire/mc-session-auth.spec.ts`, `tests/wire/mc-admin.spec.ts`, `tests/wire/mc-bypass.spec.ts`, `tests/wire/mc-bootstrap.spec.ts`.
- [ ] V.2 `npm run typecheck && npm run lint && npm run check:foundation && npm run build`; `commercetools connect application test` (service) exit 0; `commercetools connect validate` exit 0 (confirm `MC_AUTH_DISABLED` is not in `connect.yaml`: `grep -c MC_AUTH_DISABLED ../connect.yaml` -> `0`).
- [ ] V.3 Chrome scenarios (after U and I): `E2E-D-01`, `E2E-D-02` from task 7.2; evidence under `plans/evidence/d/`.
- [x] V.4 Definition of Done (`plans/04-workflow.md` section 4): SPDX, no `console.log`, no `any`, no tenant words.

## Docs to update (for spec W)

- Security model page: what the gateway JWT proves (it carries a signed user id and no e-mail); audience/issuer; single-project guard; admin = verified user id listed in `ADMIN_USER_IDS` (fail closed when empty); what is never trusted; dev bypass limits (`x-dev-admin`).
- Configuration reference rows: `MC_AUDIENCE`, `MC_APP_ENTRY_POINT_URI_PATH`, `MC_CLOUD_IDENTIFIER`, `ADMIN_USER_IDS` (and "`MC_AUTH_DISABLED` is local only").
- Runbook (with U): two-phase deploy to learn the service origin and set `MC_AUDIENCE`; "all requests 401" troubleshooting (audience, region, headers).
- Admin guide: open the app, copy "Your user ID" (Settings > About), set `ADMIN_USER_IDS` with the `configure` command and redeploy, refresh; what a non-admin sees (manual step M10).
- Frontend contract (with O): `audiencePolicy: 'forward-url-full-path'`, no permissions claim, no `userEmail`, admin status only from the bootstrap `isAdmin`, "Your user ID" from the bootstrap `userId`.
