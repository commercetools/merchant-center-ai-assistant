## Context

Change F gives the service exactly one way to talk to Google: a service-account key delivered as one Base64 secret. Everything model-related (Gemini through Vertex AI, token counting, image output) and everything storage/analytics-related on Google (BigQuery, GCS) is built from it. The legacy provider files are tiny but encode several behaviours that must survive: four distinct model/thinking profiles, an image model used as a language model, a token counter whose failure value is `0`, and a trap where one env var silently collapsed two tiers.

## Explore findings

`L:` = `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/`. `V:` = `@ai-sdk/google-vertex@5.0.108` unpacked from npm on 2026-10-08; `G:` = `@ai-sdk/google@4.0.92` (its dependency).

**Legacy behaviour**
- F1. Four provider modules, each reading `GEMINI_API_KEY` at import time and building `createGoogleGenerativeAI({ apiKey })`:
  - `gemini-3.ts`: `GEMINI_MODEL_NAME || 'gemini-3.8-flash'`; options `{ google: { thinkingConfig: { thinkingLevel: 'high', includeThoughts: true } } }`; `countTokens` via `new GoogleGenAI({ apiKey })` returning `0` on error (L: `src/functional-agent/providers/gemini-3.ts:25-56`).
  - `gemini.ts`: `GEMINI_MODEL_NAME || 'gemini-2.5-flash'`; options `{ thinkingBudget: -1, includeThoughts: true }`; same `countTokens` (L: `.../providers/gemini.ts:7-38`).
  - `gemini-lite.ts`: `GEMINI_LITE_MODEL_NAME || 'gemini-3.5-flash-lite'`; `thinkingLevel` from `GEMINI_LITE_THINKING_LEVEL` validated against `minimal|low|medium|high`, default `minimal`, **no `includeThoughts`**; invalid value only warns and falls back (L: `.../providers/gemini-lite.ts:18-80`). Header comment documents why: reasoning-token measurements (1459/1279/0) and an 8.5 s cold `GET /suggestions`.
  - `gemini-2.5-flash-image.ts`: `googleAI.languageModel('gemini-2.5-flash-image')` (a *language* model with multimodal output), no provider options, model name hard-coded (L: `.../providers/gemini-2.5-flash-image.ts`). The image agent's comment explains why it passes no `providerOptions`: `aspectRatio`/`personGeneration` are image-model options and were silently stripped (L: `.../agents/definitions/image-generation.agent.ts:30-57`).
  - `anthropic.ts` (`ANTHROPIC_API_KEY`, `claude-sonnet-4-5`) is imported by nothing; `utils/secrets.utils.ts` (Claude/Gemini/OpenAI key getters, `isProviderConfigured`) is imported by nothing (`grep` over `src` and `tests`).
- F2. Tier consumers (grep of imports): `gemini-3` -> orchestrator (`singleton.ts`), `custom-view.agent.ts`, `commercetools`, `commercetools-ui`, `visualize`, `bigquery` agents; `gemini` -> `algolia`, `stripe`, `export`, `contentstack` agents and `countTokens` for the image agent's `prepareTaskMessages` (drops history above 10^6 tokens, L: `image-generation.agent.ts:76-86`); `gemini-lite` -> `session-digest`, `suggestions`, `analyzer` agents; image model -> `image-generation` agent. **Both `gemini.ts` and `gemini-3.ts` read the same `GEMINI_MODEL_NAME`**, so setting it collapses the intended 3.x/2.5 split (acknowledged in L: `.env.example` and `gemini-3.ts:20-24`).
- F3. No source file outside `providers/` reads `providerMetadata` (grep) - history compatibility is carried only inside stored message parts (`providerMetadata.google.thoughtSignature` for Gemini 3).
- F4. BigQuery client: `new BigQuery({ projectId, credentials?: { client_email, private_key.replace(/\\n/g,'\n') } })`, lazy; projectId from `GCP_PROJECT_ID` (new: defaults to the SA key's project); dataset `GCP_BIGQUERY_DATASET_ID`; query location `GCP_BIGQUERY_LOCATION` (L: `src/services/bigquery.service.ts:55-130`, `:136`, `:245`). GCS: same shape, falls back to ADC when no key (L: `src/services/gcs.service.ts:17-47`); bucket `GCP_BUCKET_NAME`; public URL `https://storage.googleapis.com/<bucket>/<file>` (`:109`).
- F5. Legacy installed versions: `@ai-sdk/google 4.0.63`, `@google/genai 1.30.0`, `@google-cloud/bigquery 8.1.1`, `@google-cloud/storage 7.18.0`, `ai 7.0.92`.

**`@ai-sdk/google-vertex@5.0.108`** (npm, 2026-10-08; `latest` = 5.0.108)
- V1. Exports `createVertex` (alias of `createGoogleVertex`) and `vertex` (V: `dist/index.d.ts:316`); **the plan's snippet `createVertex({googleAuthOptions:{credentials}})` is correct, not `createGoogleVertex` only**. Settings: `project`, `location`, `googleAuthOptions` (google-auth-library `GoogleAuthOptions`), `apiKey`, `headers`, `fetch`, `baseURL` (V: `dist/index.d.ts:186-245`).
- V2. Node entry builds `new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'], ...options })` and sends `Authorization: Bearer <access token>` (V: `dist/index.js:5-14`, `:1403-1420`). `project` falls back to env `GOOGLE_VERTEX_PROJECT`, `location` to `GOOGLE_VERTEX_LOCATION`. **If an API key is set (`options.apiKey` or env `GOOGLE_VERTEX_API_KEY`) the provider switches to "express mode" and ignores the service account** (V: `dist/index.js:1403-1407`, `:1252`) - hence the config guard.
- V3. Location `global` maps to host `aiplatform.googleapis.com`; `eu`/`us` to `aiplatform.<loc>.rep.googleapis.com`; otherwise `<loc>-aiplatform.googleapis.com` (V: `dist/index.js:614-616`, `:1303`).
- V4. Built-in model-id unions include `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-flash-image` (V: `dist/index.d.ts:90-93`). Dependencies: `@ai-sdk/google 4.0.92`, `@ai-sdk/provider 4.0.25`, `@ai-sdk/provider-utils 5.0.57`, `google-auth-library ^10.6.2` (npm metadata). Peer: `zod ^3.25.76 || ^4.1.8`.
- V5. Language models are the same `GoogleLanguageModel` as `@ai-sdk/google`; for Vertex the **provider-options namespaces read are `googleVertex`, then `vertex`, then a fallback to `google`** (G: `dist/index.js:1407-1417`), and **response provider metadata is emitted under `googleVertex` and `vertex`** (G: `:1584`). When reading message parts the provider checks `googleVertex`, `vertex`, then `google` (G: `dist/index.js:346-372` `readProviderOpts`). Therefore (a) legacy `{google: {...}}` options would still work, but we use `vertex` explicitly; (b) stored conversations carrying `providerMetadata.google.thoughtSignature` remain valid.
- V6. `thinkingConfig` schema: `thinkingBudget?: number`, `includeThoughts?: boolean`, `thinkingLevel?: 'minimal'|'low'|'medium'|'high'` (G: `dist/index.js:710-712`, `dist/index.d.ts:22`).

**Other libraries**
- G1. `@google/genai@1.30` `GoogleGenAIOptions` has `vertexai?: boolean`, `project?`, `location?`, `googleAuthOptions?: GoogleAuthOptions` (installed `dist/genai.d.ts:3761-3812`); latest on npm is 2.28 (not adopted; follow legacy line, Decision D6).
- G2. `@google-cloud/bigquery` and `@google-cloud/storage` constructors accept `projectId` and `credentials: { client_email, private_key }` (installed typings/docs, `build/src/bigquery.d.ts:204-217`).

**Google documentation**
- D1. On Vertex, current Gemini models (3.8 Flash, 3.5 Flash, 3.1 Pro preview ...) are listed for **both** the global endpoint and regional endpoints (us-central1, europe-west1 ...); the global endpoint "can improve availability and reduce 429 errors" but is not for workloads with ML-processing residency requirements; set via host `aiplatform.googleapis.com` / location `global` - https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations (fetched 2026-10-08; the page does not list per-region image-model availability, so it is checked by the live smoke test).
- D2. The service account needs the Vertex AI User role `roles/aiplatform.user`, BigQuery `roles/bigquery.dataEditor` + `roles/bigquery.jobUser`, and Storage `roles/storage.objectAdmin` on the bucket (least privilege, bucket pre-created) or `roles/storage.admin` on the project (lets the service create the bucket; see change L D-L11) (plan Q9; role names are Google IAM standard names; the Vertex quickstart page was too large to confirm the text, so the smoke test is the check).

## Glossary

- **Vertex AI**: Google Cloud's managed model platform; Gemini is served at `<location>-aiplatform.googleapis.com` and billed to a GCP project, authenticated with OAuth tokens (not API keys).
- **Service-account key (SA key)**: a JSON file with `client_email` and `private_key`; here shipped as Base64 in one secret.
- **GoogleAuth / `googleAuthOptions`**: google-auth-library object turning those credentials into short-lived OAuth access tokens; options are passed through all Google client libraries.
- **Express mode**: Vertex's API-key mode; selected silently if `GOOGLE_VERTEX_API_KEY` exists.
- **Thinking config**: Gemini's reasoning controls: `thinkingLevel` (Gemini 3.x) vs `thinkingBudget` (2.5-era) and `includeThoughts` (stream thought summaries to the UI "thinking pill").
- **Tier**: our name for a model role: `main`, `agent`, `lite`, `image`.
- **Thought signature**: opaque value Gemini 3 returns with tool calls and expects back in history.
- **ADC (Application Default Credentials)**: Google's implicit credential lookup (env file path, metadata server); deliberately not used.

## Source map

| Legacy file (under `.../service/src/`) | New file (under `service/src/`) | Verdict |
|---|---|---|
| `functional-agent/providers/gemini-3.ts` | `llm/models.ts` (tier `main`), `llm/provider-options.ts`, `llm/count-tokens.ts` | CHANGE (Vertex, `vertex` namespace) |
| `functional-agent/providers/gemini.ts` | `llm/models.ts` (tier `agent`) | CHANGE (own env var) |
| `functional-agent/providers/gemini-lite.ts` | `llm/models.ts` (tier `lite`) + `config/sections/llm.ts` (validated level) | CHANGE (invalid level fails fast) |
| `functional-agent/providers/gemini-2.5-flash-image.ts` | `llm/models.ts` (tier `image`) | CHANGE (name configurable) |
| `functional-agent/providers/anthropic.ts` | - | DROP |
| `utils/secrets.utils.ts` | - | DROP |
| `services/bigquery.service.ts` (client part, lines 55-130) | `gcp/clients.ts` (`getBigQueryClient`) | CHANGE (credentials from SA key, no `\n` unescape, no ADC); service logic stays for spec L |
| `services/gcs.service.ts` (client part, lines 17-47) | `gcp/clients.ts` (`getStorageClient`) | CHANGE (no ADC fallback) |
| (new) | `gcp/service-account.ts`, `gcp/credentials.ts`, `gcp/readiness.ts`, `config/sections/{gcp,llm}.ts` | NEW |
| `.env.example` GCP/Gemini entries | `service/.env.example` | CHANGE |

## Decisions

### D1. Vertex AI with `createVertex`, credentials passed explicitly
`createVertex({ project, location, googleAuthOptions: { credentials, projectId, scopes } })`. Alternatives: (a) keep `@ai-sdk/google` with an API key - rejected by owner requirement R8 (single SA secret); (b) Vertex with ADC - rejected: Connect has no GCP identity attached to our container (we cannot assume metadata-server credentials) and the plan fixes the Base64 key; (c) call `@google/genai` directly - rejected: the AI SDK (`ToolLoopAgent`, UI message streams) is the backbone of H.

### D2. Base64 of the *whole* JSON, strict closed-list errors
One secret, one parser, no partial `client_email`/`private_key` variables. Error strings come from a closed list so a mis-pasted key can never be reconstructed from logs (CI logs, Connect deployment logs, GitHub issues). Accepts URL-safe Base64 and line-wrapped Base64 because `base64 < key.json` wraps on Linux and `base64 -w0`/`tr -d '\n'` is easy to forget.

### D3. Four tiers, not three (`agent` added)
Plan 03 lists `getModel('main'|'lite'|'image')`. The legacy has *two* chat tiers - `gemini-3.8-flash` (orchestrator and commercetools-facing agents) and `gemini-2.5-flash` with `thinkingBudget:-1` (Algolia, Stripe, export, Contentstack agents) - plus the trap that one variable pinned both. Dropping the second tier would change the behaviour and cost of four agents; merging it into `main` would silently upgrade them. We keep the split behind `GEMINI_AGENT_MODEL_NAME`; owners may set both names equal. Recorded as a plan amendment for H (consumer).

### D4. Provider options use the `vertex` namespace
V5 shows `googleVertex`/`vertex` are the canonical names and `google` is a fallback. Using `vertex` makes the metadata namespace of new messages consistent and keeps old messages readable. Alternative: keep `google` for zero diff - rejected; relies on a fallback path that could be removed.

### D5. `countTokens` keeps the "0 on error" contract
Callers use it as a soft guard (`> 10^6` -> drop history). Changing it to throw would alter image-agent behaviour. Cost: a persistent Vertex failure silently disables the guard; the error log carries the signal.

### D6. Library lines follow the legacy-proven versions
`@google/genai ^1.30.0` (2.x exists; not needed), `@google-cloud/bigquery ^8.1.1`, `@google-cloud/storage ^7.14.0`, `google-auth-library ^10.6.2` (the version Vertex depends on, so there is one copy; `11.x` exists). `@ai-sdk/google-vertex ^5.0.108` follows the same AI SDK v7 line as `ai@7.0.92` (provider spec v4). Bumps are deliberate follow-ups.

### D7. Fail fast in production, lazy error in development
In production a missing key must stop the deploy (C D1). In development/test the service should still boot for work that never touches Google (auth, persistence UI) - first use throws `GcpNotConfiguredError` (HTTP 503 `Gemini is not configured`).

### D8. No ADC fallback, no `GEMINI_API_KEY`
Silent fallbacks hide misconfiguration (legacy GCS used ADC when the key was absent, which works on a dev laptop and fails in Connect). One path only; legacy variables are ignored with a boot warning; `GOOGLE_VERTEX_API_KEY` is refused because it changes the auth mode.

### D9. `GCP_VERTEX_LOCATION` default `us-central1`; `global` supported
Documentation shows the same models on regional and global endpoints (D1) so a regional default is safe and keeps data in-region; operators can pick `global` for availability. A single location serves all tiers; if the image model proves unavailable in a region the smoke test shows it and the open question is raised (no per-tier location variable until needed).

## Risks / Trade-offs

- R1. **Model availability/names** (`gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-flash-image`) in the chosen project/location - only provable live. Mitigation: the live smoke suite and `checkGcpReadiness` (manual step M5); defaults are overridable by env.
- R2. **Thought-signature compatibility** after switching providers. Mitigation: V5 (read fallback) + live two-step tool-call smoke with replayed history.
- R3. **`ai@7.0.92` pins `@ai-sdk/provider-utils 5.0.36` while Vertex needs 5.0.57**: npm may install two copies. Types are structural, but if `tsc` or runtime complains, bump `ai` within 7.0.x (verified latest 7.0.134) as a deliberate change. Task 2.2 runs `npm ls @ai-sdk/provider-utils` and records the outcome.
- R4. **Quotas/latency differ from the Developer API**: Vertex has per-project, per-region quotas and 429s; the legacy comments cite a measured 3 s step and 8.5 s digest. Mitigation: `global` location option, lite tier minimal thinking kept.
- R5. **Secret size**: a SA key is ~2.4 KB (3.2 KB Base64); Connect `securedConfiguration` value limits are not documented. Verified at first sandbox deploy (U); fallback: store the key as an encrypted Custom Object - not planned.
- R6. **Image model location**: some image preview models are location-restricted. Smoke test + open question.
- R7. **Token minting on cold start** adds ~200-500 ms to the first Gemini call; `GoogleAuth` caches tokens per process, not across instances.
- R8. **`GOOGLE_VERTEX_API_KEY` guard could surprise developers** who export it for other tools; message names the variable and the reason.

## Migration Plan

None (no stored state). Operators replace `GEMINI_API_KEY` by creating a service account (roles in D2), downloading its JSON key and exporting `GCP_SA_KEY_BASE64=$(base64 < key.json | tr -d '\n')`. Enable the Vertex AI, BigQuery and Cloud Storage APIs in the project (manual step M5; checked by `checkGcpReadiness`).

## Open questions

- Q-F1. (RESOLVED 2026-10-09, owner decision Q9) Every Google Cloud setting has a default and is configurable in `connect.yaml`; images default to `private` (backend-streamed). Mirrored as CQ6.
- Q-F2. Is `gemini-2.5-flash-image` available on Vertex in the chosen location, or should a newer image model replace it? Resolved by the smoke test; default keep.
- Q-F3. Should the `agent` tier default move to the 3.x family (one model for everything)? Default no (parity). CQ7.
- Q-F4. Connect secured-configuration value size limit for a 3.2 KB secret - verify at first deploy (not owner-only).

## Changelog

- 2026-10-09 (owner decision Q9): the `gcp` section now has a default for every key and exposes `vertexLocation` (renamed from `GCP_LOCATION`/`location`), `bigquery.{datasetId,location}` (always defined), `bucket.{name,location}` (name derived as `<project>-ai-assistant-images` when unset), `imageUrlMode` (`private` default | `public`; `signed` is rejected). No separate BigQuery project key (BigQuery and Storage use `gcp.projectId`). One credential only: `GCP_SA_KEY_BASE64` for Vertex text+image, BigQuery and Storage. Readiness (`checkGcpReadiness`) no longer treats a missing dataset/bucket as a failure; L's `checkGcpAnalytics()` reports and creates them.
- 2026-10-09 (owner decision Q11): confirmed that Anthropic and OpenAI providers are dropped permanently (Vertex Gemini only); wording in the proposal's out-of-scope list now says so; no task changes (the foundation gate script already rejects `ANTHROPIC_`, `OPENAI_API_KEY`, `openai` and `createAnthropic`).
