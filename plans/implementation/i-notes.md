# Change I (i-identity-managed-mcp): implementation notes

## Summary

Branch `worktree-agent-a8b70fb89b1428099` (reset to `develop`). Tasks 0.1-7.1, V.1 and V.2 are ticked; V.3 (Chrome E2E) and V.4 (`/opsx:verify`) are not.

Built in `service/src/identity-mcp/`: `constants`, `types`, `keys` (cache key, `callbackUrl`, scope, `MissingAudienceError`), `region`, `ports`, `adapters/persistence.ts` (the only file that knows E's store names), `errors`, `auth-provider.ts` (three modes, DCR client lifecycle, compare-and-delete token invalidation, PKCE attempt as ONE encrypted record), `discovery.ts`, `connection.ts`, `revocation.ts`, `toolset.ts` (owner-checked per-user cache, error mapping, `callIdentityMcpTool`), `tool-source.ts` (`commercetools` ToolSource, placeholder tool `commercetools_account_not_connected` plus prompt fragment), `result-pipeline.ts` (temporary passthrough for L's `withToolResultPipeline`; delete when L lands), `controller.ts`, `routes.ts` (also registers the `identity-mcp` bootstrap contributor), `runtime.ts` (production wiring plus test seam). `service/scripts/probe-identity-mcp.ts` + `npm run probe:identity`.

Edits to other changes' files (small, additive): E `persistence/stores/token.store.ts` (`getTokensWithVersion`, `deleteTokensIfVersion`, `deleteAllTokens(beforeDelete?)`; prettier also reformatted that file, so the diff looks bigger), H `tool-sources/index.ts` (1 import + 1 `registerToolSource` line), `routes/service.route.ts` (1 import + 1 `use` line), `package.json` (`probe:identity` script). No config keys added, so connect.yaml / checker untouched.

Commands run (in this worktree):
- `cd service && npm ci && npm run build && npm test && npm run lint` -> build ok; 121 suites / 1085 tests pass (baseline 108 / 966); lint 0 errors (41 warnings, all in tests: non-null assertions and the old `any` ones). `npm run check:foundation` ok. `npm run test:integration` -> all skipped (no credentials).
- Root: `node scripts/check-connect-layout.mjs` ok; `node --test scripts/tests/*.test.mjs` 112 pass; `spdx-check` ok; `check-repo-rules` ok.
- `npm run probe:identity -- zzz-nope us-central1.gcp` (live, unauthenticated, read-only) -> verdict `client-credentials-as`, as expected for the template metadata (design finding 4).
- Tests (`tests/identity-mcp/`): adapters, keys, discovery, issuer-drift (canary, ported), tokens, provider-policy, revocation, log-safety, toolset (fake MCP server over an injected fetch), tool-source (incl. registry integration), controller.binding, controller.oauth (full authorize -> callback with a fake auth2, replay, concurrent, expired, rebind, denied), routes. The controller specs use the real router with the real `verifyMcSession` (dev bypass) and `requireAdmin`.

## Questions (for the owner)

1. Bind-time verdict `auth2` may be impossible: the live probe shows the protected-resource metadata is template-generated and mode-blind (names `auth.` for any server name). If a real identity-mode server behaves the same, `PUT` can never succeed. Needs M11 (a real identity-mode server) to settle; fallback idea: accept `client-credentials-as` when the AS metadata of auth2 for the region has `registration_endpoint` (i.e. skip the verdict) or a `force` flag for admins.
2. On rebind (`PUT`) old users' token records stay (stale revision, never read, deleted only when read or on unbind). Should `PUT` also delete+revoke them like `DELETE` does? Spec only requires "not connected".
3. IQ2/IQ3 (live): OQ-I1 (does auth2 grant the `mcp:` scope), OQ-I2 (refresh-token rotation grace). Not testable here.
4. User ids are no longer logged (D's note says they are personal data); the legacy logged `user=`. OK?

## Missed features / gaps found in the spec

- `SERVICE_BASE_PATH` (design DI-4 "C's base-path constant") does not exist in C; `/service` is a literal in `app.ts`. Defined in `identity-mcp/constants.ts`; C/app.ts should adopt it.
- The `@ai-sdk/mcp` calls to AS metadata, registration and token endpoints do not go through `globalThis.fetch` spied in Jest (a global spy only saw the first request; the rest went to the real network). Tests therefore inject `fetchFn` (`auth({fetchFn})`, transport `fetch`). Production code exposes this as an optional seam (`IdentityRuntime.fetchFn`, `IdentityToolSetDeps.fetchFn`, `probeIdentityMcp({fetchFn})`).
- Spec task 6.1 says "normalizeToolSchemas (H)" inside the tool set and 0.2 expects H's MCP helper module (`logMcpFailure`, `describeMcpFailure`): H has no such module (the registry normalises once with `normalizeToolSet`). Kept normalisation in the registry only; wrote a tiny `describeMcpFailure` in `errors.ts`.
- Task 0.2 names `createPersistence(...)` returning `TokenStore`/`SettingsStore` with `deleteTokens(userId,{ifVersion})`: E has none of the version-aware methods; added them (task 2.2 allowed it).
- `ENCRYPTION_KEY` missing -> 503 (spec/task 5.2) cannot happen: C/E make it required at boot. No guard written.
- Spec V.2 grep `projects/` over `src/identity-mcp` cannot be empty: `managedMcpUrl` is `.../projects/{p}/{s}` by definition (one hit in `region.ts`).
- The SDK (`@ai-sdk/mcp` 2.0.73) passes `{ tokens }` as second argument of `invalidateCredentials` and has `isClientInformationDynamicallyRegistered`; not used (own version compare, as designed). Returning `true` from the latter would make the SDK auto-clear a rejected client; left out to keep parity.
- Spec says a stale/unknown AS "refresh failed and record deleted": with no stored client (no `tokenEndpoint`) the SDK invalidates tokens itself before refreshing (first-leg quirk); with a stored client the refresh runs. Both end in compare-and-delete.
- Login-CSRF of the callback (OQ-I7) is unchanged (legacy parity).
- The callback page shows `error_description` from the authorization server (capped to 200 chars, JSON-escaped). Other error messages are replaced by a generic text.

## TODOs (not done: need credentials / Docker / Chrome)

- E2E-I-01 .. E2E-I-07 and V.3 (scratch project, M3/M8/M10/M11); `plans/evidence/I/` empty. V.4 `/opsx:verify` not run.
- IQ2 / IQ3 / OQ-I1 / OQ-I2 live checks (scope `mcp:...` granted, refresh rotation, real wording of the "no tool permitted" rejection; tighten `NO_PERMITTED` regex in `errors.ts`).
- `tests/integration/identity-adapters.spec.ts` (live adapters) written, skipped without credentials. It lives in `tests/integration/` instead of `tests/identity-mcp/adapters.int.spec.ts` so `npm run test:integration` picks it up.
- `commercetools connect validate` (Docker) not run; no new config keys or scopes.
- Delete `identity-mcp/result-pipeline.ts` when L lands (import L's `withToolResultPipeline` in `tool-source.ts`).
- Task 0.1 online docs (managed-mcp-servers pages) not read; the design's findings were used. Docs for W: see tasks.md "Docs to update".

## Deviations from the spec (with reason)

- Branch: harness worktree branch instead of `spec/i`.
- `getIdentityMcpToolSet(userId, binding, deps)` signature (no `project`/`req`); deps carry config, stores, optional cache/client factory/fetch.
- Tool source reads `ctx.config` / `ctx.stores` (not process singletons), so tests and the registry stay hermetic; HTTP handlers use `getIdentityRuntime()`.
- `kind: 'core'` for the source: `integration` would list commercetools among the optional "connected sources" of the suggestions prompt.
- `IdentityReauthRequiredError('no-token')` is raised from the provider's own observation (`hadNoToken`) after the SDK's 401 round trip, instead of an extra token read.
- Second `invalid_client` rejection is a 500 (spec text), the legacy returned the URL anyway.
- `deleteAllTokens` takes a `beforeDelete` hook so unbind can revoke each refresh token before deleting it (the ports contract has no listing).
- Logs carry no user id (see Question 4). `MAJOR_VERSION_PATTERN` validation on `majorVersion` added.
- `storedState()` in callback mode returns `''` (never `undefined`) when no attempt is loaded, so the SDK's CSRF compare can never be skipped.
