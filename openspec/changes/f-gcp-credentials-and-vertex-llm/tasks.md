## 0. Read first

- [ ] 0.1 Read `proposal.md`, `design.md` (Explore findings F1-F5, V1-V6, G1-G2, D1-D2; Decisions D1-D9), and the three specs in `specs/`.
- [ ] 0.2 Read the legacy files (read-only) under `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/`: `functional-agent/providers/{gemini-3,gemini,gemini-lite,gemini-2.5-flash-image}.ts` (the long header comments explain *why* each setting exists), `functional-agent/agents/definitions/image-generation.agent.ts` (lines 1-110), `services/bigquery.service.ts` (lines 55-135), `services/gcs.service.ts` (lines 1-60).
- [ ] 0.3 Skim the installed provider typings after step 1.2: `service/node_modules/@ai-sdk/google-vertex/dist/index.d.ts` (settings, lines 186-245) and `service/node_modules/@google/genai/dist/genai.d.ts` (`GoogleGenAIOptions`, ~3761).

You should now be able to explain: (a) why one Base64 JSON secret replaces API key + split SA variables; (b) what "express mode" is and why `GOOGLE_VERTEX_API_KEY` is refused; (c) the four tiers and which legacy agents use each; (d) why `countTokens` returns `0` on failure; (e) which provider-options namespace we use and why old conversations still work.

## 1. Setup

- [ ] 1.1 Confirm spec C is merged (`ls service/src/config/index.ts`), `cd service && npm test` green. Branch: `git checkout -b spec/f-gcp-credentials-and-vertex-llm`.
- [ ] 1.2 Install dependencies.
  ```bash
  cd service
  npm install @ai-sdk/google-vertex@^5.0.108 google-auth-library@^10.6.2 @google/genai@^1.30.0 @google-cloud/bigquery@^8.1.1 @google-cloud/storage@^7.14.0
  npm ls @ai-sdk/google-vertex google-auth-library @google/genai     # expect one version each
  npm ls @ai-sdk/provider-utils                                       # note whether 5.0.36 and 5.0.57 both appear (design R3)
  ```
  **Done when:** `npm run typecheck` still passes; if two `@ai-sdk/provider-utils` copies cause a type error later (task 3.1), bump `ai` within `7.0.x` (e.g. `npm install ai@7.0.134 --save-exact`) and record it in the PR.
  **Watch out:** do NOT install `@ai-sdk/google`, `@ai-sdk/anthropic`, `openai` directly.
- [ ] 1.3 Ask the owner for manual step **M5** now if not done (service-account JSON with the roles in design F/D2, `export GCP_SA_KEY_BASE64=$(base64 < key.json | tr -d '\n')` into `service/.env.local`). Sections 2-5 do not need it; section 6 does.

## 2. Credentials and configuration

- [ ] 2.1 Service-account key parser.
  **Why:** the only code allowed to touch the raw secret; errors must never leak it (spec `gcp-credentials`).
  **Where:** `service/src/gcp/service-account.ts` (new).
  **How:**
  ```ts
  export interface ServiceAccountKey { type: 'service_account'; project_id: string; client_email: string; private_key: string; private_key_id?: string; client_id?: string; token_uri?: string }
  export class ServiceAccountKeyError extends Error { constructor(readonly reason: Reason) { super(`GCP_SA_KEY_BASE64: ${reason}`); } }
  type Reason = 'empty' | 'not valid base64' | 'too large' | 'decoded value is not JSON' | 'decoded JSON is not an object'
    | `missing field "${string}"` | 'field "type" must be "service_account"' | 'client_email is not a service-account address' | 'private_key is not a PEM private key';
  export function parseServiceAccountKey(input: string): ServiceAccountKey {
    const compact = input.replace(/\s+/g, '');
    if (!compact) throw new ServiceAccountKeyError('empty');
    if (compact.length > 24_000) throw new ServiceAccountKeyError('too large');
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) throw new ServiceAccountKeyError('not valid base64');
    const text = Buffer.from(compact.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    let obj: unknown; try { obj = JSON.parse(text); } catch { throw new ServiceAccountKeyError('decoded value is not JSON'); }   // never use the caught error's message
    /* object check, required fields (names only), type, email, PEM prefix, normalise \\n, pick allowed fields */
  }
  ```
  Required fields: `type`, `project_id`, `client_email`, `private_key`. PEM prefix check: `/^-----BEGIN (RSA )?PRIVATE KEY-----/`. Normalise: if `!key.includes('\n') && key.includes('\\n')` -> `key.replace(/\\n/g, '\n')`.
  **Done when:** `tests/unit/gcp/service-account.spec.ts` passes: valid key; URL-safe + wrapped Base64; `\\n` normalisation; every reason in the closed list is reachable; a sentinel string embedded in the bad input (`SENTINEL-DO-NOT-LEAK`) is asserted absent from every error message and from `JSON.stringify(error)`.
  **Watch out:** `JSON.parse` errors quote the input in some Node versions - never forward them. Use a **fake** key generated in the test (`crypto.generateKeyPairSync('rsa', {modulusLength: 2048})` exported as PKCS8 PEM); never commit a real key.

- [ ] 2.2 `gcp` and `llm` config sections.
  **Where:** `service/src/config/sections/gcp.ts`, `service/src/config/sections/llm.ts` (replace C's placeholders; keep exported types `GcpConfig`, `LlmConfig`).
  **How:**
  ```ts
  export interface GcpConfig {
    serviceAccount?: Secret<ServiceAccountKey>;   // undefined only in development/test
    projectId?: string;                           // GCP_PROJECT_ID, else the key's project_id
    vertexLocation: string;                       // GCP_VERTEX_LOCATION, default 'us-central1'
    bigquery: { datasetId: string; location: string };      // defaults 'aiassistant', 'us-central1'
    bucket: { name?: string; location: string };             // name default `${projectId}-ai-assistant-images`; location default 'us-central1'
    imageUrlMode: 'private' | 'public';                      // IMAGE_URL_MODE, default 'private'
  }
  export interface LlmConfig { mainModel: string; agentModel: string; liteModel: string; imageModel: string; liteThinkingLevel: 'minimal'|'low'|'medium'|'high' }
  ```
  Rules from the spec: key required in production; `GOOGLE_VERTEX_API_KEY` present -> error `GOOGLE_VERTEX_API_KEY: must not be set (it switches Vertex to API-key mode)`; legacy variables present -> collect names for one boot warning (`config.warnings: string[]`, add this field to C's `AppConfig` in `config/types.ts` if missing; `index.ts` logs them); regexes for project, vertex location, dataset, bigquery location, bucket, bucket location; `IMAGE_URL_MODE` enum (`private`|`public`, anything else - including `signed` - is an error); `GCP_LOCATION` present -> boot warning that it is ignored (renamed `GCP_VERTEX_LOCATION`); derive `bucket.name` once the project id is known; model names `^[A-Za-z0-9._-]{3,100}$`; `GEMINI_LITE_THINKING_LEVEL` enum. Defaults: `gemini-3.8-flash`, `gemini-2.5-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-flash-image`, `minimal`, location `us-central1`.
  **Done when:** `tests/unit/gcp/config.gcp-llm.spec.ts` covers every scenario of `gcp-credentials` and `vertex-llm-models` that is configuration-only (defaults incl. dataset `aiassistant`, bigquery location `us-central1`, derived bucket name, `IMAGE_URL_MODE` default and rejection of `signed`, independent override, bad location, bad lite level, production-required, development-optional, express-mode guard, stale legacy variable warning, project override).
  **Watch out:** the parser must catch `ServiceAccountKeyError` and push `err.message` (already safe); any other error -> `GCP_SA_KEY_BASE64: could not be processed`.

- [ ] 2.3 `getGoogleCredentials()`.
  **Where:** `service/src/gcp/credentials.ts` (new).
  **How:**
  ```ts
  export class GcpNotConfiguredError extends CustomError { constructor(what = 'GCP_SA_KEY_BASE64') { super(503, `Google Cloud is not configured (${what})`); } }
  export function getGoogleCredentials() {
    const { gcp } = readConfiguration();
    if (!gcp.serviceAccount) throw new GcpNotConfiguredError();
    const k = gcp.serviceAccount.reveal();
    const credentials = { client_email: k.client_email, private_key: k.private_key };
    const projectId = gcp.projectId ?? k.project_id;
    return { projectId, location: gcp.vertexLocation, credentials,
      googleAuthOptions: { projectId, credentials, scopes: ['https://www.googleapis.com/auth/cloud-platform'] } };
  }
  ```
  **Done when:** `tests/unit/gcp/credentials.spec.ts`: values correct; missing key -> `GcpNotConfiguredError`; the returned object is never logged (spy on `logger`).

## 3. Models

- [ ] 3.1 Model factory and provider options.
  **Why:** replace four legacy provider modules with one tiered factory (spec `vertex-llm-models`).
  **Where:** `service/src/llm/models.ts`, `service/src/llm/provider-options.ts`, `service/src/llm/index.ts` (new). Legacy: the four `providers/*.ts` named in 0.2.
  **How:**
  ```ts
  import { createVertex } from '@ai-sdk/google-vertex';
  export type ModelTier = 'main' | 'agent' | 'lite' | 'image';
  let provider: ReturnType<typeof createVertex> | undefined;
  const vertex = () => (provider ??= (() => { const c = getGoogleCredentials(); return createVertex({ project: c.projectId, location: c.location, googleAuthOptions: c.googleAuthOptions }); })());
  export const getModelName = (t: ModelTier) => ({ main: cfg.mainModel, agent: cfg.agentModel, lite: cfg.liteModel, image: cfg.imageModel })[t];
  export const getModel = (t: ModelTier) => vertex().languageModel(getModelName(t));
  export function getProviderOptions(t: ModelTier) {
    switch (t) {
      case 'main':  return { vertex: { thinkingConfig: { thinkingLevel: 'high', includeThoughts: true } } };
      case 'agent': return { vertex: { thinkingConfig: { thinkingBudget: -1, includeThoughts: true } } };
      case 'lite':  return { vertex: { thinkingConfig: { thinkingLevel: cfg.liteThinkingLevel } } };
      case 'image': return undefined;
    }
  }
  export const resetLlmForTests = () => { provider = undefined; };
  ```
  Type `getProviderOptions` against `GoogleGenerativeAIProviderOptions`-equivalent from `@ai-sdk/google-vertex` if exported, else a local `ProviderOptions` type from `ai` (`import type { ProviderOptions } from '@ai-sdk/provider-utils'` - check the actual export path in the installed typings). Add the `lite` tier comment about `includeThoughts` from legacy `gemini-lite.ts:68-73` and the image comment from `image-generation.agent.ts:30-57`.
  **Done when:** `tests/unit/llm/models.spec.ts` (mock `@ai-sdk/google-vertex` with `jest.unstable_mockModule`): `createVertex` called once with the project/location/auth options; tier names and defaults; independent override; each provider-options object equals the spec; `image` is `undefined`; unconfigured -> `GcpNotConfiguredError`.
  **Watch out:** the legacy `thinkingBudget` for `agent` is a 2.5-era control; Gemini 3.x ignores or rejects it - it is only valid while the `agent` model is a 2.5 model (comment this next to the default).

- [ ] 3.2 `countTokens`.
  **Where:** `service/src/llm/count-tokens.ts`. Legacy: the `countTokens` functions in `providers/gemini*.ts`.
  **How:**
  ```ts
  let ai: GoogleGenAI | undefined;
  const client = () => (ai ??= (() => { const c = getGoogleCredentials(); return new GoogleGenAI({ vertexai: true, project: c.projectId, location: c.location, googleAuthOptions: c.googleAuthOptions }); })());
  export async function countTokens(text: string, tier: ModelTier = 'agent'): Promise<number> {
    try { const r = await client().models.countTokens({ model: getModelName(tier), contents: text }); return r.totalTokens ?? 0; }
    catch (error) { logger.error('countTokens failed', { tier, error: describeError(error) }); return 0; }  // never log `text`
  }
  ```
  `describeError` returns `name` + message truncated to 200 chars and with any `private_key`-looking substrings removed (reuse the helper from spec C if one exists; else a 5-line regex on `-----BEGIN`).
  **Done when:** `tests/unit/llm/count-tokens.spec.ts`: mocked `GoogleGenAI` constructed once with `vertexai: true` and the shared options; returns `totalTokens`; rejects -> `0` and the log call arguments do not contain the input text.

- [ ] 3.3 Model plumbing for later specs.
  **Where:** `service/src/llm/index.ts` re-exports `getModel`, `getModelName`, `getProviderOptions`, `countTokens`, `ModelTier`; put JSDoc on each export (documentation proper goes to spec W) naming the legacy consumers from design F2 (which legacy agents use which tier), so H can map them.
  **Done when:** `npm run typecheck` passes and a `tests/unit/llm/exports.spec.ts` asserts the export names (guards the contract used by G/H/L).

## 4. Clients and readiness

- [ ] 4.1 BigQuery and Storage clients.
  **Where:** `service/src/gcp/clients.ts` (new). Legacy: `services/bigquery.service.ts:85-125`, `services/gcs.service.ts:17-47`.
  **How:**
  ```ts
  let bq: BigQuery | undefined; let storage: Storage | undefined;
  export const getBigQueryClient = () => (bq ??= (() => { const c = getGoogleCredentials(); const loc = readConfiguration().gcp.bigquery.location;
    return new BigQuery({ projectId: c.projectId, credentials: c.credentials, location: loc }); })());
  export const getStorageClient = () => (storage ??= (() => { const c = getGoogleCredentials(); return new Storage({ projectId: c.projectId, credentials: c.credentials }); })());
  export function requireBucketName(): string { getGoogleCredentials(); /* throws GcpNotConfiguredError without a key */ return readConfiguration().gcp.bucket.name!; }   // derived `${projectId}-ai-assistant-images` when GCP_BUCKET_NAME is unset
  export const getDatasetId = () => readConfiguration().gcp.bigquery.datasetId;
  ```
  **Done when:** `tests/unit/gcp/clients.spec.ts` (module mocks): constructor arguments carry `credentials` and never `keyFilename`; singletons; `requireBucketName` returns the derived name `<project>-ai-assistant-images` (and the explicit one when set) and throws `GcpNotConfiguredError` without a key; a combined test asserts that Vertex, `GoogleGenAI`, BigQuery and Storage were all constructed from values equal to `getGoogleCredentials()` (spec "one source of truth").
  **Watch out:** the BigQuery `location` constructor option sets the default *job* location; spec L still passes `location` per query like the legacy code (line 245).

- [ ] 4.2 `checkGcpReadiness`.
  **Where:** `service/src/gcp/readiness.ts`.
  **How:** sequential checks, each wrapped in try/catch returning `{ name, ok, detail }` with fixed detail strings (`'ok'`, `'access token could not be minted'`, `'countTokens failed'`, ...). `decode` = config present; `token` = `new GoogleAuth(c.googleAuthOptions).getAccessToken()` truthy; `vertex` = `countTokens('ping','main') > 0` (note the `0` contract: treat 0 as failure here); when `deep`: BigQuery `createQueryJob({ query: 'SELECT 1', dryRun: true, location })` and `getStorageClient().bucket(name).exists()`.
  **Done when:** `tests/unit/gcp/readiness.spec.ts` with mocks for pass and fail paths; assert no detail contains the fake token or `private_key`.
  **Watch out:** spec U's `postDeploy` calls this; it must never throw and must finish within ~15 s (add per-check `Promise.race` timeout of 8 s).

## 5. Removal and gates

- [ ] 5.1 Gate script rules.
  **Where:** extend `service/scripts/check-foundation.mjs` (from C).
  **How:** fail when `src/` contains `GEMINI_API_KEY|createGoogleGenerativeAI|createAnthropic|CLAUDE_API_KEY|OPENAI_API_KEY|ANTHROPIC_|GCP_SERVICE_ACCOUNT_|secrets\.utils|GOOGLE_APPLICATION_CREDENTIALS` (allow-list the two config files that *name* the legacy variables for the boot warning and the `GOOGLE_VERTEX_API_KEY` guard), or `package.json` has `@ai-sdk/google`, `@ai-sdk/anthropic` or `openai` in `dependencies`.
  **Done when:** `npm run check:foundation` exits 0; adding `import OpenAI from 'openai'` to a scratch file makes it exit 1.

- [ ] 5.2 Environment example.
  **Where:** `service/.env.example` (C created it).
  **How:** add the F keys with comments: `GCP_SA_KEY_BASE64=` (how to create: `base64 < key.json | tr -d '\n'`), `GCP_PROJECT_ID=`, `GCP_VERTEX_LOCATION=us-central1`, `GEMINI_MODEL_NAME=`, `GEMINI_AGENT_MODEL_NAME=`, `GEMINI_LITE_MODEL_NAME=`, `GEMINI_IMAGE_MODEL_NAME=`, `GEMINI_LITE_THINKING_LEVEL=minimal`, `GCP_BIGQUERY_DATASET_ID=aiassistant`, `GCP_BIGQUERY_LOCATION=us-central1`, `GCP_BUCKET_NAME=`, `GCP_BUCKET_LOCATION=us-central1`, `IMAGE_URL_MODE=private`. Secrets and project/bucket names stay empty. Do not copy legacy `.env.example` comments verbatim if they mention internal hosts or project ids.
  **Done when:** `grep -E "AIza|BEGIN PRIVATE|@.*gserviceaccount" service/.env.example` returns nothing.

## 6. Live verification (manual step M5 required)

- [ ] 6.1 Live smoke suite.
  **Where:** `service/tests/integration/gcp.smoke.spec.ts` (uses `jest.integration.config.cjs` created by spec E task 7.1; if E is not merged yet, create the same file here and E will reconcile).
  **How:** `const live = Boolean(process.env.GCP_SA_KEY_BASE64); const d = live ? describe : describe.skip;` then tests, each with a 60 s timeout:
  1. `token`: `checkGcpReadiness({deep:false})` -> `ok`.
  2. `main`: `generateText({ model: getModel('main'), providerOptions: getProviderOptions('main'), prompt: 'Reply with the single word OK.' })` -> text non-empty.
  3. `agent`, `lite`: same per tier.
  4. `image`: `generateText({ model: getModel('image'), prompt: 'A small red square on white background.' })` -> `result.files.some(f => f.mediaType.startsWith('image/'))`.
  5. `count`: `countTokens('hello world')` -> `> 0`.
  6. `tool-continuity`: a `ToolLoopAgent` (or two `generateText` calls) on `main` with one trivial tool (`add(a,b)`), then replay `response.messages` as history with a follow-up question -> succeeds, no error mentioning "signature".
  7. `bigquery` (only if `GCP_BIGQUERY_DATASET_ID` or project configured): dry-run `SELECT 1`.
  8. `storage` (only if the effective bucket exists): `bucket.exists()` -> `[true]` (skipped when the bucket does not exist yet).
  **Done when:** without the key `npm run test:integration` reports the suite skipped (exit 0); with the key all applicable tests pass.
  **Watch out:** these tests spend a few cents; keep prompts tiny. Never print `result.response.body` (could contain request echoes) - assert only on derived values.

- [ ] 6.2 Run and record.
  **Do:** with M5 done run `npm run test:integration -- gcp.smoke`. If a model name or the image model fails in the chosen location, set the env override, re-run, and amend defaults/decision D9/Open question Q-F2 via `/opsx:update f-gcp-credentials-and-vertex-llm` (note it in a `## Changelog` section).
  **Done when:** a results table (tier, model name, location, pass/fail) is added to `design.md` as Appendix A.

## Last: Verification

- [ ] V.1 Unit tests (`cd service && npm test`): `tests/unit/gcp/{service-account,config.gcp-llm,credentials,clients,readiness}.spec.ts`, `tests/unit/llm/{models,count-tokens,exports}.spec.ts`.
- [ ] V.2 Live (needs M5): `npm run test:integration -- gcp.smoke` (tests `token`, `main`, `agent`, `lite`, `image`, `count`, `tool-continuity`, `bigquery`, `storage`).
- [ ] V.3 `npm run typecheck && npm run lint && npm run check:foundation && npm run build`; `commercetools connect application test` exit 0; `commercetools connect validate` exit 0 (confirm `connect.yaml` lists `GCP_SA_KEY_BASE64` under `securedConfiguration` and none of the removed variables).
- [ ] V.4 Secret hygiene check: run the service with a fake valid-shaped key and `LOG_LEVEL=debug`, hit `/service/status`, and `grep -c "BEGIN PRIVATE KEY" <captured stdout>` -> `0`.
- [ ] V.5 Chrome E2E: none for this spec; `E2E-H-*` (chat streams a reply) and `E2E-L-*` (image appears) are the user-visible proofs and must reference this smoke suite as precondition.
- [ ] V.6 Definition of Done (`plans/04-workflow.md` section 4): SPDX headers, no `console.log`, no `any`, no tenant words.

## Docs to update (for spec W)

- Google Cloud setup guide (M5): create project, enable `aiplatform.googleapis.com`, BigQuery and Storage APIs, create the service account with `roles/aiplatform.user`, `roles/bigquery.dataEditor`, `roles/bigquery.jobUser`, `roles/storage.objectAdmin` (bucket-scoped, bucket pre-created) or `roles/storage.admin` on the project (lets the service create the bucket), create a key, `base64 < key.json | tr -d '\n'`, set `GCP_SA_KEY_BASE64`; rotate by redeploying with a new value; never commit the key.
- Configuration reference rows: all F keys with defaults (`GCP_PROJECT_ID`, `GCP_VERTEX_LOCATION`, `GCP_BIGQUERY_*`, `GCP_BUCKET_*`, `IMAGE_URL_MODE`); table of the four tiers, their legacy agents and thinking settings; `GCP_VERTEX_LOCATION` guidance (`us-central1` vs `global`, residency caveat).
- Troubleshooting: "GCP_SA_KEY_BASE64: ..." messages, 403 from Vertex (missing role/API), 404 model not found in location, `GOOGLE_VERTEX_API_KEY` refusal.
- Architecture: one credential for Gemini, BigQuery and GCS; no API-key path; Vertex billing/quotas.
