## Why

Change **U** (`u-connect-deployment-no-gha`, Wave 7, Needs: B, C, O) is how the connector gets from git to a running Merchant Center extension **without GitHub Actions, Terraform, Dockerfiles or Cloud Run scripts** (requirement R6). Two platform facts make this non-trivial and are the reason for the change: (1) the service's public URL exists only after the first deployment and `CONNECT_SERVICE_URL` is available only inside the lifecycle scripts, so `MC_AUDIENCE` (used by change D to verify forward-to JWTs) and `CHAT_SERVICE_ENDPOINT_URL` (baked into the three frontends) can only be set by a **second phase**; (2) a failing `postDeploy` does not reliably fail the deployment, so deployment correctness must be proved by explicit checks and a runbook.

## What Changes

- Add `scripts/connect/connect.mjs`, a dependency-free Node CLI that wraps the official Connect CLI (`commercetools connect connectorstaged create|update|publish|preview`, `deployment create|redeploy|describe|logs|delete`) and the Connect REST API (read-only, for the service URL and status polling). Sub-commands: `stage`, `publish`, `preview`, `deploy`, `finalize`, `configure`, `update-code`, `status`, `logs`, `delete`.
- Implement the **two-phase deploy**: `deploy` (phase 1, all four applications, placeholders) -> `finalize` (phase 2: read service URL, redeploy with `MC_AUDIENCE` and `CHAT_SERVICE_ENDPOINT_URL`, wait for `Deployed`, smoke-check `/service/status`, print the URLs to paste into the Merchant Center registrations) -> manual registration (M9).
- Set the **third-party provider keys** (owner decision Q4: `CONTENTSTACK_*`, `ALGOLIA_MCP_URL`, `STRIPE_*` are Connect configuration, secrets secured) at first `deploy` (only the keys present in the environment are passed) or later with `configure KEY=VALUE ...`, a partial-merge configuration redeploy limited to an allow-list of keys; document it in the runbook.
- Document and enforce sandbox / preview / production semantics; production requires an explicit flag.
- Implement the service's `postDeploy` / `preUndeploy` lifecycle scripts (`service/src/connector/`): idempotent checks for the Base64 service-account key, Vertex AI reachability, Custom Object access and audience consistency, plus an informational report of which providers (Contentstack, Algolia, Stripe) are configured (names and booleans only, never values); clean `preUndeploy` that removes only its own probe object.
- Add `docs/deployment-runbook.md` (install, update, rollback, undeploy, troubleshooting) with every manual step marked by id.
- Add tests: node:test for the CLI helpers, jest for the lifecycle scripts.

## Capabilities

### New Capabilities
- `connect-deployment`: Connect-CLI-based staging/publishing/deployment scripts, the two-phase deploy contract, deployment types, lifecycle-script behaviour and the runbook; explicitly no CI, no containers, no IaC.

### Modified Capabilities
<!-- none -->

## Impact

- New: `scripts/connect/**`, `scripts/tests/connect-*.test.mjs`, `service/src/connector/**`, `service/tests/connector/**`, `docs/deployment-runbook.md`, `scripts/connect/.env.connect.example`.
- Changes `service/package.json` (adds `google-auth-library`, `@commercetools/platform-sdk@^8`, `@commercetools/ts-client@^4` if C has not already).
- Consumes: `connect.yaml` and key names from B; `AppConfig`/logger from C; frontend env contract from O; `GCP_SA_KEY_BASE64` and the Vertex model names from F.
- Needs the owner for manual steps M3, M4, M5, M6, M7, M9 and the new inbox steps M14-M16 (Docker, private staging repository access, Connect API client).

## Legacy source

Read-only. The legacy deployment was Cloud Run + GitHub Actions; nothing is ported, only consulted to know what to drop:

- `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/.github/workflows/{workflow.yml,nimbus-mcp-gateway.yml}` (DROP: Cloud Run deploy)
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/.github/regions.json` (DROP: region matrix)
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/nimbus-mcp-gateway/Dockerfile` (DROP, gateway embedded by change K)
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/utils/startup-checks.ts` (concept reused by the lifecycle checks: say loudly what is missing)
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/ARCHITECTURE.md` lines ~295-320 (how `MC_AUDIENCE` and the forward-to JWT relate)

## Out of scope

- Publishing to the public Connect marketplace / certification (`connectorstaged certify`); Q14 default is sandbox + private connector.
- Creating the GitHub repository, tags on the public repo (M1, M13; change X / Z).
- Production deployment of the finished product (change Z checklist); U supports the flag but does not exercise it.
- Chrome end-to-end scenarios (change V); U only does a `curl`-level smoke check and the rehearsal that resolves unknown platform behaviour.
- Terraform, Dockerfiles, `gcloud`, GitHub Actions, any CI.
- Registering Custom Applications/Views in the Merchant Center (M6/M7) and pasting URLs (M9): documented, not automated.
