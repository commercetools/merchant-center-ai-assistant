## ADDED Requirements

### Requirement: Session records
`SessionStore` SHALL persist one object per session in container `ai-assistant-sessions` with key = session id and a value containing at least `{ id, userId, createdAt, updatedAt }` plus the optional digest fields, `featureFlags`, `disabledTools`, `temporaryTables`, `metadata`, `userLabel`, `schemaVersion`. `create` MUST fail with `ConflictError` if the session exists. `update(id, mutate)` MUST use the optimistic-concurrency helper and throw `NotFoundError` if absent. `touch(id)` MUST update `updatedAt` best-effort (failures logged, never thrown).

#### Scenario: Concurrent digest and touch
- **WHEN** a digest update and a `touch` run simultaneously on one session
- **THEN** the final record has the new digest fields and a refreshed `updatedAt`

#### Scenario: Create twice
- **WHEN** `create` is called twice with the same id
- **THEN** the second call throws `ConflictError`

### Requirement: Per-user listing
`listByUser(userId, { limit })` SHALL return the user's sessions newest-first using `valueEquals('userId', userId)` sorted by `lastModifiedAt desc`, capped at 500 per call, and SHALL apply feature-flag matching (absent flags vs a given flag) in memory after reading, never with negation predicates. The user id MUST be the verified Identity user id; e-mail is never a key or filter.

#### Scenario: Isolation
- **WHEN** users A and B each own sessions
- **THEN** `listByUser(A)` returns only A's sessions

#### Scenario: Flag filter
- **WHEN** one session has `featureFlags.customView='x'` and one has none
- **THEN** a query without flags returns only the flag-free session and a query with `customView='x'` returns only the other

### Requirement: Admin listing
`listAll({ limit, offset, userId?, createdBefore?, createdAfter? })` SHALL return `{ items, total }` newest-first for backoffice use, supporting time-range filters via `time` filters and bounded to `offset + limit <= 10000`.

#### Scenario: Time-range
- **WHEN** `createdAfter` is set to the creation time of session 2 of 3
- **THEN** only sessions created after it are returned

### Requirement: Messages layout
`MessageStore` SHALL store each message as one object in container `ai-assistant-messages-<sessionId>` with key = message id (validated) and value `{ v: 1, id, role, timestamp, partsJson }` where `partsJson` is `JSON.stringify(parts)`; `parts` MUST be reconstructed with `JSON.parse` on read so that nested `null` members survive. Writes within one call MUST be sequential in array order and `timestamp` MUST be strictly increasing within a session. Messages MUST be read in creation order (`sort createdAt asc`, tie-break by `timestamp`).

#### Scenario: Round-trip with nulls
- **WHEN** a message part contains `{ "output": null }`
- **THEN** reading it back yields `{ "output": null }`

#### Scenario: Order preserved for a batch
- **WHEN** three messages are appended in one call
- **THEN** `list` returns them in the same order

#### Scenario: Upsert by id
- **WHEN** a message with an existing id is put again with different parts
- **THEN** the stored message is replaced, the count does not change, and its position in the list does not change

### Requirement: Message reads
`list(sessionId, { limit, order })` SHALL support the newest-N case (`createdAt desc`, then reversed to chronological) and full reads by offset pagination in pages of 500 up to the 10 000 message ceiling (`SessionTooLongError` beyond); `count` MUST use `limit=1, withTotal=true`; `has(sessionId, ids)` MUST use `keyIn` in chunks of at most 50 ids.

#### Scenario: Last N
- **WHEN** a session has 30 messages and `list(id, { limit: 20, order: 'desc' })` is called
- **THEN** the 20 newest are returned in chronological order

#### Scenario: Large read
- **WHEN** a session has 1 200 messages and `list(id)` is called
- **THEN** all 1 200 are returned in order using three requests

### Requirement: Cascade delete
`deleteSessionCascade(persistence, sessionId)` SHALL delete all messages of the session first (list page of keys then bounded-concurrency deletes, repeated until the container is empty) and the session object last, and MUST be safely re-runnable after a partial failure.

#### Scenario: Delete session
- **WHEN** a session with 50 messages is deleted
- **THEN** `get` returns `null`, `count` returns 0, and at most `concurrency` deletes were in flight

#### Scenario: Retry after failure
- **WHEN** the first run fails after deleting 20 messages
- **THEN** a second run completes and reports success

### Requirement: Document ordering guarantee is tested
The integration suite SHALL contain a probe that appends 50 messages sequentially and asserts the server `createdAt` order equals the append order.

#### Scenario: Probe
- **WHEN** the probe runs against a scratch project
- **THEN** order matches or the probe fails naming the ordering assumption
