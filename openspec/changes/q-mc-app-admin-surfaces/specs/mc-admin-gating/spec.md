## ADDED Requirements

### Requirement: One admin primitive
All admin-only UI and routes MUST use `useIsAssistantAdmin()` from change O, which reads only the bootstrap `isAdmin` field of `POST /auth/session`; no component MAY derive admin status from an e-mail address, a user id typed or stored in the browser, a Merchant Center permission, a query parameter, `localStorage`, a header or a server allowlist call. When `ADMIN_USER_IDS` is empty nobody is an administrator and every admin surface stays hidden. The UI gate is a convenience only; the service enforces `requireAdmin` on every admin route.

#### Scenario: Static check
- **WHEN** `grep -rn "is-admin\|ADMIN_USER_IDS\|userEmail\|useIsAuthorized" mc-app/src` runs
- **THEN** it returns no match in admin components

#### Scenario: Admin user sees admin surfaces
- **WHEN** the admin user (user id in `ADMIN_USER_IDS`) opens the app
- **THEN** the rail shows Connections, Settings shows the detail-level control, the system prompt and the backoffice link, and `/backoffice` renders

### Requirement: Non-admin experience
For a user whose bootstrap says `isAdmin: false`, the UI MUST hide every admin item (Connections / Managed MCP setup, detail-level control, system prompt editor, backoffice and feedback review links) and MUST render the "Administrator access required" notice when such a route or the unbound-project gate is reached; chat, sessions, digest, the read-only provider status cards and the user's own identity-MCP connect (when an administrator already bound a server) MUST work unchanged.

#### Scenario: Non-admin navigation
- **WHEN** the non-admin user opens `<app>/backoffice` directly
- **THEN** the "Administrator access required" notice is shown and no `backoffice/*` or `feedback/*` request is sent

#### Scenario: Non-admin Settings
- **WHEN** the non-admin user opens Settings
- **THEN** provider status cards show Enabled/Not configured badges only, and Connections, detail level, system prompt and backoffice link are absent

#### Scenario: Chat keeps working
- **WHEN** the non-admin user sends a chat message in a project where an administrator already bound the Managed MCP server and the user connected their account
- **THEN** the chat answers normally

### Requirement: Administrator-required page shows the user id
The "Administrator access required" notice (shown on a deep link to an admin route and at the unbound-project gate) MUST include the read-only `YourUserId` line of change P and the sentence "Ask an administrator to add your user ID to ADMIN_USER_IDS", and MUST NOT show any e-mail, input or sign-in action. Settings MUST be reachable by every user and MUST contain an "About" section with the same `YourUserId` line and, when `isAdmin` is false, the same sentence.

#### Scenario: Deep link as non-admin
- **WHEN** the non-admin user opens `<app>/backoffice` directly
- **THEN** the page shows "Administrator access required", the user's own user id with a Copy button and the instruction, and no admin request is sent

#### Scenario: Settings About for a non-admin
- **WHEN** the non-admin user opens Settings
- **THEN** the About section shows the user id and the sentence "Ask an administrator to add your user ID to ADMIN_USER_IDS"

#### Scenario: Admin surfaces appear after reconfiguration
- **WHEN** the operator adds the user's id to `ADMIN_USER_IDS`, redeploys with `configure`, and the user refreshes the page
- **THEN** the bootstrap returns `isAdmin: true`, Connections and the backoffice link appear, and the sentence is gone

### Requirement: Degrade, do not leak
Sections that show state to everyone (provider status cards) MUST render read-only status for non-admins; sections that only make sense for admins MUST NOT render for them.

#### Scenario: Non-admin sees no editor
- **WHEN** the non-admin user opens Settings
- **THEN** no textarea, password input or Save button exists in the drawer

### Requirement: Server refusal is handled
When the service answers 403 `ADMIN_REQUIRED` to an admin action, the UI MUST show "Administrator access required" and MUST NOT change local state to look saved.

#### Scenario: 403 on save
- **WHEN** `PUT system-prompt` returns 403 `ADMIN_REQUIRED`
- **THEN** an error is shown and the field reverts to the stored value on reload

### Requirement: Forged label does not grant admin
Browser-supplied values (`x-admin-email`, `userEmail`, `userLabel`, a copied administrator user id in a header, query parameters, `localStorage`) MUST NOT change what the UI shows or what the service allows; `userLabel` is display-only text.

#### Scenario: Forged label with the non-admin user
- **WHEN** the non-admin user sets `x-admin-email`, `userEmail` and `userLabel` to an administrator's e-mail or user id on admin routes (`PUT system-prompt`, `PUT managed-mcp-identity`, `POST backoffice/threads`, `GET feedback/fetch`)
- **THEN** every request is answered 403 `ADMIN_REQUIRED` and the UI still shows the non-admin experience
