# Change C (c-service-foundation): implementation notes

## Summary

Branch `worktree-agent-ad602376b70ad4ebd` (reset to `develop`, which contains A and B, before starting). Everything in `tasks.md` is done and ticked except the items that need Docker (`commercetools connect validate`): 1.1, 6.2, V.3 (partly), and V.5 (the repo-wide SPDX check fails on B's files, see TODOs).

Built in `service/`: npm toolchain (`package-lock.json` only, Node `>=22 <25`), ESM-mode Jest, ESLint 8 with `no-console`, `no-explicit-any` and the `process.env` restriction outside `src/config/`; `readConfiguration()` with sections `server ctp auth persistence gcp llm cache providers`, `Secret<T>`, `parseAdminUserIds`, production guards; logger with correlation id, request context, error middleware, `requestUrlForLog`, memory cache, `createApp(config)`, `/service/status` + `/service/health`, 404, `getApiRoot()`, `scripts/check-foundation.mjs`, `scripts/smoke-start.mjs`, `README.dev.md`, `.env.example` with every key.

Results (all run in this worktree):
- `cd service && npm ci && npm run build && npm test` -> 13 suites, 101 tests pass.
- `npm run typecheck`, `npm run lint`, `npm run check:foundation` -> exit 0. Negative lint check: `process.env.FOO`, `console.log`, `: any` outside config each fail lint; `import 'dotenv'` fails the foundation gate.
- `npm run build && node scripts/smoke-start.mjs` -> `smoke OK` (built CJS output starts, `CTP_REGION` missing exits 1 naming the key).
- `commercetools connect application build` and `... test` (run from `service/`) -> exit 0, jest summary printed.
- `node scripts/check-connect-layout.mjs` -> `connect layout ok (4 applications)`; `node --test scripts/tests/*.test.mjs` -> 28 pass.
- `node scripts/check-repo-rules.mjs` -> ok. `node scripts/spdx-check.mjs` -> headers ok, license ok, but 6 NAME failures in B's frontends (see TODOs); `service/` is clean.
- Evidence: `plans/evidence/c/status.txt` (git-ignored) with `curl -i /service/status`.

Edits outside `service/` (told to keep these consistent): `connect.yaml` (added `CTP_REGION` as required standard configuration of `service`, fixed header comment), `scripts/check-connect-layout.mjs` (`CTP_REGION` removed from `INJECTED_KEYS`, added to `SERVICE_STANDARD`), `scripts/tests/check-connect-layout.test.mjs` (fixture gets `CTP_REGION`).

## Questions (for the owner)

1. `connect.yaml` still declares `CLOUD_IDENTIFIER` (default `gcp-us`) for `service` (from B). Design D3 says the service derives the cloud identifier from `CTP_REGION` and `MC_CLOUD_IDENTIFIER` is an optional override owned by D. Nothing in C reads `CLOUD_IDENTIFIER`. Should D rename it to `MC_CLOUD_IDENTIFIER` (optional, no default) or drop it? The checker tables pin the current name.
2. `ENCRYPTION_KEY` and `GCP_SA_KEY_BASE64` are `required: true` in `connect.yaml`, but `readConfiguration()` does not require them yet (E and F own that). Confirm that E/F make them required in production when they replace their sections.
3. Is a request log line of `ADMIN_USER_IDS is empty: no administrator` on every boot acceptable noise? It is as specified.

## Missed features / gaps found in the spec

- `connect.yaml`/B contradicts the plan: B's header comment and checker said never to declare `CTP_REGION`, while plan 02, C's design (P4) and C's spec say it is a standard configuration key. Fixed here (see Summary); B's notes should be corrected.
- `commercetools connect application build|test|start` in CLI 0.0.17 take no flags and no application name; they build the current directory and fail with `No package.json file found` from the repository root. Spec text (`--name service`, "from the repo root", task 6.2 "flags for service") is wrong; the working form is `cd service && commercetools connect application build`. Documented in `service/README.dev.md`. `commercetools connect validate` was run from the repo root and only failed on Docker.
- `plans/questions-inbox/CDEF-plan-amendments.md` (task 6.2 watch-out) does not exist in the repo; I had no `validate` gap to report anyway.
- Task 2.2 says "tests excluded in tsconfig.json" but B's layout has `tsconfig.json` (include `src`) plus `tsconfig.build.json`; kept B's two-file layout. ts-jest inherits `rootDir: src` from `tsconfig.json` even with an inline tsconfig object, so tests failed with TS6059 until `rootDir: '.'` was added to the inline Jest tsconfig. The spec's "copy legacy jest config unchanged" does not work as written.
- Task 2.1 installs `msw` unpinned: npm resolved 3.0.2, whose API differs from msw 2 (`server.listen({ onUnhandledFrame: 'error' })` instead of `onUnhandledRequest`). Later specs copying msw 2 snippets must adapt.
- Task 2.1 installs `eslint@^8` with `@typescript-eslint@^5`; both are end-of-life. Kept as written. `npm install` also reports audit findings (not triaged).
- Task 4.5 says to read `version` from `package.json` via `resolveJsonModule`: impossible with `rootDir: src` (and `__dirname` does not exist in the ESM Jest mode). Implemented by reading `package.json` from `process.cwd()` with `'unknown'` as fallback. Works when the process starts from `service/` (the Connect and `npm start` case).
- Spec section list includes `integrations`; task 3.4 and the verification list only name eight sections. I did not add an empty `integrations` section (nothing to parse yet); the registry in `src/config/sections/index.ts` takes it as one file plus one line when change I/K needs it.
- Design registry marks `LOG_HTTP`, `FEEDBACK_BODY_LIMIT`, `CACHE_*`, `MCP_HANDSHAKE_TIMEOUT_MS` as `std` (connect.yaml) but B's key list is exact and the checker rejects unknown keys. They are readable from the environment but not yet declared in `connect.yaml`, so an owner cannot set them in a Connect deployment. Plan 02 also lists `MC_APP_ENTRY_POINT_URI_PATH`, `CHAT_REQUEST_BUDGET_MS`, `CHAT_FINALIZE_RESERVE_MS`, `NIMBUS_MCP_ENABLED`, `GEMINI_AGENT_MODEL_NAME`, `GEMINI_IMAGE_MODEL_NAME` (B's note already flagged these). `MC_APP_ENTRY_POINT_URI_PATH` is parsed in `auth` but not declared. Declare them in `connect.yaml` and in the checker tables when the owning change needs them.
- The spec requires `getApiRoot()` to retry on "5xx"; the `ts-client` default retries only 503 and network errors, so I set `retryCodes: [500, 502, 503, 504]`. Retrying 500 on non-idempotent writes is a judgement call for E.
- `FEEDBACK_BODY_LIMIT` format validation (`^\d+(\.\d+)?\s*(b|kb|mb|gb)?$`) is my addition (a typo would otherwise be accepted and make body-parser throw per request).

## TODOs (skipped or unverifiable here)

- `commercetools connect validate` (tasks 1.1, 6.2, V.3): Docker daemon is not running (`Cannot connect to the Docker daemon`). The owner must run it. `application build` and `test` pass.
- `commercetools connect application start`: not run (the CLI has no flags and would occupy the terminal); `node build/index.js` is covered by the smoke test.
- `node scripts/spdx-check.mjs` exits 1 because of B's `@types-extensions/json-stable-stringify/package.json` in `mc-app`, `composed-apps`, `mc-view-app` (`BAD NAME` and `NOT PRIVATE`, 6 failures). Not my files, not edited. B/A should either exclude that path in the checker or rename/privatise the shim package.
- Live checks against a scratch commercetools project (Custom Objects, real token) were not done: no credentials. `api-root.spec.ts` uses msw.
- Connect injection of `PORT` is still unverified (Q-C1, first sandbox deploy in change U).
- `npm run start:dev` (tsx watch with `--env-file`) was not exercised; I ran the built output instead.
- Task 1.2 asked for `git checkout -b spec/c-service-foundation`; see Deviations.
- Unverified: Connect's own build (buildpacks) of the service; only the local `application build` was run.

## Deviations from the spec (with reason)

- Branch: stayed on the worktree branch `worktree-agent-ad602376b70ad4ebd` (harness-created) instead of `spec/c-service-foundation`.
- Package name stays `ai-assistant-service` (B's name accepted by A's checker, which expects `ai-assistant-<suffix>`) instead of `@commercetools-labs/ai-assistant-service`; `engines.node` is `>=22 <25` as in the spec.
- `tsconfig.json`/`tsconfig.build.json`: kept B's pair; `tsconfig.json` extends `@tsconfig/recommended` and now sets `inlineSourceMap`, `resolveJsonModule`. `start:dev` replaced `ts-node-dev` (removed) with `tsx watch --env-file=.env.local`.
- Root `.gitignore`: no change needed (A's file already ignores `.env`, `.env.*` and `!.env.example`; `git check-ignore` confirmed `service/.env.local` is ignored and `service/.env.example` is not). `service/.gitignore` from B still exists.
- `.env.example` keeps documented non-secret defaults (`GCP_VERTEX_LOCATION=us-central1`, `IMAGE_URL_MODE=private`, ...) instead of leaving every value empty; blank values are treated as unset by the parser, and no secret value is present (`check-repo-rules` passes). `CLOUD_IDENTIFIER` was dropped from it because nothing reads it (Question 1).
- `getCache()` (lazy singleton) replaces the legacy exported `cache` constant, because limits now come from the configuration, which is not readable at import time. `MemoryCache` takes `{ maxEntries, sweepMs, sweep }`; overwriting an existing key no longer evicts another entry.
- `CustomError`, `log-url.utils.ts`, `cache.types.ts` copied verbatim (plus SPDX header). `errorMiddleware` renders `statusCode` through `Number(...)` and fixes `messge`.
- Logger: no `rewriteFieldsFormatter` (design D5 mentions it, the task does not); the `Authorization` header is never logged anyway. `logger` level is read once at import (falls back to `info` while the configuration is invalid).
- No `withLoggerMiddleware()` on the API client (its default logger writes response bodies to stdout; the task said to remove it if so).
- Tests live under `tests/unit`, `tests/wire`, plus `tests/helpers` and `tests/setup.ts` (mutes the console transport, so test output is readable); `status.spec.ts` from B moved into `tests/wire/` and rewritten for the new body.
- `tasks.md` V.3/6.2 and 1.1 left unticked (Docker); V.5 left unticked because the repo-wide SPDX check fails on B's files.
