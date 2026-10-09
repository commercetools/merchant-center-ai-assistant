## Why

Change **S** delivers the third Merchant Center surface: **AI Assistant**, a Custom View of type `CustomPanel` that embeds a reduced chat in a side panel on 65 built-in Merchant Center pages (products, categories, customers, orders, discounts, standalone prices, settings, operations). The panel knows which entity the user is looking at because it forwards the host page URL to the service as the `customView` feature flag. The legacy view has its own forked chat surface that has drifted from `mc-app`, an `.env` and a hard-coded product page in its development config, a session bootstrap that returns the multitenant workspace payload, and a read-only Managed MCP gate. This change ports it onto foundation O and the chat surface of P as a single-tenant, Connect-deployable Custom View.

- Change ID: **S** (`s-mc-view-app`). Wave 7, size M.
- Needs: **O** (frontend foundation) and **P** (mc-app chat surface, the source of the reduced copy). Transitively G, H (REST contract and chat stream) and I (identity MCP endpoints used by the connect gate).
- Unblocks: **V** (E2E-S-nn), **W**, **U** (deployment of `mc-view-app`).

## What Changes

- Create `mc-view-app/` as a `merchant-center-custom-view` (`CustomPanel`, `typeSettings.size: SMALL`) with the same 65 locators, no extra permission group (the legacy group is REMOVED; `view_mcp_servers` / `manage_mcp_servers` now sit in the view's normal `oAuthScopes`), and `${env:...}` placeholders for every per-deployment value.
- Re-derive the reduced chat surface (composer, message list, parts, visualisation, typing indicator, export part, file attachment, empty state) **by copying from the finished `mc-app` chat components of change P and deleting what the panel does not use**, instead of porting the legacy fork (decision D1). Files that stay byte-identical to mc-app are registered in the duplicate-drift check.
- Keep the `FeatureFlagsProvider` (`customView` = base64 of the host URL) and the `useFetch` wrapper that appends flags to every service URL; harden the encoding (UTF-8 safe) and make the flag name a single constant.
- Keep the read-only MCP binding gate: the panel never configures a Managed MCP Server; it shows an instruction when the project has no binding and the "Connect my account" gate (identity MCP, per-user) when the user has not connected.
- Align the session bootstrap with the single-tenant REST contract (`/auth/session` returns `{projectKey, userId, identityMcpConfigured, isAdmin}`; no registration; the panel has no admin surface and ignores `isAdmin`, and never sends an e-mail). The panel footer shows the read-only "Your user ID" line (P's `YourUserId`, compact) from the bootstrap `userId`.
- Remove: `.env` with real project/ngrok values, dev-tunnel/Cloud Run CSP hosts, hard-coded `hostUriPath`, starter leftovers, `console.*`, the `userEmail` identification parameter (never sent: identity is the verified `userId`).
- Add unit tests (feature-flag URL builder, session storage guards, connect gate state machine) and the per-app `README.md` required by Connect certification.

## Capabilities

### New Capabilities
- `mc-view-app`: behaviour of the AI Assistant Custom View: registration contract (type, size, locators, scopes), embedded chat, entity context via feature flag, read-only MCP binding gate, identity connect gate, session handling, resilience and hygiene.

### Modified Capabilities
<!-- none -->

## Impact

- New folder `mc-view-app/` (about 55 source files).
- `connect.yaml` entry `mc-view-app` (change B/U): config keys `CUSTOM_VIEW_ID`, `CLOUD_IDENTIFIER`, `CHAT_SERVICE_ENDPOINT_URL`.
- `scripts/check-duplicates.mjs` (change O) gains a group `view-chat-parts`.
- Merchant Center registration step M7 must exist; E2E needs a product in the scratch project.
- Service side: relies on the `customView` feature flag handling from changes G (session scoping) and H (custom-view orchestrator); R does not change them.

## Out of scope

- Any Managed MCP Server creation/binding UI (that stays in `mc-app`, change Q).
- Feedback popup, tool menu, configuration panel, backoffice, composed pages, view switcher (not part of the panel; see design D2).
- New locators beyond the legacy 65 (adding one is a one-line follow-up).
- Translations (English only, Q15).
- The service-side custom-view agent prompt (change H).

## Legacy source

- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-view-app` (`custom-view-config.mjs`, `src/**`, `.env.example`, `package.json`)
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/FEATURES.md` (section "`mc-view-app/` - Merchant Center Custom View")
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/FEATURES.md` (feature-flag scoping and `custom-view.agent.ts`)
