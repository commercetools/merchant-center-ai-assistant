## 0. Read first

- [ ] 0.1 Read the context (30-45 min, no code)
      **Why:** this flow has many subtle OAuth details; the legacy comments explain most of them.
      **Where:** `proposal.md`, `design.md` (all of "Explore findings"), `specs/*/spec.md` in this change; legacy `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/services/identity-mcp-auth.provider.ts` (whole file), `.../controllers/managed-mcp-identity.controller.ts`, `.../client/ct-identity.mcp.ts`, `.../tests/wire/identity-issuer-drift.spec.ts`; docs https://docs.commercetools.com/api/managed-mcp-servers-overview.md and https://docs.commercetools.com/api/managed-mcp-servers-get-started.md (section "Authenticate with an Identity account"); `plans/03-spec-dependency-map.md` (interface contracts); the merged designs of changes D, E, H under `openspec/changes/` (or `openspec/specs/` once archived).
      **How:** read in that order; open the legacy provider next to the issuer-drift spec.
      **Done when:** you can explain, without looking: (1) why `runtime` mode must never save a code verifier, (2) why the state is claimed before the code exchange, (3) why the token cache key contains the user, (4) why `issuer` is not pinned, (5) why the callback route cannot use the forward-to JWT.
      **Watch out:** legacy paths name `Firestore`, `projectKey` and `Project` everywhere - none of that exists in the new repo.

- [ ] 0.2 Confirm dependencies are implemented
      **Why:** I cannot compile without D, E and H.
      **Where:** `service/src/` of this repo; contracts in `openspec/changes/{c,d,e,h}-*/design.md`.
      **How:** check that these exist (names as in the designs; adjust if the merged code differs): D `RequestUser`, `verifyMcSession`, `requireAdmin` (driven by `ADMIN_USER_IDS`), `registerBootstrapContributor(name, fn)`; E `createPersistence()` returning `{ settings: SettingsStore, tokens: TokenStore }` `encryptJson/decryptJson`-style helper (spec `secret-storage`), memory gateway for tests (`createPersistence(cfg, { gateway: memoryGateway })`); H `ToolSource`, `ToolContext`, `registerToolSource`, MCP helper module (`normalizeToolSet`, `logMcpFailure`, `describeMcpFailure`); C `readConfiguration()` (`ctp.region` in API spelling like `us-central1.gcp`, `ctp.projectKey`, `auth.mcAudience`, `encryptionKey`), logger, `SERVICE_BASE_PATH`.
      **Done when:** `grep -rn "requireAdmin\|registerBootstrapContributor\|ToolSource\|TokenStore" service/src | head` shows all four.
      **Watch out:** if one is missing, stop and finish that change first (build waves in `plans/03-spec-dependency-map.md`). E's `TokenStore` currently lacks version-aware delete and "delete all"; task 2.2 amends E through `/opsx:update e-persistence-custom-objects` if still unmerged, or adds them in a small PR to E's files if merged.

## 1. Setup

- [ ] 1.1 Create the module skeleton and test folder
      **Why:** a stable layout lets later tasks reference exact files.
      **Where:** create `service/src/identity-mcp/{constants.ts,types.ts,keys.ts,region.ts,ports.ts,auth-provider.ts,discovery.ts,connection.ts,toolset.ts,tool-source.ts,controller.ts,routes.ts}`, `service/src/identity-mcp/adapters/persistence.ts`, `service/tests/identity-mcp/`, `service/scripts/probe-identity-mcp.ts`. Every file starts with the SPDX header used by the repo (see `scripts/spdx-check.mjs`).
      **How:** `mkdir -p` + empty exports; add `@ai-sdk/mcp` to `service/package.json` if H has not (exact version, e.g. `"@ai-sdk/mcp": "2.0.44"` or a newer one you verified).
      **Done when:** `cd service && npm run build` -> exit 0 (no output errors) and `node ../scripts/spdx-check.mjs` -> exit 0.
      **Watch out:** no `console.log`; use the logger from C.

## 2. Ports, adapters over change E, keys

- [ ] 2.1 Define the domain types and the three ports
      **Why:** isolates OAuth logic from persistence (design DI-1) so the provider is unit-testable and E's final method names are confined to one adapter file.
      **Where:** `service/src/identity-mcp/types.ts`, `ports.ts`. Copy shapes from legacy `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/types/service.types.ts` lines 25-125 (`IdentityMcpClientSecrets`, `IdentityMcpTokenSecrets`, `IdentityMcpClient`, `IdentityMcpDiscovery`, `IdentityMcpConfig`); dates are **epoch milliseconds** (E's convention), no `Project`.
      **How:**
      ```ts
      export interface IdentityBinding { serverKey: string; url: string; majorVersion: string;
        authenticationMode: 'CommercetoolsIdentity'; connectedAt: number; discovery?: IdentityMcpDiscovery;
        client?: IdentityMcpClient }
      export interface IdentityBindingStore {
        get(): Promise<IdentityBinding | null>;
        set(b: Omit<IdentityBinding, 'client'>): Promise<void>;        // new connectedAt, drops client
        setClient(c: IdentityMcpClient | null): Promise<void>;         // CAS touching only client
        clear(): Promise<void>; }
      export interface IdentityTokenStore {
        get(userId: string): Promise<{ record: TokenRecord; version: number } | null>;
        put(record: TokenRecord): Promise<'written' | 'stale-ignored'>;
        deleteIfVersion(userId: string, version: number): Promise<'deleted' | 'conflict' | 'absent'>;
        delete(userId: string): Promise<void>;
        deleteAll(): Promise<number>; }
      export interface IdentityAuthStateStore {
        create(r: AuthStateRecord): Promise<void>;
        claim(state: string): Promise<{ outcome: 'claimed'; record: AuthStateRecord } | { outcome: 'unknown' } | { outcome: 'expired'; ageMs: number }>; }
      ```
      **Done when:** `cd service && npm run build` passes; the interfaces are exported.
      **Watch out:** `Envelope`/encrypted types come from E; do not redefine them.

- [ ] 2.2 Implement the adapters over E (and amend E where it lacks a primitive)
      **Why:** production persistence = E's `TokenStore` (containers `ai-assistant-identity-tokens`, `ai-assistant-identity-auth-states`) and `SettingsStore.update` (binding + DCR client live in `settings.identityMcp`).
      **Where:** `service/src/identity-mcp/adapters/persistence.ts`; if needed small additions in E's `service/src/persistence/stores/token-store.ts`.
      **How:** `bindings` -> `settings.get().identityMcp` / `settings.update(s => ({...s, identityMcp}))` (and `identityMcp.client` only for `setClient`); `tokens.get` -> E `getTokens` (needs the object `version`: add `getTokensWithVersion(userId)` to E), `deleteIfVersion` -> E gateway `delete(container, key, { ifVersion })` exposed as `deleteTokens(userId, { ifVersion })`, `deleteAll` -> page through the container (`limit 100`) and delete every MCP token record (add `deleteAllTokens()` to E); `authStates.create/claim` -> E `createAuthState/claimAuthState` (E already sweeps expired states fire-and-forget on create, which satisfies the "no accumulation" requirement).
      **Done when:** `tests/identity-mcp/adapters.spec.ts` using `createPersistence(cfg, { gateway: memoryGateway })`: claim twice -> second `unknown`; stale `issuedAt` put -> `stale-ignored`; `deleteIfVersion` with an old version -> `conflict`; `deleteAll` returns the count and empties the token container; `setClient` keeps `connectedAt` and `discovery`. `npx jest tests/identity-mcp/adapters.spec.ts` green. With the scratch project (`service/.env.local`, manual step M3) `tests/identity-mcp/adapters.int.spec.ts` passes (skipped without credentials, same pattern as E).
      **Watch out:** a 404/409 from the versioned delete is a normal outcome (`absent`/`conflict`), not an error. E's AAD binding means a token blob copied to another user's object fails to decrypt - do not "fix" that.

- [ ] 2.3 Constants, keys and region helpers
      **Why:** pure functions, easy to unit test.
      **Where:** `identity-mcp/constants.ts`, `keys.ts`, `region.ts`. Copy from legacy `utils/managed-mcp-resolution.ts`, `utils/mcp-server-key.ts`, `utils/region.ts` (`managedMcpUrl`, `auth2Url`, `isCommercetoolsAuthHost`) - C keeps only the region mapping, the MCP URL helpers are I's.
      **How:**
      ```ts
      export const IDENTITY_TOOLS_TTL_MS = 60_000;
      export const AUTH_STATE_TTL_MS = 10 * 60_000;
      export const SERVER_KEY_PATTERN = /^[A-Za-z0-9_-]{2,256}$/;
      export const identityToolsCacheKey = (userId: string, b: IdentityBinding) => `ctmcpid:${userId}:${b.connectedAt}:${b.serverKey}`;
      export const callbackUrl = (cfg: AppConfig) => `${new URL(cfg.auth.mcAudience!).origin}${SERVICE_BASE_PATH}/managed-mcp-identity/callback`;
      export const identityScope = (projectKey: string, serverKey: string) => `openid offline_access mcp:${projectKey}:${serverKey}`;
      export const managedMcpUrl = (apiRegion: string, projectKey: string, serverKey: string) => `https://mcp.${apiRegion}.commercetools.com/projects/${projectKey}/${serverKey}`;
      ```
      **Done when:** port legacy `managed-mcp-resolution.spec.ts` as `tests/identity-mcp/keys.spec.ts` (drop project cases) and add `callbackUrl` cases (origin only, full service URL, trailing slash, missing `mcAudience` -> throws a typed `MissingAudienceError` that the controller maps to 503); `npx jest tests/identity-mcp/keys.spec.ts` green.
      **Watch out:** `MC_AUDIENCE` is optional at boot (change C decision D2): the first deploy has no URL yet. `managedMcpUrl` uses the doc format `https://mcp.{region}.{domain}/projects/{projectKey}/{key}` (https://docs.commercetools.com/api/projects/managed-mcp-servers.md); `commercetools.com` is the only domain supported here.

## 3. Discovery

- [ ] 3.1 Port the discovery probe and the CLI script
      **Why:** bind-time verification and a debugging tool.
      **Where:** `identity-mcp/discovery.ts` from legacy `services/identity-mcp-discovery.service.ts`; `service/scripts/probe-identity-mcp.ts` from legacy `scripts/probe-identity-mcp.ts` (arguments `<serverKey> [cloudIdentifier]`; project key from env `CTP_PROJECT_KEY`).
      **How:** replace `getContext()` request-id usage with C's request context helper; keep `PROBE_TIMEOUT_MS`, `redirect: 'manual'`, the cross-origin metadata refusal, the verdict enum.
      **Done when:** unit test `discovery.spec.ts` with a stubbed `fetch` covers: 401+challenge -> `auth2`; metadata naming `auth.` host -> `client-credentials-as`; 200 instead of 401 -> `problems` entry; `npx jest tests/identity-mcp/discovery.spec.ts` green. Manual: `npx ts-node scripts/probe-identity-mcp.ts zzz-nope us-central1.gcp` prints verdict `client-credentials-as` (live, read-only; this is the template-generated metadata, see design finding 4).
      **Watch out:** never throw from the probe; never send credentials.

## 4. OAuth provider

- [ ] 4.1 Port the provider core (modes, redirect, metadata, state, verifier)
      **Why:** the heart of the flow.
      **Where:** `identity-mcp/auth-provider.ts` from legacy `services/identity-mcp-auth.provider.ts` lines 1-330 and 420-520 (everything except tokens and client storage).
      **How:** constructor takes `{ config: AppConfig, binding, userId, mode, loadedState?, stores: {binding, tokens, authStates}, crypto }`. Keep the three modes exactly; `callbackUrl(cfg)` replaces `identityRedirectUri()`; `clientMetadata.client_name = 'commercetools AI Assistant'`.
      **Done when:** `npx tsc --noEmit` clean; unit tests: `runtime` mode `saveCodeVerifier` is a no-op and `redirectToAuthorization` does not throw; `callback` mode `state()` returns the loaded state; `authorize` mode produces a 43-char base64url state.
      **Watch out:** `storedState()` must never return `undefined` in callback mode (silently disables the SDK CSRF check). Do not log `code`, `state` or tokens - port the legacy redaction test `identity-mcp.spec.ts` ("callback log safety").

- [ ] 4.2 Port client registration (DCR) storage and staleness rules
      **Why:** re-register automatically when the deployment URL or scope changes.
      **Where:** same file, methods `clientInformation`, `saveClientInformation`, `authorizationServerInformation`, `saveAuthorizationServerInformation`, helper `withoutEmbeddedAuthorizationServer`.
      **How:** persist via `IdentityBindingStore.setClient`; encrypt with purpose `'identity-client'`; compare stored `redirectUri` and `registeredScope` with current values; never pin `issuer`.
      **Done when:** port `identity-issuer-drift.spec.ts` to `tests/identity-mcp/issuer-drift.spec.ts` using the in-memory stores and the same fake auth2 (replace the three `jest.unstable_mockModule('firestore.utils')` mocks by constructing the provider with memory stores) - all 3 tests green.
      **Watch out:** this test is the canary for SDK upgrades; keep its legacy-shaped seed data (records with `issuer` and `authorization_server`).

- [ ] 4.3 Port token storage with refresh-race protection
      **Why:** design DI-3.
      **Where:** same file, `tokens()`, `saveTokens()`, `invalidateCredentials()`.
      **How:** `tokens()`: `stores.tokens.get(userId)`; remember `{version}` in a private field; reject (and delete) when `bindingConnectedAt` != `binding.connectedAt`; decrypt purpose `'identity-tokens'`; return even when expired. `saveTokens()`: encrypt, `put`; log `TOK_NO_REFRESH` warn when no refresh token. `invalidateCredentials(scope)`: tokens -> `deleteIfVersion(userId, rememberedVersion)`; on `conflict` log `INVALIDATE_SKIPPED_NEWER` and return; client -> `setClient(null)`.
      **Done when:** new unit tests (`tokens.spec.ts`): (a) stale revision -> record deleted, `tokens()` undefined; (b) provider A and B share a store; A saves new tokens; B's `invalidateCredentials('tokens')` leaves A's record; (c) `saveTokens` with older `issuedAt` -> `stale-ignored` logged. `npx jest tests/identity-mcp/tokens.spec.ts` green.
      **Watch out:** if no version was remembered (token never read) fall back to `delete` only when scope is `all` from the authorize leg; otherwise skip.

- [ ] 4.4 Port the authorize-leg persistence and AS validation hooks
      **Why:** state+verifier written as one record; foreign AS refused.
      **Where:** same file: `persistPendingAttempt`, `validateAuthorizationServerURL`, `validateResourceURL`.
      **How:** `persistPendingAttempt` writes one `AuthStateRecord` (verifier encrypted purpose `'identity-verifier'`, `expiresAt = now + AUTH_STATE_TTL_MS`). `validateResourceURL`: no env switch; mismatch -> log error and return derived URL.
      **Done when:** unit tests: foreign AS host throws "Refusing authorization server"; AS with wrong region origin throws; incomplete attempt throws; `npx jest tests/identity-mcp/provider-policy.spec.ts` green.
      **Watch out:** `isCommercetoolsAuthHost` accepts `auth.` and `auth.identity.` only so diagnostics log them; the origin comparison is what blocks.

## 5. Controller and routes

- [ ] 5.1 Binding handlers: GET, PUT, DELETE
      **Why:** spec `identity-mcp-binding`.
      **Where:** `identity-mcp/controller.ts` (`getIdentityMcp`, `putIdentityMcp`, `deleteIdentityMcp`); legacy lines 100-200 of `controllers/managed-mcp-identity.controller.ts`.
      **How:** `put`: validate `serverKey` with `SERVER_KEY_PATTERN`; `expectedUrl = managedMcpUrl(region, projectKey, serverKey)`; reject different `url`; `probeIdentityMcp`; require verdict `auth2`; `binding.set({... connectedAt: new Date()})`; `setClient(null)`; `invalidateAllToolSets()`. `delete`: `tokens.deleteAll()` + best-effort `revokeAll` (task 5.5), `binding.clear()`, invalidate caches.
      **Done when:** supertest (`controller.binding.spec.ts`, in-memory stores, `fetch` stubbed): 404 code `IDENTITY_MCP_NOT_CONFIGURED`; PUT as non-admin -> 403 with zero `fetch` calls; PUT with `url` mismatch -> 400; PUT verdict `client-credentials-as` -> 400; DELETE removes other users' records.
      **Watch out:** response never includes `client`; use the `{ success, data | error, code }` envelope from change G's `rest-api-contract`.

- [ ] 5.2 `POST /authorize` with the invalid_client retry
      **Why:** user-facing "Connect my account".
      **Where:** controller `authorizeIdentityMcp`; legacy lines 225-345 incl. `authorizationRejectsClient`.
      **How:** guards (503 for missing `ENCRYPTION_KEY`, missing `MC_AUDIENCE` or non-https callback, 409 without binding); loop with `attempt` max 2; on `AUTHORIZED` return `{connected:true}`; else `persistPendingAttempt()` then return URL; no explicit sweep: E's `createAuthState` triggers `sweepExpiredAuthStates` fire-and-forget (at most once per 60 s per process).
      **Done when:** supertest with a fake auth2 (reuse the fake from 4.2): returns `authorizationUrl` containing `code_challenge_method=S256` and the derived `redirect_uri`; one auth-state record exists; with the fake returning a 302 to `/oauth2/fallbacks/error?error=invalid_client` on the first URL, a second registration happens and the final response is 200.
      **Watch out:** the pre-flight `fetch(url, {redirect:'manual'})` must time out at 5 s and treat any failure as "not rejected".

- [ ] 5.3 `GET /callback` (unauthenticated)
      **Why:** where auth2 sends the browser.
      **Where:** controller `callbackIdentityMcp` + `callbackPage`; legacy lines 55-100 and 350-420.
      **How:** `claim(state)` FIRST; map `unknown/expired` to the legacy messages; handle `error` / `error_description`; compare `binding.serverKey` and `connectedAt` with the record; build the provider in `callback` mode with `loadedState`; `auth(provider, {serverUrl, authorizationCode, callbackState, callbackIssuer: query.iss, scope})`; on success `invalidateToolSetsForUser`. HTML page identical (nonce CSP, `postMessage` type `ct-identity-mcp-oauth`).
      **Done when:** supertest: replayed callback -> second page says "invalid or was already used" and the fake token endpoint saw ONE request; `error=access_denied` -> failure page, no token record; expired -> "expired"; response headers contain `Cache-Control: no-store` and a CSP with a nonce; `postMessage` payload has `<` escaped as `<`.
      **Watch out:** mount this route BEFORE the forward-to middleware (see 5.6); `window.opener.postMessage(payload, '*')` is intentional - the frontend filters by `event.origin`, the payload holds no secret.

- [ ] 5.4 `GET /status`, `POST /verify`, `DELETE /me`
      **Why:** UI gate and disconnect.
      **Where:** controller; `identity-mcp/connection.ts` (`readIdentityConnection`, `isIdentityUserConnected`) from legacy `services/identity-connection.service.ts`.
      **How:** connected = token record exists AND `bindingConnectedAt` equals binding `connectedAt` (ms equality). `verify` maps `IdentityReauthRequiredError` -> 401 `IDENTITY_REAUTH_REQUIRED` and `IdentityNoPermittedToolsError` -> 403 `IDENTITY_NO_PERMITTED_TOOLS`. `DELETE /me`: read record, `revokeRefreshToken` (5.5), delete, `invalidateToolSetsForUser`.
      **Done when:** supertest covers all three plus "stale revision is not connected"; `registerBootstrapContributor('identity-mcp', async (req) => ({ identityMcpConfigured, identityUserConnected, managedMcpConfigured: identityMcpConfigured }))` is registered from `identity-mcp/routes.ts` (D's registry, spec `mc-session-bootstrap`; one binding read + one token read, no decrypt).
      **Watch out:** `/status` must never decrypt tokens (metadata only).

- [ ] 5.5 Token revocation helper
      **Why:** design DI-11.
      **Where:** `identity-mcp/revocation.ts`.
      **How:** fetch AS metadata (`auth2Url(region)/.well-known/oauth-authorization-server`), read `revocation_endpoint`, POST form `token=<refresh>&token_type_hint=refresh_token&client_id=<id>` (public client) with 5 s timeout; swallow and log `REVOKE_FAILED`.
      **Done when:** unit test with stubbed fetch: success path posts the right body; network error returns without throwing.
      **Watch out:** never log the token; do not block the HTTP response for more than 5 s.

- [ ] 5.6 Routes and mounting
      **Why:** admin gate placement is the security-relevant part (`requireAdmin` = the verified user id is listed in `ADMIN_USER_IDS`, change D).
      **Where:** `identity-mcp/routes.ts`; mount in `service/src/app.ts` (C) at `/managed-mcp-identity` under the service base path.
      **How:**
      ```ts
      r.get('/callback', callbackIdentityMcp);                 // no forward-to
      r.get('/', authed, getIdentityMcp);
      r.put('/', authed, requireAdmin, putIdentityMcp);
      r.delete('/', authed, requireAdmin, deleteIdentityMcp);
      r.get('/status', authed, status); r.post('/authorize', authed, authorize);
      r.post('/verify', authed, verify); r.delete('/me', authed, disconnect);
      ```
      `authed` = D's session middleware (verifies JWT, project guard).
      **Done when:** a route-table test asserts the exact (method, path, middleware names) list above; `curl -i http://localhost:8080/service/managed-mcp-identity/callback` -> HTML page (400, "Missing OAuth state"), `curl -i .../status` -> 401.
      **Watch out:** Express matches in order; do not put a catch-all `authed` router before `/callback`.

## 6. Tool set and ToolSource

- [ ] 6.1 Per-user tool-set cache with owner re-check
      **Why:** spec `identity-mcp-toolset`.
      **Where:** `identity-mcp/toolset.ts` from legacy `client/ct-identity.mcp.ts` lines 85-280.
      **How:** `getIdentityMcpToolSet(user, binding, deps)`: validate user id; key via `identityToolsCacheKey`; cache get -> owner check (user, server, revision) -> discard + `logger.error('TOOLS_CACHE_OWNER_MISMATCH ...')`; else handshake with `createMCPClient({ transport: { type: 'http', url: binding.url, authProvider: provider, redirect: 'error' }, protocolVersionDiscovery: false })`; `normalizeToolSchemas` (H); cache set with `IDENTITY_TOOLS_TTL_MS`; `TOOLS_ZERO` warning. Provide `invalidateToolSetsForUser(userId)` and `invalidateAllToolSets()` (prefix delete with C's cache API; if C has none, keep a module-level `Map` instead and note it).
      **Done when:** `toolset.spec.ts` (fake MCP server via `msw` or an in-process `http` server answering `initialize`, `tools/list`): two users -> two entries; tampered owner -> entry discarded and error logged; second call within TTL -> `cached: true` and no second `tools/list`.
      **Watch out:** `createMCPClient` transport object shape is from `@ai-sdk/mcp` v2 - check `node_modules/@ai-sdk/mcp/dist/index.d.ts` (`MCPTransportConfig`) before writing it.

- [ ] 6.2 Error mapping
      **Why:** rejections must be distinguishable.
      **Where:** `identity-mcp/errors.ts`, used by `toolset.ts`.
      **How:** `IdentityReauthRequiredError(reason)` (copy from legacy provider), new `IdentityNoPermittedToolsError`. In the catch: `UnauthorizedError` (by `constructor.name`, as legacy) -> reauth `refresh-failed`; error with `statusCode === 403` or message matching /no (configured )?tools? .*permitted|not permitted/i -> no-permitted; else `TOOLS_HANDSHAKE_FAILED class=.. ms=.. detail=..` and `null`.
      **Done when:** unit tests feed each error kind through a stubbed `createMCPClient` and assert thrown class / `null`.
      **Watch out:** the exact wording of the "no tool permitted" rejection is not documented - the 403 status is the primary signal; capture the real body in E2E-I-05b and tighten the regex.

- [ ] 6.3 Implement the `commercetools` ToolSource (H contract)
      **Why:** plugs into change H's registry (`openspec/changes/h-agents-and-chat-stream/specs/tool-source-registry/spec.md`). The registry already applies the 15 s per-source timeout, failure isolation, per-session `disabledTools`, Gemini schema normalisation and prompt gating (a source's prompt is only included when it contributed at least one tool) - this source must NOT re-implement those.
      **Where:** `identity-mcp/tool-source.ts`; one `registerToolSource(...)` line in H's `service/src/tool-sources/index.ts`.
      **How:**
      ```ts
      const reauth = new WeakMap<ToolContext, 'reauth' | 'no-permitted'>();   // per-request state
      export const commercetoolsToolSource: ToolSource = {
        name: 'commercetools', displayName: 'commercetools Commerce', order: 10,
        isEnabled: async (ctx) => Boolean(await bindings.get()),
        getTools: async (ctx) => {
          try {
            const r = await getIdentityMcpToolSet(ctx.user.userId, ...);   // owner-checked, cached
            return r ? withToolResultPipeline(r.tools, { sessionId: ctx.sessionId, userId: ctx.user.userId }) : {};   // change L
          } catch (e) {
            if (e instanceof IdentityReauthRequiredError) { reauth.set(ctx, 'reauth'); return { commercetools_account_not_connected: notConnectedTool('IDENTITY_REAUTH_REQUIRED') }; }
            if (e instanceof IdentityNoPermittedToolsError) { reauth.set(ctx, 'no-permitted'); return { commercetools_account_not_connected: notConnectedTool('IDENTITY_NO_PERMITTED_TOOLS') }; }
            throw e;                                                           // registry isolates it
          } },
        listForMenu: async (ctx) => ({ toolNames: names }),                    // [] when not connected: empty group still shown
        getPrompt: (ctx) => PROMPT + (reauth.get(ctx) ? RECONNECT_FRAGMENT[reauth.get(ctx)!] : ''),
      };
      ```
      `notConnectedTool` is a no-argument AI SDK tool (`inputSchema: z.object({})`) whose `execute` returns `{ success:false, code, message:"The user's commercetools account is not connected (or the connection expired). Tell them to use the Connect my account button, then retry." }`. It exists so the source still contributes a tool and therefore its prompt (registry gating). The commercetools prompt text (`PROMPT`) is H's `agents/prompts/commercetools.prompt.ts` - import it, do not copy it; the Knowledge developer-tips block is injected by change J.
      **Done when:** `tool-source.spec.ts` with a stub `ToolContext`: connected user -> filtered-by-registry tool set (assert the source returns ALL tools, filtering is the registry's job); reauth path -> exactly one tool `commercetools_account_not_connected` and `getPrompt` contains "Connect my account"; no binding -> `isEnabled` false; `listForMenu` returns names only; a thrown unknown error propagates (registry test shows isolation).
      **Watch out:** the `WeakMap` key must be the same `ctx` object the registry passes to `getTools` and `getPrompt` - confirm in H's `registry.ts`; if H clones the context, use `ctx.sessionId + turn id` instead. The BigQuery offload wrapper comes from change L (`withToolResultPipeline`); if L is not merged yet, import it behind a tiny `identity` fallback in one file and delete the fallback when L lands - do not copy L's code.

- [ ] 6.4 Wire the Knowledge MCP separately (do not merge into this source)
      **Why:** legacy `commercetools.agent.ts` mixed both; they have different owners (J).
      **Where:** nothing to build - state in the `tool-source.ts` docblock that `commercetools` (I) and `commercetools-knowledge` (J) are two independent ToolSources; H's orchestrators merge them (the custom-view orchestrator selects exactly these two).
      **Done when:** `grep -rn "knowledge" service/src/identity-mcp` returns nothing.
      **Watch out:** menu groups are separate (`commercetools`, `commercetools-knowledge`).

## 7. Documentation hooks and scripts

- [ ] 7.1 Package script and README snippet inputs
      **Why:** operators need the probe.
      **Where:** `service/package.json` script `"probe:identity": "ts-node scripts/probe-identity-mcp.ts"` (or compiled equivalent).
      **Done when:** `npm run probe:identity -- zzz-nope us-central1.gcp` runs and prints a verdict.
      **Watch out:** read-only; no credentials.

## Last. Verification

- [ ] V.1 Run all unit/wire tests of this change
      **How:** `cd service && npm run build && npx jest tests/identity-mcp` -> all green. Test files: `adapters.spec.ts`, `adapters.int.spec.ts` (skipped without scratch project), `keys.spec.ts`, `discovery.spec.ts`, `issuer-drift.spec.ts`, `tokens.spec.ts`, `provider-policy.spec.ts`, `controller.binding.spec.ts`, `controller.oauth.spec.ts`, `toolset.spec.ts`, `tool-source.spec.ts`, `revocation.spec.ts`, `routes.spec.ts`, `log-safety.spec.ts`.
- [ ] V.2 Repo gates
      **How:** `node scripts/spdx-check.mjs`; `grep -rn "console\.\|tenant\|projects/" service/src/identity-mcp` -> empty; `commercetools connect validate` unchanged (no new config keys, no new scopes).
- [ ] V.3 Chrome scenarios (agent runs them against the scratch project; evidence in `plans/evidence/I/`; needs manual steps M3, M8, M10, M11)
      - **E2E-I-01** fresh deployment: `GET /managed-mcp-identity` 404 `IDENTITY_MCP_NOT_CONFIGURED`; app shows the setup step (network log).
      - **E2E-I-02** admin user A (id in `ADMIN_USER_IDS`) binds the identity-mode server (verdict `auth2`); non-admin user B gets 403 `ADMIN_REQUIRED` on the same call (also with a forged e-mail/label header).
      - **E2E-I-03** "Connect my account": popup opens `auth2...`, consent, popup closes, `/status` `connected: true`; token record in Custom Objects has no plaintext `refresh_token`; record `scope` contains `mcp:` (OQ-I1).
      - **E2E-I-04** chat turn "list my 5 latest orders": a `commercetools` tool part appears, no error frame, `/session/:id/tools` lists only tools permitted for this user.
      - **E2E-I-05** disconnect (`DELETE /me`), send a chat message: the answer asks to reconnect; `/status` `connected: false`. **E2E-I-05b** user with no permitted tools: 403 `IDENTITY_NO_PERMITTED_TOOLS`.
      - **E2E-I-06** open the callback URL twice: second shows "already used"; `list_network_requests` shows one token request.
      - **E2E-I-07** admin unbinds: token container empty, `/status` `configured:false` for everyone.
- [ ] V.4 Definition of Done from `plans/04-workflow.md` section 4 ticked; `/opsx:verify i-identity-managed-mcp` clean.

## Docs to update (for change W)

- `docs/api.md`: the identity endpoints table (method, path, auth, request, response, error codes `IDENTITY_MCP_NOT_CONFIGURED`, `IDENTITY_REAUTH_REQUIRED`, `IDENTITY_NO_PERMITTED_TOOLS`).
- README "Administrator access" (owned by change D/W): only users listed in `ADMIN_USER_IDS` can bind or unbind the server; the setup page is hidden for others.
- README "Identity mode": admin creates the Managed MCP Server in `CommercetoolsIdentity` mode (https://docs.commercetools.com/api/managed-mcp-servers-get-started.md), binds it in the app, each user clicks Connect; consent screen appears every time; callback URL derives from the service URL; no extra API-client scope.
- `docs/how-it-works.md`: why tokens are encrypted Custom Objects and PKCE state lives in persistence; refresh-race handling.
- Config reference: removed knobs (`IDENTITY_REDIRECT_ORIGIN`, `IDENTITY_MCP_SCOPE`, `IDENTITY_MCP_SKIP_RESOURCE`, `IDENTITY_MCP_STATE_TTL_MS`, `IDENTITY_MCP_TOOLS_TTL_MS`).
- Change D docs: `/auth/session` field `identityUserConnected` is computed by `isIdentityUserConnected` (change I).
