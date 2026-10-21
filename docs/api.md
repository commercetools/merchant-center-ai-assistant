# REST API reference

The service exposes its API under the base path `/service`. It is called by the Merchant Center applications through the
Merchant Center gateway (`/proxy/forward-to`), not by browsers directly. The route table below is checked against the code by
`node scripts/docs/check-api-doc.mjs`.

## Conventions

- **Base path**: `/service` (the `endpoint` of the service in `connect.yaml`).
- **Authentication**: `Authorization: Bearer <token>` where the token is the signed token the Merchant Center gateway adds. Routes marked "none" below need no token. A missing,
  malformed or unverifiable token answers 401; a token for another project answers 403. Authenticated JSON responses carry `Cache-Control: no-store` and `Vary: Authorization`.
- **Administrator routes** answer 403 with code `ADMIN_REQUIRED` for a user who is not listed in `ADMIN_USER_IDS`. The decision is made by the service from the verified user ID; no header, query or body field can grant it.
- **Success envelope**: `{ "success": true, "data": ... }`. List answers of the review routes add a sibling `pagination` object (`limit`, `offset`, `total`). A delete answers `{ "success": true, "message": "..." }`.
  Exceptions that are not enveloped: `GET /service/status` and `GET /service/health` (a plain status object), `GET /service/status/nimbus`, the stream, the image route (binary) and the OAuth callback (an HTML page).
- **Error envelope**: `{ "success": false, "error": "<text>", "message": "<text>", "code": "<optional code>" }` with the HTTP status. Persistence problems use fixed texts (404 `Not found`, 409 `Conflict, please retry`,
  413 `Payload too large`, 503 `Storage temporarily unavailable, please retry`); unexpected errors answer 500 `Internal server error` without details.
- **Correlation**: send `X-Correlation-Id` (at most 128 characters) to find the request in the logs. The service echoes the id (or, when none was sent or it is not visible ASCII, a generated one) in the `X-Correlation-Id` response header.
- **Body limits**: JSON bodies are limited to 100 kB (413 above it), except `POST /service/feedback/submit` and `POST /service/ai-chat/:sessionId/message/stream`, which accept 10 MB (chat messages can carry attached images), and only after the caller has been authenticated, so an anonymous caller cannot make the service read a large body.
  A feedback transcript is stored up to 8 MiB.
- **Identity**: the service never reads a user ID, e-mail address or admin flag from a header, body or query parameter. The optional `userLabel` in session and feedback bodies is stored as an unverified, sanitised display label only.
- **Custom View**: the optional query parameter `customView=<base64 of the Merchant Center page URL>` scopes the session routes to sessions created by the Custom View. Requests without it only see sessions created outside the view.

## Route table

| Method | Path | Auth | Admin | Purpose |
| --- | --- | --- | --- | --- |
| `GET` | `/service/status` | none | no | Liveness and configuration summary |
| `GET` | `/service/health` | none | no | Alias of `/service/status` |
| `GET` | `/service/status/nimbus` | none | no | Readiness of the embedded Nimbus MCP |
| `POST` | `/service/auth/session` | token | no | Session bootstrap: `userId`, `isAdmin`, project key, identity connection state |
| `POST` | `/service/session` | token | no | Create a session |
| `GET` | `/service/session` | token | no | The user's latest session |
| `GET` | `/service/session/all` | token | no | List the user's sessions |
| `GET` | `/service/session/:sessionId` | token | no | Read a session |
| `PUT` | `/service/session/:sessionId` | token | no | Change title or metadata |
| `DELETE` | `/service/session/:sessionId` | token | no | Delete a session and its messages |
| `GET` | `/service/session/:sessionId/messages` | token | no | List the messages of a session |
| `GET` | `/service/session/:sessionId/digest` | token | no | Title, description, icon and follow-up prompts of the last turn |
| `GET` | `/service/session/:sessionId/tools` | token | no | The tools menu with the session's switches |
| `POST` | `/service/session/:sessionId/tools` | token | no | Same as `GET` (alias for older clients) |
| `PUT` | `/service/session/:sessionId/tools` | token | no | Switch tools off or on for the session |
| `GET` | `/service/suggestions` | token | no | Four prompt cards |
| `GET` | `/service/system-prompt` | token | no | Read the project system prompt |
| `PUT` | `/service/system-prompt` | token | yes | Replace the project system prompt |
| `GET` | `/service/tool-call-logs` | token | no | Read the tool-call detail level |
| `PUT` | `/service/tool-call-logs` | token | yes | Set the tool-call detail level |
| `POST` | `/service/ai-chat/:sessionId/message/stream` | token | no | Send a message; the answer streams back |
| `POST` | `/service/feedback/submit` | token | no | Submit feedback with a transcript snapshot |
| `GET` | `/service/feedback/fetch` | token | yes | List feedback |
| `GET` | `/service/feedback/fetch/:feedbackId` | token | yes | Read one feedback with its transcript |
| `GET` | `/service/backoffice/is-admin` | token | no | Whether the caller is an administrator |
| `POST` | `/service/backoffice/threads` | token | yes | List sessions of all users with messages |
| `GET` | `/service/backoffice/threads/:sessionId` | token | yes | Read one session of any user |
| `GET` | `/service/files/:sessionId/:fileName` | token | no | Stream a generated image (owner or administrator) |
| `GET` | `/service/mcp/providers` | token | no | Which third-party tool sources are configured |
| `GET` | `/service/managed-mcp-identity` | token | no | The bound Managed MCP server |
| `PUT` | `/service/managed-mcp-identity` | token | yes | Bind a Managed MCP server (identity mode) |
| `DELETE` | `/service/managed-mcp-identity` | token | yes | Remove the binding and every user's tokens |
| `GET` | `/service/managed-mcp-identity/status` | token | no | Whether this user is connected |
| `POST` | `/service/managed-mcp-identity/authorize` | token | no | Start the OAuth connection of this user |
| `POST` | `/service/managed-mcp-identity/verify` | token | no | Check this user's connection and list the tools |
| `DELETE` | `/service/managed-mcp-identity/me` | token | no | Disconnect this user |
| `GET` | `/service/managed-mcp-identity/callback` | none (single-use state) | no | OAuth redirect target |

## Health

`GET /service/status` answers 200 `{ "status": "UP", "service": "ai-assistant", "version": "<package version>", "persistence": "custom-objects", "authConfigured": true, "adminConfigured": false }`.
`authConfigured` is true when `CONNECT_SERVICE_URL` is set; `adminConfigured` is true when `ADMIN_USER_IDS` lists at least one user. It calls no dependency and returns no secret (`service/src/controllers/status.controller.ts`).
`GET /service/status/nimbus` answers 200 with `{ "status": "ok" | "disabled", ... }` and 503 for `degraded` or `error`; it names only the Nimbus MCP version and tool names (`service/src/controllers/nimbus-status.controller.ts`).

## Session bootstrap

`POST /service/auth/session` answers `{ success: true, data: { projectKey, userId, isAdmin, identityMcpConfigured, identityUserConnected, managedMcpConfigured } }`. There is no e-mail address and no permissions array.
`isAdmin` is the only source of administrator status for the apps. `identityMcpConfigured` says whether a Managed MCP server is bound, `identityUserConnected` whether this user has connected
(`managedMcpConfigured` repeats the first for older clients). The request body is ignored (`service/src/controllers/mc-auth.controller.ts`).

## Sessions

- `POST /service/session` body (all optional): `title` (at most 200 characters), `metadata` (object), `featureFlags` (at most 10 entries of strings or booleans), `userLabel`. Answers 201 with the session record.
- `GET /service/session` answers the latest session or 404 `No session found for this user`.
- `GET /service/session/all?limit=<n>` answers an array of `{ id, title, createdAt, updatedAt, featureFlags?, ... }`, newest first, at most 500.
- `PUT /service/session/:sessionId` changes only `title` and `metadata`; other keys are ignored.
- `DELETE /service/session/:sessionId` removes the messages and the session, and drops the session's BigQuery tables and stored images. It does not delete feedback records.
- `GET /service/session/:sessionId/messages?limit=&offset=` answers stored messages in order: `{ id, role, parts, timestamp, metadata? }`. `metadata.usage` holds the token counts of the turn.
- `GET /service/session/:sessionId/digest?since=<epoch ms>` answers `{ pending: true }` until a digest newer than `since` exists, then `{ pending: false, digestUpdatedAt, title, description, icon, nextPrompts }`.
- A session of another user, an unknown id and a malformed id all answer 404 `Session not found`.

## Tools menu

- `GET` or `POST /service/session/:sessionId/tools?locale=` answers `[{ "mcp": "<source>", "tools": [{ "toolName": "...", "enabled": true }] }]`.
- `PUT` takes `{ "tools": [{ "mcp": "<source>", "tools": [{ "toolName": "...", "enabled": false }] }] }` (at most 50 groups, 1,000 tools per group) and stores the switched-off tools. A group that is not mentioned is unchanged. The sentinel tool name `all_tools` switches a whole source off.

## Settings

- `GET /service/system-prompt` answers `{ systemPrompt }` (empty when unset); `PUT` takes `{ systemPrompt }` (a string of at most 20,000 characters, otherwise 400) and logs `audit.admin_action`.
- `GET /service/tool-call-logs` answers `{ mode }` (`none`, `thinking`, `tools` or `all`; `all` when never set); `PUT` takes `{ mode }`.
- `GET /service/suggestions?locale=<tag>` always answers 200 with `{ suggestions: [{ icon, title, detail, prompt }], personalised: boolean }`.

## Chat stream

`POST /service/ai-chat/:sessionId/message/stream` with body `{ "message": { "id": "<string>", "role": "user", "parts": [ { "type": "text", "text": "..." } ] } }` and optional query `locale`. The role `system` is rejected.
Validation errors (400) are answered before any stream byte; other pre-stream errors use the error envelope.

The answer is `text/event-stream` in the AI SDK UI message stream format: JSON chunks such as `start`, `text-start`, `text-delta`, `text-end`, `reasoning-*`, `tool-input-*`, `tool-output-*`, `start-step`, `finish-step`, `finish` and `abort`,
terminated by `data: [DONE]`. Additional parts of this service:

| Part | Meaning |
| --- | --- |
| `data-keepalive` | Transient heartbeat every 20 s while the stream is idle; never stored |
| `data-turn-status` | Stored marker appended when the time budget ended the answer; the text part before it holds the notice |
| `data-ct-annotations` | Sent by the app with a message: annotations on a composed page preview |

After headers are sent a failure is reported as an in-band error chunk followed by `[DONE]`. See `service/src/chat/stream.ts`.

## Limits applied inside a chat turn

These limits shape what a tool result can contain; they are not request parameters. Tool errors are returned to the model with a hint, so
the assistant normally retries with a smaller request.

| Area | Limit | Code |
| --- | --- | --- |
| History given to the model | the last 20 stored messages | `service/src/chat/constants.ts` (`CHAT_HISTORY_MESSAGES`) |
| History given to the analyzer step that decides whether a tool result is offloaded | the last 10 messages | `service/src/chat/constants.ts` (`ANALYZER_HISTORY_MESSAGES`) |
| Steps per turn | 50 | `service/src/chat/constants.ts` (`CHAT_MAX_STEPS`) |
| CSV export (`export_data`, CSV only) | at most 50,000 rows and 5 MB of Base64-encoded content (about 3.75 MB of CSV); above either the tool answers an error and a hint to filter or aggregate first | `service/src/analytics/constants.ts`, `service/src/tools/export.tool.ts` |
| Composed page (`create_composed_page`) | at most 20 components, 10 data sources and 20,000 characters per component body; the tool answers the list of fields to fix | `service/src/composed-pages/schema.ts` |
| Result offloaded to a session table | at most 20,000 rows and 20 MB; tables expire after 7 days | `service/src/analytics/constants.ts` |
| `query_aggregated_data` | `SELECT` only, at most 500 rows and 256 KiB returned, 200 MB billed, 60 s | `service/src/analytics/constants.ts` |

## Feedback and backoffice

- `POST /service/feedback/submit` body: `sessionId` (required), `comment` (truncated at 5,000 characters), `messages` (the client's transcript; when empty the stored transcript is used), `userLabel`.
  The caller must own the session (administrators may submit for any). Answers 201 `{ id, createdAt, messageCount, snapshotSource, truncated, snapshotBytes }`; 413 when the snapshot exceeds 8 MiB.
- `GET /service/feedback/fetch?limit=&offset=&authorUserId=&createdAtBefore=&createdAtAfter=` (limit 1 to 100, default 20) answers an array of feedback records without transcripts and `pagination`.
- `GET /service/feedback/fetch/:feedbackId` answers the record, the reassembled `messages` and `snapshotIntact` (false when a chunk is missing or the digest differs).
- `GET /service/backoffice/is-admin` answers `{ isAdmin }`, the service's own decision.
- `POST /service/backoffice/threads?limit=&offset=&messages=false` with body `{ "filters": { "userId", "createdAtBefore", "createdAtAfter" } }` answers `{ sessionId, userId, userLabel?, title?, createdAt, updatedAt, messages, truncated }` per thread
  (default 10, at most 25 per page; at most 2,000 messages per thread, `truncated` says when more exist) and `pagination`; `offset` is limited to 10,000.
- `GET /service/backoffice/threads/:sessionId` answers one thread of any user.
- Every administrator call logs `audit.admin_action` with the user ID, the route and the outcome; submissions log `audit.feedback_submitted`.

## Generated images

`GET /service/files/:sessionId/:fileName` streams the image with `Content-Type` from the file extension (`png`, `jpg`, `webp`, `gif`), `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`
and `Cache-Control: private, no-store`. Only the session owner and administrators may read it; every other case, including a malformed name or a missing object, answers 404 `File not found`, so existence is not revealed.
Success is not enveloped. Message file parts carry the relative path `/files/<sessionId>/<fileName>` in the default private mode, or the public bucket URL when `IMAGE_URL_MODE=public`.

## Managed MCP identity

- `GET /service/managed-mcp-identity` answers the public binding `{ serverKey, url, majorVersion, authenticationMode, connectedAt, discovery }` or 404 with code `IDENTITY_MCP_NOT_CONFIGURED`.
- `PUT` takes `{ serverKey, majorVersion? }` (`url`, if sent, must equal the server address of this project). It probes the server and answers 400 unless it advertises commercetools Identity. `DELETE` revokes and deletes every user's tokens, then removes the binding.
- `GET .../status` answers `{ configured, connected, serverKey?, hasRefreshToken?, accessTokenExpiresAt?, scope? }` and never decrypts a token.
- `POST .../authorize` answers `{ connected: true }` when a valid token exists, otherwise `{ connected: false, authorizationUrl }` for the popup. It answers 503 while `CONNECT_SERVICE_URL` is unset or not HTTPS, and 409 when no server is bound.
- `POST .../verify` answers `{ connected, cached, toolCount, toolNames }`, or 401 `IDENTITY_REAUTH_REQUIRED`, or 403 `IDENTITY_NO_PERMITTED_TOOLS`, or 409 when nothing is bound.
- `DELETE .../me` revokes and deletes the caller's tokens and answers `{ connected: false }`.
- `GET .../callback?code=&state=` is called by the browser from the authorization server. It claims the state first, exchanges the code and answers a small HTML page with a strict content security policy that posts the outcome to the opener and closes the window.

## Tool providers

`GET /service/mcp/providers` answers `[{ provider: "contentstack" | "algolia" | "stripe", configured, enabled, missingKeys: [<key names>] }]`. It returns names and booleans only. There is no API to write provider configuration:
the keys are Connect configuration ([configuration.md](./configuration.md)).
