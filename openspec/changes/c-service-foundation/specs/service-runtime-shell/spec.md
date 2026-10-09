## ADDED Requirements

### Requirement: Router is mounted at the Connect endpoint base
The service SHALL mount its single top-level router at `/service`, identical to the `endpoint: /service` declared for the `service` application in `connect.yaml`. No route SHALL be served outside `/service` except the framework 404.

#### Scenario: A route under the endpoint resolves
- **WHEN** a client sends `GET /service/status`
- **THEN** the response status is 200

#### Scenario: A path outside the endpoint is not found
- **WHEN** a client sends `GET /status`
- **THEN** the response status is 404 and the body is `{ "message": "Path not found." }`

### Requirement: Liveness endpoint
The service SHALL expose `GET /service/status` (and `GET /service/health` as an alias that calls the same handler) that requires no authentication, performs no network or persistence call, and returns `{ "status": "UP", "service": "ai-assistant", "version": <package version>, "persistence": <driver>, "authConfigured": <boolean>, "adminConfigured": <boolean> }` (`adminConfigured` is true iff `ADMIN_USER_IDS` is non-empty; the list is never returned). The body MUST NOT contain any configuration value other than those listed.

#### Scenario: Status is unauthenticated and fast
- **WHEN** `GET /service/status` is called without an `Authorization` header
- **THEN** the status is 200 and `status` is `"UP"`

#### Scenario: Status reports missing audience without failing
- **WHEN** the service is configured without `MC_AUDIENCE`
- **THEN** `GET /service/status` returns 200 with `authConfigured: false`

#### Scenario: Status shows whether an administrator is configured
- **WHEN** `ADMIN_USER_IDS` is unset and `GET /service/status` is called
- **THEN** the body has `adminConfigured: false` and no user id appears anywhere in it

#### Scenario: Status leaks nothing
- **WHEN** `GET /service/status` is called
- **THEN** the serialized body contains none of `CTP_CLIENT_SECRET`, `ENCRYPTION_KEY`, `GCP_SA_KEY_BASE64` values

### Requirement: Error contract
All errors SHALL pass through one error middleware registered last. A `CustomError(statusCode, message, errors?)` MUST be rendered as `{ message, errors? }` with its status; an Express-style 4xx error (for example body-parser `entity.too.large`) MUST be rendered as `{ success: false, error: <type>, message }` with its status; any other error MUST be rendered as HTTP 500 `{ "message": "Internal server error" }`. Stack traces MUST be included only when `NODE_ENV=development`.

#### Scenario: Custom error
- **WHEN** a handler throws `new CustomError(403, 'nope')`
- **THEN** the response is 403 with body `{ "message": "nope" }` and no `stack`

#### Scenario: Oversized body is a 413, not a 500
- **WHEN** a JSON body larger than the configured limit is posted
- **THEN** the response status is 413

#### Scenario: Unknown error is opaque in production
- **WHEN** a handler throws `new Error('db password is hunter2')` and `NODE_ENV=production`
- **THEN** the response is 500 with body `{ "message": "Internal server error" }`

### Requirement: Request context
Every request SHALL run inside an `AsyncLocalStorage` scope created before any other middleware, holding `{ requestId, correlationId, user?, session? }`. `correlationId` MUST be the `x-correlation-id` request header when present, otherwise the generated `requestId`. The logger MUST add `correlationId` to every line logged inside a request.

#### Scenario: Correlation header is honoured
- **WHEN** a request carries `x-correlation-id: abc-123`
- **THEN** `getContext()?.correlationId` equals `abc-123` inside the handler

#### Scenario: Context is isolated between concurrent requests
- **WHEN** two requests run concurrently
- **THEN** each handler observes only its own `requestId`

### Requirement: Safe request logging
URLs written to logs SHALL be passed through `requestUrlForLog`, which replaces the values of the query parameters `code`, `state`, `token`, `access_token`, `refresh_token`, `id_token`, `client_secret`, `code_verifier`, `assertion` with `[redacted:<length>]`. The `Authorization` header and request bodies MUST NOT be logged at any level.

#### Scenario: OAuth callback code is redacted
- **WHEN** an error occurs for `GET /service/x/callback?code=SECRET&state=S&error=denied`
- **THEN** the log line contains `code=[redacted:6]` and `error=denied` and does not contain `SECRET`

### Requirement: Cache layer is an optimisation only
The service SHALL provide an in-memory `CacheStore` (namespace + key, TTL, FIFO eviction at `CACHE_MAX_ENTRIES`, periodic sweep that is disabled when `NODE_ENV=test`). No feature MAY rely on the cache for correctness; a cold or empty cache MUST yield the same results as a warm one.

#### Scenario: Entry expires
- **WHEN** a value is set with `ttlMs=50` and read after 100 ms
- **THEN** `get` returns `null`

#### Scenario: Eviction at capacity
- **WHEN** `CACHE_MAX_ENTRIES=2` and three distinct keys are set
- **THEN** the first key is no longer returned

#### Scenario: Prefix delete is namespace-scoped
- **WHEN** `deletePrefix('a', 'x')` is called while `('b','x1')` is stored
- **THEN** `('b','x1')` is still returned

### Requirement: No tenancy shell
The service MUST NOT contain a project/tenant middleware, a `projects/{key}` model, a region matrix, a Firestore import, or the strings `tenant`/`multitenant` in source (outside an optional historical changelog).

#### Scenario: Grep gate
- **WHEN** `grep -rniE "tenant|firestore|validateProject" service/src` is run
- **THEN** it returns no matches
