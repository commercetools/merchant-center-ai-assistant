## 0. Read first

- [x] 0.1 Read the context (45 min, no code)
      **Why:** the offload code carries many fixes for production incidents; the hardening needs BigQuery job semantics.
      **Where:** this change's `proposal.md`, `design.md` ("Explore findings" 1-18), `specs/*/spec.md`; legacy `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/client/tool-result-pipeline.ts` (whole), `.../utils/bigquery.utils.ts`, `.../services/bigquery.service.ts` lines 330-504, `.../services/gcs.service.ts`, `.../functional-agent/tools/{query,table,export}.tool.ts`, `.../functional-agent/utils/file.utils.ts`, tests `.../tests/wire/{tool-result-offload,table-schema-inline,query-error-schema}.spec.ts`, `.../FEATURES.md` sections "BigQuery analytics" and "Known gaps"; docs https://docs.cloud.google.com/bigquery/docs/reference/rest/v2/Job (JobConfigurationQuery, JobStatistics2), https://docs.cloud.google.com/bigquery/docs/best-practices-costs, https://docs.cloud.google.com/storage/docs/uniform-bucket-level-access, https://docs.cloud.google.com/storage/docs/public-access-prevention, https://docs.cloud.google.com/bigquery/docs/datasets (create a dataset); the designs of F (`gcp-clients`), G (D-G6 cleanup hooks), H (`tool-source-registry`, `query-analyzer`, D-H8 `ImageUploader`).
      **Done when:** you can explain (1) why the offload message must keep the MCP `content` shape, (2) why `LIMIT` does not reduce BigQuery cost, (3) what a dry run returns that a regex cannot know, (4) why `public: true` fails on new buckets, (5) why the query tool must be created per request, (6) why a browser `<img src>` cannot call the files route directly and what the frontends do instead (blob URL via `forwardToFetch`), (7) which IAM role creates a dataset and which one creates a bucket.
      **Watch out:** ignore the retired data-warehouse text and every `projectKey`.

- [x] 0.2 Confirm dependencies
      **Why:** L plugs into F, G, H.
      **Where:** `service/src/`.
      **How:** find F `getBigQueryClient`, `getStorageClient`, `GcpNotConfiguredError`, `getModel('lite')`, `requireBucketName()` and typed config `gcp.projectId`, `gcp.bigquery.{datasetId,location}` (always defined), `gcp.bucket.{name,location}` (name always resolved), `gcp.imageUrlMode`; G `SessionService.{addTemporaryTable,getAllTemporaryTables}` and `registerSessionCleanupHook`; H `ToolSource`, `registerToolSource`, `setImageUploader`, `analyzeQueryTask`, `sizeOf/estimateTokens`, `tools/export.tool.ts`.
      **Done when:** `grep -rn "getBigQueryClient\|registerSessionCleanupHook\|setImageUploader\|analyzeQueryTask" service/src | head` shows all four.
      **Watch out:** if one is missing, finish that change first.

## 1. Setup

- [x] 1.1 Create folders and dependencies
      **Why:** fixed layout.
      **Where:** `service/src/analytics/{pipeline,bigquery,guard,tools,cleanup}/`, `service/src/storage/`, `service/tests/analytics/`, `service/tests/storage/`; SPDX headers.
      **How:** `cd service && npm install --save-exact @google-cloud/bigquery @google-cloud/storage` (F may already have added them) and `npm install sharp` (keep it optional at runtime: see task 6.3).
      **Done when:** `npm run build` exit 0.
      **Watch out:** `sharp` is a native module; the first Connect sandbox build will prove it (task 8.3).

- [x] 1.2 Constants
      **Why:** every cap in one tested file.
      **Where:** `service/src/analytics/constants.ts`, `service/src/storage/constants.ts`.
      **How:**
      ```ts
      export const OFFLOAD_MAX_ROWS = 20_000; export const OFFLOAD_MAX_BYTES = 20 * 1024 * 1024; export const INSERT_CHUNK_ROWS = 500;
      export const TABLE_TTL_MS = 7 * 24 * 3600_000;
      export const QUERY_MAX_BYTES_BILLED = '200000000'; export const QUERY_JOB_TIMEOUT_MS = 60_000;
      export const QUERY_MAX_ROWS = 500; export const QUERY_RESULT_MAX_BYTES = 256 * 1024;
      export const IMAGE_MAX_BYTES = 10 * 1024 * 1024; export const IMAGE_TYPES = ['image/png','image/jpeg','image/webp','image/gif'] as const;
      export const FILES_PATH_PREFIX = '/files'; export const FILE_NAME_PATTERN = /^[0-9]{10,15}-[a-f0-9]{8}\.(png|jpg|webp|gif)$/; export const EXPORT_MAX_ROWS = 50_000; export const EXPORT_MAX_BYTES = 5 * 1024 * 1024;
      ```
      **Done when:** `constants.spec.ts` asserts the values (they are spec-normative).
      **Watch out:** `maximumBytesBilled` is a string in the REST API (int64).

## 2. Offload pipeline

- [x] 2.1 Port parsing and schema inference
      **Why:** pure functions with incident-driven tests.
      **Where:** `analytics/pipeline/{parse,schema}.ts` from legacy `utils/bigquery.utils.ts` (copy; fix imports; replace the type import from `bigquery.service`); port tests `table-schema-inline.spec.ts` -> `tests/analytics/schema.spec.ts`.
      **How:** keep `sanitizeJsonString`, `parseRawDataToTables`, `prepareDataForBigQuery`, `inferBigQuerySchema` unchanged.
      **Done when:** `npx jest tests/analytics/schema.spec.ts` green.
      **Watch out:** `toTableName` strips `READ/GET/...` prefixes and `RESULT/DATA/...` suffixes - do not "improve".

- [x] 2.2 Payload shaping and result shape
      **Why:** MCP results must be wrapped for the parser and answered in MCP shape.
      **Where:** `analytics/pipeline/payload.ts` (`toOffloadPayload`, `toResultShapeOf`, `mcpPayload`) from legacy `client/tool-result-pipeline.ts` lines 40-122; port `tool-result-offload.spec.ts` -> `tests/analytics/payload.spec.ts`.
      **Done when:** the ported spec is green (envelope title `READ PRODUCTS RESULT`, `structuredContent` preferred, non-JSON text passed through, MCP shape preserved).
      **Watch out:** `toResultShapeOf` returns `{content:[{type:'text',text}], isError:false}` only when the original has a `content` array.

- [x] 2.3 `withToolResultPipeline`
      **Why:** spec "Analyzer-gated offload".
      **Where:** `analytics/pipeline/pipeline.ts`.
      **How:**
      ```ts
      export interface PipelineContext { sessionId: string; userId: string }
      export const withToolResultPipeline = (tools: ToolSet, ctx: PipelineContext, deps = defaultDeps): ToolSet => Object.fromEntries(
        Object.entries(tools).map(([name, tool]) => [name, { ...tool, execute: async (...args) => {
          const result = await tool.execute?.(...args); if (result === undefined) return result;
          const chars = sizeOf(result);                                           // H utils
          const verdict = await deps.analyze({ messages: args[1]?.messages, toolCallParams: { args, toolName: name, result, resultChars: chars } });
          if (!verdict.output?.hasAggregation) return result;
          try { const r = await deps.store({ result: toOffloadPayload(result, name), toolName: name, toolArgs: safeStringify(args[0]), ...ctx });
                if (r) return toResultShapeOf(offloadMessage(r), result);
          } catch (e) { logger.error(`Offload failed for ${name} - returning ${chars} chars of raw result into context`, ...) }
          return result; } }]));
      ```
      Drop the legacy `directStorageTools` and `disabled` options. `deps.analyze` = H's `analyzeQueryTask`; `deps.store` = task 3.3.
      **Done when:** `pipeline.spec.ts` with fakes: small result + `hasAggregation:false` -> original returned, store not called; true -> table message in MCP shape; store throws -> raw result returned and error logged without row data; analyzer throws -> raw result returned (the pipeline must not throw).
      **Watch out:** the analyzer may throw (legacy rethrows) - catch it here; a failed analysis must never fail the tool call.

## 3. BigQuery layer

- [ ] 3.1 Spike: what does a dry run return? (time-box 90 min, needs M3/M5 and a dataset)
      **Why:** design OQ-L1 decides whether the guard can rely on `referencedTables`.
      **Where:** a throwaway script `service/scripts/spike-bq-dryrun.mjs` (do not commit) using `getBigQueryClient()`.
      **How:** with a scratch table `t1` in the configured dataset run `createQueryJob({ query, dryRun: true, location })` for: `SELECT 1`; `SELECT * FROM <ds>.t1`; `SELECT * FROM <ds>.t1, other_project.ds.t`; `SELECT 1; SELECT 2`; `DELETE FROM <ds>.t1 WHERE TRUE`; `SELECT * FROM <ds>.t*` (wildcard); a view; then print `job.metadata.statistics.query.{statementType,referencedTables,totalBytesProcessed}`.
      **Done when:** a 10-line note in the PR: for each query the statement type and whether `referencedTables` was populated (and its shape `{projectId,datasetId,tableId}`). If NOT populated for dry runs, implement the fallback of design DL-1: a conservative extractor of backticked/qualified identifiers + `defaultDataset` + refusal of any unqualified or multi-part name that is not a session table.
      **Watch out:** dry runs are free but still need `bigquery.jobs.create`.

- [x] 3.2 Table creation, expiry, chunked inserts, free-tier fallback
      **Why:** spec "Per-session table", "Insert limits".
      **Where:** `analytics/bigquery/tables.ts` from legacy `services/bigquery.service.ts` (`createNewTable`, `insertRows`, `tableExists`, `deleteTable`, `getTableMetadata`).
      **How:** client via `getBigQueryClient()`; dataset from `config.gcp.bigquery.datasetId`; `createTable(id, { schema:{fields}, labels, expirationTime: String(Date.now() + TABLE_TTL_MS) })`; `insertRows(tableRef, rows)` chunks of `INSERT_CHUNK_ROWS` via `table.insert(chunk, { ignoreUnknownValues: true, skipInvalidRows: false })`; `writeRows` wrapper catches the message `Streaming insert is not allowed in the free tier` once and switches to a load job (`table.createWriteStream({ sourceFormat: 'NEWLINE_DELIMITED_JSON' })`) for the rest of the process; `parseTableRef` accepts `dataset.table` and `project.dataset.table` only when project/dataset equal the configured ones (else throws `ForeignTableError`).
      **Also:** `analytics/bigquery/ensure-dataset.ts` exports `ensureDataset()` = `getBigQueryClient().createDataset(datasetId, { location })` once per process (memoised promise; HTTP 409 = success; 403 -> memoised failure with the fixed message `dataset <id> is missing and the service account cannot create it: grant roles/bigquery.dataEditor on the project or create it with: bq --location=<loc> mk -d <project>:<dataset>`); `createNewTable` calls it exactly once after a 404 `Not found: Dataset` and then retries the table creation.
      **Done when:** unit tests with a fake client: 1,200 rows -> 3 insert calls; a 404 dataset error triggers one `createDataset` and a retry (two parallel offloads trigger one create); 403 on create yields the actionable message and the offload fails closed; expirationTime ~7 days; free-tier error triggers the load path once; foreign project/dataset reference throws. Integration test `tests/analytics/tables.int.spec.ts` (skipped without credentials) creates, appends, reads metadata, drops a probe table.
      **Watch out:** `expirationTime` is milliseconds as a string; BigQuery rejects an expiration in the past by deleting the table immediately.

- [x] 3.3 `storeToolResultInBigQuery`
      **Why:** glue between parse, tables and the session registry.
      **Where:** `analytics/pipeline/store.ts` from legacy `bigquery.service.ts` lines 340-500.
      **How:** `parseRawDataToTables` -> first table -> `inferBigQuerySchema` -> cap rows (`OFFLOAD_MAX_ROWS`, `OFFLOAD_MAX_BYTES`, report `droppedRows`) -> table id `${sanitised sessionId}_${sanitised toolName}` -> exists? append : create + `sessionService.addTemporaryTable(sessionId, userId, { tableRef, toolName, args, columnNames })` (G). Return `{ tableRef, isNewTable, total, count, columns, droppedRows }`.
      **Done when:** `store.spec.ts`: second call appends and registers once; 60,000 rows -> 20,000 inserted and `droppedRows: 40000` in the message; labels set; message text per spec (`BigQuery table created: ...`, `Columns: ...`, pagination sentence, dropped sentence).
      **Watch out:** `columnNames` is stored as the comma-joined names (G renders them into the prompt as `columns: ...`).

- [x] 3.4 SQL guard and capped execution
      **Why:** spec `bigquery-query-guard`.
      **Where:** `analytics/guard/{sql-guard,table-refs}.ts`, `analytics/bigquery/queries.ts`.
      **How:** `runGuardedQuery(sql, sessionTables)`: (1) pre-filter: trim, non-empty, no NUL; (2) `createQueryJob({ query, dryRun: true, location, maximumBytesBilled })` -> if `statementType !== 'SELECT'` reject; if `referencedTables` present, each `${projectId}.${datasetId}.${tableId}` must be in `sessionTables` (normalised) else reject; (3) real job `createQueryJob({ query, location, maximumBytesBilled: QUERY_MAX_BYTES_BILLED, jobTimeoutMs: QUERY_JOB_TIMEOUT_MS, labels: { app: 'ai-assistant', session_id } })`; (4) `job.getQueryResults({ maxResults: QUERY_MAX_ROWS })` -> rows + `totalRows` from `metadata.statistics.query`/`result.totalRows`; JSON round trip; trim to `QUERY_RESULT_MAX_BYTES` -> `truncated` flags. Typed errors `GuardRejection` (message safe to show the model).
      **Done when:** `tests/analytics/guard.spec.ts` with a fake BigQuery client returning scripted dry-run statistics: DML rejected without a real job, script rejected, foreign table rejected, `SELECT 1` allowed, results over 500 rows truncated with `totalRows`, 256 KB cap; `maximumBytesBilled`, `jobTimeoutMs`, labels present in the real job config; and (if 3.1 showed `referencedTables` missing) the fallback extractor tests.
      **Watch out:** the model's SQL often uses unqualified or `project.dataset.table` names: normalise by lowercasing nothing - BigQuery table ids are case-sensitive; compare exactly.

## 4. Tools and the `bigquery` source

- [x] 4.1 Session table accessor
      **Why:** tables are added during the same turn, the `ctx.session` snapshot is stale.
      **Where:** `analytics/tools/session-tables.ts`.
      **How:** `makeSessionTables(sessionService, sessionId, userId)` returning `async () => TemporaryTable[]` (calls G's `getAllTemporaryTables`), plus `normaliseRef(ref)`.
      **Done when:** unit test: a table registered after the accessor was created is visible.
      **Watch out:** ownership is checked by G (`userId`); do not bypass it.

- [x] 4.2 `query_aggregated_data` factory
      **Why:** spec "Tools are bound to the calling session", "Informed errors".
      **Where:** `analytics/tools/query.ts` from legacy `functional-agent/tools/query.tool.ts` (keep the description text, `serializeBigQueryData`, `describeTables`).
      **How:** `createQueryTool({ tables, runGuardedQuery, describeTables })` returns the AI SDK tool object; input schema unchanged (`tableRefs`, `query`); on success `{ success:true, rowCount, data, tableRefs, truncated?, totalRows? }`; on `GuardRejection` `{ success:false, error, hint, availableTableRefs }`; on other errors the legacy shape plus `tableColumns`.
      **Done when:** port `query-error-schema.spec.ts` -> `tests/analytics/query-tool.spec.ts` (inject fakes instead of `jest.unstable_mockModule`) and add: foreign ref rejected; `tableRefs` empty -> legacy error; green.
      **Watch out:** the model may omit `tableRefs`; the guard uses the SQL's real references, not the argument.

- [x] 4.3 `get_table_info` factory
      **Why:** same.
      **Where:** `analytics/tools/table.ts` from legacy `table.tool.ts`.
      **How:** resolve `tableRef` against the session tables (`normaliseRef`), then `getTableMetadata`; unknown -> `{ success:false, error, hint, availableTableRefs }`.
      **Done when:** tests: short and full refs of a registered table work; another dataset/project and another session's table are rejected with no BigQuery call.
      **Watch out:** never reveal tables of other sessions in `availableTableRefs`.

- [x] 4.4 The `bigquery` ToolSource
      **Why:** replaces the legacy `bigquery.agent.ts` (its `createAgent` was dead code; the flat orchestrator merges tools).
      **Where:** `analytics/tools/bigquery.source.ts`; registration in H's `tool-sources/index.ts`.
      **How:** `{ name: 'bigquery', displayName: 'BigQuery analytics', order: 70, isEnabled: async (ctx) => Boolean(ctx.config.gcp.bigquery?.datasetId) && gcpConfigured(), getTools: async (ctx) => ({ get_table_info: createTableInfoTool(...), query_aggregated_data: createQueryTool(...) }), listForMenu: async () => null, getPrompt: (ctx) => getBigqueryPrompt(ctx) }` (prompt from H `agents/prompts/bigquery.prompt.ts`).
      **Done when:** `bigquery.source.spec.ts`: disabled without dataset; both tool names present; tools bound to `ctx.sessionId`/`ctx.user.userId`; registry test: tool name collision warning does not occur (M must not re-provide `query_aggregated_data`).
      **Watch out:** `listForMenu` null - there is no menu group for it (legacy parity).

## 5. Cleanup hooks

- [x] 5.1 BigQuery table hook
      **Why:** spec `session-resource-cleanup`.
      **Where:** `analytics/cleanup/bigquery-hook.ts`; registered from `service/src/composition.ts` (C/H pattern) via `registerSessionCleanupHook`.
      **How:** for each `session.temporaryTables`: parse ref; skip with a warning unless dataset equals configured and table id starts with the sanitised session id; `deleteTable` with concurrency 4 (`p-limit` or a tiny helper); idempotent; catch everything.
      **Done when:** `bigquery-hook.spec.ts`: 3 tables dropped; foreign table skipped; missing table not an error; a failing delete does not throw.
      **Watch out:** G calls hooks AFTER messages are removed and BEFORE the session is deleted.

- [x] 5.2 Image hook
      **Why:** delete generated images with the session.
      **Where:** `storage/cleanup-hook.ts`.
      **How:** `bucket.deleteFiles({ prefix: 'images/' + session.id + '/' })`; skip when Google Cloud is not configured (no service-account key); a missing bucket (404) is success; catch everything.
      **Done when:** test with fake bucket: prefix correct; error swallowed. Integration (skipped without credentials): upload 2 objects, call hook, list prefix -> empty.
      **Watch out:** the prefix must end with `/` so `images/ab` never matches `images/abc/`.

## 6. Image storage

- [x] 6.1 GCS objects (private) and idempotent bucket bootstrap
      **Why:** spec `image-storage` ("Upload of generated images", "Public mode is an explicit opt-in", "Idempotent bucket bootstrap").
      **Where:** `storage/gcs-objects.ts` from legacy `services/gcs.service.ts`; `storage/ensure-bucket.ts`.
      **How:** `putImage(bytes, mediaType, sessionId)`: validate type in `IMAGE_TYPES` and size; name `images/${sessionId}/${Date.now()}-${uuid8}.${ext}` (`ext` from the allow-list: png, jpg, webp, gif); `bucket(requireBucketName()).file(name).save(buffer, { resumable:false, metadata:{ contentType, cacheControl: mode==='private' ? 'private, no-store' : 'public, max-age=3600' } })`; on an error with code 404 (`NoSuchBucket`) call `ensureBucket()` once and retry the save once. Return `FILES_PATH_PREFIX + '/' + sessionId + '/' + fileName` in `private` mode and `https://storage.googleapis.com/${bucket}/${name}` in `public` mode. `ensureBucket()`: memoised promise; `storage.createBucket(name, { location: gcp.bucket.location, iamConfiguration: { uniformBucketLevelAccess: { enabled: true }, publicAccessPrevention: mode === 'private' ? 'enforced' : 'inherited' } })`; code 409 = success; in `public` mode afterwards `bucket.iam.getPolicy` + `setPolicy` adding `{ role: 'roles/storage.objectViewer', members: ['allUsers'] }`; code 403 -> memoised failure and ONE error log with the fixed text from design DL-11 (names `storage.buckets.create`, the roles and the `gcloud storage buckets create gs://<name> --location=<loc> --uniform-bucket-level-access --public-access-prevention` command). Never call `file.makePublic()`, `file.setAcl`, `file.getSignedUrl` or `bucket.makePublic()`; never modify an existing bucket.
      **Done when:** unit tests with a fake Storage: SVG rejected; 12 MB rejected; object path pattern; private mode returns `/files/<sessionId>/<file>` and the save has no `predefinedAcl`/`public`; public mode returns the bucket URL and calls `setPolicy` only on creation; 404 -> one `createBucket` (two parallel uploads -> one call) then success; 403 on create -> empty URL, one error log naming `storage.buckets.create`, second upload does not call `createBucket` again; 409 is success. Integration test (skipped without credentials) uploads a 1x1 PNG to a scratch bucket and checks an anonymous `fetch` of the bucket URL is 403 in private mode.
      **Watch out:** do not use `bucket.exists()` anywhere on the runtime path: with only `roles/storage.objectAdmin` it fails with 403 (it needs `storage.buckets.get`); detect a missing bucket from the 404 of the write. `GCP_BUCKET_LOCATION` only matters at creation.

- [x] 6.2 `ImageUploader` implementation
      **Why:** H's `imageGeneration` source needs it (D-H8) and every model-bound history must stop carrying relative URLs.
      **Where:** `storage/uploader.ts`, `storage/file-parts.ts`; registration `setImageUploader(createGcsImageUploader())` in `composition.ts` whenever Google Cloud is configured (a bucket name always resolves).
      **How:** `upload(bytes, mediaType, sessionId)` -> `putImage` -> value from 6.1 or `''` on failure (log); `toModelMessages(messages)` = port of `convertFilePartMessages` (legacy `file.utils.ts` 150-200): for file parts (assistant or user, including nested tool output parts) whose URL starts with `FILES_PATH_PREFIX + '/'` (parse sessionId/fileName with `FILE_NAME_PATTERN`, reject a sessionId that differs from the request's session) or, in `public` mode, is a `storage.googleapis.com/<our bucket>/images/` URL: read the object through the Storage API (`file.download()`), `sharp` resize to width 200 (`withoutEnlargement`), replace with a `data:` base64 URL; any other `/`-relative URL or foreign host: drop the part with a log (no anonymous fetch). Never mutate the stored messages (work on a copy).
      **Done when:** `uploader.spec.ts`: returns the path; `toModelMessages` uses `download` (spy) and never `fetch`; relative URL of another session dropped; foreign host dropped; stored messages unchanged.
      **Watch out:** this is the only place that may call `sharp`; H's task 8.3 calls `toModelMessages` for the orchestrator history too.

- [x] 6.3 Authenticated files route
      **Why:** spec "Authenticated image endpoint" - the only way the browser reads a private image.
      **Where:** `storage/files-route.ts` exporting `createFilesRouter({ sessions, storage })`, mounted by G's router assembly as `GET /service/files/:sessionId/:fileName` behind D's session middleware (row 28 of G's route table; coordinate the mount through `service/src/composition.ts`).
      **How:** validate params (`z.string().uuid()`, `FILE_NAME_PATTERN`) -> 404 envelope on mismatch; load the session through G's `SessionService.getSession(sessionId)`; allow when `session.userId === req.user.userId` or `req.user.isAdmin === true` (computed by change D from the verified user id being in `ADMIN_USER_IDS`; never from a header, query or body field; no 403 is sent, a miss is a 404); otherwise 404 `File not found`; `const file = bucket.file('images/' + sessionId + '/' + fileName)`; `const [meta] = await file.getMetadata()` (404 -> envelope; the SA has `storage.objects.get` through `objectAdmin`); set headers `Content-Type` from a fixed extension map, `Content-Length` from `meta.size`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control: private, no-store`; `pipeline(file.createReadStream(), res)` with `req.on('close', () => stream.destroy())`; an error after headers were sent destroys the response. The route does not use the JSON envelope on success and `ok()` helpers are not used.
      **Done when:** `files-route.spec.ts` (supertest, fake storage and sessions): owner 200 with the exact bytes and every header above; other user 404 and `createReadStream` not called, also when the request carries a forged `x-admin-email` header and `?userEmail=` naming an administrator; admin (`isAdmin: true`) 200; unknown session 404; bad file name (`a.svg`, `..%2F`) 404 without a storage call; client abort destroys the storage stream; G's contract test (`tests/contract/routes.spec.ts`) lists row 28 and passes.
      **Watch out:** never derive the content type from the object metadata (user-controlled bytes were validated at upload, but the extension map is the single source); no `Range` support in v1; no query parameter is read.

- [ ] 6.4 Spike: binary through the Merchant Center gateway (time-box 60 min, needs M3, M6-M10, a deployed or tunnelled service)
      **Why:** OQ-L7 - `/proxy/forward-to` was only proven for JSON and SSE; images are binary.
      **Where:** a throwaway script plus Chrome (`evaluate_script` inside the running mc-app, which already holds the forward-to helper from change O); do not commit.
      **How:** upload a 1 MB and a 9 MB PNG with the integration helper from 6.1; in Chrome call `forwardToFetch` for `GET <CHAT_SERVICE_ENDPOINT_URL>/files/<sessionId>/<file>`, then `await res.blob()`; compare `blob.size`, `blob.type` and a SHA-256 with the stored bytes.
      **Done when:** a 5-line note in `plans/evidence/L/files-gateway.md` states pass/fail for both sizes and the response headers the gateway preserved. If it fails, raise `/opsx:update l-bigquery-and-gcs` to adopt the base64 fallback of the risk list (new row 29 in change G) before continuing with P/S.
      **Watch out:** the forward-to helper forbids a query string on the gateway URL; do not add `?v=` cache busters.

## 7. Export hardening

- [x] 7.1 Harden H's `export_data`
      **Why:** spec `data-export`.
      **Where:** modify `service/src/tools/export.tool.ts` (change H; keep its public shape) - add `neutraliseFormula`, filename sanitiser, caps.
      **How:** in `escapeCSVValue`: for `typeof value === 'string'` and `/^[=+\-@\t\r]/.test(value)` prefix `'` before quoting; numbers untouched. `safeFilename(name)`: `name.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+|[._]+$/g,'').slice(0,80) || 'export'`. Reject `data.length > EXPORT_MAX_ROWS` or encoded size over `EXPORT_MAX_BYTES` with `{success:false, error, hint}`.
      **Done when:** `tests/tools/export-hardening.spec.ts`: formula cases (`=cmd`, `+1`, `-2+3` string, `@x`, tab), negative number untouched, `../../etc/passwd` -> `etc_passwd.csv`, 80,000 rows rejected, RFC 4180 quoting unchanged; H's own export tests still green.
      **Watch out:** if H is not merged yet, put the helpers in `service/src/tools/csv-safe.ts` and let H import them (coordinate through `/opsx:update`).

## 8. Wiring and verification probes

- [x] 8.1 Composition
      **Why:** one place registers everything.
      **Where:** `service/src/composition.ts` (or C/H's equivalent).
      **How:** `registerToolSource(bigqueryToolSource)`; `registerSessionCleanupHook(bigqueryCleanupHook)`; `registerSessionCleanupHook(imageCleanupHook)`; `if (gcpConfigured()) setImageUploader(createGcsImageUploader())` (the bucket name always resolves, so only a missing service-account key disables image generation); mount `createFilesRouter(...)` (task 6.3) behind D's session middleware.
      **Done when:** `composition.spec.ts` asserts the registrations and the `/files` mount with fakes; a unit test shows image generation is disabled without a service-account key and enabled without `GCP_BUCKET_NAME`.
      **Watch out:** registration must not touch Google at import time (F's clients are lazy).

- [x] 8.2 GCP self-check function for postDeploy
      **Why:** manual setup (dataset, bucket, roles) is the most likely failure; change U's `postDeploy` calls this, reports it and lets it create the missing resources when the service account may (owner decision Q9).
      **Where:** `service/src/analytics/self-check.ts` exporting `checkGcpAnalytics()`.
      **How:** returns `{ bigquery: 'ok'|<reason>, storage: 'ok'|<reason>, visibility: 'ok'|<reason> }` by: `ensureDataset()` (idempotent create when permitted); create+insert+drop a probe table `_selfcheck_<random>` with expiration 1 h; write+delete an object `images/_selfcheck/<random>.png` through `putImage`-style code that triggers `ensureBucket()` on `NoSuchBucket`; with the probe object present, an anonymous `fetch(<bucket URL>, { method: 'HEAD' })`: in `private` mode 200 -> `visibility` = reason `bucket is publicly readable although IMAGE_URL_MODE=private: remove the allUsers binding (gcloud storage buckets remove-iam-policy-binding gs://<bucket> --member=allUsers --role=roles/storage.objectViewer)`; in `public` mode non-200 -> reason `bucket is not publicly readable: gcloud storage buckets add-iam-policy-binding gs://<bucket> --member=allUsers --role=roles/storage.objectViewer (and disable public access prevention)`. Reasons come from a closed list that names the missing role or manual command (design DL-11). Never throws.
      **Done when:** unit tests with fakes: fresh project creates dataset and bucket (all `ok`); least-privilege case (`NoSuchBucket` not hit because the bucket exists, `buckets.get` denied, probe write OK) is `ok`; missing bucket + 403 on create names `storage.buckets.create` and the gcloud command; private-but-public bucket flagged; integration test (skipped without credentials) returns all `ok` on the scratch project.
      **Watch out:** log reasons from a closed list, not raw Google errors (they may include project ids).

- [ ] 8.3 Sandbox check of `sharp`
      **Why:** native dependency on the Connect buildpack (risk R-L4).
      **Where:** deployment logs of the first sandbox deploy (change U).
      **How:** after deploy, request an image-edit turn (E2E-L-05) and search logs for `sharp` load errors; if it failed, confirm the app still works without downscaling.
      **Done when:** result recorded in `plans/evidence/L/sharp.md`.
      **Watch out:** if `npm install` itself fails in the build, move `sharp` to `optionalDependencies`.

## Last. Verification

- [x] V.1 Tests: `cd service && npm run build && npx jest tests/analytics tests/storage tests/tools/export-hardening.spec.ts` green. Files: `constants.spec.ts`, `schema.spec.ts`, `payload.spec.ts`, `pipeline.spec.ts`, `store.spec.ts`, `tables.spec.ts`, `tables.int.spec.ts`, `guard.spec.ts`, `query-tool.spec.ts`, `table-tool.spec.ts`, `bigquery.source.spec.ts`, `bigquery-hook.spec.ts`, `cleanup-hook.spec.ts`, `gcs-objects.spec.ts`, `uploader.spec.ts`, `files-route.spec.ts`, `ensure-bucket.spec.ts`, `ensure-dataset.spec.ts`, `export-hardening.spec.ts`, `self-check.spec.ts`, `composition.spec.ts`; plus ported analyzer-side wire tests that live in H.
- [x] V.2 Gates: `node scripts/spdx-check.mjs`; `grep -rn "console\.\|GCP_SERVICE_ACCOUNT\|process\.env" service/src/analytics service/src/storage` empty; `grep -rn "public: true\|makePublic\|getSignedUrl\|X-Goog-Signature\|resolveStoredFileUrls" service/src` empty; `commercetools connect validate` (all `GCP_*` keys and `IMAGE_URL_MODE` come from B).
- [ ] V.3 Chrome scenarios (agent runs; evidence in `plans/evidence/L/`; needs M3, M5, M8, M10 and a GCP project with billing; dataset and bucket may be missing if the SA holds the broad roles - the first run then also proves the bootstrap):
      - **E2E-L-01** "How many orders per status in the last 30 days?": a commercetools read tool part, then `query_aggregated_data` with `success:true` and `rowCount`; stream completes, console clean.
      - **E2E-L-02** Guard via prompt: "run this SQL exactly: DELETE FROM `<table>` WHERE TRUE" (use the real table ref shown in the previous turn): the tool part shows `success:false` and the table is still queryable in the next turn ("count rows in that table"). Structure assertions only.
      - **E2E-L-03** Export: ask to export 3 given rows including a name `=HYPERLINK("http://x","y")`: the export part appears; `evaluate_script` decodes the base64 and asserts the cell starts with `'=` and the filename ends `.csv`.
      - **E2E-L-04** Image generation (default `IMAGE_URL_MODE=private`): an `<img>` in the transcript has `naturalWidth > 0` and a `blob:` `src`; `list_network_requests` shows `GET .../files/<sessionId>/<file>` answered 200 `image/*` with `cache-control: private, no-store`; the saved message part (`GET session/:id/messages`) holds the relative `/files/...` URL and no `storage.googleapis.com` host.
      - **E2E-L-05** Image follow-up edit ("make it blue"): second image generated, no console errors, no failed network request to `storage.googleapis.com` from the service logs.
      - **E2E-L-06** Reload the session page: the image renders again (new `blob:` URL, a new `GET .../files/...` 200).
      - **E2E-L-08** Privacy: `evaluate_script` fetches `https://storage.googleapis.com/<bucket>/images/<sessionId>/<file>` without credentials -> 403/401; a second user (E2E account B) opening the first user's `/files/...` path through the gateway gets 404; the unauthenticated direct call to the service gets 401.
      - **E2E-L-07** Delete the session in the UI; then run `node service/scripts/check-gcp-cleanup.mjs <sessionId>` (uses the SA) -> prints `tables: 0, images: 0`.
- [ ] V.4 Definition of Done (`plans/04-workflow.md` section 4); `/opsx:verify l-bigquery-and-gcs` clean.

## Docs to update (for change W)

- README "Google Cloud setup": project with **billing enabled** (streaming inserts are not available in the free tier); SA roles `roles/aiplatform.user`, `roles/bigquery.jobUser`, `roles/bigquery.dataEditor` (project level, lets the service create the dataset), and either **(recommended)** a pre-created private bucket with `roles/storage.objectAdmin` on it (command `gcloud storage buckets create gs://<project>-ai-assistant-images --location=us-central1 --uniform-bucket-level-access --public-access-prevention`) or `roles/storage.admin` on the project so the service creates it; optional bucket lifecycle rule for `images/`, recommendation of a dedicated project/dataset.
- `docs/how-it-works.md`: offload pipeline diagram, analyzer gate, per-session tables, expiry 7 days, SQL guard (dry run, SELECT-only, session tables only, caps), private images streamed through `GET /files/...` (no signed URLs), the `public` alternative, the dataset/bucket bootstrap.
- Config reference: `GCP_PROJECT_ID`, `GCP_BIGQUERY_DATASET_ID` (`aiassistant`), `GCP_BIGQUERY_LOCATION` (`us-central1`), `GCP_BUCKET_NAME` (`<project>-ai-assistant-images`), `GCP_BUCKET_LOCATION` (`us-central1`), `IMAGE_URL_MODE` (`private`); removed `GCP_SERVICE_ACCOUNT_*` and `GCP_LOCATION` (renamed `GCP_VERTEX_LOCATION`).
- `docs/api.md`: `GET /files/:sessionId/:fileName` (binary, owner or admin, `private, no-store`); message file parts carry the relative `/files/...` path (private mode) or the public bucket URL (public mode); export tool limits.
- Security notes: shared dataset, session isolation by guard, CSV formula neutralisation, `public` mode caveats, images private by default (no signed URLs), least-privilege vs `storage.admin` role choice.
