## ADDED Requirements

### Requirement: Custom View registration contract
The `mc-view-app` application SHALL be a Merchant Center Custom View named "AI Assistant" with `type: CustomPanel`, `typeSettings.size: SMALL` and exactly the 65 locators defined in `custom-view-config.mjs`. `customViewId`, `url` and `cloudIdentifier` SHALL come from `${env:...}` placeholders and no project key, entity id or tunnel host SHALL be hard-coded.

#### Scenario: Locator count
- **WHEN** the locator array of `custom-view-config.mjs` is counted
- **THEN** it contains 65 unique entries and each is a locator accepted by the Merchant Center (validated by `mc-scripts build` and by registration)

#### Scenario: Panel available on a product page
- **WHEN** a user (admin or non-admin) with the view's View permission opens a product detail page in the scratch project
- **THEN** the AI Assistant custom view icon is present in the page's custom view toolbar

#### Scenario: No hard-coded values
- **WHEN** the config and `src/**` are scanned for `ngrok`, `run.app`, a literal `us-store` path or a UUID host path
- **THEN** no match is found

### Requirement: Scopes without a permission group
The Custom View SHALL declare no permission group and no `additionalOAuthScopes`; its `oAuthScopes` SHALL contain `view_key_value_documents` and `view_mcp_servers` under `view` and `manage_key_value_documents` and `manage_mcp_servers` under `manage`, each listed with its reason in the README. The panel SHALL NOT read `isAdmin`, SHALL NOT render any admin-only control and SHALL NOT send any e-mail (`userEmail`) to the service.

#### Scenario: Scope declaration
- **WHEN** `custom-view-config.mjs` and `src/constants.ts` are read
- **THEN** there is no `additionalOAuthScopes` or permission-group constant, and the four scopes above are present

#### Scenario: No e-mail on the wire
- **WHEN** the panel's network log is inspected after a message exchange
- **THEN** no forwarded URL, header or body contains `userEmail` or an e-mail address

### Requirement: Own user id shown read-only
The panel SHALL show, in its footer (or overflow menu when space is too tight), a read-only "Your user ID" line with a Copy button fed by the bootstrap `userId`, to every user; it SHALL be plain text without an input and SHALL NOT make the panel read `isAdmin`.

#### Scenario: Footer line
- **WHEN** a user opens the panel
- **THEN** the footer shows "Your user ID" with the same value as the bootstrap `userId`, no input element exists in it, and Copy writes the id to the clipboard without any request

### Requirement: Embedded chat with entity context
The panel SHALL open (or resume) a chat session and send messages through the Merchant Center gateway (`/proxy/forward-to`) to `ai-chat/:sessionId/message/stream`, and every service URL it calls SHALL carry the query parameter `customView=<base64 of the host page URL>`. The panel SHALL NOT call the service without that parameter.

#### Scenario: Send a message from a product page
- **WHEN** the user opens the panel on a product page, types a question about the product and submits
- **THEN** a request to `/proxy/forward-to` is made whose forwarded URL contains `customView=`, the stream completes and an assistant message is rendered

#### Scenario: Flag survives every call
- **WHEN** the panel's network log is inspected after a message exchange
- **THEN** the forwarded URLs of the session lookup, the message stream and the digest/follow-up calls all contain the `customView` parameter

#### Scenario: Non-Latin host URL
- **WHEN** the host URL contains non-Latin-1 characters
- **THEN** the flag is still produced (UTF-8 safe encoding) and the panel does not throw

### Requirement: Read-only Managed MCP binding gate
The panel SHALL consume the project's identity-mode Managed MCP binding read-only. If the bootstrap reports no binding it SHALL render an instruction that an administrator must connect a Managed MCP Server in the AI Assistant application, SHALL NOT render any control that creates or modifies a binding, and SHALL behave identically for administrators and non-administrators.

#### Scenario: Project without binding
- **WHEN** `/auth/session` returns `identityMcpConfigured: false`
- **THEN** the panel shows "This project is not connected to an identity-mode Managed MCP Server yet. Ask an administrator to set one up in the AI Assistant application." and no chat composer, for the admin user and the non-admin user alike

#### Scenario: Package has no write path
- **WHEN** `mc-view-app/src` is searched for `mcp-servers`, `create-api-client` and `managed-mcp` writers
- **THEN** none exist

### Requirement: Per-user identity connect gate
When the project has a binding but the signed-in user has not connected their Merchant Center identity, the panel SHALL show a "Connect my account" gate that starts the identity OAuth flow, verifies the connection and then reveals the chat. Failures SHALL be shown as readable errors and SHALL NOT lock the user out of retrying.

#### Scenario: Connect flow
- **WHEN** the user is not connected and activates "Connect my account"
- **THEN** the identity flow completes (see change I), verification succeeds and the chat composer appears

#### Scenario: Popup blocked or cancelled
- **WHEN** the identity popup is blocked or closed before completion
- **THEN** an error message is shown and the button is usable again

### Requirement: Session handling in an embedded panel
The panel SHALL remember the open session id in `localStorage` guarded against storage exceptions, SHALL scope session lookup by the `customView` flag as provided by the service, and SHALL start a fresh session when none matches.

#### Scenario: Storage blocked
- **WHEN** `localStorage` throws on read and write
- **THEN** the panel still opens a new session and works for the page view

#### Scenario: Reload resumes the conversation
- **WHEN** the user reloads the same host page
- **THEN** the previous messages of that session are shown

### Requirement: Bootstrap and authentication failures are visible
If the session bootstrap fails (401 or any other status) the panel SHALL show a message that distinguishes an expired Merchant Center session from a service failure and SHALL offer a retry. It SHALL NOT remain blank.

#### Scenario: Service unreachable
- **WHEN** the service URL does not answer
- **THEN** the panel shows an error with a Retry action within 10 seconds

#### Scenario: Wrong project
- **WHEN** the service answers 403 because the project key differs from the connector's project
- **THEN** the panel shows a message that this project is not served by the configured AI Assistant

### Requirement: Reduced chat surface
The panel SHALL include the composer, message list, text/reasoning/tool/subagent/source/file (images loaded through `forwardToFetch` into blob URLs, exactly as in the Merchant Center app)/export/visualisation parts, typing indicator and empty state, and SHALL NOT include the tool menu, feedback popup, floating actions, preview/code switcher, configuration, backoffice or composed pages.

#### Scenario: Missing features
- **WHEN** the panel is opened
- **THEN** no tool-menu trigger, feedback button or view switcher is rendered

### Requirement: Build, hygiene and drift guard
The folder SHALL install, typecheck, lint, test and build independently on Node 22 with no workspace root, SHALL contain no `.env`, build output, `console.*` or starter leftovers, SHALL carry SPDX headers, and files shared byte-for-byte with `mc-app` SHALL be registered in the duplicate-drift check.

#### Scenario: Clean build
- **WHEN** `yarn install && yarn typecheck && yarn lint && yarn test && yarn build` is run in `mc-view-app/`
- **THEN** every command exits with status 0

#### Scenario: Drift detected
- **WHEN** `src/utils/forward-to.ts` differs from the copy in `mc-app`
- **THEN** `node scripts/check-duplicates.mjs` exits non-zero
