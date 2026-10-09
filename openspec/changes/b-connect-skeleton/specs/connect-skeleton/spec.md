## ADDED Requirements

### Requirement: One connect.yaml declares exactly four applications
The repository root SHALL contain `connect.yaml` whose `deployAs` list has exactly these entries, in this order: `service` (`applicationType: service`, `endpoint: /service`), `mc-app` (`merchant-center-custom-application`), `composed-apps` (`merchant-center-custom-application`), `mc-view-app` (`merchant-center-custom-view`). Each `name` SHALL equal the name of a root-level folder that contains that application. The MC entries SHALL NOT declare `endpoint`, `securedConfiguration` or `APPLICATION_URL`.

#### Scenario: Names and folders agree
- **WHEN** `node scripts/check-connect-layout.mjs` runs
- **THEN** it exits 0 only if every `deployAs[].name` has a root folder of that name containing a `package.json`, and no other root folder except `scripts/` contains a `package.json`

#### Scenario: MC entry with forbidden keys
- **WHEN** `mc-app` in `connect.yaml` gains an `endpoint` or a `securedConfiguration`
- **THEN** `node scripts/check-connect-layout.mjs` exits 1 naming the key

### Requirement: Service configuration contract
The `service` entry SHALL declare these `standardConfiguration` keys: `CLOUD_IDENTIFIER` (default `gcp-us`), `MC_AUDIENCE` (`required: false`), `GCP_PROJECT_ID` (`required: false`; defaults to the `project_id` of the service-account key), `GCP_VERTEX_LOCATION` (default `us-central1`), `GEMINI_MODEL_NAME`, `GEMINI_LITE_MODEL_NAME`, `GCP_BIGQUERY_DATASET_ID` (default `aiassistant`), `GCP_BIGQUERY_LOCATION` (default `us-central1`), `GCP_BUCKET_NAME` (`required: false`; defaults to `<gcp project id>-ai-assistant-images`), `GCP_BUCKET_LOCATION` (default `us-central1`), `IMAGE_URL_MODE` (default `private`, allowed `private` or `public`), `MCP_TOOLS_TTL_MS` (default `1800000`), `LOG_LEVEL` (default `info`), `ADMIN_USER_IDS` (`required: false`; comma-separated allowlist of administrator Merchant Center user ids, empty or unset means nobody is an administrator), and the optional third-party provider keys `CONTENTSTACK_BRANCH` (`required: false`), `CONTENTSTACK_REGION` (default `na`), `STRIPE_CONNECTED_ACCOUNT_ID` (`required: false`); and these `securedConfiguration` keys: `GCP_SA_KEY_BASE64`, `ENCRYPTION_KEY` (both `required: true`) and, all `required: false`, `CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `ALGOLIA_MCP_URL`, `STRIPE_SECRET_KEY` (third-party provider credentials are deployment configuration, owner decision Q4; a provider is enabled only when its required keys are set). Every Google Cloud setting SHALL therefore be optional or defaulted and configurable through `connect.yaml`; all Google services use the single `GCP_SA_KEY_BASE64` credential and no other credential key exists. The legacy name `GCP_LOCATION` SHALL NOT appear. Every key SHALL have a non-empty `description`. The entry SHALL NOT declare `CTP_PROJECT_KEY`, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_SCOPE`, `CTP_API_URL`, `CTP_AUTH_URL` or `CTP_REGION`.

#### Scenario: Secrets are secured
- **WHEN** the check script parses `connect.yaml`
- **THEN** `GCP_SA_KEY_BASE64`, `ENCRYPTION_KEY`, `CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `ALGOLIA_MCP_URL` and `STRIPE_SECRET_KEY` appear only under `securedConfiguration`, and no key whose name contains `SECRET`, `KEY` (other than `*_MODEL_NAME`, `GCP_*_ID`-style identifiers) or `TOKEN` appears under `standardConfiguration`

#### Scenario: ADMIN_USER_IDS is optional standard configuration
- **WHEN** the check script parses `connect.yaml`
- **THEN** `ADMIN_USER_IDS` appears under the `service` `standardConfiguration` with `required: false` and a non-empty description, and nowhere else

#### Scenario: ADMIN_USER_IDS in the wrong place
- **WHEN** `ADMIN_USER_IDS` is added under `securedConfiguration` or to an MC application
- **THEN** the layout check fails naming the key and the expected section

#### Scenario: Provider secret in the wrong place
- **WHEN** `STRIPE_SECRET_KEY` is added under `standardConfiguration`, or `CONTENTSTACK_REGION` under `securedConfiguration`
- **THEN** the layout check fails naming the key and the expected section

#### Scenario: Injected variables are not redeclared
- **WHEN** a contributor adds `CTP_CLIENT_ID` to the service configuration
- **THEN** the layout check fails with a message that Connect injects it through `inheritAs.apiClient`

### Requirement: Merchant Center application configuration contract
`mc-app` and `composed-apps` SHALL declare `standardConfiguration` keys `CUSTOM_APPLICATION_ID` (required), `ENTRY_POINT_URI_PATH` (required), `CLOUD_IDENTIFIER` (default `gcp-us`) and `CHAT_SERVICE_ENDPOINT_URL` (`required: false`, default `https://not-configured.invalid/service`). `mc-view-app` SHALL declare `CUSTOM_VIEW_ID` (required), `CLOUD_IDENTIFIER` (default `gcp-us`) and `CHAT_SERVICE_ENDPOINT_URL` (same default) and SHALL NOT declare `ENTRY_POINT_URI_PATH`. Each folder's config file (`custom-application-config.mjs` / `custom-view-config.mjs`) SHALL reference these only through `${env:NAME}` placeholders (and `${env:APPLICATION_URL}` for the production URL) with no per-project literal.

#### Scenario: Placeholder default signals an unconfigured service
- **WHEN** a deployment is created without a value for `CHAT_SERVICE_ENDPOINT_URL`
- **THEN** the deployment succeeds and the stub UI can detect the `.invalid` host (RFC 2606 reserved) to show "service URL not configured"

#### Scenario: No literal ids in config files
- **WHEN** `grep -nE "applicationId: '[^$]|customViewId: '[^$]" mc-app composed-apps mc-view-app`
- **THEN** it prints nothing

### Requirement: Merchant Center scopes without a custom admin permission
The `oAuthScopes` of `mc-app`, `composed-apps` and `mc-view-app` config files SHALL list `view_mcp_servers` under `view` and `manage_mcp_servers` under `manage` (in addition to the scopes the application already needs). The config files and `src/constants.ts` SHALL NOT declare `additionalOAuthScopes` or a custom permission list; each Custom Application keeps only its default View/Manage permission pair, which controls access to the app and the Merchant Center GraphQL proxy and does not decide administrator status.

#### Scenario: MCP scopes are plain oAuthScopes
- **WHEN** `node scripts/check-connect-layout.mjs` inspects the three MC config files
- **THEN** each lists `view_mcp_servers` in `view` and `manage_mcp_servers` in `manage`, and exits 0

#### Scenario: Additional scopes are rejected
- **WHEN** a config file contains `additionalOAuthScopes`
- **THEN** the layout check exits 1 naming the file

### Requirement: Least-privilege API client via inheritAs
`connect.yaml` SHALL contain a single top-level `inheritAs.apiClient.scopes` list. Its content in this change SHALL be exactly `view_key_value_documents` and `manage_key_value_documents`. Each later change that needs another scope SHALL add it there together with a one-line justification in `docs/` (change W) and SHALL NOT use `manage_project`.

#### Scenario: Forbidden broad scope
- **WHEN** `manage_project` appears in `inheritAs.apiClient.scopes`
- **THEN** the layout check fails

#### Scenario: Scope list is connector-wide
- **WHEN** a reviewer looks for per-application scope lists
- **THEN** none exist, because `inheritAs.apiClient` is a top-level key shared by the connector (documented in design "Platform facts")

### Requirement: Service stub mounted at the endpoint with a status route
`service/` SHALL be a TypeScript Express application listening on `process.env.PORT` (default 8080), mounting its router at `/service` (equal to `endpoint`), exposing `GET /service/status` returning HTTP 200 and JSON `{ "status": "ok" }`, and defining npm scripts `build`, `start`, `test`, `typecheck`, `connector:post-deploy`, `connector:pre-undeploy`. Lifecycle scripts SHALL be wired in `connect.yaml` as `scripts.postDeploy: npm ci && npm run build && npm run connector:post-deploy` and `scripts.preUndeploy: npm ci && npm run build && npm run connector:pre-undeploy`, and in this change both entry points SHALL exit 0 after logging one line.

#### Scenario: Status reachable under the endpoint path
- **WHEN** the jest test `status route returns ok under /service` runs with supertest
- **THEN** `GET /service/status` returns 200 and `{ "status": "ok" }`, and `GET /status` returns 404

#### Scenario: Lifecycle stubs are harmless
- **WHEN** `npm run build && npm run connector:post-deploy` runs in `service/`
- **THEN** the process exits 0

### Requirement: Frontend stubs build with one pinned toolchain
`mc-app`, `composed-apps` and `mc-view-app` SHALL each build with `mc-scripts build` and typecheck with `tsc --noEmit`. All `@commercetools-frontend/*` dependencies in all three SHALL be pinned to the same exact version (27.9.6), Node engine `22.x`, React 19, independent lockfile per folder. No folder SHALL contain a `workspaces` field and no root `package.json` SHALL exist. `.env` files SHALL NOT be tracked.

#### Scenario: Version drift is detected
- **WHEN** `composed-apps/package.json` pins `@commercetools-frontend/application-shell` to `25.1.0`
- **THEN** `node scripts/check-connect-layout.mjs` exits 1 listing the mismatch

#### Scenario: Stub builds
- **WHEN** `yarn build` runs in `mc-app/` with the env vars from `.env.example` exported (placeholder values)
- **THEN** it exits 0 and creates `public/index.html`

### Requirement: Connect validation is green
`commercetools connect validate` run at the repository root SHALL exit 0, with a running Docker daemon. This SHALL be recorded as a Definition-of-Done command for every change that edits `connect.yaml` or an application folder.

#### Scenario: Validation passes on the skeleton
- **WHEN** `commercetools connect validate` runs on a clean checkout
- **THEN** it exits 0 and no application is reported as invalid

#### Scenario: Wrong endpoint mount is caught by test
- **WHEN** the service router is mounted at `/` instead of `/service`
- **THEN** the status-route jest test fails

### Requirement: Platform environment contract is recorded in connect.yaml
`connect.yaml` SHALL begin with a comment block stating: (1) the `CTP_*` variables Connect injects when `inheritAs.apiClient` is used, (2) that `CONNECT_SERVICE_URL` exists only in lifecycle scripts, so `MC_AUDIENCE` and `CHAT_SERVICE_ENDPOINT_URL` are set by redeploy (change U), (3) that `APPLICATION_URL` is injected for MC apps.

#### Scenario: Header comment present
- **WHEN** `head -30 connect.yaml`
- **THEN** it contains the strings `CONNECT_SERVICE_URL`, `APPLICATION_URL` and `inheritAs`
