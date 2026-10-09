## ADDED Requirements

### Requirement: Binding is a single project-wide record
The service SHALL store at most one identity-mode Managed MCP Server binding for the deployment, in the settings object owned by change E, containing `serverKey`, `url`, `majorVersion`, `authenticationMode: "CommercetoolsIdentity"`, `connectedAt` (the binding revision) and the last discovery snapshot. The URL SHALL be derived as `https://mcp.{CTP_REGION}.commercetools.com/projects/{CTP_PROJECT_KEY}/{serverKey}` and never taken from the client.

#### Scenario: Client-supplied URL must equal the derived URL
- **WHEN** an admin sends `PUT /service/managed-mcp-identity` with `url` different from the derived URL
- **THEN** the service answers 400 and the stored binding is unchanged

#### Scenario: Server key format
- **WHEN** `serverKey` does not match `^[A-Za-z0-9_-]{2,256}$` (for example it contains `://`)
- **THEN** the service answers 400 and nothing is stored

### Requirement: Reading the binding
`GET /service/managed-mcp-identity` SHALL be available to every authenticated Merchant Center user of the project and SHALL return the public binding (`serverKey`, `url`, `majorVersion`, `authenticationMode`, `connectedAt`, `discovery`) or HTTP 404 with `code: "IDENTITY_MCP_NOT_CONFIGURED"` when none exists. It SHALL NOT return client registration data or tokens.

#### Scenario: No binding yet
- **WHEN** a signed-in user calls `GET /service/managed-mcp-identity` on a fresh deployment
- **THEN** the response is 404 with `{ success: false, code: "IDENTITY_MCP_NOT_CONFIGURED" }`

#### Scenario: Binding exists
- **WHEN** a binding exists
- **THEN** the response is 200 `{ success: true, data: { serverKey, url, majorVersion, authenticationMode, connectedAt, discovery } }` and contains no `client`, `client_id`, `refresh_token` or `encrypted*` field

### Requirement: Setting the binding is admin-only and discovery-verified
`PUT /service/managed-mcp-identity` SHALL require administrator access (`requireAdmin`, change D: the caller's verified user id is listed in `ADMIN_USER_IDS`). Before storing, the service SHALL probe the server's OAuth discovery chain (unauthenticated `initialize` -> `401` + `WWW-Authenticate resource_metadata` -> protected-resource metadata -> authorization-server metadata) and SHALL store the binding only when the verdict is `auth2` (the authorization server named is `https://auth2.{CTP_REGION}.commercetools.com`). A successful `PUT` SHALL set a new `connectedAt`, clear the stored client registration, and invalidate every cached tool set.

#### Scenario: Non-admin cannot bind
- **WHEN** a user whose id is not listed in `ADMIN_USER_IDS` calls `PUT /service/managed-mcp-identity`
- **THEN** the response is 403 `ADMIN_REQUIRED` and no probe request is made

#### Scenario: Forged e-mail or id cannot bind
- **WHEN** a non-admin user calls `PUT /service/managed-mcp-identity` with `x-admin-email`, `?userEmail=` and a body `userLabel` equal to an administrator's e-mail address, plus a `userId` query/body field naming a listed id
- **THEN** the response is 403 `ADMIN_REQUIRED` and nothing is stored

#### Scenario: First bind needs no MCP sign-in
- **WHEN** an administrator (listed in `ADMIN_USER_IDS`) binds the first server on a fresh deployment
- **THEN** the bind succeeds although no identity-mode MCP token exists for anyone

#### Scenario: Server is not identity mode
- **WHEN** the probed server advertises `auth.{region}` (ClientCredentials) instead of `auth2`
- **THEN** the response is 400 with a message that names the verdict and the binding is unchanged

#### Scenario: Rebind invalidates consent
- **WHEN** an admin binds a server while user tokens exist for the previous binding revision
- **THEN** `connectedAt` changes and every user's next `GET /status` reports `connected: false` until they reconnect

### Requirement: Clearing the binding removes every user's tokens
`DELETE /service/managed-mcp-identity` SHALL require administrator access (`requireAdmin`), SHALL delete the binding and the client registration, SHALL delete every user's token record (bounded concurrency) and SHALL try to revoke each refresh token at the authorization server's `revocation_endpoint` on a best-effort basis (failures are logged and do not fail the request).

#### Scenario: Tokens of other users are removed
- **WHEN** an admin clears the binding and three other users had connected
- **THEN** the token container no longer contains their records and the response is 200

#### Scenario: Revocation endpoint unreachable
- **WHEN** the revocation request fails with a network error
- **THEN** the tokens are still deleted locally and the response is 200

### Requirement: Status endpoint
`GET /service/managed-mcp-identity/status` SHALL be available to any authenticated user and SHALL return `{ configured, connected }` and, when connected, `serverKey`, `hasRefreshToken`, `accessTokenExpiresAt`, `scope`. "Connected" SHALL mean a token record exists whose `bindingConnectedAt` equals the binding's `connectedAt`. The same predicate (`isIdentityUserConnected`) SHALL feed `identityUserConnected` in `POST /auth/session` (change D).

#### Scenario: Stale revision is not connected
- **WHEN** a user's token record carries an older `bindingConnectedAt` than the binding
- **THEN** `connected` is `false` and `/auth/session` reports `identityUserConnected: false`

### Requirement: Verify endpoint
`POST /service/managed-mcp-identity/verify` SHALL perform a real handshake as the calling user and return `{ connected, cached, toolCount, toolNames }`; when no usable token exists it SHALL answer 401 with `code: "IDENTITY_REAUTH_REQUIRED"`; when the server rejects the user because none of the configured tools are permitted it SHALL answer 403 with `code: "IDENTITY_NO_PERMITTED_TOOLS"`.

#### Scenario: Verified connection
- **WHEN** a connected user calls `POST /verify`
- **THEN** the response lists the tool names the user may use

#### Scenario: No token
- **WHEN** a user who never connected calls `POST /verify`
- **THEN** the response is 401 `IDENTITY_REAUTH_REQUIRED`
