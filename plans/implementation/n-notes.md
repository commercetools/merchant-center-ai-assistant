# Change N (n-feedback-and-backoffice-api): implementation notes

## Summary

Branch `worktree-agent-af474480d6e9b5fee` (reset to `develop` = A..F, O). Built in `service/`:

- `src/utils/feedback-snapshot.ts`: constants (192 KiB chunk, 8 MiB snapshot, `'10mb'` body, caps), `byteLength`, `truncateToBytes`, `stripInlineDataUrls`, `buildSnapshot` (one JSON string, UTF-8-safe chunks, sha256 over bytes), `reassemble` (never throws, `intact` flag), `fitNewest`, `snapshotChunkKey` (`<id>-<ord3>`).
- `src/types/feedback.types.ts`, `src/services/{feedback,backoffice}.service.ts`, `src/controllers/{feedback,backoffice}.controller.ts`, `src/routes/{feedback,backoffice}.route.ts` (router factories with injectable auth/service for tests), mounted in `routes/service.route.ts`.
- `src/utils/audit.ts` (`auditAdminAction`, `auditSubmission`; throws in test mode on forbidden keys / e-mail-like values), `src/middleware/require-admin-audited.middleware.ts` (D's `requireAdmin` plus an `outcome:'denied'` audit line), `src/utils/feedback-body-parser.ts` (`registerFeedbackBodyParser`, called in `app.ts` after `verifyMcSession`, before the global parser), `src/utils/feedback-response.ts` (envelope helpers, see gaps).
- Additive edits to E: `FeedbackRecord.snapshotSha256?`, truncation reason `snapshot-tail`, `FeedbackStore.getParts()` (raw chunk payloads; E's `get` still reassembles per message and is unused by N).
- Removed `FEEDBACK_BODY_LIMIT` (C's `server.feedbackBodyLimit`, `.env.example`, two C tests adapted). It was never in `connect.yaml`, so no checker change was needed.
- Tests (`tests/feedback/`, 84 tests + `tests/helpers/feedback-app.ts`): `snapshot` (limits, chunking, reassembly), `feedback-service`, `feedback-review`, `audit`, `body-limit` (assembled app), `backoffice`, `forged-identity`, `routes` (rows 20-25).

Commands run (this worktree):
- `cd scripts && npm ci`; `cd service && npm ci && npm run build && npm test` -> build ok; 57 suites / 511 tests pass (baseline 49 / 418).
- `npm run lint` clean; `npm run check:foundation` ok.
- Root: `node scripts/check-connect-layout.mjs` ok; `node scripts/spdx-check.mjs` ok; `node scripts/check-repo-rules.mjs` ok; `openspec validate n-feedback-and-backoffice-api --strict` valid.
- Grep gate 6.1: no hit in the N files (the one hit was a comment, reworded).

## Questions (for the owner)

1. Backoffice order: the spec says newest `updatedAt` first, but E's `SessionStore.listAll` sorts by `createdAt desc`. Accept createdAt order for v1, or should E add an `updatedAt`/`lastModifiedAt` sort?
2. Chunk write concurrency is E's `PERSISTENCE_CONCURRENCY` (default 8), not the spec's 4. OK, or do you want a separate cap for feedback writes?
3. Feedback detail reads all chunks with one key-sorted query (E's `get`), not `0..n-1` GETs by key. Fine unless the platform rate limits paging; D-N3's fallback is the other way round.

## Missed features / gaps found in the spec

- **E's `FeedbackStore` does not match design.md** (OQ-N1). E built the legacy per-message layout (`put(record, chunks)`, one container per feedback `ai-assistant-feedback-snap-<id>`, `get` reassembling per message, its own 512 KiB / 24 MiB limits in `persistence/limits.ts`). N needs whole-transcript chunks + digest. I reused `put`/`delete` (chunk object = `{index: ordinal, chunk: 0, chunks: n, payload}`, key `<id>-<ord3>`) and added `getParts`. E's `FEEDBACK_CHUNK_BYTES`, `MAX_SNAPSHOT_BYTES`, `buildSnapshotChunks`, `reassembleSnapshot` are now unused by N and misleading; E (or a cleanup) should delete or align them. Container layout therefore differs from the "ai-assistant-feedback-snapshots" mentioned in the docs list of tasks.md.
- Change G files do not exist yet: `service/src/utils/user-label.ts` (`sanitizeUserLabel`), `types/chat.types.ts` (`AiSdkChatMessage`), G's `ok/fail` envelope, `SettingsService`, G's `tests/contract/routes.spec.ts`. See TODOs.
- Error envelope: D's error middleware renders `{code,message}` for `CustomError` (no `success:false`). G's contract wants `{success:false,error,message?}` everywhere; that is G's middleware change. N's own errors (400/404/413 from the service) are already enveloped; the 403 `ADMIN_REQUIRED` and a 500 from `CustomError` are not until G lands. Tests assert `code`/status only.
- `reassemble` signature: spec says `{ chunks, expectedChunkCount, sha256 }`, task 2.3 says `{ payloads, ... }`; implemented `payloads` (array indexed by ordinal, holes = missing).
- Task 4.1 step 4 reads server messages `order:'asc', limit:2000`; for sessions over 2000 messages that returns the OLDEST 2000, contradicting "newest" intent of the overflow policy. Used `order:'desc'` + limit (E returns chronological order either way).
- Spec says list `total` "up to 10000" but E's `list` throws `QueryLimitError` (-> 400 'Invalid paging parameters') when `offset + limit > 10000`, so `offset=10000` is unusable. Offset clamp 0-10000 is applied, E's error surfaces as 400.
- Backoffice task 5.3 says `truncated = count > 2000` via a count; I read 2001 messages instead (one call, no extra `count`).
- Feedback list date filters use the object's platform `createdAt` (E), not the record's own `createdAt` field; they agree to within the write latency.
- Task 1.1 `git switch -c spec/n` conflicts with the worktree harness branch; stayed on the harness branch.
- `snapshotSha256` is optional in the type (E's record shape is shared and legacy-free, but `FeedbackRecord` has no required-field migration); records without it read back as `snapshotIntact:false`.

## TODOs

- Not run (need owner/tooling): task 3.2 (probe `createdAt` predicates / sort on a scratch project; E's `P-sort`, `P-offset` probes cover part of it; OQ-N3 not updated), task 7 "Live check" (6 MiB snapshot via curl against a scratch project, sha256 compare), the 10 MB gateway upload measurement (OQ-N2). E2E scenarios not run: E2E-N-01, E2E-N-02, E2E-N-03, E2E-N-04, E2E-N-05, E2E-N-06.
- Unticked in tasks.md: 0.2, 0.3, 0.4 (I relied on design.md and read only parts of the legacy controller/utils, not the platform page or D's spec; a reviewer should skim), 1.1 (G prerequisites missing, see below), 3.2, the "rows 20-25 active in G's contract test" line, live check, E2E.
- When G merges: (a) drop my stub `src/utils/user-label.ts` and keep G's `sanitizeUserLabel` (same name/signature, import path unchanged), (b) replace `utils/feedback-response.ts` (`sendOk`/`sendResult`) with G's `ok/fail`, (c) swap `SnapshotMessage` for `AiSdkChatMessage` if desired, (d) use G's `SettingsService` instead of `SettingsStore.get()` for the system prompt copy (the stored `systemPrompt` is `''` until G's default prompt is resolved there, in which case no prompt is stored), (e) move `tests/feedback/routes.spec.ts` rows into G's `tests/contract/routes.spec.ts` and make that test's "no unlisted route" check include these six.
- Docs for change W are listed in tasks.md "Docs to update"; additionally document that feedback chunk containers are `ai-assistant-feedback-snap-<id>`.
- `audit.ts` reads `readConfiguration()` to decide "test mode"; if G prefers a different switch, change `isTestMode`.

## Deviations from the spec (with reason)

- Branch: harness worktree branch instead of `spec/n`.
- `FeedbackListQuery`/`FeedbackDetail` names instead of reusing `FeedbackListFilters`/`FeedbackWithSnapshot`: E exports types with those names and different shapes (ISO dates, per-message messages), so mine would clash.
- `FeedbackStore` changes in E's files (see Summary) instead of "only task 3.1": the designed `putChunk/putRecord` interface does not exist; kept E's `put(record, chunks)` ordering guarantee.
- Chunk write concurrency 8 (E) not 4; chunk read by one sorted query not per-key GETs (see Questions).
- `submit` throws `CustomError(500,'Failed to submit feedback')` on a non-persistence write failure and rethrows `PersistenceError` unchanged (E's error middleware maps it to 503/413) instead of always 500.
- `registerFeedbackBodyParser` has two optional extra parameters (`basePath`, injectable `parser`) so the "parser never ran" scenario is a real spy; defaults match the spec signature.
- Removed `FEEDBACK_BODY_LIMIT` config from C's server section (spec: "constant now"); C's tests adapted (`config.server-cache`, `app-shell`: the two obsolete feedback-parser tests were replaced by `tests/feedback/body-limit.spec.ts`).
- Anonymous 9/12 MiB upload test accepts either `401` or a socket reset (`ECONNRESET`/`EPIPE`): the server answers before reading the body, which is the point of the change, but Node may reset the still-uploading client.
- `sessionUserId` is stored whenever the session has an owner (legacy only when present; equivalent).
- Test-only auth: `tests/helpers/feedback-app.ts` swaps `verifyMcSession` for `x-test-user` headers in router tests; the assembled-app tests (`body-limit`, `routes`) use the real middleware with D's dev bypass.
