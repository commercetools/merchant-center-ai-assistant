## Context

Change Q of the A-to-Z plan: the admin and account-connection surfaces of `mc-app`, layered on O (gate, `useIsAssistantAdmin` reading the bootstrap `isAdmin`, `userId` from the bootstrap) and P (shell, connector, tool menu). REST contracts come from I (`managed-mcp-identity/*`), J (`mcp/providers`, read-only), N (`backoffice/*`, `feedback/*`), G (`system-prompt`, `tool-call-logs`). At authoring time none of these changes exist in `openspec/changes/`, so shapes are taken from the legacy source and flagged where uncertain.

## Explore findings

`L/` = `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-app/src`.

1. **Managed MCP page** (`L/components/managed-mcp/index.tsx`): lists identity-mode servers via `useManagedMcpServers().fetchServers()` (`GET /{projectKey}/mcp-servers?limit=100&where=authenticationMode%3D%22CommercetoolsIdentity%22` through `MC_API_PROXY_TARGETS.COMMERCETOOLS_PLATFORM`), binds with `PUT managed-mcp-identity` `{serverKey,url,majorVersion}` (`hooks/use-managed-mcp/use-identity-mcp-config.ts`), legacy gave non-admins and permission-refused users `ManagedMcpPermissionNotice` (`variant: 'instructions'` / `'ask'`). Target: non-admins get the new `AdminRequiredNotice` ("Administrator access required"), and `ManagedMcpPermissionNotice` remains only for a Merchant Center `insufficient_scope` refusal of an admin. Server types are modelled in `hooks/use-managed-mcp/types.ts` (`McpServer`, `McpServerType`, `McpServerDraft`, `IdentityMcpBinding`, `IdentityMcpStatus`, `IdentityMcpVerification`).
2. **`use-create-api-client` no longer exists** in the tree (only referenced by stale FEATURES.md and a comment in `composed-apps/custom-application-config.mjs`). `grep -ril "api-client\|ApiClient" L` finds no hook. Identity mode needs no API client: with `CommercetoolsIdentity` "only the configured tools that the user's Merchant Center permissions allow" are exposed (https://docs.commercetools.com/api/managed-mcp-servers-overview.md, "Authentication modes" and "Tool filtering by Merchant Center permissions"). **Decision: not ported.**
3. **Per-user OAuth** (`use-identity-mcp-config.ts`): `POST managed-mcp-identity/authorize` -> `{connected}` or `{authorizationUrl}`; `window.open(url,'ct-identity-mcp-oauth','popup,width=640,height=760')`; a `message` listener accepts `event.data.type === 'ct-identity-mcp-oauth'` only when `event.origin === new URL(chatServiceEndpointUrl).origin`; polls `GET managed-mcp-identity/status` every 1000 ms up to 10 min; also `POST /verify` (`{connected,cached,toolCount,toolNames}`) and `DELETE /me`. 404 on `GET managed-mcp-identity` (singular binding) means "not bound" and is passed through as an envelope.
4. **Gate order today** (`L/contexts/connect.tsx`): bootstrap failure -> reauth dialog; `!managedMcpConfigured` -> `ManagedMcpPage`; `!identityUserConnected` -> `IdentityConnectGate`. Target bootstrap (plans/01, O) no longer carries `identityUserConnected`; the legacy `AuthProvider` fell back to `GET managed-mcp-identity/status` (`contexts/auth.tsx#fetchIdentityStatus`), which becomes the primary path.
5. **Admin gating today is mixed**: a UI Merchant Center permission check in `useIsAssistantAdmin()` (Managed MCP page, MCP provider form, rail Connections item) vs a server e-mail allowlist `GET backoffice/is-admin?userEmail=` (`contexts/backoffice-context.tsx`, used only by `AdminGuard` in `routes.tsx`), with a browser-supplied e-mail. Decision 2026-10-09: one source, the bootstrap `isAdmin` computed by the service from the gateway-verified user id in `ADMIN_USER_IDS` (O D-O6); `backoffice/is-admin` is not called.
6. **Teams leftovers**: `permission-notice.tsx` imports `useOrganizationAdministrators` from `hooks/use-mc-teams` (undocumented Administration GraphQL; both documents carry "THIS QUERY SHAPE IS UNVERIFIED"); `hooks/use-managed-mcp/types.ts` has `McTeam`. Dropped with tenancy.
7. **`assistant-updated-dialog.tsx`**: a one-time migration notice that expires `2026-10-07T00:00:00Z` (`NOTICE_EXPIRES_AT`), already past. Dropped.
8. **Settings drawer** (`L/components/panels/settings-drawer/index.tsx`): sections AccountCard / DetailLevelControl / ConnectedSources / AdvancedSection (system prompt in `Accordion`); loads MCP configs and system prompt lazily when first opened (`ensureMCPLoaded`, `ensureSystemPromptLoaded`). `DetailLevelControl` maps Off=`none`, Summary=`tools`, Detailed=`all` (the `thinking` mode is not exposed). The data-warehouse control was removed upstream (`AdvancedSection` docblock; commits `c4f8d16`), contrary to FEATURES.md.
9. **MCP providers** (`L/contexts/mcp-config.tsx`, 516 lines): `MCP_PROVIDERS` = contentstack, algolia, stripe; `ALWAYS_ON_PROVIDERS` = `commercetools`, `commercetools-knowledge`; saving calls `upsert` for enabled and `update(enabled:false)` for removed providers; forms `configure-mcp/{contentstack,algolia,stripe}-config.tsx` + shared `form-parts.tsx` (`ToggleCard`, `StatusCard`, `SaveActions`, `ConfigError`). Credentials were plain text fields posted to `mcp/configs`; non-admins got `StatusCard`s only. **Not ported (owner decision Q4):** provider credentials are Connect deployment configuration, so the target keeps only the `StatusCard` idea, fed by J's read-only `GET mcp/providers` (D-Q4).
10. **Backoffice** (`L/components/backoffice/*`): `thread-list.tsx` (DataTable; `filterProjectKey`, `filterUserEmail`), `query-threads.tsx` (alaSQL table `threads`; inputs `projectKey`, `limit`, `offset`), `session-detail.tsx` (shows `Project: {thread.projectKey}`), `feedback-list.tsx` (metadata columns; uses `userEmail` as caller identity), `feedback-detail.tsx` (523 lines; own part renderer, 240px JSON cap, never reuses `PartRenderer`). `routes.tsx` lazy-loads `backoffice-tabs` (chunk `backoffice`) and `session-detail` (chunk `backoffice-session-detail`) because `alasql` is ~500 KB. No link to `/backoffice` exists anywhere in the UI (reachable only by URL).
11. **Error helper** `L/utils/mc-api-error.ts` (117 lines): `isInsufficientPermissionError`, `missingScopesFromError` normalise both the SDK and Apollo shapes of `insufficient_scope`.
12. **Types**: `BackofficeThread { sessionId, projectKey, userEmail, messages }`, `BackofficeThreadsFilters { projectKey?, userEmail?, createdAtBefore?, createdAtAfter? }`, feedback wire contract in `hooks/use-chat-service-connector/types.ts` (`userEmail` is the caller identity, `authorEmail` is the author filter on fetch).
13. **Platform facts**: Managed MCP Servers API needs `view_mcp_servers`/`manage_mcp_servers` scopes (https://docs.commercetools.com/api/projects/managed-mcp-servers.md); server URL format `https://mcp.{region}.{domain}/projects/{projectKey}/{mcpServerKey}`; limits 500 servers/project and 1,000,000 tool invocations/month. Both scopes are in mc-app's normal `oAuthScopes` (O D-O5); they no longer ride on a permission group.

## Glossary

- **Managed MCP Server**: commercetools-hosted Model Context Protocol server configured per project (tools list, auth mode).
- **CommercetoolsIdentity mode**: users authenticate with their Merchant Center identity; the server exposes only tools their MC permissions allow.
- **Binding**: the project-level record in the service (`serverKey`, `url`, `majorVersion`) telling the assistant which MCP server to use.
- **Connect my account**: per-user OAuth (PKCE) against the identity MCP; tokens stay in the service.
- **Admin**: a user whose Merchant Center user id is in the service's `ADMIN_USER_IDS`; the bootstrap says so with `isAdmin: true`. **Your user ID line**: see change P D-P10.
- **StatusCard / ToggleCard**: read-only vs editable provider cards in `configure-mcp/form-parts.tsx`.
- **alaSQL**: in-browser SQL engine used for ad-hoc analysis of loaded threads.

## Source map

`L` = `.../mc-app/src`; new paths under `mc-app/src/`.

| Legacy | New | Verdict | Notes |
|---|---|---|---|
| `components/managed-mcp/index.tsx` | same | CHANGE | wording "tenant" none; uses `useIsAssistantAdmin`; unchanged logic |
| `components/managed-mcp/create-or-reuse-form.tsx` (511) | same | KEEP | |
| `components/managed-mcp/identity-connect-gate.tsx` | same | KEEP | |
| `components/managed-mcp/manage-mcp-panel.tsx` | same | KEEP | admin Connections drawer |
| `components/managed-mcp/permission-notice.tsx` | same | CHANGE | drop `useOrganizationAdministrators`; only for a Merchant Center `insufficient_scope` refusal (generic "ask a user who can manage MCP servers in this project") |
| (new) `components/admin-required-notice/index.tsx` | new | NEW | "Administrator access required" notice with P's `YourUserId` line and the ADMIN_USER_IDS instruction |
| `components/managed-mcp/assistant-updated-dialog.tsx` | - | DROP | expired migration notice |
| `components/configuration/{configure-mcp-providers,configure-system-prompt,identity-mcp-connection}.tsx` | same | CHANGE | `configure-mcp-providers` becomes read-only status cards; no `userEmail` |
| `components/configure-mcp/{algolia,contentstack,stripe}-config.tsx` | - | DROP | no credential forms (Q4) |
| `components/configure-mcp/form-parts.tsx` | same | CHANGE | keep `StatusCard` only; drop `ToggleCard`, `SaveActions`, `ConfigError` |
| `components/panels/settings-drawer/{index,account-card,advanced-section,connected-sources,detail-level-control}.tsx` | same | CHANGE | `advanced-section` adds admin-only backoffice link |
| `components/backoffice/{backoffice-tabs,thread-list,query-threads,session-detail,feedback-list,feedback-detail}.tsx` | same | CHANGE | no project-key column/filter; no `userEmail` param |
| `contexts/mcp-config.tsx` (516) | `contexts/mcp-providers.tsx` (new, small) | REPLACE | read-only `GET mcp/providers` via `use-admin-connector`; no save/upsert logic |
| `contexts/system-prompt-config.tsx` | same | KEEP | |
| `contexts/backoffice-context.tsx` | - | DROP | replaced by `useIsAssistantAdmin` (bootstrap `isAdmin`) |
| `contexts/{connect,index}.tsx` | O's files | CHANGE | add gates / providers |
| `contexts/{auth,session,tool-call-logs-config,...}` | - | see O / P | |
| `hooks/use-managed-mcp/{index,types,use-identity-mcp-config}.ts` | same | CHANGE | drop `McTeam`; add `useIdentityStatus` |
| `hooks/use-mc-teams/*` | - | DROP | tenancy |
| (new) `hooks/use-admin-connector.ts` | new | NEW | MCP provider status, system prompt, backoffice, feedback list calls moved out of the legacy connector (P kept chat calls) |
| `hooks/admin-types.ts` (created by P) | same | CHANGE | holds Backoffice/Feedback/MCP types |
| `utils/mc-api-error.ts` | same | KEEP | |
| everything else under `L/` | - | see O / P | |

## Decisions

**D-Q1. Identity-only; no API-client minting.** `use-create-api-client` is not recreated. Alternative (ClientCredentials MCP with minted client): rejected by plans D5 and by the doc's tool-filtering advantage of identity mode.

**D-Q2. Gate extension lives in `ConnectProvider`.** A new hook `useIdentityStatus()` feeds the gates: if the bootstrap supplied `identityUserConnected` (change I adds it to `/auth/session`, see `i-identity-managed-mcp/specs/identity-mcp-binding`) it is used directly; otherwise the hook calls `GET managed-mcp-identity/status` once when `identityMcpConfigured` is true. It exposes `{connected, loading, recheck}`. `recheck()` = `useAuth().refresh()` + status re-read. Alternative: put `identityUserConnected` back into the bootstrap response - already contributed by I, so the status call is only the fallback (Q-Q1 resolved: use the bootstrap field when present).

**D-Q3. Admin check is the bootstrap flag, not a server call.** `AdminGuard` = `useIsAssistantAdmin()` (reads only the bootstrap `isAdmin`); the service enforces `requireAdmin` on every admin route. A service 403 `ADMIN_REQUIRED` is displayed as "Administrator access required" (spec "Server refusal"). Non-admin experience: no Connections rail item, no detail-level or system-prompt controls, no backoffice link; a direct visit to `/backoffice` or an unbound project shows the notice; chat, sessions, digest and the user's own identity-MCP connect (once an admin bound a server) work as before. Settings is reachable by every user: its About section and the notice show P's read-only `YourUserId` line plus (non-admins) "Ask an administrator to add your user ID to ADMIN_USER_IDS", which is how a new operator bootstraps (copy the id, `configure` the deployment, refresh). An empty `ADMIN_USER_IDS` means nobody is admin. Alternative: keep `GET backoffice/is-admin` as a second check - rejected (duplicate source of truth).

**D-Q4. No provider credential UI (owner decision Q4, 2026-10-09).** Contentstack, Algolia and Stripe are configured with Connect `securedConfiguration`/`standardConfiguration` (change B keys, read by change C, validated by change J). The MCP Providers section is therefore read-only: one `StatusCard` per provider from `GET mcp/providers` (`{provider, configured, enabled, missingKeys[]}`), text 'Configured at deployment (Connect configuration)', missing key names when not configured, no forms, no Save, no credential state in the browser. Alternative: admin forms posting to the service - rejected by the owner (secrets would pass through the browser and Custom Objects).

**D-Q5. Backoffice is single-project.** Remove project-key filter/column; keep a user filter by verified `userId` (N: body filter `userId` on `POST backoffice/threads`, query `authorUserId` on `GET feedback/fetch`). The browser-supplied `userLabel` is shown as TEXT only (no HTML, no mailto link) tagged "(unverified)", never used to filter, join or decide. The alaSQL tab keeps `limit`/`offset` inputs. Alternative: delete the Query tab - rejected (R1). Entry via an admin-only link in Settings > Advanced (new, minimal; Q-Q3).

**D-Q6. Rail/Drawer integration.** Q adds two rail items (Connections for admins, Settings for everyone) to P's `AppRail` and mounts `ManageMcpPanel` and `SettingsDrawer` in `NewChat`; no new global state (the `DrawerId` union already contains `mcp` and `config`).

**D-Q7. Wording.** All copy uses "project" instead of tenant; notices say "Administrator access required" and never name a permission or show any e-mail.

**D-Q8. Data warehouse removed everywhere** (`ALWAYS`: no UI, no types, no strings) - confirmed removed upstream.

## Risks / Trade-offs

- **A status response could start carrying values** if J regressed: mitigation: the cards only read `provider`, `configured`, `enabled`, `missingKeys` (D-Q4) and E2E-Q-14 inspects network and DOM for sentinel values.
- **Two users needed for E2E** (admin user with id in `ADMIN_USER_IDS`, non-admin user): manual step M10; without it E2E-Q-02/09/10/15 cannot run (mark blocked, not skipped silently).
- **OAuth popup under Chrome DevTools MCP**: the popup is a second page; scenarios use `list_pages`/`select_page`. The identity login may need a consent click that only the owner can do the first time (M11).
- **Undocumented behaviour of `/proxy/ctp` for `mcp-servers`** (it works in legacy); if MC changes it, `fetchServers` fails visibly through the notice rather than silently.
- **alaSQL bundle** adds ~500 KB: stays lazy.
- **Creating real MCP servers during E2E** consumes project quota (500): scenario creates one `e2e-ai-assistant` server and deletes it afterwards through the Merchant Center API proxy, documented in cleanup.

## Open questions

- **Q-Q1**: resolved - change I adds `identityUserConnected` to the bootstrap; Q uses it and keeps the status call as fallback.
- **Q-Q2** (resolved by Q4): there are no secrets in any response; J's `GET mcp/providers` returns names and booleans only.
- **Q-Q3** (owner): accept the new admin link to the backoffice in Settings > Advanced? Default yes.
- **Q-Q4** (N): resolved - N lists/filters by `userId` and returns the optional sanitised `userLabel` for display (D-N11).
- **Q-Q5**: should non-admin users see the system prompt and detail level read-only? Decided: hidden (admin-only settings, Q17).
- Mirrored owner-facing ones: `plans/questions-inbox/OPQ-questions.md`.

## Changelog

- 2026-10-09 (owner decision Q4): replaced the MCP provider credential forms, the `mcp-config` context and the write-only-secret handling with read-only status cards fed by `GET mcp/providers`; tasks 2.5, 5.2, 6.1-6.3 and E2E-Q-08/09/14 reworked; Q-Q2 resolved.
- 2026-10-09 (owner decision Q9): transcript/snapshot views in the backoffice and feedback detail load `/files/...` images through change P's `useServiceImage` hook (forwardToFetch -> blob URL); the files route admits admins.
- 2026-10-09 (owner decisions Q6/Q8/Q17/Q26): admin gating is the bootstrap `isAdmin` (service-decided from `ADMIN_USER_IDS` membership of the verified user id) instead of a Merchant Center permission group; capability `mc-permission-gating` renamed `mc-admin-gating`; non-admins get an "Administrator access required" notice (with the read-only user-ID line and the ADMIN_USER_IDS instruction) and no admin nav (Connections, detail level, system prompt, backoffice, feedback, Managed MCP setup); new `AdminRequiredNotice`, Settings > About section (task 6.9); backoffice/feedback filter by `userId` and show display-only `userLabel` as unverified text; test users are an admin user and a non-admin user; scenarios E2E-Q-15 (forged label/id) and E2E-Q-16 (own user id, becoming administrator) added.
