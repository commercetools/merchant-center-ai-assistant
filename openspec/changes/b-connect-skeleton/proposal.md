## Why

Change **B** (`b-connect-skeleton`, Wave 1, Needs: A) turns the empty compliant repo into a **valid Connect connector**: one `connect.yaml` declaring the `service`, two Merchant Center Custom Applications and one Custom View, four app folders with minimal compilable stubs, the configuration-key contract (standard vs secured), least-privilege `inheritAs` scopes, and `commercetools connect validate` passing. Every later change (C service, O frontends, U deployment) writes into this skeleton instead of inventing structure, and the injected-environment facts documented here (service URL, `CTP_*`, `APPLICATION_URL`) drive changes D (`MC_AUDIENCE`) and U (two-phase deploy).

## What Changes

- Add root `connect.yaml` with four `deployAs` entries: `service` (type `service`, endpoint `/service`, lifecycle script hooks), `mc-app` and `composed-apps` (`merchant-center-custom-application`), `mc-view-app` (`merchant-center-custom-view`), plus a top-level `inheritAs.apiClient.scopes`.
- Define the full configuration-key table (standard / secured / defaults / required) for each application, including the optional third-party provider keys (Contentstack, Algolia, Stripe: secrets in `securedConfiguration`, non-secrets in `standardConfiguration`; owner decision Q4) and the optional `ADMIN_USER_IDS` allowlist (administrators are identified by their Merchant Center user id, decision 2026-10-09).
- Add folders `service/`, `mc-app/`, `composed-apps/`, `mc-view-app/` with stubs that build, typecheck, lint-free-start and test: an Express stub mounted at `/service` with `GET /service/status`; MC stubs with `${env:...}` placeholders in their config files, pinned to the same `@commercetools-frontend/*` version (27.9.6, decision D7).
- Add per-folder `.env.example` (policy from change A), `.nvmrc`, `engines.node: 22.x`, independent lockfiles (no npm workspaces).
- Wire `postDeploy` / `preUndeploy` script hooks to no-op stubs (`connector:post-deploy`, `connector:pre-undeploy`) that change U fills in.
- Record in `design.md` the verified platform facts about environment variables injected by Connect (see "Platform facts").
- Make `commercetools connect validate` pass and make that a Definition-of-Done command for every later change.

## Capabilities

### New Capabilities
- `connect-skeleton`: The `connect.yaml` contract (applications, endpoint, configuration keys, scopes, scripts), the folder layout and stub apps, the version/pinning rules, and the validation requirements.

### Modified Capabilities
<!-- none -->

## Impact

- New root `connect.yaml`, four app folders, four `package.json` (names from change A), four lockfiles.
- Change C replaces the service stub's internals; change O replaces the three frontend stubs' internals; change U fills the lifecycle scripts and wraps the CLI; change D reads `MC_AUDIENCE`.
- Requires a running Docker daemon on developer machines (the Connect CLI `validate` builds with Buildpacks).

## Legacy source

Read-only; copy-then-edit only the shells named here:

- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/connect.yaml` (only `mc-app` exists there; KEEP shape, add the other three)
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-app/{custom-application-config.mjs,package.json,.nvmrc,.env.example,tsconfig.json,.eslintrc.js,.prettierrc,jest.test.config.js,@types-extensions/,src/constants.ts,src/index.tsx,src/components/entry-point/}`
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/composed-apps/{custom-application-config.mjs,package.json,...}` (same files; versions drift 25.1.0 -> 27.9.6)
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-view-app/{custom-view-config.mjs,package.json,src/constants.ts,...}`
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/{package.json,tsconfig.json,jest.config.cjs,.nvmrc,.env.example,src/index.ts,src/app.ts}` (shell only; C ports the real code)
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/.connect/project.toml` (Buildpack excludes; decision in design)

## Out of scope

- Any real service code (routes, auth, persistence, agents): changes C-N.
- Any real UI beyond a stub page: changes O-S.
- Deployment scripts, two-phase flow, real `postDeploy` logic, runbook: change U.
- Registering the Custom Applications/View in the Merchant Center (manual steps M6/M7) and obtaining their IDs.
- `connectorstaged create/publish`, `deployment create`: change U.
- Final scope list for `oAuthScopes` of each MC app (O, P, Q finalise); B ships the minimum that lets stubs build plus `view_mcp_servers` (view) and `manage_mcp_servers` (manage). There is no custom permission and no `additionalOAuthScopes`; the Custom Application keeps only its default View/Manage permission pair.
- Parsing and meaning of `ADMIN_USER_IDS` (change C parses, D matches it against the verified gateway user id).
