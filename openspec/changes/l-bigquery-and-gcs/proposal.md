## Why

Large commercetools tool results must not flood the model's context window, and users want aggregations, charts, CSV downloads and generated images. The multitenant router solves this with a **tool-result offload** (analyzer decides, result rows land in a per-session BigQuery table), two SQL tools, a CSV export tool and a GCS image upload. It works, but its own FEATURES.md lists the gaps: `query_aggregated_data` passes the model's SQL straight to BigQuery ("no statement-type check, no `LIMIT` injection, no `maximumBytesBilled`, and `tableRefs` is echoed rather than enforced"), any session can read any other session's tables (and, via a 3-part table reference, anything the service account can see), tables live forever unless the session is deleted, images are made public with object ACLs that fail on modern buckets (and public images leak user content), and the CSV tool writes cells that spreadsheets execute as formulas. A public, multi-user connector cannot ship that.

## What Changes

- **Change ID: L** (`l-bigquery-and-gcs`). **Needs:** F (`getGoogleCredentials()`), H (`ToolSource` registry, analyzer, `ImageUploader` seam, built-in `export` source), G (`SessionService` temporary-table bookkeeping, `registerSessionCleanupHook`). Unblocks: V; consumed by I (offload wrapper on identity tools). In the flat orchestrator (change H, finding 1) `query_aggregated_data` is simply part of the merged tool set, so M/K do not need to re-provide it.
- Port the **tool-result pipeline** (`withToolResultPipeline`, payload shaping, offload message with columns; the analyzer itself is change H's `agents/analyzer.agent.ts`), `bigquery.utils` (parsing, schema inference), `BigQueryService`, `GcsService`, the tools `query_aggregated_data` and `get_table_info` as a `bigquery` **ToolSource**, the GCS **`ImageUploader`** for H's image-generation source, and the hardening of H's `export_data` tool - using the Google credentials from change F (the single `GCP_SA_KEY_BASE64`; no separate key variables, no API keys) and a **deployment-scoped dataset** (`GCP_BIGQUERY_DATASET_ID`, default `aiassistant`).
- **Hardening (new):** SELECT-only SQL guard through a BigQuery **dry run** (statement type must be `SELECT`, referenced tables must be tables of the calling session), `maximumBytesBilled`, job timeout, row cap on results, query labels; `get_table_info` and `getTableMetadata` restricted to the session's tables; tools are created **per request** with the session bound (no process-wide singleton); table **expiration** (7 days) and chunked inserts with row/size caps; CSV **formula-injection** neutralisation and size caps for `export_data`.
- **Session cleanup:** two hooks registered through G's `registerSessionCleanupHook(fn(session))` drop the session's BigQuery tables **and** its uploaded images when a session is deleted.
- **Image storage (owner decision Q9, 2026-10-09):** GCS upload from the image-generation agent into a **private bucket**; objects are never made public and **no signed URLs exist**. The stored message part references a **service-relative path** (`/files/{sessionId}/{fileName}`) and the frontends read the bytes only through a new **authenticated streaming endpoint** `GET /service/files/:sessionId/:fileName` (owner or admin, correct content type, `Cache-Control: private, no-store`). `IMAGE_URL_MODE=public` is the opt-in alternative (bucket readable by `allUsers`, stored URL is the public bucket URL). Media-type allow-list (no SVG), size cap.
- **Resource bootstrap:** the dataset and the bucket are created **idempotently on first use** (and by `postDeploy`'s `checkGcpAnalytics()`) when they are missing **and** the service account may create them; otherwise a self-check reports an actionable message naming the IAM role or the exact pre-creation command.
- Drop: `GCP_SERVICE_ACCOUNT_CLIENT_EMAIL/PRIVATE_KEY` variables, public ACL upload, the unauthenticated global `bigQueryService` singleton's implicit credentials fallback.

## Capabilities

### New Capabilities
- `tool-result-offload`: analyzer-gated offload of large tool results into per-session BigQuery tables and the message the model receives.
- `bigquery-query-guard`: `query_aggregated_data` / `get_table_info` with SELECT-only, session-table-only, cost- and size-capped execution.
- `session-resource-cleanup`: deletion (via G's hook) and expiry of per-session BigQuery tables and GCS images.
- `image-storage`: GCS upload of generated images into a private bucket, the authenticated `GET /service/files/:sessionId/:fileName` streaming endpoint, the `public` opt-in mode and idempotent bucket/dataset bootstrap.
- `data-export`: hardening of the `export_data` CSV tool (owned by H) with formula neutralisation and caps.

### Modified Capabilities
<!-- none -->

## Impact

- New code under `service/src/analytics/{pipeline,bigquery,guard,tools,cleanup}/`, `service/src/storage/{gcs-objects,uploader,files-route,file-parts,ensure-bucket}.ts`, `service/src/analytics/bigquery/ensure-dataset.ts`; a small edit to H's `service/src/tools/export.tool.ts`; sharp stays a dependency only for downscaling images fed back to the model.
- Config (all standard, all with defaults, owned by B/C/F, set through `connect.yaml`): `gcp.projectId` (`GCP_PROJECT_ID`, default the SA key's project), `gcp.bigquery.datasetId` (`GCP_BIGQUERY_DATASET_ID`, default `aiassistant`), `gcp.bigquery.location` (`GCP_BIGQUERY_LOCATION`, default `us-central1`), `gcp.bucket.name` (`GCP_BUCKET_NAME`, default `<gcp project id>-ai-assistant-images`), `gcp.bucket.location` (`GCP_BUCKET_LOCATION`, default `us-central1`; used only when the bucket is created), `gcp.imageUrlMode` (`IMAGE_URL_MODE`, `private` default | `public`). BigQuery and Storage use the same project as Vertex (no separate BigQuery project key). Secret: `GCP_SA_KEY_BASE64` (change F) - the only credential for Vertex, BigQuery and Cloud Storage. Clients come from F's `getBigQueryClient()` / `getStorageClient()`.
- GCP prerequisites (manual step M5/Q9): APIs enabled, **billing enabled on the project** (streaming inserts are not available in the free tier), SA roles `roles/aiplatform.user`, `roles/bigquery.jobUser` and `roles/bigquery.dataEditor` **on the project** (this includes `bigquery.datasets.create`, so the service can create the dataset; granting it on a pre-created dataset instead also works), and for the bucket one of two paths: **(recommended, least privilege)** pre-create the bucket and grant `roles/storage.objectAdmin` on that bucket only, or **(convenience)** grant `roles/storage.admin` on the project so the service can create the bucket on first use (`storage.buckets.create`). The dataset and the bucket are never required to exist beforehand when the broader roles are granted.
- Consumers: H (registers L's `bigquery` source and `ImageUploader`; its history loader calls `ImageUploader.toModelMessages`), I (`withToolResultPipeline`), G (calls L's cleanup hooks; its route table gains row 28, the files route, which L implements), N (snapshots keep the relative `/files/...` URL), P/S/Q (export download part, image part loaded through `forwardToFetch` into a blob URL), V (E2E-L-*). Plan amendment PA-L1 (`resolveStoredFileUrls` / re-signing) is **obsolete**.

## Out of scope

- The model providers and credentials loader (F), the registry/orchestrator/analyzer and message sanitising helpers (H), session CRUD (G), the `export_data` tool itself (H owns it; L only hardens it).
- The retired per-tenant data warehouse and mirror tables.
- Visualisation tool (`visualize_data`, H) and composed pages (M).
- Bucket lifecycle rules (manual/infrastructure step; documented). Dataset and bucket creation are in scope only as the idempotent best-effort bootstrap described above.
- Row-level security or per-user datasets (all users of one deployment share one dataset; isolation is per session through the guard).

## Legacy source

Read-only, under `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/`:
`src/client/tool-result-pipeline.ts`, `src/services/{bigquery,gcs}.service.ts`, `src/utils/bigquery.utils.ts`, `src/functional-agent/utils/file.utils.ts`, `src/functional-agent/tools/{query,table,export}.tool.ts`, `src/functional-agent/agents/{analyzer.agent.ts,definitions/{bigquery,export,image-generation}.agent.ts,prompts/{bigquery,export,image-generation}.prompt.ts}`, `src/functional-agent/providers/gemini-2.5-flash-image.ts`, `src/services/chat.service.ts` (lines ~555-710: temporary tables), `tests/wire/{tool-result-offload,table-schema-inline,query-error-schema,analyzer-size-gate,analyzer-messages}.spec.ts`, `../FEATURES.md` (sections "BigQuery analytics" and "Known gaps").
