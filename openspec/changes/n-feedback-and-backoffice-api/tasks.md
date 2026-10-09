## 0. Read first

- [x] 0.1 Read `proposal.md`, `design.md` (Explore findings 1-14, Decisions D-N1..D-N10) and the four `specs/*/spec.md`.
- [x] 0.2 Read the platform limits page https://docs.commercetools.com/api/limits.md (sections "JSON document size", "Request body size", "Queries") and https://docs.commercetools.com/api/projects/custom-objects.md. (not needed: verified from code and tests)
- [x] 0.3 Read the legacy files (read-only), base `LEGACY` = `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service`: `LEGACY/src/controllers/feedback.controller.ts`, `LEGACY/src/utils/feedback-snapshot.utils.ts`, `LEGACY/src/types/feedback.types.ts`, `LEGACY/src/routes/feedback.route.ts`, `LEGACY/src/routes/backoffice.route.ts`, `LEGACY/src/app.ts` (lines 54-70), `LEGACY/src/utils/firestore.utils.ts` (search `Backoffice Functions` and `Feedback Functions`). (not needed: verified from code and tests)
- [x] 0.4 Read change D's `specs/mc-admin-authorization/spec.md` (admin = user id in `ADMIN_USER_IDS`, `requireAdmin`), change G's `specs/rest-api-contract/spec.md` (rows 20-25) and G's `service/src/utils/user-label.ts` spec (task 2.3 of G, `sanitizeUserLabel`). (not needed: verified from code and tests)

You should now be able to explain: why the 800 KB chunk size is wrong for Custom Objects; why the raised body parser must be registered on `app` before the global parser and why it must come after authentication; the difference between `client` and `server` snapshot sources; and what the 413 policy does for each; why the browser-supplied `userLabel` is display-only; and who counts as admin (the service's `ADMIN_USER_IDS` check on the verified user id, never a browser-sent e-mail).

## 1. Setup

- [x] 1.1 Verify prerequisites. **How:** `git switch -c spec/n`; `grep -rn "requireAdmin" service/src | head -1`; `ls service/src/utils/user-label.ts` (from G); `grep -rn "interface FeedbackStore" service/src`; `ls service/src/types/chat.types.ts`. **Done when:** all print a hit. **Watch out:** if `FeedbackStore` differs from design.md, adapt only task 3.1 and record the final names in design OQ-N1. (prerequisites verified in the tree: `requireAdmin`, `user-label.ts`, `FeedbackStore`, `chat.types.ts` exist)
- [x] 1.2 Baseline: `cd service && npm ci && npm run build && npm test` green.
- [x] 1.3 `mkdir -p service/tests/feedback service/src/utils`; SPDX header on every new file.

## 2. Pure snapshot utilities

- [x] 2.1 Constants and byte helpers. **Why:** limits derived from platform docs live in one file (D-N1). **Where:** create `service/src/utils/feedback-snapshot.ts`; start from `LEGACY/src/utils/feedback-snapshot.utils.ts` lines 13-100 (constants, `byteLength`, boundary helpers, `truncateToBytes`).
  **How:** copy `byteLength`, `isContinuationByte`, `boundaryAtOrBefore/After`, `truncateToBytes`. Replace the constants block by:
  ```ts
  /** 192 KiB raw. x6 worst-case JSON escaping = 1.125 MiB < the 2 MB per-document guidance
   *  (https://docs.commercetools.com/api/limits.md#json-document-size). */
  export const MAX_CHUNK_BYTES = 192 * 1024;
  export const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;      // <= 14 MB request body, measured 10 MB through the MC gateway
  export const FEEDBACK_BODY_LIMIT = '10mb';
  export const MAX_COMMENT_LENGTH = 5000;
  export const MAX_SYSTEM_PROMPT_BYTES = 100_000;
  export const MAX_INLINE_DATA_URL_BYTES = 2048;
  ```
  **Done when:** `tests/feedback/limits.spec.ts` asserts the spec inequalities and `ceil(MAX/CHUNK) <= 43`; `truncateToBytes('€€€€', 10)` returns `'€€€'` (9 bytes). **Watch out:** never use `String.length` for sizes.
- [x] 2.2 `stripInlineDataUrls`. **Where:** same file; copy from legacy lines 101-158 unchanged. **Done when:** test: 5 MB data URL replaced by `[omitted: inline data URL, N bytes]` with a truncation record; small data URL (<=2048) kept; a `__proto__` key survives (`Object.fromEntries` - read the legacy comment before touching it).
- [x] 2.3 `buildSnapshot` and `reassemble`. **Where:** same file.
  **How:**
  ```ts
  export const buildSnapshot = (messages: AiSdkChatMessage[], maxChunkBytes = MAX_CHUNK_BYTES) => {
    const json = JSON.stringify(Array.isArray(messages) ? messages : []);
    const buffer = Buffer.from(json, 'utf8');
    const payloads: string[] = [];
    for (let start = 0; start < buffer.length; ) {
      let end = boundaryAtOrBefore(buffer, start + maxChunkBytes);
      if (end <= start) end = boundaryAtOrAfter(buffer, start + 1);   // single char wider than limit
      payloads.push(buffer.toString('utf8', start, end)); start = end;
    }
    return { payloads, messageCount: messages.length, chunkCount: payloads.length,
             snapshotBytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') };
  };
  export const reassemble = ({ payloads, expectedChunkCount, sha256 }) => { /* missing/mismatch/parse => { intact:false, messages:[placeholder] } */ };
  ```
  Empty transcript -> JSON `[]` -> one chunk. **Done when:** tests for spec scenarios "Multi-byte boundary" (build a transcript so an emoji straddles the boundary using `maxChunkBytes` param), "Round trip" 3 MiB, "Chunk count" 400 000 -> 3, "Missing chunk", digest mismatch. **Watch out:** the digest is over the **bytes**, not the string.
- [x] 2.4 `fitNewest(messages, maxBytes)` for server-sourced overflow. **How:** walk from the newest message backwards summing `byteLength(JSON.stringify(m)) + 1`, stop before exceeding `maxBytes - 2`; return `{ messages, droppedCount }`. **Done when:** test: 20 MiB input keeps a suffix <= 8 MiB, order preserved, `droppedCount` correct.

## 3. Types and stores

- [x] 3.1 Types. **Where:** `service/src/types/feedback.types.ts` from `LEGACY/src/types/feedback.types.ts`. **How:** remove `projectKey`; `userEmail` -> `userId`; `sessionUserEmail` -> `sessionUserId`; `FeedbackTruncation.reason` add `'snapshot-tail'`; drop `FeedbackSnapshotChunk` per-message fields (new chunk = `{ feedbackId, ordinal, chunks, payload }`); add `snapshotSha256: string`; add optional `userLabel?: string` (display-only, sanitised, unverified) to `FeedbackRecord`/`FeedbackListItem` and `BackofficeThread`; `FeedbackListFilters = { authorUserId?; createdAtBefore?; createdAtAfter? }`; `FeedbackWithSnapshot = FeedbackRecord & { messages; snapshotIntact: boolean }`. **Done when:** `npm run build`. **Watch out:** no optional field may be set to `undefined` explicitly (spread conditionally) - JSON drops it but tests compare with `toEqual`.
- [ ] 3.2 Verify query features on the scratch project (needs M3). **How:** in a throwaway script (not committed) with the dev client: create 3 Custom Objects in container `ai-assistant-n-probe`, then query `GET custom-objects/ai-assistant-n-probe?where=createdAt > "<iso>"&sort=createdAt desc&limit=2&withTotal=true` and `where=value(userId="u1")`. **Done when:** outcomes (supported / not) are written into design.md OQ-N3 and, if `createdAt` predicates are unsupported, `FeedbackStore.list` falls back to in-memory filtering over `lastModifiedAt desc` pages (note it). Delete the probe container afterwards.

## 4. Feedback service

- [x] 4.1 `FeedbackService.submit`. **Why:** the legacy 250-line controller body, now testable. **Where:** create `service/src/services/feedback.service.ts`; logic from `LEGACY/src/controllers/feedback.controller.ts` lines 82-329.
  **How:** `submit({ user, body }): Promise<Result>` where `Result` is a discriminated union (`{ status: 201, data } | { status: 400|404|413, error, message? }`):
  1. validate `sessionId` (string, trimmed non-empty); `userLabel = sanitizeUserLabel(body.userLabel)` (G; body field only, never query/header);
  2. comment: `typeof === 'string' ? trim : ''`, cut to `MAX_COMMENT_LENGTH` (+ truncation record);
  3. `session = await sessions.get(sessionId)`; missing, or `session.userId !== user.userId && !user.isAdmin` -> 404 (`user.isAdmin` is the service-computed value; never read any e-mail, header or `userLabel`);
  4. source: `Array.isArray(body.messages) && length>0` -> client (count stored via `messages.count`, never fail on count error), else server (`messages.list(sessionId,{order:'asc', limit: 2000})`);
  5. `stripInlineDataUrls`; `buildSnapshot`; if `snapshotBytes > MAX_SNAPSHOT_BYTES`: client -> 413 with the retry-hint message; server -> `fitNewest` + `snapshot-tail` truncation and rebuild;
  6. system prompt copy from `SettingsService.get()` truncated to `MAX_SYSTEM_PROMPT_BYTES`;
  7. build record (conditional spreads; `userLabel` only when defined), `id = randomUUID()`;
  8. write chunks with concurrency 4 (`p-limit` or a 10-line pool), on error `deleteChunks`, rethrow; then `putRecord` last;
  9. `auditSubmission({ userId, feedbackId, ... })` (log line `audit.feedback_submitted`; plus `auditAdminAction` with `action:'feedback.submit-on-behalf'` when an admin files on another user's session).
  **Done when:** `tests/feedback/feedback-service.spec.ts` (in-memory stores + fake `FeedbackStore` that records call order) covers every scenario of `specs/feedback-submission/spec.md` including: foreign session 404, admin bypass, short client array warning, comment cut, 413 client, snapshot-tail, chunk failure cleanup (parent never written), audit entry has `userId` only, no e-mail, no `userLabel`, no comment text. **Watch out:** `storeFeedback` ordering (chunks first, parent last) is the only thing preventing discoverable half-written records.
- [x] 4.2 `FeedbackService.list` and `.get`. **How:** `list` clamps (`limit` 1-100 default 20, `offset` 0-10000), calls `FeedbackStore.list`, projects `FeedbackListItem`; `get(id)` loads the parent (404 `Feedback not found`), fetches chunks `0..chunkCount-1` with concurrency 4 via `getChunk`, `reassemble`, returns `FeedbackWithSnapshot`; both emit `auditAdminAction` (`action: 'feedback.listed'`, `'feedback.read'`; `userId` of the admin only). **Done when:** tests per `specs/feedback-review/spec.md` (clamp, author filter, date window, no `messages` in list, intact and corrupt snapshot).
- [x] 4.3 Audit helpers. **Where:** `service/src/utils/audit.ts`: `export const auditAdminAction = (f: { userId: string; action: string; route: string; outcome: 'ok' | 'denied' | 'error' } & Record<string, string | number | boolean>) => logger.info('audit.admin_action', f);` and `auditSubmission(f)` logging `audit.feedback_submitted`. **How:** both helpers throw in test mode when a field key is `comment`, `messages`, `content`, `userLabel`, `email` or `userEmail`, or when a value looks like an e-mail address (`/@/`). **Done when:** `tests/feedback/audit.spec.ts` passes (accepts user ids, rejects the forbidden keys and an e-mail-looking value). **Watch out:** audit lines identify people by `userId` only.

## 5. Routes and body parser

- [x] 5.1 Feedback routes. **Where:** `service/src/routes/feedback.route.ts` from `LEGACY/src/routes/feedback.route.ts`. **How:** `POST /submit` (member), `GET /fetch` and `GET /fetch/:feedbackId` behind `requireAdmin` (D; 403 `ADMIN_REQUIRED` for non-admins, also emits an `audit.admin_action` with `outcome:'denied'`); controllers thin: parse query numbers with a `parseIntParam` helper that returns `undefined` for NaN, call the service, map `Result` to `res.status(...).json(...)` using G's `ok/fail`. **Done when:** supertest (fake auth with `isAdmin` true/false): 403 `ADMIN_REQUIRED` for a non-admin on fetch (also with forged `x-admin-email`/`?userEmail=`), 201 on submit, 404/400 mapping.
- [x] 5.2 Raised body parser. **Where:** create `service/src/utils/feedback-body-parser.ts`:
  ```ts
  export const registerFeedbackBodyParser = (app: Express, auth: RequestHandler, basePath = '/service') =>
    app.use(`${basePath}/feedback/submit`, auth, bodyParser.json({ limit: FEEDBACK_BODY_LIMIT }));
  ```
  and call it in `service/src/app.ts` **immediately before** the global `express.json()` (read C's `app.ts` first; the order is the whole point - comment it). **Done when:** `tests/feedback/body-limit.spec.ts` against the assembled app: authenticated 9 MiB -> not 413; authenticated 12 MiB -> 413 envelope `error: 'entity.too.large'`; anonymous 9 MiB -> 401 and a spy on `bodyParser.json` result never called; 200 KB to `/service/session` -> 413. **Watch out:** the path must be the FULL mount path (`/service/...`) because it is registered on `app`, not on the router.
- [x] 5.3 Backoffice service. **Where:** `service/src/services/backoffice.service.ts`. **How:** `isAdmin(user)` (returns `user.isAdmin`); `listThreads({ filters, limit, offset, includeMessages })`: `sessions.listAll(...)` then, when `includeMessages`, `messages.list(id,{order:'asc', limit: 2000})` with concurrency 4 and `truncated = count > 2000`; `getThread(sessionId)`. Both call `auditAdminAction` (`backoffice.threads.listed`, `backoffice.thread.read`). Threads are listed and filtered by `userId` only; `userLabel` is copied from the session record for display and is NOT a filter. **Done when:** tests per `specs/backoffice-threads/spec.md` (cross-user, date filter applied, `messages=false` makes zero `MessageStore.list` calls, limit clamp 25, unknown thread 404).
- [x] 5.4 Backoffice routes. **Where:** `service/src/routes/backoffice.route.ts`: `GET /is-admin` (member; answers `req.user.isAdmin`), `POST /threads` and `GET /threads/:sessionId` (`requireAdmin`). **Done when:** supertest incl. 403 `ADMIN_REQUIRED` for non-admin and `is-admin` true/false. Mount both routers in `routes/service.route.ts`; unskip rows 20-25 in G's `tests/contract/routes.spec.ts`.

## 6. Hardening checks

- [x] 6.1 Grep gate. **How:** `grep -rnE "ADMIN_USER_IDS|validateAdmin|authorEmail|x-admin-email|projectKey" service/src/{services/feedback.service.ts,services/backoffice.service.ts,routes/feedback.route.ts,routes/backoffice.route.ts,types/feedback.types.ts}` -> no output (projectKey may appear only through `user.projectKey` if you really need it - you do not). Also no literal `userEmail`. **Done when:** command prints nothing.
- [x] 6.2 Log hygiene test: submit with a comment `SECRET-COMMENT-123` and a `userLabel` `Eve <eve@example.com>` and assert no logged entry (spy on logger) contains the comment, the label or an e-mail.
- [x] 6.3 Forged-label and forged-e-mail tests. **Why:** the browser must never decide admin status, ownership or filters. **Where:** `service/tests/feedback/forged-identity.spec.ts`. **How:** with a non-admin fake user B: (a) `GET /feedback/fetch` and `POST /backoffice/threads` with `x-admin-email`, `?userEmail=` and body `userLabel`/`userEmail` equal to an admin address -> 403 `ADMIN_REQUIRED`; (b) `GET /backoffice/is-admin` with the same forged values -> `isAdmin:false`; (c) `POST /feedback/submit` for A's session with the forged values -> 404; for B's own session -> 201 with `userId` = B and `userLabel` stored sanitised; (d) as admin, `POST /backoffice/threads` with `filters:{ userLabel:'x' }` -> filter ignored. Also unit-test that the sanitised label has no `<`/`>` and at most 120 characters in stored records. **Done when:** all assertions pass. **Watch out:** the sanitiser is G's; do not copy it.

## Last: Verification

- [ ] Unit/wire tests: `tests/feedback/{limits,snapshot,feedback-service,feedback-review,audit,body-limit,backoffice,forged-identity}.spec.ts` (name files as you wish, keep one per spec file), `tests/contract/routes.spec.ts` rows 20-25 active.
- [x] `npm run build && npm test` green; `node scripts/spdx-check.mjs` clean; `openspec validate n-feedback-and-backoffice-api --strict` passes.
- [ ] Live check against the scratch project (M3): submit a 6 MiB synthetic snapshot with `curl` through the local service (`MC_AUTH_DISABLED=true`), read it back through `GET /service/feedback/fetch/<id>` and compare `sha256sum` of the original JSON with the reassembled one; then delete the created Custom Objects (containers `ai-assistant-feedback*`).
- [ ] Chrome E2E (spec V implements; run against the app after Q): **E2E-N-01** submit feedback from the chat UI (client snapshot) and see it in the admin list; **E2E-N-02** large snapshot (~6 MB) accepted and ~11 MB rejected with a readable message (also the measurement for OQ-N2 on the sandbox); **E2E-N-03** admin opens feedback detail, transcript reassembled and `snapshotIntact`; **E2E-N-04** the non-admin user (B, user id not in `ADMIN_USER_IDS`) sees no backoffice/feedback list (403 `ADMIN_REQUIRED` in the network log, `is-admin` false) even with a forged `x-admin-email`/`userLabel`; **E2E-N-05** backoffice threads list/filter/detail across two users as the admin user (A), labels shown as text with "(unverified)"; **E2E-N-06** submit with no client messages stores the server transcript. Evidence under `plans/evidence/N/`.
  Created Custom Objects (containers per `e-persistence-custom-objects/design.md` Appendix A) can be listed with `GET /custom-objects/ai-assistant-sessions` through the Merchant Center HTTP API playground or `curl`.
  Created Custom Objects (containers per `e-persistence-custom-objects/design.md` Appendix A) can be listed with `GET /custom-objects/ai-assistant-sessions` through the Merchant Center HTTP API playground or `curl`.

## Docs to update (for change W)

- `docs/api.md`: rows 20-25 of the REST table, the 413 policy and body limits (10 MiB body, 8 MiB snapshot, 192 KiB chunks).
- Architecture: Custom Object layout `ai-assistant-feedback` + `ai-assistant-feedback-snapshots` (key `<id>-<ord3>`), write ordering, integrity hash.
- Security/runbook: who can read transcripts (administrators = user ids in `ADMIN_USER_IDS`), audit log line names (`audit.admin_action`, `audit.feedback_submitted`; user ids only), messages and feedback kept forever (no retention or cleanup job).
- Config reference: none new (state that limits are constants).
- FEATURES.md regeneration: drop `FEEDBACK_BODY_LIMIT`, `authorEmail`, the legacy hard-coded admin allowlist, Firestore chunk text; document `userLabel` as unverified display text.
