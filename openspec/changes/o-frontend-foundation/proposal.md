## Why

The three Merchant Center frontends (`mc-app`, `composed-apps`, `mc-view-app`) were copied from a multitenant
repo and have drifted: `@commercetools-frontend/*` is on 27.9.6 / 25.1.0 / 27.9.6 (FEATURES.md still claims
24.11 / 25.1 / 26.1), CSP lists dev tunnels and Cloud Run hosts, the configs carry tenant wording
("Multitenant Chat App"), and the session bootstrap still returns tenant-era fields
(`managedMcpConfigured`, `workspace`). Every later frontend change (P, Q, R, S) builds on one common foundation, so
it must be fixed once: same toolchain, the Connect `${env:...}` contract, one auth bootstrap, one
admin model (the service decides, the bootstrap carries `isAdmin`), and a guard against the deliberate `forward-to.ts` duplication drifting.

## What Changes

- **Change ID O** (`o-frontend-foundation`). **Needs: B, D** (Connect skeleton with stub app folders; service
  `/auth/session` contract incl. `userId` and `isAdmin`). Wave 4. Size L.
- Align all three apps to **one `@commercetools-frontend/*` version (27.9.6)**, Node 22 (`.nvmrc` + `engines`),
  yarn 1 per folder, **no workspace root**, identical script set (`build`, `start`, `typecheck`, `lint`, `format`, `compile-html`).
- Rewrite `custom-application-config.mjs` (x2) and `custom-view-config.mjs` with `${env:...}` placeholders
  (`applicationId`/`customViewId`, `url`, `entryPointUriPath`, `cloudIdentifier`, `chatServiceEndpointUrl`), neutral
  names, a minimal CSP and least-privilege OAuth scopes; add `.env.example` per app, no committed `.env`.
- Remove starter/netlify/ngrok/Cloud-Run leftovers, `console.log`, dead i18n scripts, the tracked-env habit.
- Port `utils/forward-to.ts` (identical x3) and add `scripts/check-duplicates.mjs` that fails when copies differ.
- Port the **auth bootstrap**: `useMcSession` -> `POST /auth/session`, `AuthProvider`, `ConnectProvider` (session
  gate with the re-authentication dialog), `useIsAssistantAdmin`, `useCurrentUser`, `useChatServiceEndpoint`.
  Response shape becomes `{ projectKey, userId, identityMcpConfigured, isAdmin }`; the bootstrap hook exposes `userId` so the apps can show a read-only "Your user ID" line (P, S).
- **Admin model (2026-10-09):** admin = the user's Merchant Center user id is in the service's `ADMIN_USER_IDS` allowlist (verified by the gateway JWT); the service decides. `useIsAssistantAdmin` reads ONLY the bootstrap `isAdmin` (display gating; the service enforces with 403 `ADMIN_REQUIRED`). No permission group, no `includeUserPermissions`; the apps' normal `oAuthScopes` carry `view_mcp_servers` / `manage_mcp_servers`.
- **Remove tenancy** from the frontend foundation: no `x-mc-team-id`, no team context, no `use-mc-teams`, no
  `INITIAL_PROJECT_KEY` in committed files, no tenant wording.
- SPDX MIT header on every `ts/tsx/mjs` file; `yarn typecheck && yarn lint && yarn build` green in all three folders.
- Port `scripts/generate-nimbus-surface.mjs` + `postinstall` chain (needed by the preview renderer in P/R).

## Capabilities

### New Capabilities
- `frontend-build-alignment`: one toolchain/version/script contract for the three apps, no leftovers, SPDX headers.
- `frontend-config-env-contract`: `${env:...}` config placeholders, `.env.example`, CSP, scopes, env names used by Connect.
- `frontend-auth-bootstrap`: forward-to transport, duplicate guard, `/auth/session` bootstrap, session gate, admin flag and own user id from the bootstrap.

### Modified Capabilities
<!-- none: no main specs exist yet -->

## Impact

- New/changed: `mc-app/`, `composed-apps/`, `mc-view-app/` (config + tooling + foundation `src/` only), `scripts/check-duplicates.mjs`.
- Needs from other changes: B's `connect.yaml` key names; D's `/auth/session` contract (`userId`, `isAdmin`).
- Unblocks P, Q (mc-app), R (composed-apps), S (mc-view-app), U (deploy scripts need the env contract).
- Pages-heavy source (`composed-apps/src`, `mc-view-app/src` beyond foundation files) is ported by R and S, not here.

## Out of scope

- Chat UI, composer, parts renderers, session drawer (P); managed-MCP, settings, backoffice (Q).
- Composed pages rendering in `composed-apps` (R); the 65 view locators and feature flags (S) - O only leaves a one-locator placeholder.
- `connect.yaml` itself (B) and deploy scripts (U).
- i18n beyond the minimal app-kit wiring (Q15: English only).
- Unit tests beyond `useIsAssistantAdmin` (legacy has none; verification is typecheck + lint + build + Chrome scenarios).

## Legacy source

- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-app` (package.json, custom-application-config.mjs, src/constants.ts, src/contexts/{auth,connect,index}.tsx, src/hooks/{use-mc-session,use-chat-service-endpoint,use-assistant-admin,use-current-user}, src/utils/forward-to.ts, src/components/reauthenticate-dialog, scripts/generate-nimbus-surface.mjs)
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/composed-apps`
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-view-app`
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/{connect.yaml,README.md,FEATURES.md,netlify.toml}`
