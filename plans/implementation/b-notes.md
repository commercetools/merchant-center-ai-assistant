# Change B (b-connect-skeleton): implementation notes

## Summary

Done on branch `worktree-agent-a48fe969e4cbde169` (fast-forwarded to `develop` first, because the worktree started before the plans existed).

- `connect.yaml` with the header comment, four `deployAs` entries (service, mc-app, composed-apps, mc-view-app) and top-level `inheritAs.apiClient.scopes`.
- `service/` Express stub (`GET /service/status`), lifecycle stubs, `.env.example`, `package-lock.json`. `npm ci && npm run build && npm test` gives `Tests: 2 passed`; post-deploy/pre-undeploy stubs exit 0.
- `mc-app/`, `composed-apps/`, `mc-view-app/` stubs, all `@commercetools-frontend/*` pinned to exactly 27.9.6, React 19.0.0, yarn lockfile per folder. `yarn typecheck`, `yarn lint` and `yarn build` (with `.env.example` exported) pass in each; `public/index.html` is created.
- `scripts/check-connect-layout.mjs` (+ `scripts/package.json`, lockfile unused/ignored, `scripts/tests/check-connect-layout.test.mjs`): `node scripts/check-connect-layout.mjs` prints `connect layout ok (4 applications)`; the 12 new tests pass.
- `openspec validate b-connect-skeleton --strict` is valid.
- SPDX three-line banner added by hand to every `.ts/.tsx/.js/.mjs/.cjs` I created or copied (grep confirms none missing); no `console.*` left; no `ngrok`, `run.app` or tenant words.

## Questions (for the owner)

1. Task 5.1/5.2: should `scripts/package.json` be owned by A or B? Both specs mention it; I created it (name `ai-assistant-scripts`, `"type": "module"`, dependency `yaml ^2.5.0`). A's junior may create a conflicting file at the same path, so expect a merge conflict to resolve (keep a union of dependencies).
2. BQ1: model ids `gemini-3.8-flash` / `gemini-3.5-flash-lite` are copied unverified from the legacy `.env.example`; F must confirm they exist on Vertex.
3. D-B3 (npm for the service, yarn for frontends): kept as written. Veto now if you prefer one tool.
4. Entry point defaults `ai-assistant` / `ai-assistant-pages` (BQ3) are only used in `.env.example`; owner chooses the real unique values when registering (M6/M7).

## Missed features / gaps found in the spec

- `plans/02-target-architecture.md` section 2 lists service keys that B's spec and `connect.yaml` do not have: `MC_APP_ENTRY_POINT_URI_PATH`, `CHAT_REQUEST_BUDGET_MS`, `CHAT_FINALIZE_RESERVE_MS`, `NIMBUS_MCP_ENABLED`, `GEMINI_AGENT_MODEL_NAME`, `GEMINI_IMAGE_MODEL_NAME`. B's spec says the key list is exact, so I did not add them. Later changes (C, F, H, K) must add them to `connect.yaml` and to the checker tables `SERVICE_STANDARD` in `scripts/check-connect-layout.mjs` (the checker rejects unknown keys on purpose).
- Spec text says "Wrong endpoint mount is caught by test" and the `/status` 404 test: done. But the spec never says what the `service/tests` jest `testMatch` must exclude; I used `**/tests/**/*.spec.ts` only.
- `tasks.md` 4.1 lists `src/components/entry-point/` for mc-app, but in the legacy repo mc-app has a single file `src/components/entry-point.tsx` (composed-apps and mc-view-app have the folder). I copied what exists.
- `tasks.md` 4.1 lists `src/constants.ts` for mc-view-app; the legacy view constants only held the permission group, so the stub view has no `src/constants.ts` at all (nothing uses it). The spec's "keep the View/Manage PERMISSIONS pair" does not apply to the view.
- `tasks.md` 5.2 says "A's 14 plus these 12 = pass 26" and `node --test scripts/tests/`. On Node 22 `node --test <directory>` fails (`Cannot find module .../scripts/tests`); the glob form `node --test 'scripts/tests/*.test.mjs'` works. A's tests were not present in my worktree, so I could only see 12 passing. Text in V.1 ("pass 26", "the 10 layout tests") is inconsistent with 5.2 (12 tests): V.2 says 10.
- Legacy `yarn lint` (jest-runner-eslint + `.eslintrc.js`) does NOT work with `@commercetools-frontend/eslint-config-mc-app` 27.9.6, which is an ESLint 9 flat config (every lint run failed with a config schema error). The spec does not mention this. See Deviations.
- `connect.yaml` has no way (via the checker or spec) to prove the Connect UI accepts `required: false` together with a `default` on `CHAT_SERVICE_ENDPOINT_URL`; `connect validate` could not run.
- Spec scenario "No literal ids in config files": the grep `applicationId: '[^$]` passes; verified by inspection (all values are `${env:...}`).

## TODOs (skipped or unverifiable here)

- **Docker daemon is stopped on this machine**: `commercetools connect validate` (task 6.1, V.1, V.4) could not be run (`Cannot connect to the Docker daemon`). Must be run by the owner with Docker running; if it complains about missing `.connect/project.toml`, add it per design E7 (not needed so far, because validate did not get that far).
- Task 1.1: the branch is the worktree branch, not `spec/b`; the `docker info` check failed as above.
- Task 1.2 (throw-away `create-mc-app` reference scaffold): skipped (network `npx`, and the scaffold is only a reference). Nothing was copied from it.
- Task 6.2: `node scripts/spdx-check.mjs`, `node scripts/check-repo-rules.mjs` and `scripts/labs-gate.sh ossify` do not exist in this branch (change A's files, being built in parallel). Re-run them after merging A. In the meantime I verified by grep that every `.ts/.tsx/.js/.mjs/.cjs` file I created has the SPDX banner and that no tenant words/`console.*`/internal hosts exist. The banner format I used (block comment, `Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors`, `Freely available, AS IS and UNSUPPORTED. See LICENSE.`) is copied from A's design E1; confirm against A's `spdx-check.mjs`.
- `scripts/.gitignore`/root `.gitignore`: root `.gitignore` (ignores `node_modules/`) is A's file; I did not touch it. A should also add `.connect/*.log` (task 6.1 watch-out) and `public/` is ignored per app via each app's own `.gitignore`.
- U1-U4 (unverified platform items) remain for change U.
- V.3 smoke check `yarn start` in mc-app: skipped (needs Merchant Center login).
- Re-run `node scripts/check-connect-layout.mjs` after A merges: A may add a root `package.json` or other folders with a `package.json` (the checker would fail on both, by spec).

## Deviations from the spec (with reason)

1. **ESLint 9 flat config instead of the legacy setup.** Each frontend has `eslint.config.js` (spreads `@commercetools-frontend/eslint-config-mc-app`), `eslint` is `^9.0.0`, script `lint` is `eslint .`. Removed `.eslintrc.js`, `jest.eslint.config.js`, `jest-runner-eslint.config.js` and the devDependencies `jest-runner-eslint`, `eslint-formatter-pretty`, `jest-watch-typeahead`, `@graphql-eslint/eslint-plugin`. Reason: the legacy lint was broken at 27.9.6 (see gaps). `yarn lint` now exits 0 (mc-view-app prints 6 `no-template-curly-in-string` warnings for the `${env:...}` placeholders in the config file; they are intentional).
2. **Dependency pruning is coarse.** Instead of deleting packages one by one until the build breaks, I removed the clearly app-level ones (AI SDK, Nimbus, Chakra, slate, zod, formik, moment, charts, markdown, alasql, sync-actions, test-data, etc.) and kept the app-kit peers and toolchain (Apollo, graphql, redux, react-intl, babel, jest, testing-library, msw, ...). Result builds and lints; later changes O-S add what they need. A finer prune can be done in change O.
3. **Dropped extra legacy files** not needed by the stub: `intl-formatter.js` (its only user, the `extract-intl` script, is dropped), `README.md`, `scripts/`. `@types-extensions/json-stable-stringify` and `jest.d.ts` were kept (headered). `src/i18n/data/{en,de,core}.json` are `{}`.
4. **Stub `src/` is smaller than "legacy shell"**: `load-messages.ts`, `graphql.d.ts`, `index.tsx`, `routes.tsx` (renders `<name> (stub)`), `components/entry-point` (plus `constants.ts` for the two Custom Applications). `console.warn` in the legacy `load-messages.ts` was replaced by a silent fallback (DoD: no console usage).
5. **Package versions**: frontends use `version: 0.1.0` (legacy `1.0.0`); `composed-apps`/`mc-view-app` bumped to 27.9.6 as asked (they were 25.1.0 / 27.9.6).
6. **`scripts/package.json`** has `"type": "module"` (the checker and tests are ESM `.mjs`; harmless) and no `package-lock.json` committed beyond what `npm install` created (the lockfile is committed if present; `node_modules/` is ignored).
7. **Test invocation**: `node --test 'scripts/tests/*.test.mjs'` (Node 22) instead of `node --test scripts/tests/`.
8. **Checker details beyond the text**: `checkApplications` also checks that `endpoint` is `/service` and that the lifecycle scripts call the connector stubs; `checkConfigKeys` rejects unknown keys in every application (so adding a key means editing the tables in the checker, intentionally); `checkMcScopes` strips comments before looking for `additionalOAuthScopes` so explanatory comments are allowed.
9. **Service tsconfig** has `tsconfig.build.json` excluding `tests`; `typecheck` uses `tsconfig.json` (`include: ["src"]`), so test files are type-checked only by `ts-jest`.
