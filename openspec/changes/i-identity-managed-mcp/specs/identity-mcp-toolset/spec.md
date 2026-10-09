## ADDED Requirements

### Requirement: Tool sets are per user and double-checked
`getIdentityMcpToolSet(user)` SHALL return the tools of the bound server as that user. The in-memory cache key SHALL contain the user id, the binding revision and the server key (`ctmcpid:{userId}:{revision}:{serverKey}`) and every read SHALL re-verify the stored owner (user id, server key, revision); a mismatch SHALL discard the entry and log an error. The cache is an optimisation only: with the cache disabled or empty, behaviour is identical. TTL SHALL be 60 seconds. A missing or malformed user id SHALL throw before any key is built.

#### Scenario: Two users, one binding
- **WHEN** users A and B request tool sets within the TTL
- **THEN** each gets its own entry and B never receives tool objects created for A

#### Scenario: Owner mismatch
- **WHEN** a cache entry under A's key carries owner B
- **THEN** the entry is deleted, an error is logged and a fresh handshake is made

#### Scenario: Binding revision change
- **WHEN** the binding is re-set
- **THEN** all cached tool sets are dropped and keys of the new revision differ

### Requirement: Rejection and failure mapping
A handshake that fails with `UnauthorizedError` SHALL raise `IdentityReauthRequiredError('refresh-failed')`; a missing token SHALL raise `IdentityReauthRequiredError('no-token')`; a `403` or an MCP error stating that no configured tool is permitted SHALL raise `IdentityNoPermittedToolsError`; any other failure SHALL log `TOOLS_HANDSHAKE_FAILED` with the error class and duration and return `null` (the agent continues without commerce tools). A handshake that succeeds with zero tools SHALL log `TOOLS_ZERO`. HTTP redirects from the MCP server SHALL be rejected (`redirect: "error"`).

#### Scenario: Refresh failed
- **WHEN** the stored refresh token is rejected and no newer record exists
- **THEN** the caller receives `IDENTITY_REAUTH_REQUIRED` and the record is deleted (compare-and-delete)

#### Scenario: Zero permitted tools
- **WHEN** the server rejects because the user's Merchant Center permissions allow none of the configured tools
- **THEN** the caller receives `IDENTITY_NO_PERMITTED_TOOLS`, not a generic 500

### Requirement: commercetools ToolSource
The change SHALL register a `ToolSource` (change H contract) named `commercetools` with `displayName` "commercetools Commerce": `isEnabled(ctx)` true when a binding exists; `getTools(ctx)` returning ALL tools of the user's tool set (the registry, not this source, applies the session `disabledTools`, the 15 s timeout, failure isolation and Gemini schema normalisation), wrapped with the tool-result offload pipeline from change L; `listForMenu(ctx)` returning `{ toolNames }` (no descriptions; an empty list when the user is not connected, so the group is still shown); `getPrompt(ctx)` returning the commercetools prompt. When the user must re-authorise or has no permitted tools, `getTools` SHALL return exactly one placeholder tool `commercetools_account_not_connected` (no arguments; its result states the problem and what to tell the user) so that the registry keeps the source's prompt, and `getPrompt` SHALL then append the instruction to ask the user to reconnect; the failure SHALL NOT be swallowed by a bare `console.error`.

#### Scenario: Menu lists live tools
- **WHEN** the tools menu for a session is requested by a connected user
- **THEN** the `commercetools` group lists exactly the tool names `tools/list` returned for that user

#### Scenario: Disabled tool
- **WHEN** the session disabled `delete_orders`
- **THEN** the registry removes it from the model's tool set for that turn (the source itself returned it)

#### Scenario: Reconnect needed during a turn
- **WHEN** the token is gone mid-session
- **THEN** the source contributes only `commercetools_account_not_connected`, the prompt contains the reconnect instruction, the turn completes with an answer that tells the user to reconnect, and `GET /status` reports `connected: false`

#### Scenario: Unexpected error
- **WHEN** `getTools` throws an error that is neither re-auth nor no-permitted-tools
- **THEN** it propagates to the registry, which logs it and contributes nothing for this source

### Requirement: Tool calls run as the user
`callIdentityMcpTool(user, name, args)` SHALL re-resolve the tool set through the owner-checked path (never accept a caller-supplied tool set), and SHALL log `CALL_ERR` with tool, duration and error class on failure.

#### Scenario: Unknown tool
- **WHEN** a name not exposed to this user is called
- **THEN** an error lists the tools that are available
