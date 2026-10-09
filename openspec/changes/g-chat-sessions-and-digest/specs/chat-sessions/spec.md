## ADDED Requirements

### Requirement: Session creation
`POST /service/session` SHALL create a session owned by `req.user.userId` with a server-generated UUID v4 id, `title` defaulting to `New chat`, `metadata` defaulting to `{}`, `featureFlags` defaulting to `null`, `createdAt = updatedAt = Date.now()`, and persist it through `SessionStore`. The response MUST NOT contain any `projectKey` or tenant field.

#### Scenario: Create with defaults
- **WHEN** a member posts `{}` to `/service/session`
- **THEN** the status is 201 and `data.title === 'New chat'`, `data.id` is a UUID, `data.userId` equals the verified user id

#### Scenario: Display label is sanitised and never an identity
- **WHEN** a member posts `{ "userLabel": "  <b>Ann</b>\u0007 Admin  " }`
- **THEN** the stored optional `userLabel` is the sanitised text (trimmed, control characters and angle brackets removed, whitespace collapsed, at most 120 characters; an empty result stores no label), `userId` is still the verified user id, and the label is never used for authorisation, ownership, keys, filters or joins

#### Scenario: Create bound to a custom view
- **WHEN** a member posts `{ "featureFlags": { "customView": "L3Byb2R1Y3Rz" } }`
- **THEN** the stored session has `featureFlags.customView === 'L3Byb2R1Y3Rz'`

### Requirement: Ownership and isolation
Every session route with a `:sessionId` SHALL load the session once and answer 404 `Session not found` when the session does not exist OR its `userId` differs from `req.user.userId`. Ownership is by the verified `userId` only (no e-mail is stored on or compared with a session). Two users of the same project MUST NOT be able to read, update, delete, list or stream each other's sessions.

#### Scenario: Other user's session
- **WHEN** user B calls `GET /service/session/<id of user A's session>`
- **THEN** the status is 404

#### Scenario: Forged label or e-mail does not change ownership
- **WHEN** user B calls `GET /service/session/<id of user A's session>` or `GET /service/session/all?userEmail=<A's address>` with `x-admin-email`, `userEmail` or `userLabel` naming user A
- **THEN** the status is 404 (respectively only B's sessions are returned); ownership is decided by the verified `userId` only

#### Scenario: Session list only shows own sessions
- **WHEN** users A and B each own two sessions and A calls `GET /service/session/all`
- **THEN** exactly A's two sessions are returned

### Requirement: Session listing
`GET /service/session/all` SHALL return `SessionListItem[]` (`id, title, description?, icon?, createdAt, updatedAt, featureFlags?`) sorted by `updatedAt` descending, bounded by `?limit=` when it is a positive integer, scoped by feature flags (below). A session without `digestUpdatedAt` MUST fall back to a title derived from its first stored user text (first 50 characters, ellipsis when longer) and a session with a digest MUST NOT trigger any message read.

#### Scenario: Digested sessions cause no message reads
- **WHEN** the list is requested for 30 sessions that all have `digestUpdatedAt`
- **THEN** `MessageStore.list` is called zero times

#### Scenario: Undigested session falls back
- **WHEN** one session has no digest and its first user message is 80 characters
- **THEN** its list `title` is the first 50 characters followed by `...`

#### Scenario: Limit
- **WHEN** `?limit=4` is passed and the user has 9 sessions
- **THEN** four items are returned, the four most recently updated

### Requirement: Feature-flag scoping
Any query parameter other than `limit`, `offset`, `since`, `locale` and the legacy identity keys (`userEmail`, `projectKey`, `userId`, as defined by change D) SHALL be parsed as a feature flag (`'true'`/`'false'` become booleans, other values are URL-decoded strings). A request with flags sees only sessions whose `featureFlags` equal every requested flag; a request without flags sees only sessions with no flags. `GET /service/session` MUST return the most recently updated matching session or 404.

#### Scenario: Custom view isolation
- **WHEN** user A has one plain session and one session with `customView=X`, and calls `GET /service/session/all?customView=X`
- **THEN** only the `customView=X` session is returned

#### Scenario: Plain request hides flagged sessions
- **WHEN** the same user calls `GET /service/session/all` with no flags
- **THEN** only the plain session is returned

#### Scenario: Messages of a mismatching session
- **WHEN** `GET /session/:id/messages?customView=X` targets a session whose flags do not match
- **THEN** the messages of the user's last session matching `customView=X` are returned (legacy behaviour kept), or 404 if there is none

### Requirement: Update and delete
`PUT /service/session/:sessionId` SHALL accept only `title` and `metadata` (all other body keys ignored) and refresh `updatedAt`. `DELETE` SHALL remove all messages of the session, run every registered session-cleanup hook (used by change L to drop BigQuery temp tables; failures are logged and do not fail the request), then delete the session; it MUST be idempotent for a second call (404).

#### Scenario: Update ignores protected fields
- **WHEN** the body is `{ "title": "T", "userId": "evil", "disabledTools": {} }`
- **THEN** only `title` changes and `userId` is unchanged

#### Scenario: Delete runs cleanup hooks
- **WHEN** a hook is registered and the session is deleted
- **THEN** the hook is called with the session before the session record is removed, and its failure still yields 200

### Requirement: Messages
`GET /service/session/:sessionId/messages` SHALL return stored `AiSdkChatMessage[]` oldest first, honouring `limit` and `offset`. `MessageService.appendMissing(sessionId, messages)` SHALL persist only messages whose id is not yet stored (idempotent) and bump the session `updatedAt`. History for the model is read by H through `MessageService.lastN(sessionId, n)` returning the newest `n` messages in chronological order.

#### Scenario: Append is idempotent
- **WHEN** `appendMissing` is called twice with the same message ids
- **THEN** the second call stores nothing and returns an empty array

#### Scenario: Last N
- **WHEN** 45 messages are stored and `lastN(sessionId, 20)` is called
- **THEN** the 20 newest are returned, oldest of them first

### Requirement: Temporary table bookkeeping
`SessionService` SHALL expose `addTemporaryTable`, `getAllTemporaryTables`, `getTemporaryTableMessages` and `registerSessionCleanupHook` with the same semantics as the legacy chat service (de-duplicate by `tableRef`; message text includes `columns:` when `columnNames` is set).

#### Scenario: Duplicate table ref
- **WHEN** the same `tableRef` is added twice
- **THEN** the session holds one entry

### Requirement: Concurrent writers do not lose data
Session updates from independent writers (digest, tools PUT, title PUT, temporary tables) SHALL be applied as merge patches through `SessionStore.update`, which retries on version conflicts, so that a digest write racing a tools write keeps both changes.

#### Scenario: Digest races tools update
- **WHEN** `applySessionDigest` and `PUT /tools` run concurrently against the in-memory store with forced version conflicts
- **THEN** the final session has both the new digest fields and the new `disabledTools`
