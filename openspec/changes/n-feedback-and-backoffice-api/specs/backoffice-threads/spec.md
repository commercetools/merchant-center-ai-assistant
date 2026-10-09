## ADDED Requirements

### Requirement: is-admin
`GET /service/backoffice/is-admin` SHALL be available to any verified member and return `{ isAdmin: boolean }` equal to `req.user.isAdmin`, the service-computed `ADMIN_USER_IDS` check of change D (the same value as the bootstrap `isAdmin`). It MUST NOT read `userEmail`, `x-admin-email`, `userLabel` or any query parameter.

#### Scenario: Non-admin
- **WHEN** a non-admin member (user id not in `ADMIN_USER_IDS`) calls it
- **THEN** `data.isAdmin` is false

#### Scenario: Forged e-mail does not grant admin
- **WHEN** the same member calls it with `?userEmail=<admin address>` and `x-admin-email: <admin address>`
- **THEN** `data.isAdmin` is still false

### Requirement: Thread listing across users of the project
`POST /service/backoffice/threads` SHALL require admin and list sessions of ALL users of the single project, newest `updatedAt` first, with `limit` (1-25, default 10), `offset` (0-10000, default 0) in the query and optional body filters `{ userId?, createdAtBefore?, createdAtAfter? }` applied to the session's owner and creation time. There MUST be no `projectKey` filter and no cross-project access. Listing and filtering are by `userId` only; `userLabel` is the session's optional sanitised display text, unverified, returned for display, and MUST NOT be filterable, joinable or used for any decision (the UI renders it as text only, tagged "(unverified)"). Each thread is `{ sessionId, userId, userLabel?, title?, createdAt, updatedAt, messages, truncated }` where `messages` are the stored messages oldest first (at most 2000; `truncated: true` when more exist); `?messages=false` returns `messages: []` and skips message reads. Response carries `pagination: { limit, offset, total }` with `total` capped at 10000.

#### Scenario: Cross-user listing
- **WHEN** users A and B each own a session and an admin lists threads
- **THEN** both threads are returned

#### Scenario: Date filter is applied
- **WHEN** `createdAtBefore` excludes one of three sessions
- **THEN** two threads are returned (legacy declared this filter but never applied it)

#### Scenario: Messages skipped
- **WHEN** `?messages=false`
- **THEN** no `MessageStore.list` call is made and each thread has `messages: []`

#### Scenario: Limit clamp
- **WHEN** `limit=100`
- **THEN** `pagination.limit` is 25

#### Scenario: Non-admin
- **WHEN** a non-admin member lists threads
- **THEN** the status is 403 `ADMIN_REQUIRED` and no store read occurs

#### Scenario: Forged label does not change listing or admin status
- **WHEN** a non-admin sends `POST /service/backoffice/threads` with `userLabel`, `userEmail` or `x-admin-email` set to an admin address, or an admin lists with body `filters: { userLabel: "x" }`
- **THEN** the non-admin gets 403 `ADMIN_REQUIRED`, and for the admin the unknown `userLabel` filter is ignored (threads are filtered by `userId` only)

### Requirement: Thread detail
`GET /service/backoffice/threads/:sessionId` SHALL require admin and return the thread with all stored messages (same cap), or 404 `Thread not found`.

#### Scenario: Unknown thread
- **WHEN** the id does not exist
- **THEN** the status is 404

### Requirement: Audit log
Every thread list and detail response SHALL emit an `audit.admin_action` log line (`action: 'backoffice.threads.listed'` with filters and count, `action: 'backoffice.thread.read'` with `sessionId` and `sessionUserId`, plus route and outcome) naming the acting admin by `userId` only; no e-mail, no `userLabel` and no message content MUST be logged.

#### Scenario: Detail read
- **WHEN** an admin opens a thread of another user
- **THEN** an `audit.admin_action` line with `action: 'backoffice.thread.read'` exists
