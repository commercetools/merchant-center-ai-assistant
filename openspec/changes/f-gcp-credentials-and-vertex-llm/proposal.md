## Why

The legacy service reaches Gemini with a plain API key (`GEMINI_API_KEY`) while BigQuery and GCS use a *different* credential (split `GCP_SERVICE_ACCOUNT_CLIENT_EMAIL` / `..._PRIVATE_KEY` variables with `\n` unescaping, or Application Default Credentials). Two further providers (Anthropic, OpenAI) are imported by nothing. The owner requirement R8 is **one** secret: the whole Google service-account JSON key, Base64-encoded, serving Gemini (via Vertex AI), BigQuery and GCS. This change builds that single credential path, the model provider layer, token counting and the BigQuery/GCS client factories, and deletes everything else.

- Change ID: **F** `f-gcp-credentials-and-vertex-llm`
- Needs: **C** `c-service-foundation`. Wave 3 (parallel with D, E). Consumed by G (digest/suggestions), H (agents), L (BigQuery/GCS services), and the postDeploy check (U).

## What Changes

- `GCP_SA_KEY_BASE64` decoding and validation with errors that name the problem but never echo any part of the key; every Google Cloud setting has a default and is configurable through `connect.yaml` (owner decision Q9, 2026-10-09): `GCP_PROJECT_ID` (default: the key's `project_id`), `GCP_VERTEX_LOCATION` (default `us-central1`; the legacy name `GCP_LOCATION` is not used), `GCP_BIGQUERY_DATASET_ID` (`aiassistant`), `GCP_BIGQUERY_LOCATION` (`us-central1`), `GCP_BUCKET_NAME` (`<gcp project id>-ai-assistant-images`), `GCP_BUCKET_LOCATION` (`us-central1`) and `IMAGE_URL_MODE` (`private` | `public`, default `private`). One credential, `GCP_SA_KEY_BASE64`, serves Vertex (text and image models), BigQuery and Cloud Storage.
- `getGoogleCredentials()`: the single credentials provider (decoded key, project, location, `googleAuthOptions`) consumed by Vertex, BigQuery and Storage.
- `@ai-sdk/google-vertex` provider (`createVertex({ project, location, googleAuthOptions })`); `getModel('main' | 'agent' | 'lite' | 'image')` and `getProviderOptions(tier)` reproducing the legacy thinking configuration; `countTokens()` through Vertex (`@google/genai` with `vertexai: true`).
- `getBigQueryClient()` and `getStorageClient()` lazy singletons built from the same credentials (API/ADC fallbacks removed).
- `checkGcpReadiness()`: decode + token mint + Vertex `countTokens` ping (+ optional BigQuery dry-run, GCS bucket existence; missing dataset/bucket are not failures here - L's `checkGcpAnalytics()` reports and creates them) for the `postDeploy` script (U) and a skipped-without-key **live smoke suite** (manual step M5).
- Removal of `GEMINI_API_KEY`, `CLAUDE_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_*`, `GCP_SERVICE_ACCOUNT_*`, `utils/secrets.utils.ts`, `providers/anthropic.ts`, packages `@ai-sdk/anthropic`, `openai`, `@ai-sdk/google` (direct), and a config guard that refuses `GOOGLE_VERTEX_API_KEY` (it would silently switch the provider to API-key "express mode").
- **BREAKING (vs legacy):** model calls run on Vertex AI (project billing, IAM `roles/aiplatform.user`, regional endpoint) rather than the Gemini Developer API; provider-option namespace is `vertex`; no API-key path exists.

## Capabilities

### New Capabilities
- `gcp-credentials`: decode/validate the Base64 service-account key, project/location resolution, shared credentials provider, readiness check.
- `vertex-llm-models`: model tiers, thinking configuration, image model, token counting, removed providers.
- `gcp-clients`: BigQuery and Cloud Storage client factories on the shared credentials.

### Modified Capabilities
<!-- none -->

## Impact

- New: `service/src/gcp/{service-account,credentials,readiness}.ts`, `service/src/llm/{models,provider-options,count-tokens}.ts`, `service/src/gcp/clients.ts`, `service/src/config/sections/{gcp,llm}.ts` (replace C placeholders), tests under `service/tests/{unit,integration}/`.
- `connect.yaml` (B): secured `GCP_SA_KEY_BASE64` (required); standard `GCP_PROJECT_ID` (opt), `GCP_VERTEX_LOCATION` (default `us-central1`), `GEMINI_MODEL_NAME`, `GEMINI_AGENT_MODEL_NAME`, `GEMINI_LITE_MODEL_NAME`, `GEMINI_IMAGE_MODEL_NAME`, `GEMINI_LITE_THINKING_LEVEL`, `GCP_BIGQUERY_DATASET_ID`, `GCP_BIGQUERY_LOCATION`, `GCP_BUCKET_NAME`, `GCP_BUCKET_LOCATION`, `IMAGE_URL_MODE` (all optional; every one has a default).
- Dependencies added: `@ai-sdk/google-vertex@^5.0.108`, `google-auth-library@^10.6.2`, `@google/genai@^1.30.0`, `@google-cloud/bigquery@^8.1.1`, `@google-cloud/storage@^7.14.0`. Removed (never added): `@ai-sdk/anthropic`, `@ai-sdk/google`, `openai`.
- Contract change vs plan `03`: a fourth tier `agent` is added to `getModel` (see design D3).

## Out of scope

- Agents, prompts and tools that use the models (H), the BigQuery offload and GCS upload *services* (L) - F supplies only clients and credentials.
- Creating the GCP project, enabling APIs and the service account (manual step M5, documented in README by W).
- Image URL policy (`private` backend-streamed images vs `public`): implemented by L; F only parses and validates `IMAGE_URL_MODE`.
- Any non-Google provider (Q11 DECIDED 2026-10-09: Anthropic and OpenAI providers are dropped for good; Vertex Gemini only, no `ANTHROPIC_*` / `OPENAI_*` keys).

## Legacy source

Read-only, absolute paths under `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/`:
- `src/functional-agent/providers/{gemini-3,gemini,gemini-lite,gemini-2.5-flash-image,anthropic}.ts`
- `src/utils/secrets.utils.ts`
- `src/services/bigquery.service.ts` lines 55-130 (client construction), `src/services/gcs.service.ts` lines 1-60
- Consumers of the providers (for the tier mapping): `src/functional-agent/{singleton,custom-view.agent}.ts`, `src/functional-agent/agents/*.ts`, `src/functional-agent/agents/definitions/*.ts`
- `.env.example`, `package.json`
