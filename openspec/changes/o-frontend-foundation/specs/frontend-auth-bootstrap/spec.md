## ADDED Requirements

### Requirement: All service calls go through `/proxy/forward-to`
Every browser request to the chat service MUST be sent via `forwardToFetch`, which sets `X-Forward-To` to the service URL and `audiencePolicy: 'forward-url-full-path'`, MUST NOT request user permissions or any other custom claims (`includeUserPermissions` and `X-Forward-To-Claims` are not used), uses `cache: 'no-store'`, and never adds a query string to the gateway URL.

#### Scenario: Gateway request shape
- **WHEN** the app starts and calls `POST auth/session`
- **THEN** `list_network_requests` shows one request to `<mc-api>/proxy/forward-to` with request header `x-forward-to` ending in `/service/auth/session`, and no `x-forward-to-claims` header

#### Scenario: No router credential in the browser
- **WHEN** local/session storage and request headers are inspected
- **THEN** no bearer token for the service is present

### Requirement: forward-to copies cannot drift
`mc-app/src/utils/forward-to.ts`, `composed-apps/src/utils/forward-to.ts` and `mc-view-app/src/utils/forward-to.ts` MUST be byte-identical, enforced by `scripts/check-duplicates.mjs`.

#### Scenario: Identical copies pass
- **WHEN** `node scripts/check-duplicates.mjs` runs on a clean tree
- **THEN** it prints `OK` and exits 0

#### Scenario: Divergence fails
- **WHEN** one copy gets an extra blank line
- **THEN** the script exits 1 and prints which files differ and a unified hint to copy from `mc-app`

### Requirement: Session bootstrap returns a single-project identity
The app MUST call `POST <endpoint>auth/session` once at start and MUST treat the response `{ success, data: { projectKey, userId, identityMcpConfigured, isAdmin } }` as the only source of identity (including the user's own `userId`, exposed by `useAuth()` so UIs can display it read-only) and of the admin flag. The app MUST NOT send `userEmail` (header, body or query) or `x-mc-team-id`, MUST NOT read or write a team context, MUST NOT depend on `managedMcpConfigured` or `workspace`, and MUST treat `identityUserConnected` and `toolCallLogs` as optional extra fields (used when present, never required).

#### Scenario: Successful bootstrap
- **WHEN** the service answers 200 with the shape above
- **THEN** `useAuth()` reports `isAuthenticated=true`, the given `userId`, `identityMcpConfigured`, `isAdmin`

#### Scenario: Project mismatch
- **WHEN** the service answers 403 (verified `projectKey` differs from the deployment's project)
- **THEN** the session gate shows the error text and a Retry action, not the chat

### Requirement: Re-authentication gate
When the bootstrap fails, `ConnectProvider` MUST render a non-dismissable dialog; a 401 MUST lead with "Sign in again" (navigation to `/logout?reason=unauthorized`) and any other failure MUST lead with "Retry".

#### Scenario: Lapsed session
- **WHEN** the bootstrap returns 401
- **THEN** the dialog title says the Merchant Center session expired and the primary button is "Sign in again"

#### Scenario: Retry succeeds
- **WHEN** the user presses Retry and the bootstrap now succeeds
- **THEN** the dialog disappears and children render

### Requirement: Admin flag comes only from the bootstrap
`useIsAssistantAdmin()` MUST return the bootstrap field `isAdmin` and nothing else: it MUST NOT consult a Merchant Center permission, `localStorage`, a header, a query parameter or a browser-supplied e-mail, and MUST return false while the bootstrap is loading, failed, or when the field is absent. The result is a UX hint only; the service enforces admin on every admin route.

#### Scenario: Admin user
- **WHEN** the signed-in user's user id is in `ADMIN_USER_IDS` and `/auth/session` returns `isAdmin: true`
- **THEN** `useIsAssistantAdmin()` is true

#### Scenario: Non-admin user
- **WHEN** `/auth/session` returns `isAdmin: false` for a user who holds the app's Manage permission
- **THEN** `useIsAssistantAdmin()` is false

#### Scenario: Forged label does not change the flag
- **WHEN** the non-admin user sets `localStorage` entries, request headers (`x-admin-email`) or query parameters (`?userEmail=`) to an administrator's e-mail or user id and reloads the app
- **THEN** the bootstrap still returns `isAdmin: false` and `useIsAssistantAdmin()` stays false
