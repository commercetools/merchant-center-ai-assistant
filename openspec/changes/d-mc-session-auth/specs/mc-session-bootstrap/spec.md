## ADDED Requirements

### Requirement: Bootstrap endpoint
`POST /service/auth/session` SHALL be guarded by `verifyMcSession` and respond `200 { "success": true, "data": { projectKey, userId, isAdmin, ...contributions } }`. It MUST NOT register a project, issue a token, or write persistence. `isAdmin` is the service-computed `ADMIN_USER_IDS` membership of the verified `sub` (never derived from the request) and `userId` is that verified `sub`; the frontends read admin status only from `isAdmin` and show `userId` as the read-only "Your user ID".

#### Scenario: Core payload
- **WHEN** an authenticated admin posts `{}`
- **THEN** `data` equals `{ projectKey, userId, isAdmin: true }` exactly (no extra keys when no contributor is registered)

#### Scenario: Non-admin
- **WHEN** an authenticated user whose id is not in `ADMIN_USER_IDS` posts `{}` with the forged header `x-admin-email: admin@example.com`
- **THEN** `data.isAdmin` is false

#### Scenario: Own user id for the admin bootstrap
- **WHEN** `ADMIN_USER_IDS` is empty and a user posts `{}`
- **THEN** `data.isAdmin` is false and `data.userId` equals the verified `sub`, so the user can copy it into `ADMIN_USER_IDS`

#### Scenario: Unauthenticated
- **WHEN** the request has no valid session
- **THEN** the response is 401 `{ "message": "Missing or invalid Merchant Center session" }` and no contributor runs

### Requirement: Contributor registry
D SHALL export `registerBootstrapContributor(name, fn)` where `fn(req: AuthenticatedRequest): Promise<Record<string, unknown>>`. The endpoint MUST run all contributors concurrently, merge their results into `data`, reject contributors that return a key already used (startup error), and on a contributor failure omit its keys and log a warning instead of failing the bootstrap (the app treats a failed bootstrap as a dead session).

#### Scenario: Contributor adds fields
- **WHEN** a contributor returns `{ toolCallLogs: 'all' }`
- **THEN** `data.toolCallLogs` is `'all'`

#### Scenario: Contributor fails
- **WHEN** a contributor rejects
- **THEN** the response is still 200 and its keys are absent

#### Scenario: Key collision
- **WHEN** two contributors return the same key
- **THEN** registration or first request throws a clear error at startup/test time, never silently overwrites

### Requirement: Response hygiene
The bootstrap response MUST NOT echo the JWT, the audience, the issuer, or any request body field.

#### Scenario: Echo check
- **WHEN** the body `{ "projectKey": "x", "token": "y" }` is posted
- **THEN** `data.projectKey` is the verified project key, not `x`, and `y` appears nowhere in the response
