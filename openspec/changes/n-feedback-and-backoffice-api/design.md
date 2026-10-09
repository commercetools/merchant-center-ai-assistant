## Context

Change **N**. Needs D (verified `RequestUser { userId, projectKey, isAdmin }`, with `isAdmin` computed by the service from the verified user id and `ADMIN_USER_IDS`; `requireAdmin`), E (`FeedbackStore`, `SessionStore`, `MessageStore`), G (envelope, `ChatSession`, REST contract). Feeds Q (feedback and backoffice UI). Chunk sizes are **re-derived from the Custom Object limits** because the legacy 800 KB constant exists only to fit Firestore's 1 MiB document.

Interface assumptions (names reconciled with E at apply time; change E's design was not yet written when this was authored - see OQ-N1):

```ts
interface FeedbackStore {
  putChunk(c: { feedbackId: string; ordinal: number; chunks: number; payload: string }): Promise<void>; // key `${id}-${ord3}`
  deleteChunks(feedbackId: string, upTo: number): Promise<void>;
  getChunk(feedbackId: string, ordinal: number): Promise<{ payload: string } | null>;
  putRecord(r: FeedbackRecord): Promise<void>;                 // parent, written last
  getRecord(id: string): Promise<FeedbackRecord | null>;
  list(q: { limit: number; offset: number; authorUserId?: string; createdAtBefore?: number; createdAtAfter?: number }):
    Promise<{ items: FeedbackListItem[]; total: number }>;     // newest first
}
interface SessionStore { get(id): ...; listAll(q: { limit; offset; userId?; createdAtBefore?; createdAtAfter? }): Promise<{ items: ChatSession[]; total: number }>; }
interface MessageStore { list(sessionId, { limit?, offset?, order? }): Promise<StoredMessage[]>; count(sessionId): Promise<number>; }
```

## Explore findings

Legacy paths relative to `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/`.

1. **Feedback submit flow** `src/controllers/feedback.controller.ts:82-329`: validates `sessionId` (`:110-116`), trims/cuts comment to 5000 (`:122-133`), loads session (`:137`), tenant check (`:147-155`), ownership with `ADMIN_EMAILS` bypass (`:165-174`), client-vs-server source (`:189-226`), strips data URLs then chunks (`:230-234`), 413 above `MAX_SNAPSHOT_BYTES` (`:238-247`), system prompt copy capped (`:251-263`), record build (`:268-298`), `storeFeedback` (`:300`), 201 response without snapshot (`:307-317`).
2. **Admin = unverified e-mail**: `src/middleware/admin.middleware.ts:9-27` hard-codes an allowlist and compares `req.query.userEmail`; the controller itself notes it (`feedback.controller.ts:423-426`). Target uses D's `requireAdmin` (`d-mc-session-auth/specs/mc-admin-authorization`): admin = the user's verified user id is in `ADMIN_USER_IDS`; browser-sent e-mail (`x-admin-email`, `userEmail`, `userLabel`) is never read for authorisation.
3. **Raised body limit trick**: `src/app.ts:54-66` registers `bodyParser.json({ limit: process.env.FEEDBACK_BODY_LIMIT || '25mb' })` on `app` for the **full** path `/service/feedback/submit` BEFORE the global parser (`app.ts:69`), because body-parser sets `req._body` and the later global instance short-circuits (`body-parser/lib/types/json.js:102` per the comment). A route-level parser inside the router would never run. **Finding:** this parser runs *before* `verifyMcSession` (auth is on the router, `routes/feedback.route.ts:18`), so an anonymous client can make the service parse up to 25 MB of JSON. Fixed here (spec "registered after authentication").
4. **Chunking**: `src/utils/feedback-snapshot.utils.ts` - `MAX_CHUNK_BYTES = 800_000` "Firestore cap 1,048,576" (`:18`), `MAX_SNAPSHOT_BYTES = 24 MiB` under the 25 MB body limit under Cloud Run's 32 MiB (`:25`), `MAX_COMMENT_LENGTH = 5000` (`:31`), `MAX_SYSTEM_PROMPT_BYTES = 100_000` (`:34`), `MAX_INLINE_DATA_URL_BYTES = 2048` (`:42`); per-message chunks sliced on UTF-8 byte boundaries (`buildSnapshotChunks :175-229`), doc id `{index:6}-{chunk:3}` to get order from a bare `.get()` (`:98`), reassembly with per-message unreadable placeholders (`reassembleSnapshot :253-294`). The payload is a string field "immune to Firestore's nested-array and `__x__` field-name rules" (types file `:105-110`) - not a concern for Custom Object values, but a string payload is still right for size control.
5. **Platform limits (Knowledge MCP, https://docs.commercetools.com/api/limits.md):** JSON documents persisted through any endpoint <= **16 MB** (error `ResourceSizeLimitExceeded`); recommended average **100 KB**, large documents **<= 2 MB**; HTTP request body of any API call <= **14 MB** (413 before reaching logic); Custom Objects per project 20 000 000 (soft); queries max 500 elements, offset <= 10 000 and `total` limited to the max offset when a predicate is used. There is **no Custom-Object-specific value limit** documented beyond the 16 MB document limit; the 2 MB guidance is what sizes our chunks.
6. **Chunk-size derivation:** a chunk is a *string inside JSON*, so serialising it into the Custom Object value escapes `"` and `\` (typical JSON text inflates ~1.15x) and, worst case, control characters become `\u00XX` (6x). `192 KiB x 6 = 1.125 MiB < 2 MB`, so even adversarial content stays inside the guidance; typical objects are ~220 KiB, close to the 100 KB average recommendation. 8 MiB / 192 KiB = 43 chunks max per feedback.
7. **Gateway body size**: legacy `FEATURES.md` (~line 82) records "a 10 MB body accepted" through the MC `forward-to` gateway (measured 2026-09-22 on Cloud Run). Request body limit is therefore set to 10 MiB (not 25) so it never exceeds what was measured; re-measure on Connect (E2E-N-02, OQ-N2).
8. **Per-message chunks cost objects**: one document per message minimum (`feedback-snapshot.utils.ts:189-221`) - a 200-message session = 200 writes; as Custom Objects that is 200 API calls and 200 of the 20 M objects. The whole-transcript split writes ceil(bytes/192 KiB) objects (e.g. 1 MiB -> 6).
9. **Backoffice**: `src/routes/backoffice.route.ts` - `GET /is-admin` (`:28-40`, allowlist check on `userEmail`), `POST /threads` (`:61-93`, `limit` default 10, filters in body), `GET /threads/:sessionId` (`:100-132`). Implementation `src/utils/firestore.utils.ts:1201-1255`: cross-project capable query, **`createdAtBefore/After` declared but never applied** (FEATURES.md line 683), and the doc comment says `messages=[]` but the code **fetches all messages per thread** (`:1234-1252`, N+1, unbounded). `getBackofficeThreadMessages` reads any session id (`:1266-1308`).
10. **Feedback list**: `src/controllers/feedback.controller.ts:345-397` limit default 20 clamp 1-100 (`:352-356`); filters `projectKey`, `authorEmail`, dates; projection excludes `systemPrompt`/`disabledTools`; FEATURES.md notes there is no `feedbacks` composite index in legacy (line 685).
11. **Audit**: only `fetchFeedbackById` logs "Admin ... fetched feedback" (`:427-429`); backoffice reads and list reads are silent. Target: `audit.admin_action` lines with `userId` (never an e-mail).
12. **Error envelope**: handlers answer `{ success:false, ... }` inline because `error.middleware` renders `CustomError` without `success` (`feedback.controller.ts:36-41`); G's contract requires the middleware to produce the envelope, so the inline convention is no longer needed.
13. **Request-size caveat for Custom Objects**: a chunk write sends ~220 KiB - 1.1 MiB; far below 14 MB. A submission of 8 MiB = up to 43 sequential-ish writes; with concurrency 4 and typical 100-200 ms latency that is ~2-3 s - acceptable (no streaming concern; the request is not an SSE).
14. **Date filtering**: Custom Objects expose `createdAt` / `lastModifiedAt` in query predicates and sort (plans/05 point 2; verify against scratch project in task 3.2). Feedback `createdAt` filtering therefore uses the Custom Object `createdAt` of the parent; thread date filters use the session object's `createdAt`.

## Glossary

- **Feedback**: a user's complaint/note on a session plus a transcript snapshot at that moment.
- **Snapshot**: the serialised transcript JSON, stored as N chunk Custom Objects.
- **Snapshot source**: `client` (browser's full `useChat` array incl. reasoning and tool calls) or `server` (stored, already filtered messages).
- **Backoffice thread**: a session plus its messages as shown to admins.
- **Chunk**: one Custom Object in `ai-assistant-feedback-snapshots` holding a slice of the snapshot string.
- **Parent record**: the metadata object in `ai-assistant-feedback`, written last.
- **Admin**: a user for whom the service's `requireAdmin` passes: their verified Merchant Center user id (signed gateway token) is in `ADMIN_USER_IDS` (change D). Computed server-side on every request; never by the browser.
- **`ADMIN_USER_IDS`**: deployment configuration, comma-separated allowlist of administrator Merchant Center user ids (changes C, D).
- **`userLabel`**: optional display text supplied in a request body; sanitised (trim, control characters and angle brackets removed, whitespace collapsed, max 120 characters), unverified, rendered as text only, never used for authorisation, keys, filters, ownership or joins.
- **Audit entry**: a structured log line `audit.admin_action` (admin-only actions) carrying `userId` (never an e-mail), action, route and outcome; submissions log `audit.feedback_submitted`.
- **413**: HTTP "Content Too Large".
- **Custom Object container/key**: namespace and id of a Custom Object (plans/05).

## Source map

| Legacy file (under `.../service/src/`) | New file (under `service/src/`) | Verdict |
|---|---|---|
| `routes/feedback.route.ts` | `routes/feedback.route.ts` | CHANGE (`requireAdmin`) |
| `controllers/feedback.controller.ts` | `controllers/feedback.controller.ts` + `services/feedback.service.ts` | CHANGE (stores, userId, audit, 413 policy, snapshot-tail) |
| `utils/feedback-snapshot.utils.ts` | `utils/feedback-snapshot.ts` | CHANGE (limits re-derived, whole-transcript chunking, sha256) |
| `types/feedback.types.ts` | `types/feedback.types.ts` | CHANGE (`userId`, no `projectKey`/e-mail, `snapshot-tail`, `snapshotSha256`) |
| `routes/backoffice.route.ts` | `routes/backoffice.route.ts` + `services/backoffice.service.ts` | CHANGE |
| `utils/firestore.utils.ts` (feedback, backoffice sections) | (E) `FeedbackStore`, `SessionStore.listAll` | E |
| `middleware/admin.middleware.ts` | - (D `requireAdmin`) | DROP |
| `app.ts` lines 54-66 | `app.ts` `registerFeedbackBodyParser(app, verifyMcSession)` in `utils/feedback-body-parser.ts` | CHANGE (after auth, 10 MiB) |
| (none) | `utils/audit.ts` | NEW |
| `deleteFeedback` (firestore.utils) | - | DROP (no caller) |

## Decisions

**D-N1 Chunk size 192 KiB, snapshot cap 8 MiB, body limit 10 MiB (constants).** Derivation in Explore 5-7. *Alternatives:* 800 KB kept (rejected: 6x escape worst case = 4.8 MB, over the 2 MB guidance); 1 MiB (same problem); 64 KiB (rejected: 128 objects for 8 MiB, more calls); env-configurable limits (rejected: the limits are properties of the platform, not of a deployment; fewer knobs, `FEEDBACK_BODY_LIMIT` env removed).

**D-N2 Whole-transcript string, not per-message chunks.** One JSON array string split into <= 192 KiB parts + `sha256` on the parent. Fewer objects (Explore 8), integrity check replaces per-message placeholders. *Alternative:* per-message chunks (legacy) - rejected: N objects per feedback, and keeps a message boundary that nobody needs because the reviewer always reads the full thread. Trade-off: one lost chunk makes the whole snapshot unreadable (reported as `snapshotIntact:false`); acceptable since chunks are written before the parent and verified by digest.

**D-N3 Deterministic chunk keys; read by GET, not by query.** Key `<feedbackId>-<ord3>`; the parent stores `chunkCount`; detail reads `0..chunkCount-1` with concurrency 4. Avoids relying on `value(...)` predicates and on 500-per-page paging. *Alternative:* query the container by `value(feedbackId=...)` sorted by key - kept as fallback if GET-by-key rate limits bite.

**D-N4 413 policy** (spec "413 policy"): client snapshot too large -> 413 with a retry hint ("submit without the transcript"); server snapshot too large -> newest-fit truncation. *Alternatives:* always 413 (rejected: a user with a huge stored session could never file feedback); always truncate the client snapshot too (rejected: silently drops the exact tool output being reported, contradicts the legacy "chunking beats truncating" principle; the client has an explicit alternative).

**D-N5 Parser after authentication.** `app.use('/service/feedback/submit', verifyMcSession, bodyParser.json({ limit: '10mb' }))` before the global parser, exported as `registerFeedbackBodyParser(app, auth)` and called from `app.ts` immediately before the global `express.json()`. The router chain runs `verifyMcSession` again (it is idempotent on `req.user`, change D); the cost is negligible. *Alternative:* raise the limit globally (rejected: all routes accept 10 MB). *Alternative:* streaming parse (rejected: complexity).

**D-N6 Admin through `requireAdmin` (D); ownership bypass uses `req.user.isAdmin`.** `userEmail`, `authorEmail` and the legacy allowlist are gone; `isAdmin` is the service's `ADMIN_USER_IDS` check (decided 2026-10-09, replaces the permission-claim model); list filter becomes `authorUserId`; the backoffice lists and filters by `userId` only. Feedback and backoffice routes except `is-admin` and `submit` are `requireAdmin`.

**D-N7 Audit = structured log lines** (`utils/audit.ts`: `auditAdminAction({ userId, action, route, outcome, ...ids })` -> `logger.info('audit.admin_action', ...)`; `userId` only, never an e-mail or `userLabel`, never message text; submissions use `audit.feedback_submitted`). *Alternative:* persist audit entries as Custom Objects (rejected for v1: write amplification, retention policy needed, Q13); revisit if a retention policy is ever decided (Q13/Q25 decided: none).

**D-N8 Backoffice thread messages bounded.** `limit <= 25`, messages <= 2000 per thread, read with concurrency 4, optional `?messages=false`. Legacy N+1 unbounded reads (Explore 9) are the main performance risk for Custom Objects (each thread = >=1 call, 2000 messages = 4 pages). Keeps Q's in-browser query feature (it needs messages) working with explicit bounds.

**D-N9 Records drop tenant fields.** `FeedbackRecord` keeps legacy shape minus `projectKey`; `userEmail` -> `userId`; `sessionUserEmail` -> `sessionUserId`; adds `snapshotSha256`, `chunkCount` semantics = Custom Objects written. `FeedbackListItem` projection unchanged otherwise.

**D-N10 Session lookup for submit** uses `SessionStore.get` directly (not G's owner-scoped `SessionService.get`) because admins may file on any session; ownership logic lives in `feedback.service.ts`.

**D-N11 `userLabel` is display-only.** Feedback submit accepts an optional body field `userLabel` (never a query parameter, never `userEmail`), run through `sanitizeUserLabel` (change G, `utils/user-label.ts`) and stored as `userLabel` on the feedback record; backoffice threads expose the session's own sanitised `userLabel` (set at session creation, change G). The UI (Q) renders it as text with an "(unverified)" tag. The verified identity is always `userId`; no query, filter, key, ownership check or join uses the label. *Alternatives:* show nothing (rejected: reviewers cannot recognise a bare user id); trust an e-mail from the browser (rejected: forgeable).

## Risks / Trade-offs

- **R-N1 Large writes on a slow project API**: 43 chunk writes; mitigated by concurrency 4, 8 MiB cap, cleanup on failure. A timeout mid-way leaves orphan chunks if cleanup also fails (bounded, invisible without a parent); there is no retention or cleanup job (Q13/Q25), so a one-off manual sweep is the only remedy.
- **R-N2 Gateway/Connect body limits unknown for Connect** (OQ-N2); if < 10 MiB the client gets a 413/502 from the proxy, not our envelope. Mitigation: E2E-N-02 measures; limit constants are in one file.
- **R-N3 `offset <= 10000`** caps how deep admins can page; acceptable for v1, retention/keyset later.
- **R-N4 Admin reads of other users' transcripts** (Q8, Q26 decided 2026-10-09: kept, admin-only): audited with `audit.admin_action`, admin = `ADMIN_USER_IDS`; no PII redaction.
- **R-N8 Forged display label**: a user can put any text (even an admin's address) in `userLabel`; it grants nothing and is rendered as unverified text. Reviewers must rely on `userId`.
- **R-N9 Unbounded growth**: messages and feedback are kept forever (Q13/Q25); only the offset cap (R-N3) limits browsing; storage growth is accepted by the owner.
- **R-N5 Single-chunk loss** invalidates a snapshot (D-N2); detection via digest.
- **R-N6 `sha256` on 8 MiB** costs ~20 ms; negligible.
- **R-N7 Double-click double submit** still writes two snapshots; Q must guard.

## Migration Plan

Greenfield; no legacy data import. After N is archived, Q can build against `docs/api.md` rows 20-25. If E's `FeedbackStore` shape differs, adjust task 3.1 only.

## Open questions

- **OQ-N1** `FeedbackStore` / `SessionStore.listAll` exact signatures (E not authored yet). Not owner-only.
- **OQ-N2** Max request body accepted end-to-end on Connect (gateway + platform front door) - measure in E2E-N-02; adjust the `FEEDBACK_BODY_LIMIT` / `MAX_SNAPSHOT_BYTES` constants if needed (caps stay 10 MiB request / 8 MiB snapshot, Q27). Not owner-only.
- **OQ-N3** Confirm `createdAt` predicates and `sort=createdAt desc` on Custom Object queries (task 3.2). Not owner-only.
- **OQ-N4** RESOLVED 2026-10-09 (Q13/Q25): feedback and threads are kept forever, no retention job. A persisted audit trail remains out of scope (log lines only).
- **OQ-N5** RESOLVED 2026-10-09 (Q8/Q26): admins may read other users' transcripts; admin-only through `ADMIN_USER_IDS`, with `audit.admin_action` log lines.

## Changelog

- 2026-10-09 (owner decision Q9): generated images are referenced by the service-relative path `/files/{sessionId}/{file}` (private bucket, backend-streamed by change L); snapshots and backoffice transcripts keep that path untouched and need no re-signing step (plan amendment PA-L1 obsolete); admins may read any session's image through the files route.
- 2026-10-09 (owner decisions Q6/Q8/Q13/Q17/Q25/Q26/Q27, CQ5): admin is now the service-computed admin by `ADMIN_USER_IDS` (`requireAdmin`), replacing the permission claim; feedback review and backoffice (except `is-admin` and `submit`) are admin-only; audit lines renamed `audit.admin_action` with `userId` only (never an e-mail); added display-only sanitised `userLabel` (D-N11, body field only, unverified, never used for keys/filters/ownership/joins; backoffice lists and filters by `userId`); messages and feedback kept forever with no retention/cleanup job (OQ-N4/N5 resolved); caps 10 MiB request / 8 MiB snapshot unchanged; new forged-label/e-mail scenarios and task 6.3.
