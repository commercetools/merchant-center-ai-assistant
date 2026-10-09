## ADDED Requirements

### Requirement: Digest generation
`generateSessionDigest({ messages, locale, model?, timeoutMs? })` SHALL summarise the last 20 messages (tool messages excluded, empty turns filtered) as ONE user message holding a labelled transcript using `getModel('lite')`, with `AbortSignal.timeout(20000)`, and return `{ title, description, icon, summary, nextPrompts }` or `null` when there is nothing to summarise or the model fails. It MUST NOT throw.

#### Scenario: Nothing to summarise
- **WHEN** the history has no text parts
- **THEN** the function returns `null` and the model is not called

#### Scenario: Model failure
- **WHEN** the model throws or answers unparseable output
- **THEN** the function returns `null`

#### Scenario: Never ends with a model turn
- **WHEN** the history ends with an assistant reply
- **THEN** the single message sent to the model has role `user`

### Requirement: Output clamping
Digest output SHALL be normalised before storage: title <= 60, description <= 140, summary <= 400 characters, each `nextPrompts[].text` <= 40 and `.prompt` <= 200 characters, at most 3 follow-ups, incomplete follow-ups dropped, icon outside `DIGEST_ICON_NAMES` replaced by `auto_awesome`. Clamping MUST cut on a word boundary when one exists after 60% of the limit and end with an ellipsis.

#### Scenario: Over-long title
- **WHEN** the model returns a 90-character title
- **THEN** the stored title is at most 60 characters, ends with the ellipsis, and the rest of the digest is kept

#### Scenario: Unknown icon
- **WHEN** the model returns `rocket_launch`
- **THEN** the icon is `auto_awesome`

### Requirement: Only answered turns are digested
`runTurnDigest` SHALL skip the digest when no assistant message in the finished turn has a non-blank text part.

#### Scenario: Errored turn
- **WHEN** the turn contains a user message and an assistant message with only a tool part
- **THEN** no model call is made and the session title is unchanged

### Requirement: Digest is never awaited by the stream
`runTurnDigest` SHALL return `void` synchronously, start the work in a detached promise whose rejection is caught and logged, and MUST NOT be awaited by the chat stream or its `onFinish`. A failed digest leaves the session as it was.

#### Scenario: Slow model does not delay onFinish
- **WHEN** the digest model takes 5 s and `onFinish` calls `runTurnDigest`
- **THEN** `onFinish` returns in under 50 ms

#### Scenario: Failure is swallowed
- **WHEN** applying the digest rejects
- **THEN** no unhandled rejection occurs and an error is logged

### Requirement: Digest polling endpoint
`GET /service/session/:sessionId/digest?since=<ms>` SHALL be read-only and answer `{ pending: true }` when the session has no `digestUpdatedAt` or it is `<= since`, otherwise `{ pending: false, digestUpdatedAt, title, description, icon, nextPrompts }` (`nextPrompts` defaults to `[]`). It MUST NOT call a model.

#### Scenario: Stale digest
- **WHEN** `digestUpdatedAt` is 1000 and `since=1000`
- **THEN** the answer is `{ pending: true }`

#### Scenario: Fresh digest
- **WHEN** `digestUpdatedAt` is 2000 and `since=1000`
- **THEN** the answer has `pending: false` and the stored title

#### Scenario: Chrome
- **WHEN** a user finishes a turn in the chat app (E2E-G-03)
- **THEN** within 30 s the drawer title changes from `New chat` to a generated title and follow-up chips appear
