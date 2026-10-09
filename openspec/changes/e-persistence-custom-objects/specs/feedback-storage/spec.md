## ADDED Requirements

### Requirement: Feedback layout
`FeedbackStore.put(record, chunks)` SHALL write the snapshot chunks first and the parent record last. The snapshot chunks go to container `ai-assistant-feedback-snap-<feedbackId>` (key `<index6>-<chunk3>`, value `{ index, chunk, chunks, role?, payload }`), the parent to container `ai-assistant-feedback` (key = feedback id). A parent MUST NOT be discoverable until all chunks are stored. Failed writes MUST leave only orphan chunks, never a parent with holes.

#### Scenario: Parent written last
- **WHEN** the third chunk write fails
- **THEN** no parent record exists and `list` does not return the feedback

#### Scenario: Transcript reassembly
- **WHEN** a feedback with 3 messages (one split into 3 chunks) is read with `get(id)`
- **THEN** the messages are returned in order, byte-identical to the originals

### Requirement: Chunk and size policy
Snapshot payload chunks SHALL be at most `FEEDBACK_CHUNK_BYTES = 524288` (512 KiB) of UTF-8 raw message JSON, cut on character boundaries; payloads MUST be strings (`JSON.stringify(message)`), never structured values; the total snapshot MUST NOT exceed `MAX_SNAPSHOT_BYTES = 25165824` (24 MiB) (callers answer 413 above it). Chunk writes use bounded concurrency; the parent is written only after all chunk promises resolve.

#### Scenario: Chunk bound
- **WHEN** a 1.3 MB message is chunked
- **THEN** it becomes 3 chunks, each at most 524288 bytes, and concatenation restores it

#### Scenario: Multibyte safety
- **WHEN** a message contains emoji at a chunk boundary
- **THEN** every chunk is valid UTF-8 and reassembly equals the original

### Requirement: Listing and filters
`list({ authorUserId?, createdBefore?, createdAfter? }, limit, offset)` SHALL return `{ items, total }` newest-first with only the list projection fields (never `systemPrompt`, `disabledTools` or transcript), using `createdAt` time filters and `valueEquals('userId', ...)`.

#### Scenario: Projection
- **WHEN** a feedback with a 50 KB system prompt is listed
- **THEN** the list item contains no `systemPrompt` field

### Requirement: Delete order
`delete(id)` SHALL delete the parent first, then all chunks in bounded batches until the snapshot container is empty, returning `false` if the parent did not exist; it MUST be re-runnable.

#### Scenario: Parent disappears first
- **WHEN** deletion is interrupted after the parent delete
- **THEN** `get(id)` returns `null` while orphan chunks may remain, and a later `delete(id)` removes them

### Requirement: Identity of the submitter
The record SHALL store `userId` (verified) and an optional display-only `userLabel`; authorisation and filtering MUST use `userId` only.

#### Scenario: Label is not trusted
- **WHEN** two feedbacks claim the same `userLabel` but have different `userId`
- **THEN** filtering by `authorUserId` separates them
