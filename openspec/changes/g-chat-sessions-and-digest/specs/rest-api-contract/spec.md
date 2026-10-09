## ADDED Requirements

### Requirement: Response envelope
Every JSON endpoint of the service (except the SSE stream, the binary image route `GET /files/:sessionId/:fileName` on success, and `GET /status`) SHALL answer with `{ "success": true, "data": ... }` on success and `{ "success": false, "error": "<short>", "message"?: "<detail>" }` on failure. The error middleware MUST render every error, including body-parser 413 and thrown `CustomError`, in this shape. Responses of authenticated routes MUST carry `Cache-Control: no-store`.

#### Scenario: Unknown session
- **WHEN** a member calls `GET /service/session/<unknown-uuid>`
- **THEN** the status is 404 and the body is `{ "success": false, "error": "Session not found" }`

#### Scenario: Thrown error keeps the envelope
- **WHEN** a handler throws `CustomError(403, 'Access denied')`
- **THEN** the body contains `"success": false` and `"error"`, and no stack trace outside development

### Requirement: Authentication classes
Every route below SHALL be mounted behind the verified Merchant Center session of change D. Three auth classes exist: **member** (verified user whose `projectKey` equals `CTP_PROJECT_KEY`), **owner** (member AND the session's `userId` equals `req.user.userId`), **admin** (member for whom `requireAdmin` passes: the service computed `isAdmin` from the verified user id being in `ADMIN_USER_IDS`, change D; there is no permission claim and the browser never decides). Non-admins receive 403 `{ code: 'ADMIN_REQUIRED' }` on admin routes. The query parameters `userEmail`, `projectKey` and `userId`, the header `x-admin-email` and the body fields `userEmail` and `userLabel` MUST NOT influence authorisation, ownership or admin status. Session ownership is by `userId` only. The one exception to "owner" is the image route (row 28, change L), which admits the session owner or an admin and answers 404 to everyone else.

#### Scenario: Missing session token
- **WHEN** any route below is called without a valid forward-to JWT
- **THEN** the status is 401 and no persistence call is made

#### Scenario: Forged e-mail or label does not grant admin
- **WHEN** a non-admin member calls any admin route of the table (rows 16, 18, 21, 22, 24, 25) with `x-admin-email`, `userEmail` (query or body) or `userLabel` set to an administrator's user id or e-mail address
- **THEN** the status is 403 `ADMIN_REQUIRED` and nothing is read from the forged values

#### Scenario: Client-supplied userEmail is ignored
- **WHEN** a member calls `GET /service/session/all?userEmail=someone-else@example.com`
- **THEN** only sessions owned by the verified `userId` are returned

### Requirement: Published route table
The service SHALL expose exactly the following routes under the base path `/service`. A contract test MUST fail when a route in this table is missing or when an unlisted route is mounted.

| # | Method | Path | Request (query / body) | Response `data` | Auth | Owner change |
|---|---|---|---|---|---|---|
| 1 | GET | `/status` | - | `{ status: 'UP', service, version, persistence, authConfigured, adminConfigured }` (no envelope; liveness only) | none | C |
| 2 | POST | `/auth/session` | - | `{ projectKey, userId, isAdmin, identityMcpConfigured, ... }` (no `permissions`; `userId` feeds the frontends' read-only "Your user ID" line; contributors of G keep working; shape owned by D) | member | D |
| 3 | POST | `/session` | body `{ title?, metadata?, featureFlags?, userLabel? }` (`userLabel` display-only, unverified, sanitised, see chat-sessions) | `Session` (201) | member | G |
| 4 | GET | `/session` | flags as query (`customView=<b64>`) | last `Session` matching flags; 404 if none | member | G |
| 5 | GET | `/session/all` | `limit?` (positive int), flags | `SessionListItem[]` newest first | member | G |
| 6 | GET | `/session/:sessionId` | - | `Session` | owner | G |
| 7 | PUT | `/session/:sessionId` | body `{ title?, metadata? }` | `Session` | owner | G |
| 8 | DELETE | `/session/:sessionId` | - | `{ message }` (envelope has `message` at top level) | owner | G |
| 9 | GET | `/session/:sessionId/messages` | `limit?`, `offset?`, flags | `AiSdkChatMessage[]` oldest first | owner | G |
| 10 | GET | `/session/:sessionId/digest` | `since?` (epoch ms) | `{ pending: true }` or `{ pending: false, digestUpdatedAt, title, description, icon, nextPrompts[] }` | owner | G |
| 11 | GET | `/session/:sessionId/tools` | - | `GroupedSessionTools[]` | owner | G |
| 12 | POST | `/session/:sessionId/tools` | - (alias of 11, kept for the legacy client) | `GroupedSessionTools[]` | owner | G |
| 13 | PUT | `/session/:sessionId/tools` | body `{ tools: GroupedSessionTools[] }` | echoes `tools` | owner | G |
| 14 | GET | `/suggestions` | `locale?` (default `en`) | `{ suggestions: PromptSuggestion[4], personalised }` | member | G |
| 15 | GET | `/system-prompt` | - | `{ systemPrompt }` | member | G |
| 16 | PUT | `/system-prompt` | body `{ systemPrompt: string }` | `{ systemPrompt, message }` | admin | G |
| 17 | GET | `/tool-call-logs` | - | `{ mode: 'none'\|'thinking'\|'tools'\|'all' }` | member | G |
| 18 | PUT | `/tool-call-logs` | body `{ mode }` | `{ mode, message }` | admin | G |
| 19 | POST | `/ai-chat/:sessionId/message/stream` | body `{ id, message: UIMessage }`, `locale?` | SSE UI message stream (`text/event-stream`), see H | owner | H |
| 20 | POST | `/feedback/submit` | body `{ sessionId, comment?, messages?, userLabel? }` (raised body limit; `userLabel` is display-only and unverified) | `{ id, createdAt, messageCount, snapshotSource, truncated, snapshotBytes }` (201) | member (owner of session, or admin) | N |
| 21 | GET | `/feedback/fetch` | `limit` (1-100, default 20), `offset`, `authorUserId?`, `createdAtBefore?`, `createdAtAfter?` | `FeedbackListItem[]` + top-level `pagination` | admin | N |
| 22 | GET | `/feedback/fetch/:feedbackId` | - | `FeedbackWithSnapshot` | admin | N |
| 23 | GET | `/backoffice/is-admin` | - | `{ isAdmin: boolean }` (service-computed, same value as bootstrap `isAdmin`) | member | N |
| 24 | POST | `/backoffice/threads` | `limit?` (1-25, default 10), `offset?`; body `{ filters?: { userId?, createdAtBefore?, createdAtAfter? } }` | `BackofficeThread[]` + top-level `pagination` | admin | N |
| 25 | GET | `/backoffice/threads/:sessionId` | - | `BackofficeThread` | admin | N |
| 26 | GET/POST/PUT/DELETE | `/managed-mcp-identity/*` | defined by change I | - | member | I |
| 27 | GET | `/mcp/providers` | - | `{ provider, configured, enabled, missingKeys[] }[]` (names and booleans only; provider credentials are Connect configuration, read-only) | member | J |
| 28 | GET | `/files/:sessionId/:fileName` | - (`:sessionId` UUID, `:fileName` `<digits>-<8 hex>.<png\|jpg\|webp\|gif>`) | raw image bytes (`image/*`, streamed, not enveloped; errors use the envelope; `Cache-Control: private, no-store`) | owner (or admin) | L |
| 29 | GET | `/health` | - | same body as row 1 (no envelope; liveness only) | none | C |
| 30 | GET | `/status/nimbus` | - | `{ status: 'ok'\|'degraded'\|'error'\|'disabled', nimbusMcp, tools? }` (no envelope; readiness of the embedded Nimbus MCP server) | none | K |

Row types: `Session`, `SessionListItem`, `AiSdkChatMessage`, `GroupedSessionTools`, `PromptSuggestion` are defined in `service/src/types/chat.types.ts` (change G); `FeedbackListItem`, `FeedbackWithSnapshot`, `BackofficeThread` in change N.

#### Scenario: Contract test enumerates the router
- **WHEN** the contract test walks the Express router stack of the assembled app
- **THEN** every row 1-25 and rows 28 to 30 matches an actual `(method, path)` and no other `(method, path)` exists under `/service` (rows 26 and 27 are matched by prefix)

#### Scenario: Removed legacy routes
- **WHEN** a client calls `GET` on the removed legacy widget bootstrap path under `/service/` or `GET /service/mcp/anything-legacy`
- **THEN** the status is 404 with the standard envelope
