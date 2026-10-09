## Why

Beyond chatting, an admin must connect the assistant to the project (bind a commercetools Managed MCP Server in
identity mode), every user must connect their own Merchant Center account, and admins configure behaviour
(tool-call detail, system prompt) and see which third-party providers are configured and review usage (backoffice transcripts and feedback).
These surfaces exist in the multitenant `mc-app` but were gated by a server-side allowlist keyed on a browser-supplied e-mail (forgeable), carry team-MCP
and organization-administrator lookups, a project-key filter, a warehouse toggle and a time-boxed migration
dialog. They must be ported as a single-project, admin-gated experience where admin means: the gateway-verified user id is in the service's `ADMIN_USER_IDS` (bootstrap `isAdmin`, owner decision 2026-10-09).

## What Changes

- **Change ID Q** (`q-mc-app-admin-surfaces`). **Needs: O, I, J, N, P** (foundation; identity MCP endpoints; read-only `GET /mcp/providers`; backoffice+feedback API; chat shell and connector). Wave 7. Size L.
- Port Managed MCP binding page + create-or-reuse form + Merchant Center permission notice + "Administrator access required" notice + identity connect gate + the admin "Connections" drawer, and extend O's `ConnectProvider` with the two gates (project not bound, user not connected).
- Port the Settings drawer (account card with Connect/Disconnect my account, detail level, connected sources = read-only MCP provider status cards, Advanced = system prompt) and the contexts behind it (`mcp-providers`, `system-prompt-config`).
- Port the backoffice (thread list, alaSQL query threads, feedback list/detail, session detail) as single-project, behind an admin route guard (bootstrap `isAdmin`); add one admin-only entry link. Threads and feedback are listed and filtered by verified `userId`; the browser-supplied display `userLabel` is shown as text tagged "(unverified)".
- **Drop**: provider credential forms and the `mcp-config` context (legacy `configure-mcp/*-config.tsx`, `ToggleCard`, `SaveActions`, `upsert`/`update`/`delete` calls), Data Warehouse (BETA) toggle and `use-bigquery`, team MCP, `use-mc-teams`/organization administrators, `assistant-updated-dialog` (expired migration notice), the e-mail-allowlist `BackofficeProvider`/`backoffice/is-admin` call (admin now comes from the bootstrap), project-key filters and columns, `use-create-api-client` (decision recorded).
- **Provider credentials are not entered in the UI** (owner decision Q4: Connect deployment configuration): the MCP Providers section is read-only status cards (Contentstack, Algolia, Stripe) reading `GET mcp/providers`, with the text 'Configured at deployment (Connect configuration)', no forms, no Save and no credential inputs for anyone.
- Admin-gated rendering rule: admin-only items (Connections / Managed MCP setup, detail-level and system-prompt controls, backoffice and feedback review) are hidden from non-admins; a non-admin who reaches an admin route sees an "Administrator access required" notice and the service answers 403 `ADMIN_REQUIRED`; the read-only provider status cards stay visible to every member.
- Every user can open Settings; its About section and the "Administrator access required" notice show the read-only "Your user ID" line (P's `YourUserId`) and, for non-admins, "Ask an administrator to add your user ID to ADMIN_USER_IDS". An empty `ADMIN_USER_IDS` means nobody is admin.
- Chrome scenarios `E2E-Q-01 .. E2E-Q-16`.

## Capabilities

### New Capabilities
- `mc-admin-managed-mcp`: identity-mode Managed MCP binding, per-user connect/disconnect, gate states.
- `mc-admin-configuration`: settings drawer, detail level, system prompt, read-only MCP provider status cards.
- `mc-admin-backoffice`: transcript and feedback review for admins.
- `mc-admin-gating`: how admin-only UI and routes are guarded by the bootstrap `isAdmin` flag, what non-admins see, and the administrator-required page with the user-id line.

### Modified Capabilities
<!-- none -->

## Impact

- `mc-app/src/{components,contexts,hooks}` additions; edits to O's `contexts/connect.tsx`, `contexts/index.tsx`, `routes.tsx` and P's `components/shell/app-rail`, `components/new-chat/index.tsx`.
- Depends on REST from I (`managed-mcp-identity/*`), J (`mcp/providers`, read-only), N (`backoffice/*`, `feedback/*`), G (`system-prompt`, `tool-call-logs`); reads Managed MCP Servers from the commercetools API through `/proxy/ctp` with the signed-in user's own permissions.
- Needs two Merchant Center users for E2E: the admin user (user id in `ADMIN_USER_IDS`) and the non-admin user - manual step M10.

## Out of scope

- Service enforcement of admin (D `requireAdmin`; N, I, J apply it); Q only gates UI and handles 403 `ADMIN_REQUIRED`.
- Chat surface (P), composed-apps (R), view (S).
- Team-level MCP bindings, ClientCredentials mode, API-client minting.
- New features beyond the single admin link to the backoffice and neutral wording.

## Legacy source

- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-app/src/components/{managed-mcp,configuration,configure-mcp,backoffice}`, `panels/settings-drawer`
- `.../mc-app/src/contexts/{mcp-config,system-prompt-config,backoffice-context}.tsx`
- `.../mc-app/src/hooks/{use-managed-mcp,use-mc-teams}`, `utils/mc-api-error.ts`
- Docs: https://docs.commercetools.com/api/projects/managed-mcp-servers.md , https://docs.commercetools.com/api/managed-mcp-servers-overview.md
