# Integration cleanup: notes

## Summary

Branch `worktree-agent-acc882f8384afba7d`, reset to `develop` (`377cfc0`) first. Five small commits (`fix(integration): ...`), not pushed. The file `plans/implementation/00-integration-todos.md` named in the brief does not exist; the work list came from the per-change notes.

## What was done

1. Response envelope (N + G). N's `utils/feedback-response.ts` is gone. Its `sendOk`/`sendResult` now use G's `ok`/`fail` from `utils/api-response.ts` (`ok` got an optional `extra` argument for `pagination`); the two param helpers moved to `utils/request-params.ts`. `sanitizeUserLabel` already was the single G helper (`utils/user-label.ts`, used by session and feedback services); N had no copy left. The 403 `ADMIN_REQUIRED` body is `{success:false, error, code, message}` (error middleware already rendered it that way after the merge); a new test `tests/wire/admin-required-envelope.spec.ts` pins it.
2. Temporary seams. I's passthrough `identity-mcp/result-pipeline.ts` is deleted and `identity-mcp/tool-source.ts` imports L's `withToolResultPipeline` (`analytics/pipeline/pipeline.ts`); the fake MCP now answers `tools/call`, and a test runs a tool through the real pipeline. U's Custom Object probe (`connector/checks/custom-object-probe.ts`) now writes, reads and deletes through E's `CustomObjectGateway` (timeout and transport retry included). `pre-undeploy` takes its container names from E's `containers()` (settings, sessions, tokens, auth states, feedback, suggestions). Already resolved by the merges, verified and left alone: `checkGcpAnalytics` wiring in `post-deploy`, J's `evaluateProvider` in `checks/providers.ts` (with the invalid-key test), H's `ImageUploader` (L's `installGcpImageUploader` in `app.ts`, used by `chat/history.ts` and image generation).
3. Retry and aad. `buildClient` sets `enableRetry: false` (the gateway owns retries; the SDK retried 500 on writes). `tests/unit/api-root.spec.ts` now asserts one request on a 503. New `crypto/aad.ts` (`IDENTITY_CLIENT_AAD`, `identityTokensAad`, `identityVerifierAad`) is used by I (`auth-provider.ts`, `revocation.ts`) and E's `maintenance.ts` (`reencryptAll`); `tests/unit/aad.spec.ts` plus the maintenance spec use the helpers. `persistence/maintenance.ts` still re-exports `IDENTITY_CLIENT_AAD`.
4. Flaky `pre-undeploy: api unreachable does not block`. Cause: the SDK's retry backoff (200+400+800 ms and more with jitter) raced the jest timeout under parallel load. With the SDK retry off it is one request; the test now counts the calls (must be 1) and has a 2 s timeout. Three consecutive `tests/connector` runs were green.
5. mc-app. `hasReturnStatement` (regex) in `utils/babel-renderer.tsx` is replaced by `isUsableTranspiledCode(script, name)` using `Babel.packages.parser` from the already installed `@babel/standalone` (same rules as the service contract: plain script, first statement `function <name>`, last statement `<name>;`). New spec `src/utils/composed-contract.spec.ts` checks it on the shared fixture (a hooks-before-return component is accepted) and that `SHARED_COMPOSED_PAGES_CONTAINER_KEY` equals the fixture's `containerKey`.

## Results

- `cd service && npm ci && npm run build && npm test && npm run lint`: build ok, 170 suites / 1533 tests pass, lint 0 errors (55 warnings, mostly old test-file `any`).
- Root: `check-connect-layout`, `spdx-check`, `check-repo-rules`, `check-duplicates` all ok.
- `cd mc-app && yarn typecheck && yarn lint && yarn test` ok (5 suites, 22 tests). `yarn build` is ok only when the Connect variables are set (`ENTRY_POINT_URI_PATH`, `CLOUD_IDENTIFIER`, `APPLICATION_URL`, `CUSTOM_APPLICATION_ID`, `CHAT_SERVICE_ENDPOINT_URL`; `.env.example` values work). Without them the build fails in `custom-application-config.mjs` ("window is not defined"), also before this change.

## Not done, and why

- Importing the container key "from the shared constant" literally: mc-app, composed-apps and the service are separate build contexts, so no cross-import is possible. mc-app has exactly one definition (`constants.ts`); the spec ties it to the shared fixture instead. `composed-apps/src/constants.ts` is R's and was not touched.
- The wrapper in `wrapInNamedComponent` (`trimmed.includes('return ')`) was kept: it decides how to wrap a component body, it is not the transpiled-code check.
- Other tool sources (third-party MCP, Nimbus) are not wrapped in the offload pipeline; no spec says so.
- Docker, live credentials and Chrome items (`commercetools connect validate`, E2E, live probes) are untouched TODOs of the original changes.

## New gaps found

- `mc-app/src/types/composed-page.ts` header still says "Current version: 4.0" (outside the allowed folders).
- `composed-apps` has its own `hasReturnStatement`-style path and key constant (R's area); it should get the same parser check.
- E's now-unused feedback helpers (`FEEDBACK_CHUNK_BYTES`, `MAX_SNAPSHOT_BYTES`, `buildSnapshotChunks`, `reassembleSnapshot`) from n-notes are still there.
- `isUsableTranspiledCode` exists twice (service and mc-app) by necessity; only the shared fixture keeps them aligned, no drift check in `check-duplicates`.
- The lifecycle probe's 5xx reason text changed (`... failed (commercetools unavailable)` after the gateway's retries); the runbook in `docs/` may quote the old text.
