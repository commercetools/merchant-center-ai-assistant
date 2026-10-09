## ADDED Requirements

### Requirement: Endpoint and wire format
`POST /service/ai-chat/:sessionId/message/stream` SHALL be reachable by the session owner only (404 otherwise, see change G), accept `{ id: string, message: UIMessage }`, and respond `200 text/event-stream` with the AI SDK UI message stream (header `x-vercel-ai-ui-message-stream: v1`, terminated by `data: [DONE]`) plus `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`. It MUST NOT set `Access-Control-Allow-*` headers. Every chunk type emitted MUST be in the client-accepted set (`start, start-step, text-*, reasoning-*, tool-input-*, tool-output-*, file, source-*, finish-step, finish, abort, error, message-metadata`, any `data-*`); `custom`, `reasoning-file`, `reset-step`, `tool-approval-response` MUST NOT be emitted.

#### Scenario: Happy path
- **WHEN** the owner posts a valid message and the model answers `hi`
- **THEN** the body contains `text-delta` chunks, ends with `data: [DONE]` and the header `x-vercel-ai-ui-message-stream` is `v1`

#### Scenario: Unknown chunk types are filtered
- **WHEN** the wire test serves a stream containing a chunk type outside the accepted set
- **THEN** the test fails

### Requirement: Request validation before streaming
The endpoint SHALL answer JSON `400` (envelope) when `message` is missing (distinguishing "body was not parsed as JSON" from "body lacks message" in the error text) and when `message.role === 'system'`. Validation MUST happen before any header is flushed and before the user message is stored.

#### Scenario: Missing message
- **WHEN** the body is `{}` with `content-type: application/json`
- **THEN** status 400 and the error text lists the received keys

#### Scenario: Unparsed body
- **WHEN** the content type is `text/plain`
- **THEN** status 400 and the error mentions `Content-Type: application/json`

#### Scenario: System role
- **WHEN** `message.role` is `system`
- **THEN** status 400 and nothing is persisted

### Requirement: History window
The model input SHALL be the newest 20 stored messages (`MessageService.lastN(sessionId, 20)`) in chronological order, plus the incoming message when its id is not already the last stored id (race guard), with every `system`-role message removed and file/annotation parts converted (`convertToModelMessages` with `convertDataPart: convertAnnotationDataPart`). The window size is the constant `CHAT_HISTORY_MESSAGES = 20`.

#### Scenario: Window
- **WHEN** 45 messages are stored
- **THEN** the model receives exactly the newest 20 stored messages plus the new one

#### Scenario: Race guard
- **WHEN** the user message is not yet committed when history is read
- **THEN** it is appended exactly once to the model input

#### Scenario: Legacy system message
- **WHEN** a stored message has role `system`
- **THEN** it is dropped with a warning and the call does not throw `InvalidPromptError`

### Requirement: Annotation data part
A `data-ct-annotations` part SHALL be preserved by the storage filter unchanged and converted by `convertAnnotationDataPart` into a text section (annotations JSON in a fenced block plus component sources) for the model; a malformed payload MUST be ignored without failing the turn.

#### Scenario: Converted for the model
- **WHEN** a user message carries a valid annotations part
- **THEN** the model messages contain a text part starting `## Annotations on the preview of`

#### Scenario: Malformed part
- **WHEN** `data.annotations` is not an array
- **THEN** the part is ignored

### Requirement: Storage filter
On `onFinish` the stored messages SHALL contain only: non-empty text parts; `file` parts with non-`data:` URLs (including service-relative `/files/...` image paths); annotation parts; terminal (`output-available`) parts of the storable tools `visualize_data`, `export_data`, `create_composed_page`; terminal parts of subagent tools with nested parts reduced to text, non-`data:` URL files (web URLs or service-relative `/files/...` paths) and storable tools; plus usage metadata. Messages left with zero parts MUST be dropped. Only message ids not stored yet are appended.

#### Scenario: Base64 image
- **WHEN** an assistant message holds a `file` part with a `data:` URL
- **THEN** it is not stored

#### Scenario: Idempotent finish
- **WHEN** `onFinish` provides the whole conversation (history + new)
- **THEN** only the new message ids are written

### Requirement: Completion hand-off
`onFinish` SHALL (1) persist filtered messages without awaiting the digest, (2) call `runTurnDigest` (change G) which is never awaited, and (3) not throw. Persistence failures are logged and MUST NOT affect the already-sent response.

#### Scenario: Digest not awaited
- **WHEN** persistence resolves immediately and the digest takes 5 s
- **THEN** `onFinish` completes in under 100 ms

### Requirement: Error reporting
Failures before headers are sent SHALL answer a JSON envelope; failures after streaming started SHALL write `data: {"type":"error","errorText":"<message>"}` followed by `data: [DONE]` and end the response. Every `toUIMessageStream` call MUST pass an explicit `onError` that logs provider details (`statusCode`, `responseBody` truncated to 2000 characters, `cause`) and returns the readable message; unserialisable tool schemas MUST be attributed by name in the log.

#### Scenario: Provider error mid-stream
- **WHEN** the model rejects with a 400 after the first chunk
- **THEN** the client receives one `error` chunk with the provider message and `[DONE]`

#### Scenario: Pipe rejection is handled
- **WHEN** a socket write fails mid-stream
- **THEN** the awaited pipe's rejection is caught (no unhandled rejection) and logged

### Requirement: Client disconnect
The endpoint SHALL abort the model run when the client closes the connection before the stream ends, and MUST still run `onFinish` persistence for whatever completed.

#### Scenario: Browser stop
- **WHEN** the client aborts the fetch
- **THEN** the agent's abort signal is aborted within 100 ms and no further model calls start
