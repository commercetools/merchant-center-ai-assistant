## Why

The commercetools agent is the heart of the assistant: it lets a Merchant Center user work on their own Project through a commercetools **Managed MCP Server in `CommercetoolsIdentity` mode**, where commercetools filters the tool list by that user's Merchant Center permissions and attributes every call to that user. The multitenant router already ships this flow, but it keeps refresh tokens, PKCE state, the dynamic-client registration and the project binding in Firestore, trusts a client-supplied `userEmail`, lets any signed-in user rebind the server, and silently degrades to "no commerce tools" when a token expires. Single-tenant Connect has no Firestore and must run on N instances with scale-to-zero, so the flow has to be re-based on the persistence interfaces (change E) and the verified user (change D), and hardened while we are at it.

## What Changes

- **Change ID: I** (`i-identity-managed-mcp`). **Needs:** D (verified `RequestUser`, `requireAdmin` driven by `ADMIN_USER_IDS`), E (persistence interfaces, encryption helper, Custom Object concurrency), H (agent registry, `ToolSource` contract, stream). Unblocks: Q (identity connect page), V (E2E).
- Port the OAuth 2.0 authorization-code + PKCE client for Managed MCP Servers (`@ai-sdk/mcp` `auth()` + a custom `OAuthClientProvider`): dynamic client registration, `authorize` / `callback` / `runtime` provider modes, token refresh, issuer-drift tolerance, authorization-server allow-listing.
- Move **all durable OAuth state** behind three small ports backed by change E: encrypted per-user token records, the project-wide DCR client registration, and single-use PKCE auth-state records. The single-use **claim is a versioned Custom Object delete**, so it is atomic across instances.
- Derive the **OAuth callback URL from `MC_AUDIENCE`** (origin) plus the service endpoint path; drop `IDENTITY_REDIRECT_ORIGIN`, `IDENTITY_MCP_SCOPE`, `IDENTITY_MCP_SKIP_RESOURCE`, `IDENTITY_MCP_STATE_TTL_MS` env knobs.
- Port the **binding endpoints** under `/service/managed-mcp-identity`: read / set / clear the server binding, "connect my account" (`POST /authorize` + browser `GET /callback`), `GET /status`, `POST /verify`, `DELETE /me`.
- Port the **per-user tool-set cache** (key includes the user; owner re-check on every read) and the **commercetools agent wiring** as a `ToolSource` named `commercetools` (plus the shared tool-result BigQuery offload pipeline hook, owned by change L).
- Specify **authorization-rejection handling** end to end: re-auth required (`IDENTITY_REAUTH_REQUIRED`), server answers 403 / "no permitted tools", the AS forgetting the registered client, `access_denied` on the consent screen, rotated refresh token raced by another instance.
- **BREAKING (vs. legacy):** `PUT` / `DELETE` of the binding require administrator access, i.e. the verified user id listed in `ADMIN_USER_IDS` (legacy: any signed-in user); `DELETE` of the binding now also removes every user's token record and revokes best-effort; no `projectKey` in any payload; `?userEmail=` is never read.
- Hardening added: compare-and-delete when the SDK invalidates tokens (so a slow instance cannot delete a token another instance just refreshed), expired auth-state sweep, refresh-token revocation on disconnect, no `console.error` swallow of re-auth in the agent.

## Capabilities

### New Capabilities
- `identity-mcp-binding`: admin-gated binding of one identity-mode Managed MCP Server to the project (read, set with discovery verification, clear with token sweep) and the status/verify endpoints.
- `identity-mcp-oauth`: per-user OAuth + PKCE connection to the bound server - authorize, callback, token storage and refresh, DCR client lifecycle, disconnect, rejection handling.
- `identity-mcp-toolset`: per-user tool-set retrieval and cache, `ToolSource` registration, commercetools agent wiring and re-auth signalling to the chat stream.

### Modified Capabilities
<!-- none: openspec/specs is empty -->

## Impact

- New code under `service/src/identity-mcp/` (provider, discovery, ports, adapters, controller, routes, toolset, tool source) and tests under `service/tests/`.
- New dependency: none beyond `@ai-sdk/mcp` (already required by H); no new env keys (callback URLs, scopes and TTLs are derived or constants). Standard config used: `MC_AUDIENCE`, `CTP_PROJECT_KEY`, `CTP_REGION`, `ADMIN_USER_IDS` (read only through D's `req.user.isAdmin` / `requireAdmin`). Secret used: `ENCRYPTION_KEY`.
- `connect.yaml` scopes: **no new scope** - the identity flow runs on the user's own token; the connector's API client never calls Managed MCP.
- Consumers: Q (`GET/PUT/DELETE /managed-mcp-identity`, `/status`, `/authorize` popup + `postMessage` contract `ct-identity-mcp-oauth`), O/P (`/auth/session` fields `identityMcpConfigured`, `identityUserConnected`, owned by D and fed by I's `isIdentityUserConnected`), V (scenarios E2E-I-01..07).

## Out of scope

- Creating or editing Managed MCP Server configurations (tools list, state, authentication mode) - done in the Merchant Center UI / API by the admin; the service only binds a server key.
- ClientCredentials-mode Managed MCP, team/credential bindings, `x-mc-team-id`, `verify:mcp-isolation` (dropped upstream; D5).
- The agent registry, orchestrator, SSE stream (H), tool menu endpoints (G), the BigQuery offload implementation (L), schema normalisation (H).
- The frontend connect page and gate (Q).
- Forward-to JWT exchange for an MCP token - proven impossible (auth2 does not advertise `jwt-bearer`).
- Hardening the identity-MCP connect flow with the same completion handshake (legacy parity in v1; recorded as a later hardening).
- Deciding who is an administrator (change D: `ADMIN_USER_IDS`); I only applies `requireAdmin` to the binding writes.

## Legacy source

Read-only, under `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/`:
`service/src/client/{ct-identity.mcp,commercetools-tools}.ts`, `service/src/services/{identity-mcp-auth.provider,identity-mcp-discovery.service,identity-connection.service}.ts`, `service/src/controllers/managed-mcp-identity.controller.ts`, `service/src/routes/managed-mcp-identity.route.ts`, `service/src/cache/mcp-tools.cache.ts`, `service/src/utils/{managed-mcp-resolution,mcp-server-key,region}.ts`, `service/src/functional-agent/agents/definitions/commercetools.agent.ts`, `service/scripts/probe-identity-mcp.ts`, `service/tests/wire/{identity-issuer-drift,identity-mcp,managed-mcp-resolution}.spec.ts`, `ARCHITECTURE.md` section "Identity mode: reachable, and what it costs", `FEATURES.md`.
Frontend contract read from `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-app/src/hooks/use-managed-mcp/use-identity-mcp-config.ts` and `mc-app/src/contexts/connect.tsx`.
