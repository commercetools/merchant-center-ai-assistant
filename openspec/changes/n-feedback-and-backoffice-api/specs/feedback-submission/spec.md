## ADDED Requirements

### Requirement: Submit endpoint
`POST /service/feedback/submit` SHALL accept `{ sessionId: string, comment?: string, messages?: AiSdkChatMessage[], userLabel?: string }` from any verified member, answer 201 `{ success: true, data: { id, createdAt, messageCount, snapshotSource, truncated, snapshotBytes } }` and MUST NOT echo the snapshot. `projectKey` and the submitter are taken only from the verified user; the body cannot set them. `userLabel` is the only user-describing body field the service reads and it is display-only (see "Display label is unverified").

#### Scenario: Submit with client transcript
- **WHEN** the owner posts a comment and 12 messages for their own session
- **THEN** the status is 201, `snapshotSource` is `client`, `messageCount` is 12

#### Scenario: Empty comment is valid
- **WHEN** `comment` is absent
- **THEN** the stored comment is `''` and the status is 201

#### Scenario: Missing session id
- **WHEN** `sessionId` is missing or blank
- **THEN** the status is 400 with `error: 'sessionId is required and must be a non-empty string'`

### Requirement: Display label is unverified
The optional body field `userLabel` SHALL be sanitised before storage: trimmed, control characters and angle brackets (`<`, `>`) removed, whitespace collapsed, cut to 120 characters, and dropped (not stored) when empty or not a string. It MUST be read from the request body only (never from a query parameter, header or `userEmail`) and stored as the record's `userLabel`. It MUST NOT be used for authorisation, ownership, record keys, filters or joins; the verified identity of the submitter is always `userId`. Clients MUST render it as text only and label it unverified.

#### Scenario: Label is sanitised
- **WHEN** the body carries `userLabel: "  <img src=x onerror=1> Bob\u0000  "`
- **THEN** the stored `userLabel` contains no angle brackets or control characters, is trimmed and at most 120 characters, and the record's `userId` is the verified user id

#### Scenario: Forged label does not change identity or admin status
- **WHEN** non-admin user B submits for B's own session with `userLabel` set to an administrator's user id or e-mail address and the headers `x-admin-email` and the query `userEmail` set to the same address
- **THEN** the status is 201, `userId` is B's id, `userLabel` is stored only as unverified text, B is still not an admin (a following `GET /service/feedback/fetch` answers 403 `ADMIN_REQUIRED`) and no ownership check changed

### Requirement: Ownership with admin bypass
The submitter SHALL be the session owner (`session.userId === req.user.userId`) or an admin (`req.user.isAdmin`, the service-computed `ADMIN_USER_IDS` check of change D). A non-owner non-admin and an unknown session both receive 404 `Session not found`.

#### Scenario: Foreign session
- **WHEN** user B submits feedback for user A's session
- **THEN** the status is 404 and nothing is written

#### Scenario: Non-admin cannot borrow admin status
- **WHEN** user B (user id not in `ADMIN_USER_IDS`) submits for user A's session with a forged `x-admin-email`, `userEmail` or `userLabel` naming an admin
- **THEN** the status is 404 and nothing is written

#### Scenario: Admin files on another user's session
- **WHEN** an admin submits for user A's session
- **THEN** the status is 201 and the record's `sessionUserId` is A's id while `userId` is the admin's

### Requirement: Snapshot source is fall-back, never merge
When `messages` is a non-empty array the snapshot SHALL be exactly that array (`snapshotSource: 'client'`); otherwise it SHALL be the stored messages of the session (`'server'`). The two MUST never be merged. The record stores `clientMessageCount` and `storedMessageCount`; a stored count greater than the client count is logged as a warning and never topped up.

#### Scenario: Server fallback
- **WHEN** `messages` is `[]`
- **THEN** `snapshotSource` is `server` and the transcript equals the stored messages

#### Scenario: Short client array
- **WHEN** the client sends 3 messages and 10 are stored
- **THEN** the record has `clientMessageCount: 3`, `storedMessageCount: 10`, a warning is logged and the snapshot has 3 messages

### Requirement: Field caps and truncation records
The comment SHALL be trimmed and cut to 5000 characters; the stored copy of the project system prompt SHALL be cut to 100 000 bytes; every cut and every stripped data URL MUST be recorded as a `FeedbackTruncation` (`reason` one of `inline-data-url`, `comment`, `system-prompt`, `snapshot-tail`) and `truncated` MUST equal `truncations.length > 0`.

#### Scenario: Long comment
- **WHEN** the comment has 6000 characters
- **THEN** 5000 are stored and a `comment` truncation with `originalBytes` is recorded

### Requirement: 413 policy
(1) A request body larger than `FEEDBACK_BODY_LIMIT` (10 MiB, constant) SHALL be rejected by the body parser with status 413 and the standard envelope (`error: 'entity.too.large'`). (2) A client-sourced snapshot whose `snapshotBytes` exceeds `MAX_SNAPSHOT_BYTES` after data-URL stripping SHALL be rejected with 413 `{ success: false, error: 'Feedback snapshot is too large', message: 'Snapshot is N bytes, the limit is M bytes. Submit without the transcript to store the saved conversation instead.' }` and nothing is written. (3) A server-sourced snapshot over the cap SHALL keep the newest messages whose serialised size fits, record a `snapshot-tail` truncation, and succeed. The caps (10 MiB request, 8 MiB snapshot) are unchanged by the "kept forever" decision (no retention or cleanup job exists for feedback or its chunks).

#### Scenario: Body too large
- **WHEN** a 12 MiB JSON body is posted by an authenticated user
- **THEN** the status is 413 and no store call happens

#### Scenario: Client snapshot over cap
- **WHEN** the stripped client transcript is 9 MiB
- **THEN** the status is 413 with the retry hint and `FeedbackStore.create` is not called

#### Scenario: Huge stored session
- **WHEN** no messages are sent and the stored transcript is 20 MiB
- **THEN** the status is 201, `truncated` is true and a `snapshot-tail` truncation exists

### Requirement: Raised body limit registered after authentication
The route-level JSON parser with the 10 MiB limit SHALL be registered on the Express `app` for the full path `/service/feedback/submit`, after `verifyMcSession` and before the global JSON parser. Requests without a valid session MUST be rejected 401 before any body is read. All other routes keep the global limit.

#### Scenario: Anonymous large body
- **WHEN** an unauthenticated client posts 9 MiB to the submit path
- **THEN** the status is 401 and the body parser never ran (spy)

#### Scenario: Other routes unaffected
- **WHEN** a 200 KB JSON body is posted to `/service/session`
- **THEN** the status is 413 from the global limit

### Requirement: Write ordering and cleanup
`FeedbackStore.create` SHALL write all chunk objects first (bounded concurrency 4) and the parent record last, so no half-written feedback is discoverable. When a chunk write fails the service MUST delete the chunks already written (best effort), answer 500 `Failed to submit feedback`, and not write the parent.

#### Scenario: Chunk failure
- **WHEN** the third chunk write rejects
- **THEN** chunks 0-1 are deleted, the parent is not written and the status is 500

### Requirement: Audit log on submit
Every successful submission SHALL emit one structured log line `audit.feedback_submitted` with fields `{ userId, feedbackId, sessionId, sessionUserId, messageCount, chunkCount, snapshotBytes, snapshotSource }` (and, when the submitter is acting as an admin on another user's session, an additional `audit.admin_action` line with `action: 'feedback.submit-on-behalf'`). Log lines MUST carry user ids only: never an e-mail, never `userLabel`, never the comment or message content.

#### Scenario: Audit content
- **WHEN** a submission succeeds
- **THEN** the log entry exists, names the user by `userId` only and contains no comment text, no e-mail and no `userLabel`
