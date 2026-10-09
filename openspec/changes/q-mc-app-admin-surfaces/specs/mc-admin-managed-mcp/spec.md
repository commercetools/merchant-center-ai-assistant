## ADDED Requirements

### Requirement: Session gate states
`ConnectProvider` MUST render, in order: spinner while the bootstrap runs; the re-authentication dialog on bootstrap failure (O); the Managed MCP binding page when `identityMcpConfigured` is false (administrators only; every other user sees the "Administrator access required" notice instead of the page); the identity connect gate when the project is bound but the current user has not connected (`GET managed-mcp-identity/status` returns `connected: false`); otherwise the chat.

#### Scenario: Project not bound, admin
- **WHEN** the bootstrap returns `identityMcpConfigured: false` and `isAdmin: true`
- **THEN** the binding page with the server picker/creator is shown instead of the chat

#### Scenario: Bound, user not connected
- **WHEN** `identityMcpConfigured` is true and status `connected` is false
- **THEN** the "Connect my account" gate is shown

#### Scenario: Ready
- **WHEN** both are true
- **THEN** children render and no gate is visible

#### Scenario: Project not bound, non-admin
- **WHEN** the bootstrap returns `identityMcpConfigured: false` and `isAdmin: false`
- **THEN** the "Administrator access required" notice is shown (with the user's own id and the instruction to ask an administrator to add it to `ADMIN_USER_IDS`), no server list is requested and no `PUT managed-mcp-identity` can be sent

### Requirement: Binding uses the signed-in user's permissions
Listing, reading the tool catalog of, and creating Managed MCP Servers MUST go through the Merchant Center `/proxy/ctp` REST proxy (`GET /{projectKey}/mcp-servers`, `GET /{projectKey}/mcp-servers/types/CommerceMCP?majorVersion=v4`, `POST /{projectKey}/mcp-servers`), MUST NOT mint API clients, and the list MUST be restricted to `authenticationMode="CommercetoolsIdentity"`.

#### Scenario: Create a server
- **WHEN** an admin enters key `e2e-ai-assistant`, keeps the Read-only preset and submits
- **THEN** a POST with `authenticationMode: "CommercetoolsIdentity"`, `state: "Enabled"`, `mcpServer.type: "CommerceMCP"` is sent and the server is then bound via `PUT managed-mcp-identity`

#### Scenario: Permission refusal
- **WHEN** the Merchant Center refuses the create with `insufficient_scope`
- **THEN** the permission notice names the missing scopes and nothing is bound

### Requirement: Create-or-reuse form
The form MUST list existing identity servers with key, URL and tool count, mark the bound one "in use", refuse a `Disabled` server, and for a new server provide key/name inputs and a tool picker with Read-only / All / None presets that preselects Read-only tools and hides the `all` and `read_all` wildcard entries.

#### Scenario: Disabled server
- **WHEN** an existing server has state `Disabled`
- **THEN** it cannot be selected and the reason is shown

### Requirement: Per-user connect and disconnect
The user MUST be able to connect their Merchant Center account through a popup OAuth flow (`POST managed-mcp-identity/authorize`, popup, `postMessage` of type `ct-identity-mcp-oauth` accepted only from the service origin, status polling every second, 10 minute timeout), verify (`POST managed-mcp-identity/verify`), and disconnect (`DELETE managed-mcp-identity/me`).

#### Scenario: Popup blocked
- **WHEN** the browser blocks the popup
- **THEN** an error "The sign-in popup was blocked by the browser" is shown and no polling continues

#### Scenario: Disconnect re-gates
- **WHEN** a connected user presses "Disconnect my account"
- **THEN** after the DELETE the identity gate is shown again

### Requirement: Admin connections drawer
Admins (bootstrap `isAdmin`) MUST see a "Connections" rail item that opens a drawer to rebind or remove the project binding; non-admins MUST NOT see the item, and the service answers 403 `ADMIN_REQUIRED` to their `PUT`/`DELETE managed-mcp-identity`.

#### Scenario: Non-admin rail
- **WHEN** the non-admin user opens the app
- **THEN** the rail has no Connections item

#### Scenario: Forged label cannot bind
- **WHEN** the non-admin user sends `PUT managed-mcp-identity` with `x-admin-email`, `userEmail` or `userLabel` set to an administrator's e-mail or user id
- **THEN** the service answers 403 `ADMIN_REQUIRED` and nothing is bound
