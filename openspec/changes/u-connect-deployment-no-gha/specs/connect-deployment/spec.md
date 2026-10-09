## ADDED Requirements

### Requirement: Deployment uses only the Connect CLI and Connect API
All deployment automation SHALL consist of scripts under `scripts/connect/` that invoke the `commercetools connect ...` CLI (with argument arrays, never through a shell string) or perform read-only HTTPS calls to `https://connect.<region>.commercetools.com`. The repository SHALL NOT contain GitHub Actions workflows, Dockerfiles, Terraform, `gcloud` or `docker push` invocations in any script.

#### Scenario: No forbidden tooling
- **WHEN** `node scripts/check-repo-rules.mjs` and `grep -rnE "gcloud|docker push|terraform|gh workflow" scripts service/src` run
- **THEN** the first exits 0 and the grep prints nothing

### Requirement: Configuration comes from the environment and secrets are masked
`scripts/connect/connect.mjs` SHALL read its settings from process environment variables (optionally loaded from an untracked `scripts/connect/.env.connect`), SHALL validate that required variables are present before invoking any CLI command, and SHALL print every command it runs with secured values replaced by `***`. `scripts/connect/.env.connect.example` SHALL list all variable names with empty secret values.

#### Scenario: Missing variable
- **WHEN** `node scripts/connect/connect.mjs deploy` runs without `GCP_SA_KEY_BASE64`
- **THEN** it exits 2, names the missing variable and executes no CLI command

#### Scenario: Secrets never printed
- **WHEN** `deploy --dry-run` runs with `GCP_SA_KEY_BASE64=abc`, `ENCRYPTION_KEY=def` and `STRIPE_SECRET_KEY=ghi`
- **THEN** stdout contains `service.GCP_SA_KEY_BASE64=***` and `service.STRIPE_SECRET_KEY=***` and none of `abc`, `def`, `ghi` appears anywhere in stdout or stderr

### Requirement: Stage, publish and preview are create-or-update and tag-driven
`stage` SHALL create the ConnectorStaged for `CONNECTOR_KEY` when absent and otherwise run `connectorstaged update` with the new `--repository-url`/`--repository-tag`; `publish` SHALL run `connectorstaged publish`; `preview` SHALL run `connectorstaged preview` with a `--deployment-key` and `--region`. Each SHALL be safe to repeat. `update-code` SHALL execute the chain `stage` (new tag) -> `publish` -> `deployment redeploy --updateConnector`.

#### Scenario: Re-running stage
- **WHEN** `stage` runs twice with the same tag
- **THEN** the second run issues `connectorstaged update` and exits 0

#### Scenario: Code update chain
- **WHEN** `update-code --tag v0.2.0` runs
- **THEN** the printed command order is `connectorstaged update`, `connectorstaged publish`, `deployment redeploy ... --updateConnector`

### Requirement: Deployment types and the production guard
The script SHALL support `--type sandbox` (default), `--type preview` (via `connectorstaged preview`) and `--type production`. `production` SHALL be refused unless `--confirm-production` is passed. Sandbox and preview deployments SHALL be documented as scaling to zero (about 15 s cold start) and preview deployments as short-lived and to be deleted after testing.

#### Scenario: Production without confirmation
- **WHEN** `deploy --type production` runs without `--confirm-production`
- **THEN** it exits 2 with a message pointing to the runbook and runs no CLI command

### Requirement: Two-phase deployment
`deploy` (phase 1) SHALL create one Deployment containing all four applications, passing the registered ids (`CUSTOM_APPLICATION_ID`, `ENTRY_POINT_URI_PATH` for `mc-app` and `composed-apps`, `CUSTOM_VIEW_ID` for `mc-view-app`), `CLOUD_IDENTIFIER` derived from the Connect region, the service secrets, and NO `MC_AUDIENCE` and NO `CHAT_SERVICE_ENDPOINT_URL`. `finalize` (phase 2) SHALL read the service URL from the Deployment (`applications[name=service].url`), compute the origin, and redeploy with `service.MC_AUDIENCE=<origin>` and `<app>.CHAT_SERVICE_ENDPOINT_URL=<origin>/service` for `mc-app`, `composed-apps` and `mc-view-app`; wait until the Deployment status is `Deployed` (timeout 25 minutes); call `GET <origin>/service/status` with retries (cold start); and print the three application URLs for the Merchant Center registrations.

#### Scenario: Phase 2 computes the right values
- **WHEN** the helper receives a Deployment whose service url is `https://service-abc.us-central1.gcp.commercetools.app/service`
- **THEN** `MC_AUDIENCE` is `https://service-abc.us-central1.gcp.commercetools.app` and `CHAT_SERVICE_ENDPOINT_URL` is `https://service-abc.us-central1.gcp.commercetools.app/service`

#### Scenario: Redeploy is a partial merge
- **WHEN** `finalize` redeploys
- **THEN** it passes only the four changed keys and never re-sends secured values

#### Scenario: Service URL not yet known
- **WHEN** `finalize` runs while the Deployment status is `Queued` or the service url is empty
- **THEN** it keeps polling until the timeout and then exits 1 with the `deployment logs` hint

### Requirement: Administrator allowlist is deployment configuration
`deploy` SHALL pass `service.ADMIN_USER_IDS=<value>` (standard configuration) only when `ADMIN_USER_IDS` is set and non-empty in the environment, keeping the whole comma-separated list of Merchant Center user ids as ONE configuration item, and SHALL NOT require it. `configure` SHALL accept `ADMIN_USER_IDS=<value>` in addition to the provider and Google keys. `docs/deployment-runbook.md` SHALL list `ADMIN_USER_IDS` in the configuration table and in the first-install steps, SHALL describe the fail-closed behaviour (empty list means nobody is an administrator), SHALL contain the bootstrap sequence (deploy, open the app, read the "Your user ID" line under Settings > About, `configure ADMIN_USER_IDS=<id>`, refresh) and the manual step M10 (create the two test users, put only user A's id into `ADMIN_USER_IDS`, grant both the app's ordinary permission; no permission strings are captured).

#### Scenario: ADMIN_USER_IDS passed as one item
- **WHEN** `deploy --dry-run` runs with `ADMIN_USER_IDS=id-a,id-b`
- **THEN** the printed command contains exactly one `service.ADMIN_USER_IDS=id-a,id-b` item and it is not masked

#### Scenario: ADMIN_USER_IDS omitted when unset
- **WHEN** `deploy --dry-run` runs with `ADMIN_USER_IDS` unset or empty
- **THEN** the printed command contains no `service.ADMIN_USER_IDS` item

#### Scenario: Configure accepts the allowlist
- **WHEN** `configure ADMIN_USER_IDS=id-a --dry-run` runs
- **THEN** it prints one `deployment redeploy` line with `service.ADMIN_USER_IDS=id-a`, without `--updateConnector`, and exits 0

#### Scenario: Runbook lists the allowlist and the bootstrap
- **WHEN** `grep -c "ADMIN_USER_IDS" docs/deployment-runbook.md` runs
- **THEN** it prints 3 or more, the runbook contains the `[MANUAL M10]` line and the phrase "Your user ID"

### Requirement: Third-party provider keys are deployment configuration
`deploy` SHALL pass each of `CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION`, `ALGOLIA_MCP_URL`, `STRIPE_SECRET_KEY` and `STRIPE_CONNECTED_ACCOUNT_ID` as `service.<KEY>=<value>` only when it is set and non-empty in the environment, and SHALL NOT require any of them. `configure KEY=VALUE [KEY=VALUE ...]` SHALL accept only these seven keys, redeploy with exactly those `service.<KEY>=<value>` items (partial merge, no `--updateConnector`), wait for `Deployed` and run the smoke check; an empty value SHALL be refused with a message that clearing a key requires removing it in the Connect configuration. Secured provider values (`CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `ALGOLIA_MCP_URL`, `STRIPE_SECRET_KEY`) SHALL be masked in every printed command.

#### Scenario: Only set keys are passed
- **WHEN** `deploy --dry-run` runs with only `STRIPE_SECRET_KEY` set among the provider keys
- **THEN** the printed command contains `service.STRIPE_SECRET_KEY=***` and no other provider key

#### Scenario: Configure allow-list
- **WHEN** `configure STRIPE_SECRET_KEY=sk_test_x GCP_SA_KEY_BASE64=y --dry-run` runs
- **THEN** it exits 2 naming `GCP_SA_KEY_BASE64` as not configurable through this command and runs no CLI command

#### Scenario: Configure prints a masked redeploy
- **WHEN** `configure CONTENTSTACK_REGION=eu CONTENTSTACK_API_KEY=abc --dry-run` runs
- **THEN** the printed command is a `deployment redeploy` with `service.CONTENTSTACK_REGION=eu` and `service.CONTENTSTACK_API_KEY=***` and without `--updateConnector`

### Requirement: postDeploy verifies the runtime dependencies idempotently
The service `postDeploy` entry point SHALL: (1) decode `GCP_SA_KEY_BASE64`, require JSON with `type: "service_account"`, `client_email` and a `private_key` containing `BEGIN PRIVATE KEY`, and warn when `GCP_PROJECT_ID` is set and differs from the key's `project_id` (the effective project is `GCP_PROJECT_ID`, else the key's); (2) obtain an access token with the cloud-platform scope and call Vertex AI `countTokens` for `GEMINI_LITE_MODEL_NAME` in `GCP_VERTEX_LOCATION` (default `us-central1`); (3) write, read and delete a probe Custom Object (container `ai-assistant-lifecycle`, key `post-deploy-probe`) proving the generated API client works; (4) when `MC_AUDIENCE` is set, require its origin to equal the origin of `CONNECT_SERVICE_URL`, and when unset log the exact value to configure; (5) log the origin of `CONNECT_SERVICE_URL`; (6) run the Google analytics self-check of change L (`checkGcpAnalytics()`): create the BigQuery dataset (`GCP_BIGQUERY_DATASET_ID`, `GCP_BIGQUERY_LOCATION`) and the image bucket (`GCP_BUCKET_NAME` or `<project>-ai-assistant-images`, `GCP_BUCKET_LOCATION`) idempotently when they are missing and the service account may create them, otherwise log one actionable `post-deploy: gcp analytics:` line per missing resource naming the IAM role or the manual creation step; this check only warns; (7) log one line per provider (`contentstack`, `algolia`, `stripe`) stating `configured` or `not configured (missing: <KEY names>)`, using the same enablement rule as change J and never printing a value, a length or a host. The provider report and the analytics self-check SHALL NOT affect the exit code. It SHALL exit non-zero on a malformed key, a Vertex 4xx or a probe failure, SHALL only warn on Vertex 5xx/timeouts, SHALL never log key material, and running it twice SHALL leave no probe object behind.

#### Scenario: Malformed key
- **WHEN** `GCP_SA_KEY_BASE64` is not valid Base64 JSON
- **THEN** the script exits 1 and the message names the failing check without echoing the input

#### Scenario: Audience mismatch
- **WHEN** `MC_AUDIENCE=https://other.example` and `CONNECT_SERVICE_URL=https://service-abc.us-central1.gcp.commercetools.app/service`
- **THEN** the script exits 1 and states both origins

#### Scenario: Provider report without values
- **WHEN** `STRIPE_SECRET_KEY=sk_test_SENTINEL` is set and the Contentstack keys are not
- **THEN** the log contains `stripe: configured` and `contentstack: not configured (missing: CONTENTSTACK_API_KEY, CONTENTSTACK_MANAGEMENT_TOKEN)`, never contains `SENTINEL`, and the exit code is 0

#### Scenario: Idempotent probe
- **WHEN** the script runs twice in a row against a project
- **THEN** both runs exit 0 and a query of container `ai-assistant-lifecycle` returns zero results afterwards

### Requirement: preUndeploy removes only what the connector created
`preUndeploy` SHALL delete the probe Custom Object if present (a 404 is success) and SHALL NOT delete sessions, messages, settings, tokens, feedback or any other Custom Object, so that uninstalling does not destroy user data. It SHALL log which containers remain.

#### Scenario: Data survives undeploy
- **WHEN** `preUndeploy` runs in a project that has objects in `ai-assistant-sessions`
- **THEN** those objects still exist afterwards and the exit code is 0

### Requirement: Deployment runbook with marked manual steps
`docs/deployment-runbook.md` SHALL describe prerequisites, first install (including the manual registration of the Custom Applications and View before phase 1 and the URL update after phase 2), update, rollback, undeploy and troubleshooting, and SHALL mark each owner-only action with `[MANUAL <id>]` accompanied by a self-contained description (the published repository does not contain `plans/`). It SHALL state the fail-open/fail-closed stance (service fails closed on auth until `MC_AUDIENCE` is set), the required scopes and the configuration table, and SHALL document how to enable, change and rotate the third-party provider keys (set them in `.env.connect` before `deploy` or run `configure KEY=VALUE`; a change needs a configuration redeploy; a provider is enabled only when its required keys are set and valid).

#### Scenario: Manual steps are discoverable
- **WHEN** `grep -c "\[MANUAL" docs/deployment-runbook.md`
- **THEN** the count is at least 6 (registration of apps and view, URL update, Docker, private repo access, Connect login)
