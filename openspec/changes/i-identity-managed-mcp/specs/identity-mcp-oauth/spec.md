## ADDED Requirements

### Requirement: Callback URL is derived from MC_AUDIENCE
The OAuth redirect URI SHALL be `{origin(MC_AUDIENCE)}/service/managed-mcp-identity/callback` (the `/service` segment is the Connect endpoint path of the service application). The service SHALL refuse to start an authorization (HTTP 503) when `ENCRYPTION_KEY` is missing, `MC_AUDIENCE` is not configured (it is optional at boot until the first deploy has produced the service URL) or the redirect URI is not `https://`.

#### Scenario: Derivation
- **WHEN** `MC_AUDIENCE=https://service-abc.europe-west1.gcp.commercetools.app` (with or without the `/service` path)
- **THEN** the redirect URI is `https://service-abc.europe-west1.gcp.commercetools.app/service/managed-mcp-identity/callback`

#### Scenario: Plain http refused
- **WHEN** the derived redirect URI starts with `http://`
- **THEN** `POST /authorize` answers 503 and no authorization attempt is stored

### Requirement: Authorization starts only from an explicit user action
`POST /service/managed-mcp-identity/authorize` SHALL require a verified user and a binding. It SHALL run the SDK `auth()` in `authorize` mode, request scope `openid offline_access mcp:{CTP_PROJECT_KEY}:{serverKey}`, and return `{ connected: true }` when the SDK already holds valid tokens or `{ connected: false, authorizationUrl }` otherwise. The 256-bit `state` and the PKCE `code_verifier` SHALL be persisted together as ONE auth-state record (verifier encrypted, `expiresAt` = now + 10 min, `bindingConnectedAt`, `userId`). A tool call (`runtime` mode) SHALL never create or overwrite an authorization attempt.

#### Scenario: Popup URL
- **WHEN** a connected-less user calls `POST /authorize`
- **THEN** the response contains an `https://auth2.{region}.commercetools.com/oauth2/auth?...` URL with `code_challenge_method=S256`, the derived `redirect_uri` and the `mcp:` scope, and exactly one auth-state record exists for the returned `state`

#### Scenario: Runtime never starts an attempt
- **WHEN** a tool call needs a token and none exists
- **THEN** no auth-state record is written and `IdentityReauthRequiredError` is raised

### Requirement: Auth state is single-use across instances
The callback SHALL claim the auth-state record BEFORE exchanging the code. A claim SHALL be implemented as "read record (capture version), reject if expired, then delete with that version"; success means claimed, a `404` or `409` from the delete means unknown-or-already-used. Two concurrent callbacks with the same `state` SHALL result in exactly one code exchange, on any instance.

#### Scenario: Replayed callback
- **WHEN** the same callback URL is requested twice
- **THEN** the second request renders the failure page ("invalid or was already used") and no token exchange occurs

#### Scenario: Expired attempt
- **WHEN** the callback arrives after `expiresAt`
- **THEN** the record is deleted and the failure page says the attempt expired

#### Scenario: Different instance
- **WHEN** `authorize` ran on instance A and the callback is served by instance B
- **THEN** the exchange succeeds because the state lives in the persistence layer, not in memory

### Requirement: Callback page and popup contract
`GET /service/managed-mcp-identity/callback` SHALL NOT require the forward-to JWT (it authenticates through the claimed state). It SHALL answer a small HTML page with a per-response CSP nonce, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`, which posts `{ type: "ct-identity-mcp-oauth", success, message }` to `window.opener` and closes. The attempt SHALL be rejected (409) when the binding's server key or `connectedAt` changed since the attempt began, and when the AS returned `error` (for example `access_denied`).

#### Scenario: User denies consent
- **WHEN** the authorization server redirects with `error=access_denied`
- **THEN** the page reports failure, no token record is written and the state record is already consumed

#### Scenario: Binding changed mid-flight
- **WHEN** an admin rebinds while a user is on the consent screen
- **THEN** the callback reports "binding changed while authorization was in progress" and stores nothing

### Requirement: Tokens are stored encrypted per user and survive refresh races
Token records SHALL be keyed by `userId` (validated against `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`), contain the whole OAuth token set AES-256-GCM encrypted with `ENCRYPTION_KEY` and only non-secret metadata in the clear (`accessTokenExpiresAt`, `hasRefreshToken`, `scope`, `issuedAt`, `bindingConnectedAt`). A write SHALL be ignored when a record with a strictly newer `issuedAt` exists. When the SDK invalidates `tokens`, the provider SHALL delete the record only if it still has the version this provider read (compare-and-delete); if the version moved, it SHALL re-read and let the SDK retry once with the newer token set.

#### Scenario: Out-of-order completion
- **WHEN** two popups finish in reverse order
- **THEN** the older token set does not overwrite the newer one

#### Scenario: Concurrent refresh on two instances
- **WHEN** instance A refreshed (rotating the refresh token) and instance B then fails with `invalid_grant` using the old refresh token
- **THEN** B does not delete A's record, re-reads it and succeeds with A's tokens

#### Scenario: Secrets never plaintext
- **WHEN** the token container is read with the connector's own API client
- **THEN** no `access_token`, `refresh_token` or `id_token` substring appears in any value

### Requirement: Authorization-server pinning
The provider SHALL accept only an authorization server whose origin equals `https://auth2.{CTP_REGION}.commercetools.com` (and, for diagnostics only, recognise the other commercetools hosts); metadata naming any other host SHALL abort the flow before a browser URL is produced. The stored `issuer` SHALL NOT be used as a pin (auth2 re-spelled its issuer on 2026-09-30); the region-derived authorization-server URL and the token endpoint SHALL remain pinned. The RFC 8707 `resource` SHALL be the MCP server URL (a differing advertised value is logged and the derived value used).

#### Scenario: Issuer re-spelled
- **WHEN** records were saved with `issuer` ending in `/` and the live metadata has no trailing slash
- **THEN** refresh and a new authorization both succeed (port of `identity-issuer-drift.spec`)

#### Scenario: Foreign authorization server
- **WHEN** protected-resource metadata lists `https://evil.example`
- **THEN** the flow throws "Refusing authorization server" and no URL is returned

### Requirement: Client registration lifecycle
The project-wide dynamic client registration SHALL be stored once (client information encrypted), together with the redirect URI and scope it was registered with. A stored client SHALL be discarded and re-registered when either differs from the current values (for example a new deployment URL). When the authorization endpoint answers the generated URL with a redirect to `/oauth2/fallbacks/error?error=invalid_client`, the service SHALL clear the client and retry the authorization once.

#### Scenario: Deployment URL changed
- **WHEN** the stored redirect URI differs from the derived one
- **THEN** the next `POST /authorize` registers a new client

#### Scenario: Client forgotten by the AS
- **WHEN** the pre-flight check sees `invalid_client`
- **THEN** the stored client is cleared, a new registration is made and the response contains a working URL; a second rejection returns 500

### Requirement: Disconnect
`DELETE /service/managed-mcp-identity/me` SHALL delete the caller's token record, drop that user's cached tool sets and try to revoke the refresh token at the authorization server (best effort), and answer `{ connected: false }`.

#### Scenario: Disconnect then status
- **WHEN** a connected user calls `DELETE /me` then `GET /status`
- **THEN** `connected` is `false` and a subsequent chat turn reports re-authorization required

### Requirement: Expired attempts do not accumulate
Auth-state records older than 1 hour SHALL be deleted opportunistically by the persistence layer (change E: `sweepExpiredAuthStates`, fire-and-forget at most once per 60 s per process when an attempt is created); a sweep failure SHALL never fail `POST /authorize`.

#### Scenario: Sweep
- **WHEN** 3 auth-state records are older than 1 hour and a user calls `POST /authorize`
- **THEN** those records are deleted shortly after and the request still succeeds
