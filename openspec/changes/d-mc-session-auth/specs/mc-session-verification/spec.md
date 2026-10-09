## ADDED Requirements

### Requirement: Gateway JWT is verified on every authenticated route
`verifyMcSession` SHALL authenticate a request only if it carries the Merchant Center gateway marker headers (`x-mc-api-cloud-identifier`, `x-mc-api-forward-to-version`) and an `Authorization: Bearer` JWT that verifies as RS256 against the JWKS of the configured MC API gateway issuer, with `iss` equal to that issuer and `aud` equal to `MC_AUDIENCE` origin plus the request path (`audiencePolicy: 'forward-url-full-path'`). The verifier MUST be configured with `inferIssuer: false`. On any failure the middleware MUST respond 401 with message `Missing or invalid Merchant Center session` and MUST NOT disclose the failure reason.

#### Scenario: Valid token
- **WHEN** a request carries both marker headers and a correctly signed, unexpired token whose `aud` is `<MC_AUDIENCE>/service/auth/session` and whose project claim equals `CTP_PROJECT_KEY`
- **THEN** the handler runs and `req.user.userId` equals the token `sub`

#### Scenario: Token rejection matrix
- **WHEN** the token is missing, malformed, signed with `alg: none`, signed HS256, signed by a different RSA key, issued by another issuer, issued for another audience path, or expired
- **THEN** the response is 401 with the generic message and the handler is not invoked

#### Scenario: Request that bypassed the gateway
- **WHEN** a valid token is sent without the `x-mc-api-cloud-identifier` header
- **THEN** the response is 401

### Requirement: Fail closed without an audience
If `MC_AUDIENCE` is not configured and the development bypass is off, every authenticated route SHALL respond 401 `Service is not configured for authentication`, while the service still boots and `GET /service/status` reports `authConfigured:false`.

#### Scenario: Missing audience
- **WHEN** the service runs without `MC_AUDIENCE` and receives an otherwise valid request
- **THEN** the response is 401 with `Service is not configured for authentication`

#### Scenario: Audience must be an origin
- **WHEN** `MC_AUDIENCE=https://x.example/service`
- **THEN** configuration fails naming `MC_AUDIENCE`

### Requirement: Single-project guard
After verification, the middleware SHALL compare the token's project key with `CTP_PROJECT_KEY` and respond 403 `This assistant is not available for the requested project` on mismatch. The response MUST NOT include either key.

#### Scenario: Foreign project
- **WHEN** a valid token carries `projectKey = other-project` while `CTP_PROJECT_KEY = my-project`
- **THEN** the response is 403 and the body contains neither project key

#### Scenario: Incomplete session
- **WHEN** the verified payload lacks `sub` or the project claim
- **THEN** the response is 401 `Merchant Center session is incomplete`

### Requirement: Request user contract
On success the middleware SHALL set `req.user: RequestUser = { userId, projectKey, isAdmin: boolean }` (`isAdmin` from `ADMIN_USER_IDS`, see `mc-admin-authorization`), copy it into the request context, and set `Cache-Control: no-store` and `Vary: Authorization`. `userId` is the Merchant Center user id (the JWT `sub`, signed by the gateway).

#### Scenario: Context is populated
- **WHEN** a request is authenticated
- **THEN** `getContext()?.user` equals `req.user` inside the handler

### Requirement: Development bypass
When `MC_AUTH_DISABLED=true` the middleware SHALL skip JWT verification and build `req.user` from the headers `x-dev-user-id` (default `dev-user`) and `x-dev-admin` (`true` means admin, default false; consulted only here), with `projectKey` fixed to `CTP_PROJECT_KEY`. `readConfiguration()` MUST fail when `MC_AUTH_DISABLED=true` and `NODE_ENV=production` (the unset default), the service MUST log a warning once at boot, and `MC_AUTH_DISABLED` MUST NOT be declared in `connect.yaml`.

#### Scenario: Bypass identity
- **WHEN** `MC_AUTH_DISABLED=true`, `NODE_ENV=development`, and a request sets `x-dev-user-id: u1`
- **THEN** `req.user.userId` is `u1` and `req.user.projectKey` is `CTP_PROJECT_KEY`

#### Scenario: Bypass admin header
- **WHEN** the bypass is on and a request sets `x-dev-admin: true`
- **THEN** `req.user.isAdmin` is true; with the bypass off the same header is ignored

#### Scenario: Bypass refused in production
- **WHEN** `NODE_ENV=production` (or unset) and `MC_AUTH_DISABLED=true`
- **THEN** the service exits at start naming `MC_AUTH_DISABLED`

#### Scenario: Query parameters do not authenticate
- **WHEN** the bypass is on and a request sends `?userId=x&projectKey=y&userEmail=z` without dev headers
- **THEN** `req.user.userId` is `dev-user` and `req.user.projectKey` is `CTP_PROJECT_KEY`

### Requirement: Ownership by verified user id only
`isOwner(session, user)` SHALL return true only when `session.userId` is a non-empty string equal to `user.userId`. A session without `userId` MUST NOT be owned by anyone. No code MAY read `req.query.userEmail`, and the keys `userEmail`, `userId`, `projectKey` MUST be exported as `LEGACY_IDENTITY_QUERY_KEYS` so feature-flag parsing ignores them.

#### Scenario: Different user
- **WHEN** `session.userId = 'a'` and `user.userId = 'b'`
- **THEN** `isOwner` is false

#### Scenario: Legacy session without owner
- **WHEN** `session.userId` is undefined
- **THEN** `isOwner` is false for every user
