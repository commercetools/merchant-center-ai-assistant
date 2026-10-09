## 0. Read first

About 1.5 hours. Do not code before you can answer the questions at the end.

- [x] 0.1 Read the change documents
  - `openspec/changes/u-connect-deployment-no-gha/{proposal.md,design.md,specs/connect-deployment/spec.md}` (read the findings E1-E12 and the unverified list U1-U7, plus U9 below).
  - `openspec/changes/b-connect-skeleton/design.md` "Platform facts" PF1-PF12 (injected variables, why `MC_AUDIENCE` is a second-phase value).
  - `plans/00-overview.md` D8, D9, D13; `plans/manual-steps.md` (M3-M9, M13); `plans/04-workflow.md` section 5 (how deployed testing works).
  - Installed skill `commercetools-connect`: `references/connect-cli.md` Step 5, `references/deployment-installation.md` (all patterns), `references/lifecycle-scripts.md` (all patterns), `references/security.md` Pattern 3-4.
  - Docs: <https://docs.commercetools.com/connect/cli.md>, <https://docs.commercetools.com/connect/automation-scripts.md>, <https://docs.commercetools.com/connect/deployment-behavior-and-environments.md>, <https://docs.commercetools.com/connect/getting-started.md>, <https://docs.commercetools.com/connect/hosts-and-authorization.md>.
  - Legacy for contrast only (read-only): `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/.github/workflows/workflow.yml`, `.../service/src/utils/startup-checks.ts`, `.../ARCHITECTURE.md` lines 295-330.
  - You should now be able to explain: (1) why there are two deploy phases, (2) which value is an origin and which includes `/service`, (3) why a sandbox cannot deploy a staged connector, (4) what "partial merge" means for `redeploy`, (5) why a `Deployed` status does not prove `postDeploy` succeeded, (6) why `preUndeploy` keeps the data.

## 1. Setup

- [ ] 1.1 Branch and prerequisites
  - Run: `cd /Users/behnam/code/commercetools-labs/ai-assistant && git switch -c spec/u && git merge spec/b spec/c spec/o` (U needs B, C, O merged).
  - Run: `node -v && commercetools --version && docker info --format '{{.ServerVersion}}' && npm ci --prefix scripts && npm ci --prefix service`
  - Expected: `v22.x`, CLI `0.0.17+`, a Docker version (manual step **M14** if the daemon is down), installs finish without errors.
- [x] 1.2 Check the command surface you will wrap
  - Run: `for c in "connectorstaged create" "connectorstaged update" "connectorstaged publish" "connectorstaged preview" "deployment create" "deployment redeploy" "deployment describe" "deployment logs" "deployment delete"; do commercetools connect $c --help | sed -n 1,3p; done`
  - Expected: each prints a usage line. Compare the flag names with design E1; if one differs, fix design.md first (changelog line) and tell the maintainer, because `lib/cli.mjs` encodes them.

## 2. Environment contract

- [x] 2.1 Create `scripts/connect/.env.connect.example` and ignore the real file
  **Why:** one documented place for deployment inputs; secrets stay out of git.
  **Where:** `scripts/connect/.env.connect.example` (create); append `scripts/connect/.env.connect` to `.gitignore`.
  **How:** list (empty values for anything secret-shaped; placeholders per change A policy):
  ```
  CONNECT_REGION=us-central1.gcp
  CTP_PROJECT_KEY=
  CONNECT_CLIENT_ID=
  CONNECT_CLIENT_SECRET=
  CONNECTOR_KEY=ai-assistant
  CONNECTOR_NAME=AI Assistant
  CREATOR_EMAIL=
  REPO_URL=
  REPO_TAG=
  DEPLOYMENT_KEY=ai-assistant-sandbox
  DEPLOYMENT_TYPE=sandbox
  MC_APP_CUSTOM_APPLICATION_ID=
  MC_APP_ENTRY_POINT_URI_PATH=ai-assistant
  COMPOSED_APPS_CUSTOM_APPLICATION_ID=
  COMPOSED_APPS_ENTRY_POINT_URI_PATH=ai-assistant-pages
  MC_VIEW_CUSTOM_VIEW_ID=
  GCP_SA_KEY_BASE64=
  ENCRYPTION_KEY=
  # optional administrator allowlist (decision 2026-10-09): comma-separated Merchant Center USER IDS of administrators (find yours in the app: Settings > About > Your user ID); empty = nobody is an administrator
  ADMIN_USER_IDS=
  # optional Google Cloud settings (owner decision Q9); empty = the service default applies
  GCP_PROJECT_ID=
  GCP_VERTEX_LOCATION=
  GCP_BIGQUERY_DATASET_ID=
  GCP_BIGQUERY_LOCATION=
  GCP_BUCKET_NAME=
  GCP_BUCKET_LOCATION=
  IMAGE_URL_MODE=
  # optional third-party providers (owner decision Q4); leave empty to keep a provider disabled
  CONTENTSTACK_API_KEY=
  CONTENTSTACK_MANAGEMENT_TOKEN=
  CONTENTSTACK_BRANCH=
  CONTENTSTACK_REGION=na
  ALGOLIA_MCP_URL=
  STRIPE_SECRET_KEY=
  STRIPE_CONNECTED_ACCOUNT_ID=
  ```
  **Done when:** `node scripts/check-repo-rules.mjs` exits 0 and `git check-ignore scripts/connect/.env.connect` prints the path.
  **Watch out:** `CTP_PROJECT_KEY` here is the project you deploy INTO (also used by the REST helper); it is not an app setting (Connect injects its own). Names starting `MC_APP_`/`COMPOSED_APPS_`/`MC_VIEW_` map to application-specific values (task 3.1).

## 3. Pure helpers (no network) with tests

- [x] 3.1 `scripts/connect/lib/config.mjs`: environment -> `--configuration` arguments
  **Why:** the only code that decides which value goes to which application; must be testable.
  **Where:** `scripts/connect/lib/config.mjs` (create, headered), test `scripts/tests/connect-config.test.mjs`.
  **How:** export `loadEnv(env)` (validates required names, throws `MissingEnvError` listing all missing), `phase1Args(env)`, `phase2Args({origin})` and `maskArgs(args)`.
  `phase1Args` returns an array of strings:
  ```
  service.GCP_SA_KEY_BASE64=<v>   service.ENCRYPTION_KEY=<v>   service.CLOUD_IDENTIFIER=<derived>
  service.ADMIN_USER_IDS=<v> only when set and non-empty (standard configuration; the whole comma-separated list is ONE argv item)
  service.<GCP_SETTING>=<v> for each of the seven optional Google settings (GCP_PROJECT_ID, GCP_VERTEX_LOCATION, GCP_BIGQUERY_DATASET_ID, GCP_BIGQUERY_LOCATION, GCP_BUCKET_NAME, GCP_BUCKET_LOCATION, IMAGE_URL_MODE), only when set and non-empty
  service.<PROVIDER_KEY>=<v> for each of the seven provider keys, only when set and non-empty (CONTENTSTACK_API_KEY, CONTENTSTACK_MANAGEMENT_TOKEN, CONTENTSTACK_BRANCH, CONTENTSTACK_REGION, ALGOLIA_MCP_URL, STRIPE_SECRET_KEY, STRIPE_CONNECTED_ACCOUNT_ID)
  mc-app.CUSTOM_APPLICATION_ID=<v>  mc-app.ENTRY_POINT_URI_PATH=<v>  mc-app.CLOUD_IDENTIFIER=<derived>
  composed-apps.CUSTOM_APPLICATION_ID=<v>  composed-apps.ENTRY_POINT_URI_PATH=<v>  composed-apps.CLOUD_IDENTIFIER=<derived>
  mc-view-app.CUSTOM_VIEW_ID=<v>    mc-view-app.CLOUD_IDENTIFIER=<derived>
  ```
  `phase2Args({origin})` returns exactly four items: `service.MC_AUDIENCE=<origin>`, `mc-app.CHAT_SERVICE_ENDPOINT_URL=<origin>/service`, `composed-apps.CHAT_SERVICE_ENDPOINT_URL=<origin>/service`, `mc-view-app.CHAT_SERVICE_ENDPOINT_URL=<origin>/service`. `maskArgs` replaces the value of any item whose key is in `['GCP_SA_KEY_BASE64','ENCRYPTION_KEY','CONTENTSTACK_API_KEY','CONTENTSTACK_MANAGEMENT_TOKEN','ALGOLIA_MCP_URL','STRIPE_SECRET_KEY']` with `***`. Also export `GCP_SETTING_KEYS` (the seven optional Google names, standard configuration) and `PROVIDER_KEYS` (the seven names) and `configureArgs(pairs)` which validates every pair against `PROVIDER_KEYS` plus `GCP_SETTING_KEYS` plus `ADMIN_USER_IDS` (never `GCP_SA_KEY_BASE64`) (throws `NotConfigurableError` naming the key) and refuses empty values.
  **Done when:** `node --test scripts/tests/connect-config.test.mjs` passes the tests named `phase1: maps env to application keys`, `phase1: omits MC_AUDIENCE and CHAT_SERVICE_ENDPOINT_URL`, `phase2: exactly four keys`, `mask: hides secured values`, `mask: hides provider secrets`, `phase1: provider keys only when set`, `phase1: ADMIN_USER_IDS only when set and kept as one item with its commas`, `configure: only allow-listed keys`, `configure: accepts ADMIN_USER_IDS`, `configure: refuses empty value`, `env: lists every missing name`.
  **Watch out:** values may contain `=` (Base64 padding): split on the FIRST `=` only. Never put `ENTRY_POINT_URI_PATH` into `mc-view-app` (views have none, B PF5).
- [x] 3.2 `scripts/connect/lib/regions.mjs` and `lib/url.mjs`
  **Where:** `scripts/connect/lib/regions.mjs`, `scripts/connect/lib/url.mjs`, tests in `scripts/tests/connect-url.test.mjs`.
  **How:** `regions.mjs`: `CLOUD_IDENTIFIER_BY_REGION = {'us-central1.gcp':'gcp-us','europe-west1.gcp':'gcp-eu','australia-southeast1.gcp':'gcp-au','us-east-2.aws':'aws-us','eu-central-1.aws':'aws-eu'}` and `cloudIdentifierFor(region)` that throws on unknown. `url.mjs`: `originOf(url)` (`new URL(url).origin`, must be https), `serviceUrlFrom(deployment)` (find `applications` item with `applicationName === 'service'` and non-empty `url`; return `undefined` otherwise), `connectApiHost(region)` (`https://connect.${region}.commercetools.com`), `authHost(region)` (`https://auth.${region}.commercetools.com`).
  **Done when:** tests `region: maps all five`, `region: rejects unknown`, `url: origin strips path`, `url: rejects http`, `url: picks service application`, `url: undefined while empty` pass.
  **Watch out:** the `url` returned by Connect may or may not already end in `/service` (E4); `originOf` makes the code independent of that.
- [x] 3.3 `scripts/connect/lib/cli.mjs`: build and run CLI commands safely
  **Where:** `scripts/connect/lib/cli.mjs`, tests `scripts/tests/connect-cli.test.mjs`.
  **How:** export builders returning `{bin:'commercetools', args:[...]}`: `stageCreate`, `stageUpdate`, `publish`, `preview`, `deploymentCreate`, `redeploy`, `describe`, `logs`, `deleteDeployment`; export `run(cmd, {dryRun, exec = execFileSync, log})` that prints `$ commercetools connect ... ` with `maskArgs` applied and, unless `dryRun`, executes with `stdio: 'inherit'`. Example arrays: `['connect','deployment','create','--region',r,'--key',k,'--connector-key',ck,'--type',t,'--configuration',...]`; `['connect','deployment','redeploy','--key',k,'--configuration',...]` (+ `'--updateConnector'` for `update-code`).
  **Done when:** tests `cli: create passes type and configuration pairs`, `cli: redeploy has no --updateConnector by default`, `cli: updateConnector flag`, `cli: run masks secrets and does not execute on dry run`, `cli: never uses a shell` (assert `exec` is `execFileSync` with an array) pass.
  **Watch out:** pass each `--configuration` value as its own array element after one `--configuration` flag per value (`--configuration a=b --configuration c=d`) unless `--help` showed the variadic form works with spaces; verify once with `--help` and keep one style.

## 4. Connect REST reads

- [x] 4.1 `scripts/connect/lib/api.mjs`: token, describe, wait
  **Why:** the CLI has no JSON output.
  **Where:** `scripts/connect/lib/api.mjs`, tests `scripts/tests/connect-api.test.mjs` (inject `fetch` and `sleep`).
  **How:** `getToken({fetch, region, projectKey, clientId, clientSecret})` -> POST `${authHost}/oauth/token` with `grant_type=client_credentials&scope=view_connectors_deployments:${projectKey}` and Basic auth; `getDeployment({...,key})` -> GET `${connectApiHost}/${projectKey}/deployments/key=${key}`; `waitForDeployed({getDeployment, sleep, timeoutMs = 25*60*1000, intervalMs = 20000})` loops until `status === 'Deployed'`, throws `DeploymentFailed` on `Failed`, throws `Timeout` otherwise. Token cached for its `expires_in`.
  **Done when:** tests `api: token request shape`, `api: getDeployment url`, `wait: resolves on Deployed`, `wait: throws on Failed`, `wait: times out` pass (use a fake clock/sleep; no real waiting).
  **Watch out:** never print the token or the client secret; error messages carry status code and the Connect error `message` only. Key characters: keep `encodeURIComponent` on the key.
- [x] 4.2 `scripts/connect/lib/smoke.mjs`: status check with retries
  **How:** `smoke({fetch, sleep, origin, attempts = 10, delayMs = 10000})` requests `${origin}/service/status`, accepts HTTP 200 with JSON `{status:'ok'}`; retries on network errors and 502/503/504 (cold start).
  **Done when:** tests `smoke: retries on 503 then ok`, `smoke: fails after attempts` pass.
  **Watch out:** 401/403/404 are NOT retried (they mean a wrong path or auth, not cold start).

## 5. The command line

- [x] 5.1 `scripts/connect/connect.mjs` skeleton with `--dry-run`, help, env loading
  **Where:** `scripts/connect/connect.mjs` (create, headered; shebang optional), `scripts/package.json` script `"connect": "node connect/connect.mjs"`.
  **How:** parse `process.argv` (no dependency): `<command> [--dry-run] [--type sandbox|preview|production] [--confirm-production] [--tag vX.Y.Z]`; load `scripts/connect/.env.connect` if present (simple `KEY=VALUE` parser, never overrides existing env); print usage on unknown command with exit 2.
  **Done when:** `node scripts/connect/connect.mjs help` prints the ten commands (`stage publish preview deploy finalize configure update-code status logs delete`); `node scripts/connect/connect.mjs bogus; echo $?` prints usage and `2`.
  **Watch out:** the `.env.connect` parser must not `eval`; strip surrounding quotes; do not log values.
- [x] 5.2 `stage`, `publish`, `preview`
  **How:** `stage`: run `connectorstaged describe --key $CONNECTOR_KEY`; if it fails with "not found" run `stageCreate` (`--repository-url $REPO_URL --repository-tag $REPO_TAG --creator-email $CREATOR_EMAIL --name "$CONNECTOR_NAME" --key $CONNECTOR_KEY --supported-regions $CONNECT_REGION`), else `stageUpdate` with url+tag. `publish`: `connectorstaged publish --key`. `preview`: `connectorstaged preview --key --deployment-key $DEPLOYMENT_KEY-preview --region` plus the phase-1 configuration args.
  **Done when:** `node scripts/connect/connect.mjs stage --dry-run` (with a filled example env) prints one `$ commercetools connect connectorstaged ...` line and exits 0; unit test `stage: create vs update decision` passes with an injected describe result.
  **Watch out:** `--supported-regions` takes only the GCP values in the published docs (E1); if `CONNECT_REGION` is an AWS region omit the flag and warn.
- [x] 5.3 `deploy` (phase 1)
  **How:** guard `--type production` (exit 2 without `--confirm-production`); build `deploymentCreate({region, key, connectorKey, type, args: phase1Args(env)})`; refuse `--type preview` here (preview uses `preview`); after create, print "next: node scripts/connect/connect.mjs finalize". Does NOT wait.
  **Done when:** `deploy --dry-run` prints the masked command; `deploy --type production --dry-run` exits 2; test `deploy: production guard` passes.
  **Watch out:** a second `deploy` with the same `DEPLOYMENT_KEY` fails on the platform (key exists): detect with `describe` first and print "already exists, use finalize or redeploy".
- [x] 5.4 `finalize` (phase 2)
  **How:** (1) `waitForDeployed` on the deployment; (2) `serviceUrlFrom(deployment)` else fail with hint `logs`; (3) `origin = originOf(url)`; (4) `redeploy` with `phase2Args({origin})` (no secured values); (5) `waitForDeployed` again (status goes back through Queued: wait for `lastModifiedAt`/version to change or status != Deployed first, then Deployed); (6) fetch the deployment again, verify the `service` application's `standardConfiguration` shows `MC_AUDIENCE` = origin (printed, not secret); (7) `logs --application service` filtered for the string `post-deploy: FAILED`, exit 1 if found; (8) `smoke`; (9) print a table of the three MC application URLs (`applications[]` where name in mc-app, composed-apps, mc-view-app) under the heading `[MANUAL M9] paste these URLs into the Merchant Center registrations`.
  **Done when:** unit test `finalize: sequence and values` with fake api/cli asserts the redeploy args equal `phase2Args`, and `finalize: stops when postDeploy failed` passes; the rehearsal in task 9.1 completes.
  **Watch out:** step 5 race: right after `redeploy` the status can still read `Deployed` from before; compare `version` of the Deployment before/after and wait for it to increase, then for `Deployed`.
- [x] 5.5 `update-code`, `status`, `logs`, `delete`
  **How:** `update-code --tag vX`: `stageUpdate(tag)` -> `publish` -> `redeploy --updateConnector` (no config), then `waitForDeployed` and `smoke`. `status`: print status, version, connector version, application urls. `logs [--application x] [--since 1h]`: wrap `deployment logs` with computed dates. `delete`: confirm with `--yes`, then `deployment delete --key`.
  **Done when:** tests `update-code: command order` and `delete: requires --yes` pass.
  **Watch out:** after `update-code` compare `connector.version` of the deployment with the connector's current version; if equal to the old one, print the publishing-report hint (connect skill `deployment-installation.md` Pattern 4).

- [x] 5.6 `configure` (provider keys, `ADMIN_USER_IDS` and other allow-listed configuration)
  **Why:** owner decision Q4 - provider credentials are Connect configuration; changing or rotating them needs a configuration-only redeploy that is easy and safe to run.
  **Where:** `scripts/connect/connect.mjs` (command), `scripts/connect/lib/config.mjs` (`configureArgs`), test `scripts/tests/connect-config.test.mjs`.
  **How:** `configure KEY=VALUE [KEY=VALUE ...]`: split each argument on the FIRST `=`; `configureArgs` turns them into `service.KEY=VALUE`; run `deployment redeploy --key <DEPLOYMENT_KEY> --configuration ...` (no `--updateConnector`, no other keys); `waitForDeployed` (same version-increase rule as `finalize`); `smoke`; print `logs --application service` lines starting `post-deploy: providers` (the provider report from task 6.5) so the operator sees which providers are now configured. Values from the shell history are the operator's responsibility; the command echoes only masked arguments.
  **Done when:** tests `configure: partial merge args` (one redeploy command, no `--updateConnector`, secured value masked) and `configure: only allow-listed keys` pass; `node scripts/connect/connect.mjs configure STRIPE_SECRET_KEY=sk_test_x --dry-run` prints one masked `deployment redeploy` line and exits 0.
  **Watch out:** clearing a key is not possible through `--configuration` with an empty value on every CLI version (unverified, add to the rehearsal 9.1 as U9); the runbook says to remove it in the Connect configuration if needed.

## 6. Service lifecycle scripts

- [x] 6.1 `service/src/connector/env.ts` and the API client
  **Why:** lifecycle scripts run outside the app and need a validated minimal env.
  **Where:** `service/src/connector/env.ts`, `service/src/connector/client.ts`, tests `service/tests/connector/env.spec.ts` (all headered). Reuse change C's client builder if it exists (`service/src/client/`); otherwise build `ClientBuilder` from `@commercetools/ts-client@^4` with `CTP_API_URL`, `CTP_AUTH_URL`, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_PROJECT_KEY`, `CTP_SCOPE` and `createApiBuilderFromCtpClient` from `@commercetools/platform-sdk@^8`.
  **How:** `readLifecycleEnv(env)` returns `{ projectKey, saKeyBase64, gcpProjectId?, vertexLocation (default `us-central1`), bigqueryDatasetId (default `aiassistant`), bigqueryLocation (default `us-central1`), bucketName?, bucketLocation (default `us-central1`), liteModel, mcAudience?, serviceUrl?, providerEnv }` where `providerEnv` holds only the seven provider keys that are set (all optional, never required) or throws listing every missing name. It also accepts injected `CONNECT_SERVICE_URL` (lifecycle-only variable, B PF2).
  **Done when:** `cd service && npx jest tests/connector/env.spec.ts` passes `env: lists all missing`, `env: optional audience`.
  **Watch out:** this is the only module besides `readConfiguration()` allowed to read `process.env` (design D-U9); take `env` as a parameter so tests do not touch the real one.
- [x] 6.2 Service-account key check
  **Where:** `service/src/connector/checks/sa-key.ts`, test `service/tests/connector/sa-key.spec.ts`.
  **How:** `checkSaKey(base64, configuredProjectId?)` -> `{ok:true, warnings:[]} | {ok:false, reason}`. Steps: Base64 decode (reject non-Base64 chars and whitespace/newlines are tolerated by trimming once), `JSON.parse` in try/catch, require `type === 'service_account'`, string `client_email`, `private_key` including `BEGIN PRIVATE KEY`; the effective project id is `configuredProjectId ?? key.project_id`; a warning (not a failure) when `GCP_PROJECT_ID` is set and differs from the key's `project_id` (allowed: the key's service account may be granted access to another project). The `reason` strings are fixed messages (`not valid base64`, `not valid JSON`, `type is not service_account`, `client_email missing`, `private_key missing or malformed`), never including input.
  **Done when:** tests `sa-key: valid`, `sa-key: not base64`, `sa-key: not json`, `sa-key: wrong type`, `sa-key: missing private_key`, `sa-key: project mismatch warns`, `sa-key: reason never echoes input` pass. Test fixtures are generated in code (`Buffer.from(JSON.stringify({...})).toString('base64')` with obviously fake `-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----`); do not paste a real key (and do not write long literals next to the word "key" or "secret", gate pattern E6 of change A).
  **Watch out:** `GCP_SA_KEY_BASE64` must be the Base64 of the WHOLE JSON, single line (M5): `base64 < key.json | tr -d '\n'`.
- [x] 6.3 Vertex reachability check
  **Where:** `service/src/connector/checks/vertex.ts`, test `service/tests/connector/vertex.spec.ts`; add `google-auth-library` to `service/package.json`.
  **How:** `checkVertex({credentials, projectId, location, model, fetch, authClientFactory})`: `GoogleAuth({credentials, scopes:['https://www.googleapis.com/auth/cloud-platform']}).getClient().getAccessToken()`, then `POST https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:countTokens` with body `{contents:[{role:'user',parts:[{text:'ping'}]}]}`; map: 200 ok; 400/401/403/404 -> `{ok:false, status}` with an actionable hint (403: grant `roles/aiplatform.user`; 404: model id or location wrong); 5xx/network/timeout (10 s `AbortSignal.timeout`) -> `{ok:true, warning}`. Use msw in the test to simulate each status.
  **Done when:** tests `vertex: 200 ok`, `vertex: 403 hint mentions aiplatform.user`, `vertex: 404 names model`, `vertex: 503 warns only`, `vertex: timeout warns only` pass.
  **Watch out:** if change F already exports an authenticated Vertex helper (`getGoogleCredentials()`), use it for credentials instead of re-parsing; keep this check independent of the AI SDK so a model-library bug cannot hide a credential problem. Model ids come from `GEMINI_LITE_MODEL_NAME`; a 404 may mean the legacy id in `connect.yaml` defaults is not real (open question BQ1).
- [x] 6.4 Custom Object probe
  **Where:** `service/src/connector/checks/custom-object-probe.ts`, test `service/tests/connector/probe.spec.ts` (msw for the commercetools API).
  **How:** `runProbe(apiRoot)`: `customObjects().post({body:{container:'ai-assistant-lifecycle', key:'post-deploy-probe', value:{checkedAt: new Date().toISOString()}}})` (create-or-update), then `customObjects().withContainerAndKey({container,key}).get()`, then `.delete()` (404 ignored). Return `{ok:true}`; on 403 return `{ok:false, reason:'missing manage_key_value_documents scope on the generated API client'}`.
  **Done when:** tests `probe: create read delete`, `probe: delete 404 is fine`, `probe: 403 maps to scope hint`, `probe: twice leaves nothing` (second run sees the first run's object absent) pass.
  **Watch out:** container/key charset `[-_~.a-zA-Z0-9]` (E12). Do not use the production containers (`ai-assistant-settings`, ...) for probing.
- [x] 6.5 Provider report
  **Why:** the operator needs to see, right after a deploy or a `configure`, which providers the service will enable, without any value in the log (owner decision Q4).
  **Where:** `service/src/connector/checks/providers.ts`, test `service/tests/connector/providers.spec.ts`.
  **How:** `reportProviders(providerEnv): { lines: string[] }` applies the same rule as change J (`REQUIRED_KEYS` and `validateProvider` from `service/src/mcp-providers/`; if J is not merged yet, implement presence only and leave a `TODO(J)` removed before merge): per provider one line `post-deploy: providers <provider>: configured` or `post-deploy: providers <provider>: not configured (missing: <KEY>, <KEY>)` (names of unset or invalid keys only). Never fails: always `ok: true`.
  **Done when:** tests `providers: none configured lists missing keys`, `providers: stripe configured`, `providers: invalid stripe key reported as missing`, `providers: sentinel values never logged` pass.
  **Watch out:** no value, length, host or prefix of a value in any line; do not log `providerEnv` itself.
- [x] 6.6 `post-deploy.ts` orchestration
  **Where:** `service/src/connector/post-deploy.ts` (replace B's stub), test `service/tests/connector/post-deploy.spec.ts`.
  **How:** `run(deps)` executes in order: env -> sa-key -> vertex -> probe -> **Google analytics self-check** (`checkGcpAnalytics()` of change L: dataset and bucket exist or are created idempotently when the service account is allowed to; a missing resource it may not create is reported as `post-deploy: gcp analytics: <resource> missing - <actionable message naming the IAM role or the pre-creation command>` and is a WARNING only, never an exit-code failure, because chat works without analytics/images) -> provider report (informational) -> audience consistency -> final log. Audience: if `mcAudience` set and `serviceUrl` set and `originOf` differ -> failure with both origins; if `mcAudience` unset -> log `post-deploy: MC_AUDIENCE is not set. Set it to <origin> (redeploy: finalize)`; always log `post-deploy: service origin <origin>`. Every line is prefixed `post-deploy:`; failure summary line `post-deploy: FAILED <check>` (used by `finalize`); success `post-deploy: OK`. Set `process.exitCode = 1` on failure; never `process.exit()` mid-way (flush logs). Wrapper at the bottom `if (require.main === module) void main()`.
  **Done when:** tests `post-deploy: all green exits 0`, `post-deploy: malformed key fails`, `post-deploy: vertex 4xx fails`, `post-deploy: vertex 5xx warns`, `post-deploy: audience mismatch fails`, `post-deploy: audience unset logs hint`, `post-deploy: analytics self-check missing resource warns only`, `post-deploy: analytics self-check creates dataset and bucket when permitted`, `post-deploy: reports providers without values`, `post-deploy: logs never contain key material`, `post-deploy: idempotent twice` pass; `cd service && npm run build && node build/connector/post-deploy.js` with a fake env prints `post-deploy:` lines.
  **Watch out:** the log-hygiene test greps captured output for the Base64 string, `client_email` and `private_key`.
- [x] 6.7 `pre-undeploy.ts`
  **Where:** `service/src/connector/pre-undeploy.ts`, test `service/tests/connector/pre-undeploy.spec.ts`.
  **How:** delete the probe object (404 fine); query container counts for `ai-assistant-sessions` and `ai-assistant-settings` with `limit=1` and log `pre-undeploy: data retained in <container>` when non-empty (404/empty -> skip); exit 0 unless the API itself is unreachable (then warn, exit 0: undeploy must not be blocked).
  **Done when:** tests `pre-undeploy: probe removed`, `pre-undeploy: data untouched`, `pre-undeploy: api unreachable does not block` pass.
  **Watch out:** never call `DELETE` on anything except the probe.

## 7. Safety nets

- [x] 7.1 No-forbidden-tooling test
  **Where:** `scripts/tests/no-ci-tooling.test.mjs`.
  **How:** read all tracked files under `scripts/connect` and `service/src/connector`; assert none contains `gcloud`, `docker push`, `terraform`, `kubectl`, `gh workflow`, and that `.github/` does not exist; assert `connect.mjs` imports only `node:*` modules and local files.
  **Done when:** `node --test scripts/tests/no-ci-tooling.test.mjs` passes.
  **Watch out:** the test file itself contains those words as strings: build them with concatenation so the repo-wide grep in the spec scenario (which scans `scripts`) does not hit the test (`['g','cloud'].join('')`).

## 8. Runbook

- [x] 8.1 Write `docs/deployment-runbook.md`
  **Why:** the human interface of this change and a certification artifact (connect skill `deployment-installation.md` Pattern 6).
  **Where:** `docs/deployment-runbook.md` (create).
  **How:** sections: (1) Prerequisites, each owner-only action as `[MANUAL M14] Start Docker Desktop` (self-contained description in the line), `[MANUAL M4] Log in the Connect CLI with an API client that has manage_connectors, manage_connectors_deployments and manage_api_clients`, `[MANUAL M16] Put the same client id/secret into scripts/connect/.env.connect for the read-only REST helper`, `[MANUAL M15] Grant the GitHub user connect-mu read access to the staging repository`, `[MANUAL M5] Create the Google service account JSON (roles: aiplatform.user, bigquery.dataEditor, bigquery.jobUser, plus storage.admin on the project so the service can create the image bucket, or storage.objectAdmin on a bucket you pre-create) and Base64 it: base64 < key.json | tr -d '\n'`, `[MANUAL M6] Register the Custom Applications "AI Assistant" and "AI Assistant Pages" in the Merchant Center with a placeholder URL and record the ids`, `[MANUAL M7] Register the Custom View with a placeholder URL and record its id`, `[MANUAL M10] Create the two test users in the Merchant Center (user A, the admin user, and user B, the non-admin user), give both a Team with the app's ordinary Manage permission on the scratch project, open the deployed app as each user and read the 'Your user ID' line (Settings > About), then set the allowlist with node scripts/connect/connect.mjs configure ADMIN_USER_IDS=<user A id> (several administrators: comma-separated; at most 50; the value is one string; user B's id is deliberately NOT listed)`, `[MANUAL M21] Provide the optional provider credentials (Contentstack API key and management token, Algolia MCP URL, Stripe restricted key) and put them into scripts/connect/.env.connect or pass them with the configure command - they are Connect configuration, never entered in the app`; (1b) a "Google Cloud settings" table listing every optional setting with its default and the `configure` command to change it (`GCP_PROJECT_ID` = key's project, `GCP_VERTEX_LOCATION` = `us-central1`, `GCP_BIGQUERY_DATASET_ID` = `aiassistant`, `GCP_BIGQUERY_LOCATION` = `us-central1`, `GCP_BUCKET_NAME` = `<project>-ai-assistant-images`, `GCP_BUCKET_LOCATION` = `us-central1`, `IMAGE_URL_MODE` = `private`) and the `post-deploy: gcp analytics:` lines (what each means, how to pre-create the dataset/bucket instead of granting `storage.admin`); (2) Concepts: sandbox vs preview vs production table (design E3), why two phases; (3) First install: numbered commands `stage`, `publish`, `deploy`, `finalize`, (optional) `configure KEY=VALUE` for the provider keys (`CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION`, `ALGOLIA_MCP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_CONNECTED_ACCOUNT_ID`; a provider is enabled only when its required keys are set and valid; changes need this redeploy; rotate by running it again; check `logs --application service` for `post-deploy: providers` lines), `[MANUAL M9] update the three registrations with the printed URLs`, verification `GET /service/status`; (4) Update: tag, `update-code`; (5) Rollback: previous tag then `update-code --tag <old>`; if the new version fails to build the previous code keeps serving (connect skill statement); (6) Undeploy: `delete --yes`, data stays (design D-U10), optional purge snippet; (7) Fail-open/fail-closed table (service fails closed until `MC_AUDIENCE`); (8) Required scopes table (`view_key_value_documents`, `manage_key_value_documents`); (9) Configuration table (every `connect.yaml` key, including `ADMIN_USER_IDS`: optional, standard, comma-separated Merchant Center user ids, empty means nobody is an administrator (fail closed; the service logs `ADMIN_USER_IDS is empty: no administrator` at start and `/service/status` shows `adminConfigured:false`), changes need a `configure` redeploy and take effect after the instances restart); (9b) Bootstrap of the first administrator: `deploy`, `finalize`, open the app, read the 'Your user ID' line (Settings > About), `configure ADMIN_USER_IDS=<id>` (redeploy), refresh the app, the admin surfaces appear; (10) Troubleshooting: status `Failed`, `post-deploy: FAILED`, 401 from the service (audience mismatch), cold start, redeploy shows old behaviour (update chain), a provider shows `Not configured` in the Settings status cards (read the `post-deploy: providers` line for the missing key names, then run `configure`), (11) "Verified behaviour" (filled in task 9.1).
  **Done when:** `grep -c "\[MANUAL" docs/deployment-runbook.md` prints 7 or more; `node scripts/check-repo-rules.mjs` passes (no forbidden words); a colleague who has not read the plans can follow sections 1-3.
  **Watch out:** the runbook is published; do not mention internal tools, hostnames or project ids; refer to design material only as the project's design documents.

## 9. Rehearsal (agent-run, needs owner manual steps)

- [ ] 9.1 Sandbox rehearsal and resolution of U1-U10
  **Why:** the design rests on unverified platform behaviour; we find out before anyone else does.
  **Precondition:** manual steps done: M3 (scratch project), M4, M5, M6, M7 (ids in `.env.connect`), M10 (users A and B; `ADMIN_USER_IDS` set to user A's id), M14, M15 (private staging repo with a tag of this branch), M16.
  **How:** `node scripts/connect/connect.mjs stage && ... publish && ... deploy && ... finalize`. While doing so, answer and write into runbook section 11 with the date (U8 first: after `stage`, run `connectorstaged describe` and check `privateProjects`; if the project is missing and the CLI cannot add it, use the Merchant Center UI or the "Add Project to Private Connector" action (<https://docs.commercetools.com/connect/connectors-staged.md#add-project-to-private-connector>) and record which worked): U1 (log `process.env.MC_AUDIENCE === undefined` via a temporary log line in postDeploy), U2 (check the deployed mc-app's `window.app.additionalEnv.chatServiceEndpointUrl` in the served `index.html` after finalize: `curl -s <mc-app-url>/index.html | grep chatServiceEndpointUrl`), U3 (log `process.env.PORT` at start), U4 (add a scope in a throw-away branch, `update-code`, compare `Deployment.apiClient`), U5 (log presence of `MC_AUDIENCE` in postDeploy after finalize), U6 (read the build log for `tsc: not found`), U7 (time both waits), U9 (run `configure STRIPE_SECRET_KEY=sk_test_dummy` and confirm the `post-deploy: providers stripe: configured` line and the Settings status card; then confirm whether an empty value clears a key), U10 (comma value as ONE key: deploy or configure with `ADMIN_USER_IDS=idA,idB`, then read the service start log / `GET /service/status` and confirm two ids were parsed and the admin surfaces show for both users; if Connect splits or mangles the value, record it, use the documented fallback: the service also accepts `;` or whitespace as separators, and the runbook quotes the value). If U2 is false, STOP and record the finding as an owner question in `plans/owner-questions.md`; do not invent a different architecture.
  **Done when:** the runbook "Verified behaviour" table has ten filled rows (U1-U10); `finalize` ends with the smoke check `ok` and the printed URLs; `deployment delete --yes` cleans up; evidence (command output with secrets masked) saved under `plans/evidence/u/` (git-ignored).
  **Watch out:** all temporary log lines must be removed before commit; never paste secrets into evidence files.

## Last: Verification

- [ ] V.1 Commands and expected results
  - `node --test scripts/tests/` -> all pass (A + B + this change's tests; no failures)
  - `cd service && npm run build && npm test` -> connector tests pass
  - `node scripts/connect/connect.mjs deploy --dry-run` (example env) -> masked command, exit 0; `node scripts/connect/connect.mjs configure STRIPE_SECRET_KEY=sk_test_x --dry-run` -> one masked redeploy line, exit 0
  - `node scripts/check-repo-rules.mjs && node scripts/spdx-check.mjs && node scripts/check-connect-layout.mjs` -> exit 0
  - `commercetools connect validate` -> exit 0 (service changed)
  - `openspec validate u-connect-deployment-no-gha --strict` -> valid
- [ ] V.2 Unit test names to exist: all names listed per task above (grep `it('` / `test(` for each).
- [ ] V.3 Chrome scenarios (plans/04-workflow.md section 5, run after M8-M10, with user A as the admin user and user B as the non-admin user): `E2E-U-01 deployed mc-app loads in Merchant Center and shows the stub/real UI`, `E2E-U-02 deployed UI request to /proxy/forward-to returns 200 on /service/status-equivalent endpoint (network log)`, `E2E-U-03 console has no errors`. Scenario definitions are formalised by change V; U records the manual-step dependency.
- [ ] V.4 Definition of Done: no `console.log` (use `process.stdout.write` or the logger), SPDX headers, no secrets in logs, evidence saved, docs delta recorded.

## Docs to update (for change W)

- README "Deploy" section: link to `docs/deployment-runbook.md`; show the five-command happy path.
- Configuration reference: add the "Deployment inputs" table (`.env.connect.example` variables) and the "Verified behaviour" results U1-U7.
- Architecture doc: two-phase deploy diagram; why `MC_AUDIENCE` is origin-only; why lifecycle scripts verify rather than register.
- CONTRIBUTING: mention `scripts/connect` and that no CI exists by design.
- Security section: secrets in argv caveat (D-U3), least-privilege scopes.
- Configuration/runbook docs: how to set the seven provider keys and `ADMIN_USER_IDS` (`configure`), which are secured, the enablement rule and the `post-deploy: providers` report.
