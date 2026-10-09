## Context

Plans `02-target-architecture.md` section 2 sketches `connect.yaml`; this change freezes it after verification against the official docs and the Connect CLI. The legacy chat-app `connect.yaml` declares only `mc-app` (`CUSTOM_APPLICATION_ID`, `CLOUD_IDENTIFIER` default `gcp-us`, `ENTRY_POINT_URI_PATH`, `CHAT_SERVICE_ENDPOINT_URL` required); the router service was deployed to Cloud Run and had no `connect.yaml`.

## Platform facts (read this first; changes D and U depend on it)

All facts verified 2026-10-08 against the commercetools Knowledge MCP / docs and the installed Connect CLI (`@commercetools/cli/0.0.17`). Anything not verifiable is listed under "Unverified" and becomes a sandbox check in change U.

| # | Fact | Source |
|---|---|---|
| PF1 | With `inheritAs.apiClient.scopes` Connect generates an API client and injects exactly: `CTP_API_URL`, `CTP_AUTH_URL`, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_PROJECT_KEY`, `CTP_SCOPE`. These keys must **not** be declared in `configuration` ("to prevent configuration conflicts"). **`CTP_REGION` is NOT in the list**: do not require it; the SDK client needs only `CTP_API_URL` + `CTP_AUTH_URL`. (`plans/02` lists `CTP_REGION (inherited)`; this is corrected here, see plan amendments.) | <https://docs.commercetools.com/connect/modify-connector.md> ("Variables available in the Connect application") |
| PF2 | `CONNECT_SERVICE_URL` ("The public URL of the Connect application") is documented **only as an extra variable of `postDeploy`/`preUndeploy` scripts for service applications**. It is not documented as a runtime variable of the service process. Therefore **the service cannot learn its own public origin at runtime from Connect**: `MC_AUDIENCE` must be supplied as configuration (set on a redeploy after the URL is known, change U). | <https://docs.commercetools.com/connect/automation-scripts.md> |
| PF3 | The URL of an application has the format `{connect-provided-url}/{endpoint}` (example `https://service-XYZ.europe-west1.gcp.commercetools.app/service`). After deployment it is readable from the Deployment: `Deployment.applications[]` items carry `applicationName` and `url` (also `topic`, `schedule`). `commercetools connect deployment describe --key <k>` returns it. | <https://docs.commercetools.com/connect/development.md> (`endpoint` row); OpenAPI `connect-Deployment` (`ApplicationDeployment.url`), fetched with the Connect skill script `openApi-schemata.mjs` |
| PF4 | `APPLICATION_URL` is provided automatically by Connect for `merchant-center-custom-application` / `-custom-view` apps; it must NOT be declared in `connect.yaml`. The config files use `url: '${env:APPLICATION_URL}'`. | <https://docs.commercetools.com/merchant-center-customizations/deployment/commercetools-connect.md> |
| PF5 | `merchant-center-custom-view` `connect.yaml` fields per the deployment doc: `CUSTOM_VIEW_ID` + `CLOUD_IDENTIFIER` (no entry-point path). The generic starter listing in `development.md` shows `ENTRY_POINT_URI_PATH` for a view; the deployment doc, the connect skill and the legacy view config (`customViewId` only) agree on the former, so B follows the former. `endpoint` is not allowed/required for MC apps and assets; `configuration` is optional only for `assets`. | <https://docs.commercetools.com/merchant-center-customizations/deployment/commercetools-connect.md>; <https://docs.commercetools.com/connect/development.md> |
| PF6 | `inheritAs.apiClient.scopes` is a **top-level, connector-wide key** (sibling of `deployAs`), not a per-application key: one API client per Deployment (`Deployment.apiClient`). It therefore is "per connector". Whether the generated credentials are also injected into the MC apps is not documented (they do not need them). The deployer's own token needs the `manage_api_clients` scope to let Connect create the client, and the required scopes are shown at deployment time. | <https://docs.commercetools.com/connect/modify-connector.md>; <https://docs.commercetools.com/connect/hosts-and-authorization.md> |
| PF7 | `name` of an application: up to 256 chars, `[A-Za-z0-9_-]`, **must match the folder**. `endpoint`: optional leading `/`, up to 256 chars, same charset. | <https://docs.commercetools.com/connect/development.md> |
| PF8 | Runtime behaviour: service request timeout 5 min; sandbox deployments scale to zero (~15 s cold start); preview needs `isPreviewable`; production only for published connectors in non-trial projects; a ConnectorStaged cannot be deployed to sandbox. | <https://docs.commercetools.com/connect/deployment-behavior-and-environments.md> |
| PF9 | CLI: `commercetools connect validate [DIRECTORY] [--skip tests\|analysis]`; requirements list Node, npm and **Docker**; the command failed here with `Cannot connect to the Docker daemon` while Docker Desktop was stopped. So a running Docker daemon is a precondition of the Definition of Done. Region flags for deployment commands are the GCP regions `us-central1.gcp`, `europe-west1.gcp`, `australia-southeast1.gcp` (the API additionally lists two AWS regions). | <https://docs.commercetools.com/connect/cli.md>; local run 2026-10-08 |
| PF10 | `commercetools connect init <dir> --template tax-integration` leaves `.github/{CODEOWNERS,dependabot.yml,workflows/ci.yml}`, `.idea/`, `.cm/`, a root `LICENSE` and an old-style `inheritAs.configuration` with `CTP_*` secured keys. Do not scaffold into this repo; use scratch scaffolds only as reference. | local run 2026-10-08 |
| PF11 | `npx @commercetools-frontend/create-mc-app@latest` is at **27.13.0**; its `starter-typescript` template includes Channels sample components, `src/types/generated/ctp.ts`, `schemas/ctp.json`, `AGENTS.md`, `CLAUDE.md`, a `.env`, a flat `eslint.config.js` and `.nvmrc` = `22`. The plan pins 27.9.6 (D7, the version in the legacy mc-app). Everything the sample adds beyond the shell must be deleted. | local run 2026-10-08 |
| PF12 | MC config files accept `${env:NAME}` placeholders; `APPLICATION_URL`, `CUSTOM_APPLICATION_ID`/`CUSTOM_VIEW_ID`, `ENTRY_POINT_URI_PATH`, `CLOUD_IDENTIFIER` are the deploy-time values. `additionalEnv.chatServiceEndpointUrl: '${env:CHAT_SERVICE_ENDPOINT_URL}'` (legacy pattern) exposes the service URL to the browser bundle at compile-html time. The Custom Application / View keeps only the default View/Manage permission pair (it controls access to the app and the Merchant Center GraphQL proxy, not administration); there is no custom admin permission (owner decision 2026-10-09: admin = user id in `ADMIN_USER_IDS`, change D). | <https://docs.commercetools.com/merchant-center-customizations/tooling-and-configuration/custom-view-config.md>; legacy files |

**Unverified (resolve in change U sandbox run):** (U1) whether a non-required `standardConfiguration` key without default is absent or empty in `process.env`; (U2) whether `deployment redeploy --configuration mc-app.CHAT_SERVICE_ENDPOINT_URL=...` **rebuilds** the MC bundle so the new `additionalEnv` is baked in; (U3) whether Connect injects `PORT` (legacy code and the official template both use `process.env.PORT || 8080`, so the stub does the same); (U4) whether editing `inheritAs.apiClient.scopes` is applied on `redeploy --updateConnector`.

## Explore findings

**E1.** The legacy MC config files differ: `mc-app/custom-application-config.mjs` has a very large `oAuthScopes` list (21 view + 33 manage scopes) and a custom admin permission with `manage_mcp_servers` declared through `additionalOAuthScopes` (REMOVED by the 2026-10-09 admin decision: `view_mcp_servers` / `manage_mcp_servers` move into the plain `oAuthScopes` `view` / `manage` lists and no group exists); `composed-apps` has the same shape on 25.1.0; `mc-view-app` has `type: 'CustomPanel'`, `typeSettings.size: 'SMALL'`, 65 locators and only `view_key_value_documents`/`manage_key_value_documents` default scopes. Their `headers.csp.script-src` still lists `*.ngrok-free.app`, `localhost:8080` and three `*.run.app` hosts (internal dev hosts; must be removed, see leak check in X). B's stub config files therefore start from minimal CSP (`connect-src: ['*.commercetools.app']`).

**E2.** Legacy MC `public/` is untracked build output (design A, E11); `mc-scripts build` regenerates it. Stub builds must therefore not rely on tracked files in `public/`.

**E3.** Legacy service defaults: `PORT || 8080` (`service/src/index.ts`), `GEMINI_MODEL_NAME=gemini-3.8-flash`, `GEMINI_LITE_MODEL_NAME=gemini-3.5-flash-lite`, `GCP_BIGQUERY_DATASET_ID=aiassistant`, `GCP_BIGQUERY_LOCATION=us-central1`, `MCP_TOOLS_TTL_MS=1800000` (legacy `service/.env.example`). B copies them as defaults **unverified**; change F must confirm the model ids exist on Vertex before they stay defaults (open question).

**E4.** Legacy startup audit treats `ENCRYPTION_KEY` and `MC_AUDIENCE` as the two must-have settings and only logs when missing (`service/src/utils/startup-checks.ts`). In the new design `MC_AUDIENCE` is intentionally optional at first deploy (two-phase) and the service fails closed on auth until it is set (spec D). `ENCRYPTION_KEY` and `GCP_SA_KEY_BASE64` are `required: true` so deployment cannot be created without them.

**E5.** The official skill requires: one folder per `deployAs` name; router mounted at the `endpoint` path; `/status` health route; fail-fast env validation; `@commercetools/platform-sdk@^8` and `@commercetools/ts-client@^4`; secrets only in `securedConfiguration`; no npm workspaces; `postDeploy: npm ci && npm run build && npm run connector:post-deploy` shape (commercetools-connect skill `references/project-structure.md`, `lifecycle-scripts.md`, `monorepo-with-storefront.md`). The doc examples use `npm install` instead of `npm ci`; `npm ci` is stricter and needs a committed `package-lock.json` (B commits one).

**E6.** Legacy lockfiles are `yarn.lock` in every folder, including the service. Connect's build uses the lockfile present; the lifecycle commands in `connect.yaml` are `npm ...`. B decision D-B3 below.

**E7.** Legacy `.connect/project.toml` (`schema-version = "0.2"`, `[io.buildpacks] exclude = ["node_modules"]`) exists in the chat-app root and is git-ignored there; the router's `.connect/` held `sast_*.log` build logs. Whether the CLI regenerates `.connect/` on `validate`/`bundle` must be checked in task 7.1; design default is to commit an equivalent `project.toml` per app only if the CLI requires it.

## Glossary

- **Connector**: a git repo with a root `connect.yaml`; one or more **applications** (`deployAs` entries).
- **Deployment**: a running installation of a connector in a project/region; created with `deployment create`.
- **standardConfiguration / securedConfiguration**: non-secret / secret environment variables supplied at deployment; secured values are write-only.
- **inheritAs.apiClient**: Connect generates an API client with the listed scopes and injects `CTP_*` variables.
- **Custom Application / Custom View**: Merchant Center UI extensions; application = own menu entry and route, view = `CustomPanel` embedded in a built-in page via `locators`.
- **entryPointUriPath**: unique URL path segment of a Custom Application in a cloud region.
- **cloudIdentifier**: Merchant Center API region id (`gcp-us`, `gcp-eu`, ...), distinct from the Connect region (`us-central1.gcp`).
- **forward-to**: Merchant Center API proxy (`/proxy/forward-to`) that calls our service with a signed short-lived JWT (see plan 00/02).
- **Stub**: the smallest code that compiles, tests green and answers the platform health route; replaced by later changes.
- **Buildpacks**: the container build mechanism the Connect CLI uses locally (needs Docker).

## Source map

| Legacy file | New file | Verdict |
|---|---|---|
| `multitenant-chat-app/connect.yaml` | `connect.yaml` | CHANGE (add service, composed-apps, mc-view-app, inheritAs; default for service URL) |
| `mc-app/custom-application-config.mjs` | `mc-app/custom-application-config.mjs` | CHANGE (minimal scopes and CSP; `name: 'AI Assistant'`) |
| `composed-apps/custom-application-config.mjs` | `composed-apps/custom-application-config.mjs` | CHANGE (name `AI Assistant Pages`) |
| `mc-view-app/custom-view-config.mjs` | `mc-view-app/custom-view-config.mjs` | CHANGE (drop `hostUriPath` store/product ids; keep type/size; locators trimmed to one for the stub; full 65 in S) |
| `mc-app/package.json`, `composed-apps/package.json`, `mc-view-app/package.json` | same paths | CHANGE (name `ai-assistant-*`, deps pinned 27.9.6, drop nimbus typegen `postinstall`) |
| `mc-app/src/constants.ts`, `mc-view-app/src/constants.ts` | same | CHANGE (keep the View/Manage `PERMISSIONS` pair and the entry-point derivation; drop the permission-group constant and the composed-pages constant) |
| `*/.nvmrc` | same | KEEP (`22`) |
| `*/.env.example` | same | CHANGE (policy A) |
| `mc-app/.env`, `mc-view-app/.env` | none | DROP |
| `*/.eslintrc.js`, `.prettierrc`, `jest.*.js`, `@types-extensions/` | same | KEEP (copied as-is, headers added by ossify) |
| `mc-app/scripts/generate-nimbus-surface.mjs`, `nimbus:typegen` | none | DROP here; revisited by O/P |
| `multitenant-chat-app/netlify.toml`, root `yarn.lock` stub | none | DROP |
| `router/service/package.json` | `service/package.json` | CHANGE (name, deps trimmed to the stub; C adds the rest) |
| `router/service/tsconfig.json`, `jest.config.cjs` | `service/tsconfig.json`, `service/jest.config.cjs` | CHANGE (stub uses simple CJS ts-jest; ESM jest mode returns with C when `ai` v7 arrives) |
| `router/service/src/index.ts`, `src/app.ts` | `service/src/index.ts`, `service/src/app.ts` | CHANGE (stub only) |
| `router/service/.env.example` | `service/.env.example` | CHANGE (Firestore/Anthropic/OpenAI keys dropped) |
| `router/service/.nvmrc` (`v22.21.1`) | `service/.nvmrc` (`22`) | CHANGE |
| `router/nimbus-mcp-gateway/**`, `.github/**`, `Dockerfile*` | none | DROP |
| (new) | `scripts/check-connect-layout.mjs`, `scripts/package.json` | new |

## Decisions

**D-B1. One deployment for all four applications, one `connect.yaml`.** Alternatives: separate connectors for service and frontends (rejected: Connect apps cannot discover each other's URLs (plan D3), two connectors double the install steps). Consequence: the `service` URL is known only after the first deployment, hence the two-phase flow in U.

**D-B2. `CHAT_SERVICE_ENDPOINT_URL` is optional with the reserved default `https://not-configured.invalid/service`.** Alternatives: `required: true` (legacy; forces a throwaway value at phase 1) or empty default (unclear whether Connect accepts an empty default). `.invalid` is reserved (RFC 2606), so a request can never reach a foreign host, and the UI can detect "not configured".

**D-B3. Service uses npm (`package-lock.json`); frontends keep yarn 1.** Rationale: the service lifecycle scripts are npm commands (docs), the app-kit toolchain and its `postinstall`-free scripts work with yarn in every legacy folder. Alternative: yarn everywhere (rejected: lifecycle `npm ci` needs a package-lock) or npm everywhere (rejected: lockfile regeneration churn for the three frontends, no benefit). Recorded as an open question for the owner of C/O to veto early.

**D-B4. `MC_AUDIENCE` optional in `connect.yaml`, mandatory for correctness.** The stub does not read it; D makes the service reject MC traffic until it is set (fail closed). Alternative: make it required and ask for the URL at install (impossible: the URL is unknown before deploy, PF2/PF3).

**D-B5. `inheritAs.apiClient.scopes` = the two key-value-document scopes only.** Alternatives: add `manage_api_clients` for identity-MCP client minting: not decided until change I proves it necessary (least privilege, plan 05 caveat 6). Each addition goes through a PR that edits this list and the scope table in docs. `view_mcp_servers` / `manage_mcp_servers` are NOT service API-client scopes: they are the signed-in user's Merchant Center scopes and live in the `oAuthScopes` of `mc-app`, `composed-apps` and `mc-view-app` (`view` and `manage` respectively).

**D-B9. `ADMIN_USER_IDS` is optional standard configuration of the service (owner decision 2026-10-09).** Comma-separated allowlist of Merchant Center user ids; empty or unset means nobody is an administrator. Standard (not secured) because it is an access list, not a credential, and operators must be able to read it back with `deployment describe`. Parsing and validation (max 50, trimmed, de-duplicated, no empty entries) belong to change C; the meaning (match against the verified gateway token user id) to change D. A user learns their own id from the apps' read-only "Your user ID" line (changes P, S). Alternative rejected: a custom Merchant Center admin permission (requires a manual permission-capture step and cannot be granted per user).

**D-B6. Layout check is a public script (`scripts/check-connect-layout.mjs`) with a small `yaml` dependency in `scripts/package.json`.** Alternatives: hand-written YAML subset parser (fragile), or rely on `connect validate` only (does not enforce our config-key and version-pin rules). `scripts/` is the one non-application folder allowed to hold a `package.json`; it is not a workspace root.

**D-B7. Stub frontends are derived from the legacy app shells, not from a fresh `create-mc-app` run.** The scaffold is used only as a reference (PF11: version 27.13.0 differs and brings samples/agent files). Alternative: scaffold with `--template-version` pinned to a 27.9.6 tag (possible if such a git tag exists in `commercetools/merchant-center-application-kit`; not verified).

**D-B8. Node 22 everywhere, `.nvmrc` = `22`, `engines.node = 22.x`.** Matches legacy and the CLI environment (Node 22.21.1 on the dev machine).

## Risks / Trade-offs

- [`connect validate` needs Docker and takes minutes] -> documented precondition; `--skip tests` allowed only while iterating, never for the final check.
- [Default model ids are copied from legacy and may not exist] -> flagged; F verifies; stub does not call any model.
- [Stub build may behave differently from the real app (bundle size, CSP)] -> O/P re-run `validate` and the Chrome build check after replacing stubs.
- [Redeploy may not rebuild MC bundles (U2)] -> if so, change U switches to "delete frontends' deployment and recreate" or to a runtime-config fetch; flagged in U.
- [Scope list wrong -> generated client lacks permission] -> E and I add scopes with failing integration tests first; U's runbook shows how to read `deployment describe`'s `apiClient`.
- [Entry-point path collision in the MC region] -> `ENTRY_POINT_URI_PATH` has no default; the README (W) tells installers to choose a unique value.
- [Yarn vs npm mismatch confuses newcomers] -> one sentence in each folder's README stub and in CONTRIBUTING (W).

## Migration Plan

Create files bottom-up: service stub -> frontend stubs -> `connect.yaml` -> layout check -> `connect validate`. Rollback = delete the new folders and `connect.yaml` (nothing else depends on them until C/O start).

## Open Questions

- **BQ1** (new): default Gemini model ids (E3) - to be confirmed in F; default as copied.
- **BQ2** (new): npm for service vs yarn (D-B3) - default as decided.
- **BQ3** (new, owner): which `ENTRY_POINT_URI_PATH` and Custom Application/View names to register (manual steps M6/M7) - default entry points `ai-assistant` (mc-app) and `ai-assistant-pages` (composed-apps); display names `AI Assistant`, `AI Assistant Pages`, `AI Assistant`.
- Unverified platform items U1-U4 above (resolved in change U).

## Changelog

- 2026-10-09 (owner decision: admin by user id): `connect.yaml` `service` gains optional standard key `ADMIN_USER_IDS` (D-B9); the `assistant-admin` permission group, `PERMISSION_GROUPS` and `additionalOAuthScopes` are removed; `view_mcp_servers` / `manage_mcp_servers` move into the `oAuthScopes` `view` / `manage` lists of all three Merchant Center entries; the layout checker rejects `additionalOAuthScopes` and checks `ADMIN_USER_IDS` placement (checker test count 10 -> 12).
- 2026-10-09 (owner decision Q4): `connect.yaml` `service` gains `CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION` (standard) and `CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `ALGOLIA_MCP_URL`, `STRIPE_SECRET_KEY` (secured, all optional) plus `STRIPE_CONNECTED_ACCOUNT_ID` (standard); the layout checker enforces placement; `ENCRYPTION_KEY` description now says it protects identity tokens only. Layout test count 8 -> 10.
- 2026-10-09 (owner decision Q9): every Google Cloud setting is configurable and defaulted in `connect.yaml` `service`: `GCP_PROJECT_ID` (optional, default = `project_id` of the SA key), `GCP_VERTEX_LOCATION` (renamed from `GCP_LOCATION`, default `us-central1`), `GCP_BIGQUERY_DATASET_ID` (`aiassistant`), `GCP_BIGQUERY_LOCATION` (`us-central1`), `GCP_BUCKET_NAME` (optional, default `<project>-ai-assistant-images`), new `GCP_BUCKET_LOCATION` (`us-central1`), new `IMAGE_URL_MODE` (`private` default | `public`). No separate BigQuery project key: BigQuery and Storage use `GCP_PROJECT_ID`. The existing `keys: secured placement of GCP_SA_KEY_BASE64` test also asserts GCP keys are optional/defaulted and `GCP_LOCATION` is rejected (layout test count unchanged at 10).
