# Change L (l-bigquery-and-gcs): implementation notes

## Summary

Branch `worktree-agent-af4561f610c350977` (reset to `develop`). Built in `service/src/`:
- `analytics/`: `constants`, `pipeline/{parse,schema,payload,pipeline,store}` (offload, analyzer-gated, MCP shape preserved), `bigquery/{ports,types,tables,ensure-dataset,queries}` (clients from F, chunked inserts, 7-day expiry, free-tier load-job fallback, dry-run SQL guard with caps), `guard/{sql-guard,table-refs}` (incl. the conservative fallback extractor), `tools/{query,table,session-tables,columns,bigquery.source}` (per-request, session-bound), `cleanup/bigquery-hook`, `self-check` (`checkGcpAnalytics()`), `register`.
- `storage/`: `constants`, `ports`, `gcs-objects` (private objects, allow-list, 10 MB cap, bucket bootstrap on 404), `ensure-bucket`, `uploader` (H's `ImageUploader`), `file-parts` (`toModelMessages`: Storage API read + sharp, optional), `files-route` (`GET /service/files/:sessionId/:fileName`), `cleanup-hook`.
- `tools/export.tool.ts` hardened (formula neutralisation, filename sanitiser, 50k rows / 5 MB caps).
- Wiring (minimal): `tool-sources/index.ts` (+1 import, +1 `registerToolSource(bigquerySource)`), `app.ts` (+1 call `installGcpImageUploader(config)`), `routes/service.route.ts` (+1 mount of `/files`), cleanup hooks register at import of `analytics/register.ts`. `connector/post-deploy.ts` now calls `checkGcpAnalytics()` through a new `gcpAnalytics` dep (U's tests updated). G's contract test row 28 un-pended.
- Tests: 125 suites / 1127 tests pass (analytics, storage, tools, export-hardening, composition, contract, post-deploy), all with fakes.

Commands: `cd service && npm ci && npm run build && npm test && npm run lint` -> build ok, 1127 tests pass, lint 0 errors (32 warnings, all in test files, none mine except non-null assertions). `npm run check:foundation` ok. Root: `check-connect-layout` ok, `spdx-check` ok, `check-repo-rules` ok. grep gates (console, process.env, public ACL, signed URLs) clean (comments only). No config keys were added, so `connect.yaml` and the layout checker are untouched.

## Questions (for the owner)

1. OQ-L1: does a BigQuery dry run return `referencedTables`? (spike 3.1 needs a real project). The fallback extractor is implemented and used automatically when it is absent; it rejects comma joins.
2. OQ-L7: does `/proxy/forward-to` pass binary bodies up to 10 MB (spike 6.4)?
3. OQ-L5: are the caps (500 rows, 200 MB billed, 20k rows per offload, 7-day expiry) acceptable?
4. Billing enabled on the GCP project? (the load-job fallback covers the free tier, slower).

## Missed features / gaps found in the spec

- `ImageUploader.toModelMessages(messages)` has no session id, but the spec needs "reject a sessionId that differs from the request's session". Without it a user could forge a message part pointing at another user's `/files/...` image and have the model read it. I added an optional second argument `{ sessionId }` to H's interface (`tool-sources/types.ts`) and one line in H's `chat/history.ts`. Without a session id every stored reference is dropped (fail closed).
- Spec text says `PipelineContext = { sessionId, userId }` but G's `addTemporaryTable` takes a `RequestUser`; I build `{ userId, projectKey: '', isAdmin: false }` internally (G only compares `userId`).
- G's cleanup hooks run BEFORE messages/session are removed (G's code and docs); tasks 5.1 says "after messages". Harmless.
- `GCP_BIGQUERY_DATASET_ID` always has a default, so the spec scenario "datasetId unset -> isEnabled false" cannot occur; `isEnabled` depends on the service-account key.
- Spec task 6.2/8.1 say `gcpConfigured()`; none existed, I added it in `analytics/bigquery/ports.ts`.
- `query_aggregated_data` description now says SELECT only (the legacy text advertised all SQL).
- The registry has no collision test hook; the collision check in `bigquery.source.spec.ts` only asserts no warning with a stub source.
- `makeToolContext` (test helper) primes the config cache with its own default even when `config` is overridden, which bit tests that read `readConfiguration()`; worked around by calling `useGcpEnv()` afterwards.
- `plans/evidence/L/` files (`files-gateway.md`, `sharp.md`) not created: nothing was measured.

## TODOs (not done, need credentials/Docker/deployment)

- 3.1 dry-run spike (OQ-L1), 6.4 binary-through-gateway spike (OQ-L7), 8.3 sharp on the Connect buildpack (`sharp` was added as a normal dependency, `^0.35.5`, not exact; import is optional at runtime and falls back to no downscaling).
- Integration tests `tests/analytics/tables.int.spec.ts` and the storage integration test (skipped without credentials) were not written.
- `service/scripts/check-gcp-cleanup.mjs` (E2E-L-07) not written.
- Chrome scenarios E2E-L-01..08 not run (V.3); `/opsx:verify` and `commercetools connect validate` (Docker) not run (V.4).
- Frontends must fetch `/files/...` through `forwardToFetch` into blob URLs (P/S/Q); not part of L.
- Docs for W are listed in `tasks.md`; none written.

## Deviations from the spec (with reason)

- Branch: harness worktree branch, not `spec/l`.
- `safeFilename` additionally strips combining marks after NFKD (`Ärger` -> `Arger`, not `A_rger`); still inside `[A-Za-z0-9._-]`.
- Only real JS numbers are exempt from CSV formula prefixing (string `+1` is prefixed), as the task examples require.
- Rows in `tables.ts` come through small structural "ports" (`BigQueryPort`, `StoragePort`) with one cast of F's real clients, so tests inject fakes; clients are still F's.
- A `defaultDataset` is set on query jobs so unqualified table names resolve.
- Cleanup hooks register at module import (`analytics/register.ts`), image uploader at `createApp`, bigquery source in `tool-sources/index.ts`, files router in `service.route.ts`; there is no `composition.ts` in this repo.
- Test file names: `bigquery.source.spec.ts`, `composition.spec.ts` etc. as listed; `table-tool.spec.ts`, `ensure-bucket.spec.ts`, `ensure-dataset.spec.ts`, `cleanup-hook.spec.ts` content is merged into `query-tool.spec.ts`, `gcs-objects.spec.ts`, `tables.spec.ts`, `storage/cleanup-hook.spec.ts`.
