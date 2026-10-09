## ADDED Requirements

### Requirement: Limits derived from the platform
`service/src/utils/feedback-snapshot.ts` SHALL export these constants: `MAX_CHUNK_BYTES = 196608` (192 KiB of raw UTF-8 JSON per chunk), `MAX_SNAPSHOT_BYTES = 8388608` (8 MiB), `FEEDBACK_BODY_LIMIT = '10mb'`, `MAX_COMMENT_LENGTH = 5000`, `MAX_SYSTEM_PROMPT_BYTES = 100000`, `MAX_INLINE_DATA_URL_BYTES = 2048`. A unit test MUST assert that `MAX_CHUNK_BYTES * 6 < 2 * 1024 * 1024` (worst-case JSON-escape inflation of a chunk stored as a string stays below the 2 MB per-document guidance of https://docs.commercetools.com/api/limits.md) and that `MAX_SNAPSHOT_BYTES < 14 * 1024 * 1024` (request body ceiling).

#### Scenario: Constants are consistent
- **WHEN** the constants test runs
- **THEN** both inequalities hold and `ceil(MAX_SNAPSHOT_BYTES / MAX_CHUNK_BYTES) <= 43`

### Requirement: Whole-transcript serialisation and UTF-8-safe chunking
`buildSnapshot(messages)` SHALL serialise the (data-URL-stripped) transcript as one JSON array string, compute `snapshotBytes` as its UTF-8 byte length and a `sha256` hex digest, and split it into chunks of at most `MAX_CHUNK_BYTES` bytes on UTF-8 character boundaries (never inside a multi-byte character). An empty transcript yields one chunk containing `[]`. Chunk ordinals are zero-based and the chunk key is `<feedbackId>-<ordinal padded to 3 digits>`.

#### Scenario: Multi-byte boundary
- **WHEN** the serialised transcript has a 4-byte emoji straddling the 192 KiB boundary
- **THEN** the emoji is wholly inside one chunk and `reassemble` returns the original messages

#### Scenario: Round trip
- **WHEN** a 3 MiB transcript is chunked and reassembled
- **THEN** the result deep-equals the input and the digest matches

#### Scenario: Chunk count
- **WHEN** the serialised transcript is 400 000 bytes
- **THEN** there are exactly 3 chunks, each at most 196 608 bytes

### Requirement: Inline data URL stripping
`stripInlineDataUrls(messages)` SHALL deep-copy the transcript and replace every string value starting with `data:` and longer than `MAX_INLINE_DATA_URL_BYTES` bytes by `[omitted: inline data URL, <n> bytes]`, recording `{ messageIndex, messageId?, path, reason: 'inline-data-url', originalBytes }`. Keys named `__proto__` MUST survive.

#### Scenario: Stored image paths are kept
- **WHEN** a file part carries the service-relative url `/files/<sessionId>/<file>.png`
- **THEN** it is stored unchanged (it is not a `data:` URL, is a few dozen bytes and stays valid while the session exists)

#### Scenario: Large data URL
- **WHEN** a file part carries a 5 MB `data:image/png;base64,...` url
- **THEN** the stored url is the placeholder and one truncation is recorded with the original size

### Requirement: Integrity-checked reassembly
`reassemble({ chunks, expectedChunkCount, sha256 })` SHALL concatenate payloads in ordinal order, verify the digest, `JSON.parse` the result and return `{ messages, intact }`. A missing chunk, digest mismatch or parse failure MUST return `intact: false` and a single placeholder system message `[unreadable snapshot: <reason>]` instead of throwing.

#### Scenario: Missing chunk
- **WHEN** chunk 1 of 3 is absent
- **THEN** `intact` is false and the messages contain the placeholder

### Requirement: Byte-safe truncation helper
`truncateToBytes(value, maxBytes)` SHALL cut at a UTF-8 character boundary; `byteLength` MUST use `Buffer.byteLength(value, 'utf8')`.

#### Scenario: Multi-byte cut
- **WHEN** a string of 3-byte characters is truncated to 10 bytes
- **THEN** the result is 9 bytes (3 characters)
