# Change F (f-gcp-credentials-and-vertex-llm): implementation notes

## Summary

Branch `worktree-agent-a9e6e66fe87192e19` (reset to `develop` with A, B, C first). Everything in `tasks.md` is done and ticked except 1.3, 6.2, V.2 (need the owner's service-account key, manual step M5) and V.3 (`commercetools connect validate` needs Docker).

Built in `service/`:
- `src/gcp/service-account.ts` (closed-list key parser), `credentials.ts` (`getGoogleCredentials`, `GcpNotConfiguredError`), `clients.ts` (BigQuery/Storage singletons, `requireBucketName`, `getDatasetId`), `readiness.ts` (`checkGcpReadiness`, 8 s per check, never throws).
- `src/llm/{models,provider-options,count-tokens,index}.ts`: four tiers `main|agent|lite|image` on `createVertex`, thinking options under the `vertex` namespace, `countTokens` via `@google/genai` with `vertexai: true` (0 on error).
- `src/config/sections/{gcp,llm}.ts` replaced (new `GcpConfig`/`LlmConfig`); `index.ts` logs `config.gcp.warnings`.
- `scripts/check-foundation.mjs` extended; `.env.example` updated; `jest.integration.config.cjs` + `npm run test:integration`; `tests/integration/gcp.smoke.spec.ts` (skipped without the key).
- `connect.yaml`, `scripts/check-connect-layout.mjs` and its test fixture: added `GEMINI_AGENT_MODEL_NAME`, `GEMINI_LITE_THINKING_LEVEL`, `GEMINI_IMAGE_MODEL_NAME` (all standard, defaulted) consistently.

Commands run (all in this worktree):
- `cd service && npm ci && npm run build && npm test && npm run lint` -> build ok; 21 suites, 173 tests pass; lint clean. `npm run typecheck`, `npm run check:foundation` -> ok. `node scripts/smoke-start.mjs` -> `smoke OK`.
- Negative gate check: a scratch file with `import OpenAI from 'openai'` makes `check:foundation` exit 1 (file removed afterwards).
- `npm run test:integration` without a key -> 1 suite skipped, 9 tests skipped, exit 0.
- `commercetools connect application test` (from `service/`) -> success.
- `node scripts/check-connect-layout.mjs` -> ok (4 applications); `node --test scripts/tests/*.test.mjs` -> 28 pass; `node scripts/spdx-check.mjs` -> ok; `node scripts/check-repo-rules.mjs` -> ok.
- V.4 secret hygiene: built service started with a freshly generated fake key and `LOG_LEVEL=debug`, `GET /service/status` -> 200; `BEGIN PRIVATE KEY` count 0, Base64 key absent; the only GCP log line is the stale `GEMINI_API_KEY` warning (name, no value).

## Questions (for the owner)

1. M5: please provide the service-account key (roles in design D2) so tasks 6.2/V.2 can run: model availability of `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-flash-image` in `us-central1`, thought-signature replay, image output.
2. Is the defaults-as-named model list still right? The names are copied from the spec (they could not be validated without the key).
3. Should `GCP_SA_KEY_BASE64` stay `required: true` in `connect.yaml` given that development/test allow it to be absent? Kept as is (production semantics).

## Missed features / gaps found in the spec

- Two copies of `@ai-sdk/provider` / `provider-utils` made `tsc` fail in the smoke test (`getModel()` result not assignable to `generateText`'s `model`): design R3 happened. `ai@7.0.134` (the version the task suggests) still left two copies (provider 4.0.25 vs 4.0.26), `ai@7.0.136` (latest 7.0.x) gives exactly one of each. `package.json` now pins `ai` to `7.0.136` (exact). The spec/task text should name 7.0.136, not 7.0.134.
- `@google-cloud/storage@7` pulls `google-auth-library@9` while everything else uses 10: two copies of google-auth-library remain (Storage's own). Harmless at runtime, noted for later dependency hygiene.
- `@ai-sdk/google-vertex` pulls `@ai-sdk/google`, `@ai-sdk/anthropic` and `@ai-sdk/openai-compatible` as transitive dependencies. The gate only forbids them as direct dependencies, so it passes; but "no `@ai-sdk/anthropic` anywhere" cannot be literally true in `node_modules`.
- The task text says `GcpConfig` boot warnings go to a new `config.warnings` on `AppConfig`. C's pattern puts warnings inside the section (`providers.warnings`), so I added `gcp.warnings`. See Deviations.
- Spec max size is 16 KiB for the Base64 value, task 2.1 code says 24_000. Spec wins (16 KiB; a real key is about 3.2 KB).
- Task 3.1 suggests typing provider options from a package export; `ai` does not export `ProviderOptions` by name. I derive it from `generateText`'s parameters.
- C's tests created production-mode configs without a key (`error.middleware.spec`, `config.guards.spec`) and used non-key strings as `GCP_SA_KEY_BASE64` (`config.providers.spec`, `status.spec`). They fail once F validates the key; I updated them to use the fake key helper. B's `connect.yaml` also lacked the three new model keys (see Summary).
- The spec says storage readiness maps a 403 to ok with a role hint; the spec lists 4 detail strings only for failures, so the failure details (`access token could not be minted`, `countTokens failed`, `dry-run query failed`, `bucket check failed`, `timed out`, `service-account key is not configured`) are my own fixed strings.

## TODOs

- Tasks 1.3, 6.2, V.2: live smoke run with a real key (M5); then add the results table (tier, model, location, pass/fail) as Appendix A in `design.md` and re-check decision D9 / open question Q-F2 (image model availability in the chosen location).
- V.3: `commercetools connect validate` was not run: Docker daemon is not running (`Cannot connect to the Docker daemon`). `application test` passes.
- Q-F4: Connect's size limit for a 3.2 KB secured configuration value is unverified (first sandbox deploy, change U).
- `checkGcpReadiness` is not yet called from `connector/post-deploy.ts` (change U owns that script).
- The smoke test's tool-continuity and image assertions have never run live; their exact shape (e.g. `result.files`) is typechecked only.
- npm reports audit findings after install (not triaged, as in C).

## Deviations from the spec (with reason)

- Branch: stayed on the harness-created worktree branch instead of `spec/f-gcp-credentials-and-vertex-llm`.
- Warnings: `gcp.warnings: string[]` inside the section (and `src/index.ts` logs it) instead of a global `config.warnings`; follows the existing `providers.warnings` pattern and avoids editing C's shared `AppConfig` types that D/E also touch.
- `ai` pinned exactly to `7.0.136` (not 7.0.134, not a caret range), see gaps.
- Key size limit 16 KiB per the spec (task snippet said 24_000).
- `GcpConfig.serviceAccount` is `Secret<ServiceAccountKey>` as in the task, and `projectId`/`bucket.name` are derived inside the parser so `readConfiguration()` already returns the final values; `requireBucketName()` therefore only reads config.
- `tests/helpers/use-env.ts` (new) lets modules that call `readConfiguration()` read a controlled `process.env` in unit tests; it deletes `GCP_*`/`GEMINI_*`/`GOOGLE_*` variables first so the developer's shell cannot leak in.
- `jest.config.cjs` now ignores `tests/integration/` and a new `jest.integration.config.cjs` runs them (task said E creates the latter; E was not merged, so F created it, as the task allows). E may need to reconcile.
- `check-foundation.mjs` allow-lists only `src/config/sections/gcp.ts` (the task said "the two config files"; only one file names the legacy variables).
- Smoke test `storage` case: when the bucket does not exist or is not inspectable it passes without assertions rather than being skipped at runtime (jest cannot skip dynamically in a plain `it`).
