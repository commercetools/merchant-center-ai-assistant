## ADDED Requirements

### Requirement: Admin only
`GET /service/feedback/fetch` and `GET /service/feedback/fetch/:feedbackId` SHALL require `requireAdmin` (admin = the caller's verified user id is in `ADMIN_USER_IDS`, change D); non-admins receive 403 `{ code: 'ADMIN_REQUIRED' }` and no store read occurs. The decision MUST NOT depend on any query parameter, header or body field (`userEmail`, `x-admin-email`, `userLabel`).

#### Scenario: Non-admin
- **WHEN** a non-admin (user id not in `ADMIN_USER_IDS`, or the list is empty) calls the list or the detail
- **THEN** the status is 403 with `code: 'ADMIN_REQUIRED'` and the store is not read

#### Scenario: Forged e-mail does not grant admin
- **WHEN** a non-admin calls the list with `?userEmail=<admin address>` and the header `x-admin-email: <admin address>`
- **THEN** the status is still 403 `ADMIN_REQUIRED`

### Requirement: Paged list
The list SHALL return `FeedbackListItem[]` newest first with top-level `pagination: { limit, offset, total }`. `limit` defaults to 20 and is clamped to 1-100; `offset` defaults to 0 and is clamped to 0-10000 (platform maximum offset); filters `authorUserId` (exact), `createdAtBefore`, `createdAtAfter` (epoch ms). Items carry `userId` and the optional sanitised, unverified `userLabel` (display only; the `authorUserId` filter matches `userId` exactly and never the label). The projection MUST exclude `systemPrompt`, `disabledTools`, `temporaryTables` and any messages; `comment` is included. `total` MUST be reported as the number of matches up to 10000.

#### Scenario: Clamp
- **WHEN** `limit=500&offset=-5`
- **THEN** `pagination.limit` is 100 and `pagination.offset` is 0

#### Scenario: Filter by author
- **WHEN** `authorUserId=u1` is passed
- **THEN** only feedback submitted by `u1` is returned

#### Scenario: Date window
- **WHEN** `createdAtAfter` and `createdAtBefore` bound two records of five
- **THEN** exactly those two are returned

#### Scenario: No transcript in the list
- **WHEN** any list is fetched
- **THEN** no item has a `messages` key

### Requirement: Detail with reassembled transcript
The detail endpoint SHALL return the full record plus `messages` reassembled by `snapshot-chunking` (reading chunk objects by their deterministic keys with concurrency 4) and `snapshotIntact: boolean`; unknown id -> 404 `Feedback not found`.

#### Scenario: Intact snapshot
- **WHEN** a feedback with 3 chunks is fetched
- **THEN** `messages` equals the submitted transcript and `snapshotIntact` is true

#### Scenario: Corrupt snapshot
- **WHEN** one chunk is missing
- **THEN** the status is 200, `snapshotIntact` is false and `messages` holds the placeholder

### Requirement: Audit log on read
Every successful detail read SHALL emit one `audit.admin_action` log line `{ userId, action: 'feedback.read', route, outcome, feedbackId, sessionId, sessionUserId, messageCount }`; list reads emit `audit.admin_action` with `action: 'feedback.listed'`, the filters used (user ids and dates only) and the count returned. Lines MUST carry `userId` only: never an e-mail, never `userLabel`, never transcript content. Denied attempts (403) emit `outcome: 'denied'`.

#### Scenario: Read is audited
- **WHEN** an admin opens a feedback detail
- **THEN** one `audit.admin_action` line with `action: 'feedback.read'` exists, naming the admin by `userId` and containing no e-mail
