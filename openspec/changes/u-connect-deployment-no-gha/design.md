## Context

The legacy system deployed through GitHub Actions to Cloud Run per region. The new connector is deployed only through commercetools Connect (R2, R6). A Connect deployment is created from a **Connector** that was staged from a git repository and tag; the developer-facing tools are the Connect CLI (`@commercetools/cli`) and the Connect REST API. Deployment configuration values act as environment variables of each application. The service URL needed by two of those values (`MC_AUDIENCE`, `CHAT_SERVICE_ENDPOINT_URL`) is known only after the service is deployed, which forces the two-phase flow decided in plan D8.

## Explore findings

Verified 2026-10-08 with the commercetools Knowledge MCP, the installed CLI (`@commercetools/cli/0.0.17`, Node 22.21.1) and the installed commercetools-connect skill. Platform facts that B also needs are in B's "Platform facts" PF1-PF12; they are cited here by number.

**E1. CLI surface (verified from `commercetools connect ... --help` and <https://docs.commercetools.com/connect/cli.md>).**
- `connectorstaged create --repository-url --repository-tag --creator-email --name [--key --description --supported-regions --integration-types]`; `connectorstaged update [--id|--key] [--repository-url --repository-tag ...]`; `connectorstaged publish [--id|--key]`; `connectorstaged describe|list|certify`; `connectorstaged preview --deployment-key --region [--id|--key] [--configuration ...]`.
- `deployment create --region <r> [--key] [--connector-id|--connector-key] [--connector-staged] [--type preview|sandbox|production] [--configuration <v>...]`; `deployment redeploy [--key|--id] [--configuration ...] [--skipScripts] [--updateConnector]`; `deployment describe|list|delete|logs [--application --startDate --endDate]`.
- `--configuration` format: `{applicationName}.{key}={value}` for application values, `{key}={value}` for global ones.
- `--region` options in the installed help: `us-central1.gcp`, `europe-west1.gcp`, `australia-southeast1.gcp`, `us-east-2.aws`, `eu-central-1.aws` (the published docs list only the three GCP regions for the CLI; the API lists all five).
- There is **no machine-readable output flag** on any command (`--help` shows none), so URL/status discovery uses the REST API.

**E2. Redeploy semantics.** `redeploy` configuration values are a **partial merge**: omitted keys keep their current value; `updateConnector` moves the deployment to the latest published connector version; `skipScripts` skips `postDeploy`. Code-update chain: new tag -> `setRepository` (CLI `connectorstaged update`) -> `publish` -> `redeploy` with `updateConnector`. Source: connect skill `references/deployment-installation.md` Pattern 4; <https://docs.commercetools.com/connect/getting-started.md> ("Update your Connector").

**E3. Deployment types.** `sandbox` is the default, scales to zero (~15 s boot), **cannot** deploy a ConnectorStaged (the connector must be published first); `preview` needs the staged connector `isPreviewable` and should be deleted when testing ends; `production` needs a published connector and a non-trial project. Service request timeout 5 minutes. Deployment takes up to ~15 minutes (initial status `Queued`, then `Deployed`; `Failed` -> contact support). Source: <https://docs.commercetools.com/connect/deployment-behavior-and-environments.md>, <https://docs.commercetools.com/connect/getting-started.md>.

**E4. Service URL.** `Deployment.applications[]` items have `applicationName`, `url`, `topic`, `schedule`; REST `GET https://connect.{region}.commercetools.com/{projectKey}/deployments/key={key}`. `CONNECT_SERVICE_URL` is a lifecycle-script variable only (B PF2, PF3). Source: OpenAPI `connect-Deployment` via the connect skill script; <https://docs.commercetools.com/connect/automation-scripts.md>.

**E5. Connect API authorization.** Token scopes: `view_connectors_deployments:{projectKey}`, `manage_connectors_deployments:{projectKey}`, `manage_connectors:{projectKey}`, `manage_api_clients:{projectKey}` (needed so Connect can generate the API client from `inheritAs`). Hosts: `connect.us-central1.gcp.commercetools.com` etc. Source: <https://docs.commercetools.com/connect/hosts-and-authorization.md>. `commercetools auth login --client-credentials --client-id --client-secret --region --project-key [--scope]` configures the CLI (<https://docs.commercetools.com/connect/cli.md>).

**E6. Logs.** Up to 30 days; stdout/stderr are collected; `deployment logs --application service --startDate ... --endDate ...`; REST `GET /{projectKey}/deployments/{id}/logs`. Source: <https://docs.commercetools.com/connect/how-to-debug-a-deployment.md>. Lifecycle script output appears in these logs, so the audience hint printed by `postDeploy` is retrievable even without REST.

**E7. Lifecycle scripts.** Declared in `connect.yaml` `scripts.postDeploy|preUndeploy`; `postDeploy` runs after a successful deployment; docs do not define what a failing script does to the status, so verification is by logs plus the resource itself (connect skill `references/lifecycle-scripts.md` Pattern 5). Exit `process.exitCode = 1` on real failure; benign "already exists" is not an error. Idempotent get-then-update registration; we register nothing in the project (no Extension/Subscription), so idempotency concerns only the probe object.

**E8. Private repository access.** A staged connector's repository may be private if the GitHub machine user `connect-mu` is granted access (<https://docs.commercetools.com/merchant-center-customizations/deployment/commercetools-connect.md>). Before the public repo exists (M1/M13), rehearsals therefore need a private internal staging repository (new manual step M15).

**E9. Cloud identifiers.** Connect region -> Merchant Center cloud identifier: `us-central1.gcp` -> `gcp-us`, `europe-west1.gcp` -> `gcp-eu`, `australia-southeast1.gcp` -> `gcp-au`, `us-east-2.aws` -> `aws-us`, `eu-central-1.aws` -> `aws-eu`. Source: <https://docs.commercetools.com/merchant-center-customizations/concepts/merchant-center-api.md#cloud-identifiers>. The script derives `CLOUD_IDENTIFIER` from the region so the two cannot disagree.

**E10. How the legacy service uses the audience.** `MC_AUDIENCE` = the service's public origin; the verifier uses `audiencePolicy: 'forward-url-full-path'` (expected audience = origin + request path); without `MC_AUDIENCE` every Merchant Center request is rejected (legacy `service/src/middleware/mc-session.middleware.ts` lines ~55-135, `ARCHITECTURE.md` ~295-320). Hence: `MC_AUDIENCE` = origin (no path), `CHAT_SERVICE_ENDPOINT_URL` = origin + `/service` (what the frontend passes as the forward-to target).

**E11. Dev-machine facts.** Docker daemon must run for `connect validate` (B PF9). Local `connect init` scaffolds `.github` (B PF10), so the repo check must run before each commit.

**E12. Custom object probe.** Create-or-update is `POST /{projectKey}/custom-objects` with `{container, key, value}`; read/delete by `/{container}/{key}`; container and key charset `[-_~.a-zA-Z0-9]`, 2-256 chars; JSON documents up to 16 MB (recommended <= 100 KB) (<https://docs.commercetools.com/api/projects/custom-objects.md>, <https://docs.commercetools.com/api/limits.md>). Scope `manage_key_value_documents` (declared in `connect.yaml` by B).

**Unverified, to be resolved in the rehearsal task 9.1** (U1-U8, U10) (record answers in the runbook "Verified behaviour" section):
- U1 non-required key without default: absent or empty in `process.env`?
- U2 does `redeploy --configuration mc-app.CHAT_SERVICE_ENDPOINT_URL=...` rebuild the MC bundle (so `additionalEnv` is re-baked)? Fallback if not: delete the three MC apps' deployment and create a second Deployment (second connector) for the frontends, or switch the frontends to read the service URL from a runtime-fetched JSON (ask the owner before choosing).
- U3 is `PORT` injected, or must the app use 8080?
- U4 are `inheritAs.apiClient.scopes` changes applied by `redeploy --updateConnector`?
- U5 is `MC_AUDIENCE` visible to the lifecycle scripts' environment (the same configuration as the app)?
- U6 does `npm ci` in `scripts.postDeploy` omit devDependencies (NODE_ENV=production)? If yes change both lifecycle commands to `npm ci --include=dev && ...` (edit `connect.yaml`).
- U8 a private ConnectorStaged is visible only to projects listed in `privateProjects` (<https://docs.commercetools.com/certifications/build-and-deploy-custom-connector/create-your-connectorstaged.md>, Step 2); the CLI `connectorstaged create` help shows no such flag: is the creating project added automatically, or must the connector be created through the API/Merchant Center?
- U10 does the Connect CLI/platform keep a comma-separated `--configuration service.ADMIN_USER_IDS=idA,idB` value as ONE string? Documentation finding (2026-10-09): Connect configuration values are plain strings that "act as environment variables for your specific Deployment" (<https://docs.commercetools.com/connect/deployments>); the CLI format is `{key}={value}` and the flag is repeated for several keys (`--configuration <v>...`), comma splitting is not documented, so the value should arrive intact. Rehearsal check in task 9.1; fallback: the service also accepts `;` or whitespace as separators and the runbook quotes the value.
- U7 how long a sandbox redeploy takes and whether `finalize` timeout 25 min is enough.

## Glossary

- **ConnectorStaged**: private, editable connector registration created from a git URL + tag.
- **Connector (published)**: read-only version produced by `publish`; required for sandbox/production deployments.
- **Deployment**: running install of a connector in one project and Connect region; has a `key` we choose.
- **Phase 1 / phase 2**: create with placeholders / redeploy with the real service URL.
- **Origin**: scheme + host (+ port) of a URL, no path; `new URL(u).origin`.
- **forward-to JWT**: short-lived token the Merchant Center API gateway sends to our service (see change D); its audience binds it to our service URL.
- **Probe object**: throw-away Custom Object used by lifecycle scripts to prove the generated API client can write.
- **Cold start**: first request after scale-to-zero on sandbox/preview (~15 s).
- **Manual step id**: M1..M16 in the owner's manual-steps list; the published runbook repeats each description inline.

## Source map

| Legacy file | New file | Verdict |
|---|---|---|
| `router/.github/workflows/workflow.yml` | none | DROP (Cloud Run + Actions) |
| `router/.github/workflows/nimbus-mcp-gateway.yml` | none | DROP |
| `router/.github/regions.json` | none (region is a script argument) | DROP |
| `router/nimbus-mcp-gateway/Dockerfile` | none | DROP |
| `router/service/src/utils/startup-checks.ts` | `service/src/connector/post-deploy.ts` (idea only) | CHANGE (checks move to deploy time; runtime keeps C's fail-fast validation) |
| `router/ARCHITECTURE.md` (MC auth section) | `docs/deployment-runbook.md` (audience explanation) | CHANGE |
| (new) | `scripts/connect/connect.mjs`, `scripts/connect/lib/*.mjs`, `scripts/connect/.env.connect.example` | new |
| (new) | `service/src/connector/{post-deploy,pre-undeploy,env,checks/*}.ts` | new |
| (new) | `docs/deployment-runbook.md` | new |

## Decisions

**D-U1. One Node CLI (`connect.mjs`) instead of many bash scripts.** It needs JSON parsing, masking, polling and unit tests. Alternatives: bash wrappers (parsing `describe` text, no tests, secret leaks via `set -x`) - rejected; `make` targets - rejected. The CLI is dependency-free (Node 22 `fetch`, `node:child_process.execFileSync` with argument arrays, no shell).

**D-U2. Official CLI for mutations, REST only for reads.** Mutations go through `commercetools connect ...` so the documented commands remain the source of truth; REST (`GET deployments/key=`) is used because the CLI has no machine-readable output. Alternative: all-REST (the skill suggests it can be better) - rejected for v1: more request-shape code to maintain; revisit if CLI output proves unstable.

**D-U3. Secrets are passed as `--configuration` arguments.** They are visible in the local process list during the call. Alternatives: REST body from stdin (hides argv, but replaces the CLI path), Merchant Center UI entry (manual). Accepted for a developer workstation; documented in the runbook; masked in all printed output. Revisit if a CI is ever allowed (it is not).

**D-U4. `finalize` does a configuration-only redeploy, not `--updateConnector`.** The code does not change between phases; `updateConnector` is reserved for `update-code`. Avoids accidental version jumps.

**D-U5. One Deployment for all apps.** Follows D-B1. Failure mode: a bad service config forces a redeploy of the three static apps too (acceptable, they are cheap).

**D-U6. `CLOUD_IDENTIFIER` derived from region (E9) instead of asked from the user.** Prevents `gcp-us` frontends against a `europe-west1.gcp` project.

**D-U7. Lifecycle script policy: fail on facts we can prove wrong, warn on transient.** Malformed key, Vertex 4xx, probe failure, audience mismatch -> exit 1 (the deployment may still be marked Deployed, hence the runbook check of logs and `GET /service/status`). Vertex 5xx/timeouts, `project_id` mismatch -> warning only. Alternative: always warn - rejected, users would not notice misconfiguration. Alternative: always fail - rejected, a Vertex incident would block unrelated installs.

**D-U8. Service fails closed until `MC_AUDIENCE` is set.** Provided by change D; U only verifies and instructs. Phase 1 therefore produces a healthy but unusable service by design.

**D-U9. Lifecycle env module (`connector/env.ts`) is the one place besides `readConfiguration()` that reads `process.env`.** Lifecycle scripts run before and outside the app and must not demand keys they do not use; they still validate what they use and name each missing key.

**D-U10. `preUndeploy` does not delete data.** Alternative: purge `ai-assistant-*` containers - rejected (irreversible data loss on a routine undeploy; Q13). A documented optional purge command can live in the runbook.

**D-U11. Provider keys are plain deployment configuration (owner decision Q4, 2026-10-09).** `deploy` passes the provider keys that are set; `configure` is the supported way to add, change or rotate them later (a partial-merge configuration redeploy limited to an allow-list, so a typo cannot overwrite `GCP_SA_KEY_BASE64`). `postDeploy` reports which providers are configured (names only) so the operator gets feedback without any value in logs; the report never fails the deployment because providers are optional. Alternative: an admin UI or Custom Objects - rejected by the owner. Same argv-visibility caveat as D-U3.

## Risks / Trade-offs

- [U2 false: redeploy does not rebuild MC bundles] -> detected in rehearsal 9.1 before any user relies on it; fallback options are listed in the findings; owner is asked only if needed.
- [A failing `postDeploy` still shows `Deployed`] -> `finalize` reads `deployment logs` for the `postDeploy: FAILED` marker and exits 1; runbook step "verify".
- [CLI output/flags change (version 0.0.x)] -> `lib/cli.mjs` is the single place that builds argument arrays; unit tests assert them; `--help` snapshot noted in the runbook.
- [Secrets in argv] -> D-U3.
- [Preview/sandbox cold start causes the smoke check to flap] -> retries with backoff up to 90 s.
- [Private staging repo drifts from the future public repo] -> `update-code` always works from a tag; the same script later points at the public URL (M13).
- [Region mapping table becomes stale] -> one table in `lib/regions.mjs` with a test; unknown region -> refuse.
- [Quota or permission errors from `manage_api_clients` scope missing] -> preflight prints the exact scope list required (E5).

## Migration Plan

Implement helpers and tests first (no network), then the CLI commands against `--dry-run`, then the lifecycle scripts, then the runbook, then one real sandbox rehearsal by the agent with the owner's manual steps done. Rollback: `deployment delete` removes the installation; `preUndeploy` leaves data. Re-run `finalize` after any redeploy that changes the service URL (a recreated deployment may get a new URL).

## Open Questions

- **UQ1 (owner, refines Q14):** sandbox only for v1 (default) - confirm; production is supported by the script but guarded.
- **UQ2 (owner):** which Connect region and project for rehearsals (default `us-central1.gcp`, scratch project from M3).
- **UQ3 (new):** private staging repository name/location and who grants `connect-mu` access (manual M15).
- U1-U7 above (platform behaviour, resolved by the rehearsal) and U9: does `deployment redeploy --configuration KEY=` with an empty value clear a configuration key (for `configure`; resolved by the rehearsal).

## Changelog

- 2026-10-09 (owner decision Q9): all Google Cloud settings are optional deployment inputs (`GCP_PROJECT_ID` defaults to the key's project; `GCP_VERTEX_LOCATION`, `GCP_BIGQUERY_DATASET_ID`, `GCP_BIGQUERY_LOCATION`, `GCP_BUCKET_NAME`, `GCP_BUCKET_LOCATION`, `IMAGE_URL_MODE` pass through `deploy` phase 1 and the `configure` allow-list; `GCP_SA_KEY_BASE64` stays deploy-only); `postDeploy` gains the analytics self-check (L `checkGcpAnalytics()`: create dataset/bucket idempotently when permitted, else actionable warning, never an exit-code failure); runbook config list updated.

- 2026-10-09 (owner decision Q4): added provider keys to the deployment inputs, `deploy` phase 1 and masking; new `configure` command (task 5.6, ten commands); `postDeploy` provider report (task 6.5; later tasks renumbered 6.6/6.7); runbook, manual step M21 and rehearsal item U9. Needs now also reads change J's validators when merged.
- 2026-10-09 (owner decision: admin = `ADMIN_USER_IDS` only; Q12/Q46 test users): `ADMIN_USER_IDS` (comma-separated Merchant Center user ids, standard configuration) joins the deployment inputs (`.env.connect`, `deploy` phase 1 as ONE item, `configure` allow-list, spec requirement `Administrator allowlist is deployment configuration`); runbook documents the fail-closed default, the first-administrator bootstrap (deploy, read "Your user ID" in Settings > About, `configure ADMIN_USER_IDS=<id>`, refresh) and manual step M10 (users A and B by user id); Connect docs checked: configuration values are plain strings acting as environment variables, CLI form `{key}={value}`, comma splitting undocumented -> rehearsal check U10 added to task 9.1 with a separator fallback; tasks 5.6 moved into section 5 (numbering fixed).
