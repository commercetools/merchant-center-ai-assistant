# Change E (e-persistence-custom-objects): implementation notes

## Summary

Branch `worktree-agent-a0f0f6a50116cac4a` (reset to `develop`, which has A, B, C). Sections 0-6 of `tasks.md` are done and ticked. Section 7 (live verification) is written but could not be run (no credentials).

Built in `service/src/`:
- `config/sections/persistence.ts` (new `PersistenceConfig`: `concurrency`, `settingsCacheTtlMs`, `encryptionKey: Secret<Buffer>`, `previousEncryptionKeys`; strict base64-32-byte validation; `ENCRYPTION_KEY` is now required in all environments), `config/runtime.ts` (`isProductionEnv`).
- `crypto/{keys,envelope}.ts`: AES-256-GCM, 12-byte IV, `kid`, aad `kind|aad`, fixed-message errors.
- `persistence/gateway/`: `types`, `errors`, `query` (structured filters compiled to input variables), `retry`, `concurrency` (`mapBounded`), `cas` (`updateWithRetry`, `SKIP`), `size`, `custom-object.gateway` (the only file calling `customObjects()`), `memory.gateway`.
- `persistence/`: `names`, `limits`, `types/*` (codecs), `stores/{settings,suggestion,session,message,token,feedback}.store.ts`, `feedback/chunks.ts`, `create-persistence.ts` (`createPersistence`, `getPersistence`, `deleteSessionCascade`), `index.ts`, `maintenance.ts` (purge + reencrypt logic).
- `middleware/error.middleware.ts`: `mapPersistenceError` (generic fixed messages).
- `service/scripts/{purge-containers,reencrypt}.mjs`, npm scripts `persistence:purge`, `persistence:reencrypt`, `test:integration`.
- connect.yaml + checker + checker test: added `PERSISTENCE_CONCURRENCY`, `SETTINGS_CACHE_TTL_MS` (standard, defaults 8 / 5000) and `ENCRYPTION_KEY_PREVIOUS` (secured, optional). `service/.env.example` updated.

Commands run (all in this worktree):
- `cd service && npm ci && npm run build && npm test` -> build ok; 34 suites, 265 tests pass (was 13 suites / 101 tests).
- `npm run lint` -> 0 errors, 0 warnings. `npm run typecheck` ok. `npm run check:foundation` -> ok. `node scripts/smoke-start.mjs` -> `smoke OK` (smoke script now sets a valid test `ENCRYPTION_KEY`).
- `commercetools connect application test` (from `service/`) -> exit 0.
- `npm run test:integration` without `.env.local` -> `3 skipped, 20 tests skipped`, exit 0.
- Root: `node scripts/check-connect-layout.mjs` ok (4 applications), `node --test scripts/tests/*.test.mjs` 28 pass, `node scripts/spdx-check.mjs` ok, `node scripts/check-repo-rules.mjs` ok.
- V.4 greps: no `firestore|tenant` in `src/persistence` / `src/crypto`; `customObjects()` appears only in `custom-object.gateway.ts`.

## Questions (for the owner)

1. Create races (see gap G-E1): is it acceptable that the very first write of a never-written object (settings, session create) is an upsert, so two truly simultaneous first writers can lose one update? Or should we find a platform way to make create-only (probe `P-create-version-zero` records whether `version: 0` helps)?
2. aad for the stored OAuth client envelope (`identity-client`) is not defined by the spec. I used the constant `IDENTITY_CLIENT_AAD = 'default'` (in `maintenance.ts`). Change I must use the same value; confirm or choose another.
3. Is a project-wide sweep cost of `listByUser` (flag filtering in memory after reading up to 10 000 rows for a user with many sessions) acceptable? Benchmark 7.4 decides.

## Missed features / gaps found in the spec

- G-E1 Create races. The spec says creation races "surface as `ConflictError` from the platform". The documented POST behaviour is only: a given version must match an existing object, and truly concurrent updates give `ConcurrentModification`. A POST without a version on a missing object is an upsert, so two readers that both saw "absent" both write and the second silently overwrites the first. Consequences: `SessionStore.create` "ConflictError if exists" holds for sequential calls only; the first write of the settings object can lose an update; `createAuthState` is unaffected (unique hashed keys). `MemoryObjectGateway` deliberately mirrors the documented platform (no conflict on versionless put). Probe `P-create-version-zero` records what `version: 0` does.
- The spec test "Two updaters both win" and tasks 4.2 test "partial concurrent updates" are only true once the object exists; my tests create it first (documented in the test).
- `design.md` D3 says to re-sort the whole result by `(timestamp, key)`; that would move an upserted message (its timestamp changes, createdAt does not) and contradict the spec scenario "position does not change". Implemented as: server `createdAt` first, ties broken by `timestamp`, then id.
- Task 3.2 `compileQuery` snippet builds the nested path with a confusing `reduceRight`; rewrote it plainly. `keyIn` needs `vars` values of type `string[]`, so `CompiledQuery.vars` is `Record<string, string | string[]>`.
- Spec/task text keeps both `ValidationError` (task 4.2) and `SessionTooLongError` (spec) without listing them in the error list of 3.1; added both to `gateway/errors.ts`.
- Task 4.4 says `SessionStore.update` should always set `updatedAt`; `touch` therefore writes an identical value with a new `updatedAt`. It relies on the platform bumping `lastModifiedAt` on every write (probe `P-created` checks it for replace).
- Task 6.3 purge cannot discover per-session or per-feedback containers whose parent object is already gone (no container listing endpoint is used). Documented in the function comment.
- The spec says the 15 s timeout applies to requests; the SDK `execute()` takes no abort signal, so the timeout stops waiting but does not cancel the HTTP request.
- Double retry layer: C's `buildClient` retries 500/502/503/504 inside the SDK (3 times) and the gateway retries 429/502/503/504 again (3 times), up to 12 attempts on a persistent 503. Also, the SDK retrying a 500 on a write contradicts "a 500 on a write must not be retried blindly". For upsert writes this is harmless; for delete-with-version it could turn a succeeded-but-500 claim into `unknown` (user retries login). Suggest C/E agree to set `enableRetry: false` in `buildClient` now that the gateway owns retries (C's test `retries a 503` would change). Not done: other change's file.
- The SDK reports an infrastructure answer with an empty body (for example a bare 503) as `{ body: null, error: NetworkError }` without status; `describeError` treats this as transient.
- `PERSISTENCE_DRIVER` is not in `connect.yaml` (as required). `PERSISTENCE_CONCURRENCY` / `SETTINGS_CACHE_TTL_MS` / `ENCRYPTION_KEY_PREVIOUS` were not listed in B's key set; added them (checker and its test edited consistently).

## TODOs

- Section 7 and V.2: run `npm run test:integration` (contract, probes) and `PERF=1 npm run test:integration -- perf.sessions` against a scratch project with `service/.env.local` (manual step M3), then fill Appendix C of `design.md` (task 7.5, via `/opsx:update`). Tasks 7.2, 7.3, 7.4, 7.5, V.2 are therefore unticked. Probes written: `P-charset`, `P-created`, `P-409`, `P-create-version-zero` (new), `P-claim`, `P-list-after-write`, `P-var` (+ numeric variable typing), `P-keyin`, `P-sort`, `P-order`, `P-null`, `P-size`, `P-offset`/`P-limit`, `P-total`.
- Until `P-var-types` is known, numbers and booleans are written inline in the predicate (validated), only strings travel as input variables.
- `commercetools connect validate` (V.3) not run: Docker is not available. `connect application test` and `build` were run.
- Task 1.2 (branch `spec/e-persistence-custom-objects`) not done: stayed on the harness worktree branch.
- Task 1.4/M3: the owner has to provide the scratch project and credentials.
- V.5: the spec asks to add a note to the `tasks.md` of G, I and N; those are other changes' artifacts, so not edited. Wording for them: "created Custom Objects are described in change E design.md Appendix A; list with `GET /custom-objects/ai-assistant-sessions`".
- Change I must use `encryptJson('identity-tokens', tokens, userId)`, `encryptJson('identity-verifier', verifier, stateKey(state))` and `encryptJson('identity-client', client, IDENTITY_CLIENT_AAD)` so that `reencryptAll` can rotate them.
- Other changes that build a full `AppConfig` for tests must now supply a valid `ENCRYPTION_KEY` (`tests/helpers/env.ts` `baseEnv` does; I edited two existing tests, `config.providers.spec.ts` and `wire/status.spec.ts`, which used invalid literals).

## Deviations from the spec (with reason)

- Branch: harness worktree branch instead of `spec/e-persistence-custom-objects`.
- `PersistenceConfig` field names are `concurrency`, `settingsCacheTtlMs`, `encryptionKey`, `previousEncryptionKeys` (C had `encryptionKeyPrevious`; nothing used it).
- `isProductionEnv()` added in `src/config/runtime.ts` because the memory gateway must refuse production but the lint rule forbids `process.env` outside `src/config/`.
- `Persistence` also exposes `gateway` (maintenance scripts and tests need it); not in Appendix B.
- `updateWithRetry` returns `{ value, object, written }` (extra `written` flag used by `putTokens` and re-encryption) and its generic is typed `V | null`.
- `MemoryObjectGateway` strips `null` members itself (JSON round trip alone keeps `null`); array elements keep `null`, as in `partsJson` use.
- jest: `tests/integration/` is excluded from `npm test` (`jest.config.cjs`) and run through `jest.integration.config.cjs`, which loads `.env.local` with `process.loadEnvFile` instead of `node --env-file` (so a missing file is not an error).
- Gateway timeout implemented with `Promise.race` (no abort signal available), see gaps.
- Snapshot payload may be an empty string for an empty message (kept from legacy); relies on the platform storing empty strings (not probed).
- Task 3.4 contract: `withTransportRetry` takes total tries (`attempts` = 3) rather than extra retries; "up to 3 times" in the spec is read as 3 total tries.
