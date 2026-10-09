# Change U (u-connect-deployment-no-gha): implementation notes

## Summary

Branch `worktree-agent-afc1ca9c724af8997` (reset to `develop`, which holds A, B, C, D, F, O, first). No real Connect command was run (no Connect login, no credentials, no deployed connector, Docker daemon stopped); everything is proven with `--dry-run`, a fake CLI executable, injected `fetch`/`exec`, and msw.

Built:
- `scripts/connect/connect.mjs` (ten commands: `stage publish preview deploy finalize configure update-code status logs delete`, plus `help`) and `scripts/connect/lib/{config,regions,url,cli,api,smoke,envfile}.mjs`, `scripts/connect/.env.connect.example`. Dependency-free, `node:*` imports only, argument arrays only, every printed line masked and passed through a last-resort `redact()`.
- `service/src/connector/{env,post-deploy,pre-undeploy}.ts` and `checks/{sa-key,vertex,custom-object-probe,providers,audience}.ts`. `postDeploy` wires F's `checkGcpReadiness({deep:true})` (warnings only) after the hard checks.
- `docs/deployment-runbook.md` (13 `[MANUAL ...]` lines, sections 1-11).
- Tests: `scripts/tests/connect-{config,url,cli,api,main}.test.mjs` and `no-ci-tooling.test.mjs` (112 node tests in total with A/B/O's); `service/tests/connector/*.spec.ts` (7 suites, 56 tests).

Commands run (all in this worktree):
- `cd scripts && npm ci`; `node --test scripts/tests/*.test.mjs` -> 112 pass, 0 fail.
- `node scripts/check-connect-layout.mjs` -> `connect layout ok (4 applications)`; `node scripts/spdx-check.mjs` -> ok; `node scripts/check-repo-rules.mjs` -> ok.
- `cd service && npm ci && npm run build && npm test && npm run lint` -> 35 suites, 310 tests pass; build and lint clean; `npm run check:foundation` ok.
- `grep -rnE "gcloud|docker push|terraform|gh workflow" scripts service/src --exclude-dir=node_modules` -> no match (the guard test builds the words by concatenation).
- `openspec validate u-connect-deployment-no-gha --strict` -> valid.
- `node scripts/connect/connect.mjs deploy --dry-run`, `configure STRIPE_SECRET_KEY=sk_test_x --dry-run`, `configure ... GCP_SA_KEY_BASE64=y --dry-run` (exit 2), `deploy --type production --dry-run` (exit 2), `bogus` (exit 2): behave as the spec says.
- Built `node build/connector/post-deploy.js` and `pre-undeploy.js` with a generated fake key and unreachable URLs: prints `post-deploy:` lines (key accepted, Vertex/probe FAILED as expected, provider report, hint for `MC_AUDIENCE`), exit 1 / 0.
- Not run: `commercetools connect validate` (Docker daemon not running), task 9.1 rehearsal, V.3 Chrome scenarios.

Ticked in `tasks.md`: 0.1, 1.2, 2.1, 3.x, 4.x, 5.x, 6.x, 7.1, 8.1. Left open: 1.1 (branch is the harness branch; Docker down), 9.1 (needs owner steps), V.1 (missing `connect validate`), V.2 (two listed test names cannot exist yet, see gaps), V.3, V.4 (no Chrome evidence).

## Questions (for the owner)

1. UQ1/UQ2/UQ3 stay open: sandbox only for v1? which Connect region and project for rehearsals? where is the private staging repository and who grants `connect-mu` (M15)?
2. `service.CTP_REGION` is now passed by `deploy` (see Deviations). Confirm it is right that the Connect region string and the API-host spelling are identical (`us-central1.gcp`); the service validates it against the same list, so a mismatch fails at start.
3. Is a failing `postDeploy` allowed to mark the deployment `Failed`? Not documented; the scripts exit 1 on real failures and `finalize` greps the logs for `post-deploy: FAILED` regardless.
4. May the `.eslintrc.cjs` exception for `src/connector/env.ts` stay (needed so the lifecycle env module can default to `process.env`)? Alternative: `main()` passing `process.env` from a file excluded entirely.

## Missed features / gaps found in the spec

- **`/service/status` returns `{status:'UP'}`**, not `{status:'ok'}` (change C). The task text for `smoke` says `ok`. `smoke` accepts `UP` or `ok` (case-insensitive).
- **`service.CTP_REGION` is required and was never in the phase-1 list**: `connect.yaml` declares it `required: true` without default and Connect does not inject it, so the task's phase-1 list would produce a deployment that fails at start. Added. Conversely the task lists `service.CLOUD_IDENTIFIER`, but `connect.yaml` no longer declares it for `service` (the service derives it from `CTP_REGION`, optional override `MC_CLOUD_IDENTIFIER`), and Connect would likely reject an undeclared key. Dropped. A new test (`phase1: every passed key is declared by connect.yaml for that application`) parses `connect.yaml` and checks every key phase 1 and phase 2 pass, so this drift cannot come back silently.
- Spec scenario "Secrets never printed" uses the values `abc`, `def`, `ghi`. Substring checks on `def` would hit ordinary words ("default"); the output was kept free of them and the process test asserts literally on these values. `redact()` ignores secrets shorter than 4 characters on purpose.
- `--configuration` is variadic in the CLI help (`--configuration=<value>...`). One flag per item is used; whether the CLI accepts repeated flags is unverified (rehearsal). `--startDate` is documented as `YYYY-MM-DD HH:mm:ss` or `YYYY-MM-DDTHH:mm:ss`; the time zone is not stated, UTC is assumed.
- The Connect REST `Deployment` response shape is only partly known. Used: `status`, `applications[].applicationName/url`. Assumed (unverified): `version`, `lastModifiedAt` (race detection after `redeploy`), `connector.version`, and where `MC_AUDIENCE` appears (`audienceOf` tolerates an array of `{key,value}` or an object and degrades to a warning). Task 5.4 step 6 depends on this.
- Task 5.4 step 7 greps `post-deploy: FAILED` in the service logs; log ingestion may lag the `Deployed` status, so an empty log can be a false negative. The runbook says to also read the logs.
- Task 5.6 says `configure` prints the `post-deploy: providers` lines from the logs; same lag caveat. The lines are only printed when present.
- Task 6.6 mentions change L's `checkGcpAnalytics()`, which does not exist yet. `postDeploy` maps F's deep readiness checks (BigQuery dry run, bucket exists) to `post-deploy: gcp analytics:` warning lines instead; it never creates the dataset or bucket. `TODO(L)` in `post-deploy.ts`.
- Task 6.5's test `providers: invalid stripe key reported as missing` needs change J's validators (not merged); only presence is checked. `TODO(J)` in `checks/providers.ts`; the test is not written. Task V.2 lists it, hence V.2 stays open. Likewise `post-deploy: analytics self-check creates dataset and bucket when permitted` cannot exist before L.
- Task 6.1 says reuse C's client builder; `getApiRoot()` calls `readConfiguration()`, which needs the full service configuration (and `PERSISTENCE_DRIVER`, `ENCRYPTION_KEY`, ...). Whether the lifecycle environment contains the whole configuration is unverified (U5), and D-U9 says the scripts must not demand keys they do not use. So the probe builds a client from the lifecycle env with C's `buildClient()` (`createLifecycleApiRoot`). For the same reason F's `checkGcpReadiness` (which calls `readConfiguration()`) is skipped with a warning when the configuration is unreadable.
- Task 6.2 lists its own set of fixed reasons; F's parser already exists with a closed list (`not valid base64`, `decoded value is not JSON`, `missing field "private_key"`, ...) and is stricter (requires `project_id`, an e-mail ending `gserviceaccount.com`, the `BEGIN` header). `checkSaKey` wraps F's parser instead of duplicating the logic. The task's hygiene watch-out (grep the log for `client_email` / `private_key`) conflicts with a reason that names the missing field; the tests grep for key material (Base64, PEM body, the e-mail value, the client secret) instead.
- Task 1.1 asks for `git switch -c spec/u`; the harness branch was kept. `node --test scripts/tests/` (V.1) does not work on Node 22 (B's note); the glob form is used.
- The `.env.connect.example` was rejected by B's layout checker (`.env files must not be tracked`; it only allowed `*.env.example`) and `.gitignore` had `.env.*`. Fixed: checker accepts any `*.example`, `.gitignore` gained `!.env.connect.example` and an explicit `scripts/connect/.env.connect`. A's `.env.example` secret policy only looks at files named `.env.example`, so the new sample is not policy-checked; its secret values are empty.
- The runbook prose rule: A's `check-repo-rules` forbids three framing words; none is used. The runbook describes bucket pre-creation through the cloud console instead of quoting the cloud CLI, to keep the "no `gcloud`" grep honest.
- `plans/manual-steps.md` M9 says "after the first sandbox deploy"; the runbook follows the refined text (after `finalize`).

## TODOs (for the owner / the rehearsal)

- Run `commercetools connect validate` (Docker daemon must run, M14); I could not.
- Task 9.1 rehearsal (needs M3, M4, M5, M6, M7, M10, M14, M15, M16): fill the "Verified behaviour" table in `docs/deployment-runbook.md` (all ten rows say `open`) and save masked evidence under `plans/evidence/u/`:
  - U1 non-required key without default: absent or empty?
  - U2 does a configuration redeploy rebuild the frontends (`chatServiceEndpointUrl` in the served `index.html`)? If not, STOP and ask the owner (do not invent an architecture).
  - U3 is `PORT` injected (C also waits on this)?
  - U4 are changed `inheritAs` scopes applied by `redeploy --updateConnector`?
  - U5 is `MC_AUDIENCE` and the full service configuration visible to the lifecycle scripts? (decides whether F's readiness runs or is skipped)
  - U6 does `npm ci` in `postDeploy` drop devDependencies (then `connect.yaml` needs `npm ci --include=dev`)? Note `typescript` is a devDependency and `postDeploy` runs `npm run build`.
  - U7 how long do deploy and redeploy take (finalize timeout 25 minutes enough)?
  - U8 private ConnectorStaged and `privateProjects`.
  - U9 does `configure KEY=` with an empty value clear a key (the script refuses empty values today).
  - U10 does `ADMIN_USER_IDS=idA,idB` stay one string? (fallback: the service accepting `;` or whitespace as separators; not implemented here).
- Verify against the real CLI: repeated `--configuration` flags, the `--startDate` format and time zone, the text of the "not found" error of `connectorstaged describe` (`stage` creates only when the output matches `not found|404|does not exist`; any other failure aborts with the first stderr line), and the `Deployment` JSON fields listed above.
- Replace `TODO(L)`, `TODO(J)`, `TODO(E)` markers (analytics self-check, provider validators, container names for `pre-undeploy`, switch the probe to E's gateway).
- Task V.3 Chrome scenarios `E2E-U-01..03` after M8-M10.
- Docs for change W (README "Deploy" section, configuration reference, architecture diagram, CONTRIBUTING note that no CI exists by design, security note about secrets in argv) are listed in `tasks.md`; nothing was written outside `docs/deployment-runbook.md`.

## Deviations from the spec (with reason)

- Phase 1 passes `service.CTP_REGION=<CONNECT_REGION>` and not `service.CLOUD_IDENTIFIER` (see gaps).
- `service/.eslintrc.cjs`: `src/connector/env.ts` is excluded from the `process.env` restriction (D-U9 says it is the one other reader).
- `scripts/check-connect-layout.mjs`: tracked `.env` check relaxed to allow `*.example` files; `.gitignore` allows `.env.connect.example`.
- Test seam: `CONNECT_CLI_BIN` (environment variable) replaces the `commercetools` executable so the real `connect.mjs` can be run end to end against a fake CLI. Unset in normal use.
- Extras beyond the task text: `--preview` flag on `status`/`logs`/`delete` to address the `-preview` deployment; `finalize --dry-run` prints the redeploy with a placeholder origin; `redact()` as a second line of defence for captured CLI output; CLI errors are reported by exit status only (the Node error text would contain the whole command line with secured values); `preview` and `deploy` share `loadEnv(['deploy'])`.
- `waitForDeployed` has a `graceMs` (90 s) after which it stops waiting for evidence that a redeploy started, warns, and continues (otherwise an identical-config redeploy that never changes `version` would wait 25 minutes).
- `post-deploy` continues after a failed check so one log shows every problem; the final line is `post-deploy: FAILED <check>, <check>` (task text implies a single check).
- `probe` failures other than 403 report the status code only (`custom object probe failed (HTTP 400)`), never the response body.
- `package.json` of the service was not changed (`google-auth-library`, `@commercetools/platform-sdk`, `ts-client` were already added by C and F). `scripts/package.json` only gained the `connect` script.
