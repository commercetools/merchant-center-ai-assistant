## ADDED Requirements

### Requirement: Gateway primitives
The persistence layer SHALL access Custom Objects only through an `ObjectGateway` offering `get(container, key)`, `put(container, key, value, { ifVersion? })`, `delete(container, key, { ifVersion? })` and `query(container, query)`. `get` of a missing object MUST return `null`; `delete` of a missing object MUST return `null`; `put` with a stale `ifVersion` MUST throw `ConflictError`. No other module MAY import `@commercetools/platform-sdk` custom-object builders.

#### Scenario: Missing object
- **WHEN** `get('ai-assistant-settings','default')` is called and the object does not exist
- **THEN** the result is `null` (not an exception)

#### Scenario: Version conflict
- **WHEN** an object is at version 3 and `put(..., { ifVersion: 2 })` is called
- **THEN** a `ConflictError` is thrown and the stored value is unchanged

#### Scenario: Gateway equivalence
- **WHEN** the shared contract suite runs against `MemoryObjectGateway` and (if credentials exist) `CustomObjectGateway`
- **THEN** every scenario passes on both

### Requirement: Name safety
Container and key names SHALL match `^[A-Za-z0-9_.~-]{1,256}$` before any request; caller-supplied identifiers (session ids, feedback ids, user ids) MUST be validated with `assertSafeId` (`^[A-Za-z0-9_-]{1,100}$`) before being embedded in a container or key name; violations throw `InvalidIdError` (mapped to 404 by controllers). E-mail addresses, free text and state tokens MUST NOT be used verbatim as keys.

#### Scenario: Path-injection attempt
- **WHEN** a session id `../x` or `a b` is passed to `MessageStore.list`
- **THEN** `InvalidIdError` is thrown and no request is made

#### Scenario: PKCE state key
- **WHEN** an auth state `abc+/=` is stored
- **THEN** its key is the lowercase hex SHA-256 of the state (64 characters)

### Requirement: Structured queries only
Queries SHALL be expressed as `{ filters, sort, limit, offset, withTotal }` where filters are one of `valueEquals(path, string|number|boolean)`, `keyIn(keys)` (at most 50), `time(field, op, iso)`. The CustomObject gateway MUST compile `valueEquals`/`keyIn` using input variables (`:v0` with `var.v0=...`), MUST validate `path` against `^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$` and `iso` against an ISO-8601 UTC regex, and MUST allow `sort` only on `createdAt`, `lastModifiedAt`, `key`. `limit` MUST be 1..500; `offset` MUST NOT exceed 10000 (throws `QueryLimitError`). Callers MUST NOT pass predicate strings.

#### Scenario: Value filter with hostile content
- **WHEN** `valueEquals('userId', 'x" or 1=1 or "')` is queried
- **THEN** the request contains that text only as a `var.v0` parameter value and the predicate string is `value(userId = :v0)`

#### Scenario: Unsupported sort
- **WHEN** a query asks to sort by `value.title`
- **THEN** it is rejected before any request

### Requirement: Optimistic-concurrency read-modify-write
The layer SHALL provide `updateWithRetry(gateway, container, key, mutate, { create?, attempts = 5 })`: read the object, apply `mutate(current|null)` to produce the next value (or `SKIP` to abort), write with `ifVersion = current.version`, and on `ConflictError` re-read and re-apply with jittered exponential backoff (base 40 ms, factor 2, jitter +/-50 %); after the last attempt it MUST throw `ConflictError`. Callers MUST NOT use the SDK's concurrent-modification middleware.

#### Scenario: Two concurrent updaters both win
- **WHEN** two `updateWithRetry` calls patch different fields of the same object simultaneously
- **THEN** the final value contains both patches

#### Scenario: Exhausted retries
- **WHEN** the gateway returns a conflict on every attempt
- **THEN** `ConflictError` is thrown after 5 attempts

### Requirement: Transient failure policy
The CustomObject gateway SHALL retry HTTP 502, 503, 504, 429 and network errors up to 3 times with exponential backoff, honouring a `Retry-After` header; a 500 on a write MUST NOT be retried blindly for create-only operations; after retries it throws `UnavailableError` (mapped to HTTP 503). Requests MUST have a 15 s timeout.

#### Scenario: Rate-limited read
- **WHEN** the API answers 503 with `Retry-After: 1` once and then 200
- **THEN** the read succeeds and exactly two requests were made

### Requirement: Bounded concurrency
Bulk operations (batch delete, multi-key reads, feedback chunk writes) SHALL use `mapBounded(items, limit, fn)` with `limit = config.persistence.concurrency` (default 8, max 32) and MUST stop scheduling new work after the first failure.

#### Scenario: Concurrency ceiling
- **WHEN** 100 deletes are issued with limit 8
- **THEN** at no instant are more than 8 requests in flight

### Requirement: Size guards
Every write SHALL measure the serialized value in UTF-8 bytes and throw `TooLargeError` above 6 MiB (hard) and log a warning above 1 MiB (soft); message and feedback layouts MUST keep individual objects far below the platform's 16 MB document limit and 14 MB request-body limit.

#### Scenario: Oversized object
- **WHEN** a value serialises to 7 MiB
- **THEN** `TooLargeError` is thrown and no request is made

### Requirement: Memory gateway fidelity
`MemoryObjectGateway` SHALL emulate version numbers, `createdAt`/`lastModifiedAt` (monotonic, millisecond ISO), conflict on stale version, sorting on the three allowed fields, `limit`/`offset`/`total`, JSON round-tripping (so `undefined` and `null` object members disappear exactly as in the real service), and the three filter kinds. It MUST be refused when `NODE_ENV=production`.

#### Scenario: Null members are dropped
- **WHEN** `{ a: null, b: 1 }` is stored and read back from either gateway
- **THEN** the result is `{ b: 1 }`

### Requirement: Fact probes
The integration suite SHALL contain executable probes for every platform assumption recorded in `design.md` (key charset rejection, `createdAt` stability on update, 409 on stale version, parallel delete single winner, list-after-write visibility, `value(...)` filter with input variables, `keyIn`, ordering by `createdAt`, null-member dropping, 2 MB object write) and fail loudly when a probe disagrees.

#### Scenario: Probes run on request
- **WHEN** `npm run test:integration` runs with scratch-project credentials
- **THEN** each probe passes or names the assumption that is false
