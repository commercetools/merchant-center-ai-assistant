## 0. Read first

- [x] 0.1 Read `proposal.md`, `design.md` (Explore findings, Decisions) and `specs/*/spec.md` of this change; read `plans/03-spec-dependency-map.md` ("Interface contracts") and `plans/05-data-persistence.md`.
- [x] 0.2 Read the legacy files (read-only) in this order: `.../service/src/types/chat.types.ts`, `services/chat.service.ts`, `routes/session.route.ts`, `middleware/feature-flags.middleware.ts`, `functional-agent/turn-digest.ts`, `functional-agent/agents/session-digest.agent.ts`, `services/suggestions.service.ts`, `functional-agent/agents/suggestions.agent.ts`, `controllers/tools.controller.ts`, `services/tools.service.ts`, and the four tests `tests/wire/{session-digest,suggestions,session-summary,turn-digest}.spec.ts` (base `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service`).
- [x] 0.3 Read AI SDK docs for `generateText` + `Output.object` (https://ai-sdk.dev) and commercetools Custom Objects (https://docs.commercetools.com/api/projects/custom-objects.md). (not needed: verified from code and tests)

You should now be able to explain: why the digest is not written into the SSE stream; why ownership uses `userId` instead of `userEmail`; why only the *disabled* tools are stored; and why `/suggestions` can never answer an error.

## 1. Setup

- [x] 1.1 Confirm prerequisites are merged: changes C, D, E, F are archived (`ls openspec/specs` lists their capabilities).
  **Why:** G compiles against D/E/F interfaces. **Where:** repo root. **How:** `git switch -c spec/g`; `ls service/src/persistence service/src/middleware`. **Done when:** `SessionStore`, `MessageStore`, `SettingsStore`, `SuggestionStore`, `requireAdmin`, `getModel` exist (`grep -rn "interface SessionStore" service/src` prints one hit). **Watch out:** if names differ from design.md, adapt the skeletons below and note it in the commit message (OQ-G1/OQ-G2).
- [x] 1.2 Baseline: `cd service && npm ci && npm run build && npm test` -> expected: build OK, existing tests green (record the count).
- [x] 1.3 Create empty folders: `mkdir -p service/src/{agents,constants} service/tests/{wire,contract}`; every new file starts with the SPDX header used by A (`// SPDX-License-Identifier: MIT`).

## 2. Types, constants and response helpers

- [x] 2.1 Port `chat.types.ts` (without tenancy).
  **Why:** one shared vocabulary for API and stores. **Where:** create `service/src/types/chat.types.ts`; copy from `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/types/chat.types.ts`.
  **How:** 1) copy; 2) delete `Message`, `ValidatorCreator`, `ValidatorFunction`, `Wrapper`, `SendMessageRequest`, `ChatMessage`, `SessionWithMessages` (unused); 3) remove `projectKey` from `ChatSession`, make `userId: string` required, do NOT keep any `userEmail` field (change D's grep gate); 4) rename `ChatSession` -> keep name `ChatSession` (alias `SessionRecord = ChatSession` exported for E); 5) keep `FeatureFlags`, `DisabledTools`, `GroupedSessionTools`, `SessionTool`, `NextPrompt`, `SessionDigest`, `SessionListItem`, `PromptSuggestion`, `UserSuggestions`, `TemporaryTable`, `AiSdkChatMessage`, `CreateSessionRequest`; 6) `FeatureFlags = Record<string, string | boolean | undefined> & { customView?: string }`.
  **Done when:** `npm run build` passes; `grep -rn "projectKey" service/src/types/chat.types.ts` is empty. **Watch out:** `ai` types (`UIMessage`) are ESM-only; keep `import type`.
- [x] 2.2 Port the icon vocabulary. **Where:** create `service/src/constants/digest-icons.ts` from `.../service/src/constants.ts` lines 148-210 (`DIGEST_ICON_NAMES`, `DigestIconName`, `DEFAULT_DIGEST_ICON`). **Done when:** exports compile. **Watch out:** the frontend mirrors this list (`mc-app/src/utils/material-icons.ts` in spec P): never narrow it.
- [x] 2.3 Add the display-label sanitiser. **Why:** a browser-supplied e-mail may only ever be shown as unverified text. **Where:** create `service/src/utils/user-label.ts` exporting `sanitizeUserLabel(input: unknown): string | undefined`. **How:** non-string -> `undefined`; remove control characters (`/[\u0000-\u001f\u007f]/g`) and angle brackets (`<`, `>`); collapse whitespace; trim; cut to 120 characters (by code points, never splitting a surrogate pair); empty -> `undefined`. **Done when:** `tests/wire/user-label.spec.ts` covers HTML, control characters, 300 characters -> 120, emoji at the cut, empty and non-string input. **Watch out:** this is for display only; never compare, key or filter by it. Add optional `userLabel?: string` to `ChatSession` (task 2.1) and let `SessionService.create` store `sanitizeUserLabel(req.userLabel)` when defined.
- [x] 2.4 Add envelope helpers. **Where:** create `service/src/utils/api-response.ts` with `ok(res, data, status=200)`, `fail(res, status, error, message?)`.
  **How:**
  ```ts
  export const ok = <T>(res: Response, data: T, status = 200) => res.status(status).json({ success: true, data });
  export const fail = (res: Response, status: number, error: string, message?: string) =>
    res.status(status).json({ success: false, error, ...(message ? { message } : {}) });
  ```
  **Done when:** unit test `tests/wire/api-response.spec.ts` asserts both shapes. **Watch out:** the DELETE route returns `{ success: true, message }` (no `data`) - add `okMessage(res, message)`.

## 3. Session service and ownership

- [x] 3.1 Create `SessionService` on `SessionStore`.
  **Why:** replaces `ChatService` session methods without Firestore. **Where:** create `service/src/services/session.service.ts`; copy logic from legacy `.../services/chat.service.ts` lines 22-300 and 340-415.
  **How:** methods `create(user, req)`, `get(id, user)` (returns null when missing or `session.userId !== user.userId`), `list(user, {limit, flags})`, `lastByFlags(user, flags)`, `update(id, user, {title, metadata})`, `applySessionDigest(sessionId, userId, digest)`, `remove(id, user)`. Use `store.patch` for every mutation (D-G3). `create`: `id = randomUUID()`, `title = req.title || 'New chat'`.
  ```ts
  async get(id: string, user: RequestUser) {
    const s = await this.sessions.get(id);
    return s && s.userId === user.userId ? s : null;
  }
  ```
  **Done when:** `tests/wire/session-service.spec.ts` (in-memory stores) passes: create defaults, other-user isolation, update ignores protected fields, patch race keeps both fields (use a store wrapper that throws a 409 once). **Watch out:** the legacy ALS session cache (`getSessionFromContext`) is optional; use the request-context helper from C only to avoid *re-reading* within one request.
- [x] 3.2 Add the list fallback title. **Where:** same file. **How:** port `toSessionListItem` + `titleFromFirstMessage` (legacy lines 230-267); call `messages.list(id,{limit:1,order:'asc'})` only when `digestUpdatedAt` is falsy. **Done when:** port `tests/wire/session-summary.spec.ts` (rewire mocks to the in-memory `MessageStore` spy) and it passes, including "digested sessions cause zero message reads".
- [x] 3.3 Implement flag-scoped listing (D-G4). **Where:** `SessionStore.listByUser` caller in `session.service.ts`. **How:** fetch pages of 500 until fewer than 500 returned or 4 pages; filter with `sessionMatchesFeatureFlagsQuery` / `sessionHasNoFeatureFlags`; apply `limit` last. Try the predicate form `value(featureFlags(customView = "..."))` against the scratch project (M3) once and record the outcome in design.md OQ-G5; keep in-memory filtering regardless. **Done when:** unit test with 1 200 generated sessions returns the right 4 with `limit=4`. **Watch out:** never return other users' sessions even when flags match.
- [x] 3.4 Cleanup hooks and temporary tables. **Where:** `session.service.ts`. **How:** port `addTemporaryTable`, `getAllTemporaryTables`, `getTemporaryTableMessages` (legacy lines 526-640; keep the `columns:` text) and add:
  ```ts
  type CleanupHook = (session: ChatSession) => Promise<void>;
  const hooks: CleanupHook[] = [];
  export const registerSessionCleanupHook = (h: CleanupHook) => { hooks.push(h); };
  ```
  `remove()` runs hooks with `Promise.allSettled`, logs failures, then `messages.deleteAll`, then `sessions.delete`. **Done when:** tests "delete runs hooks", "hook failure still deletes", "duplicate tableRef". **Watch out:** do NOT import BigQuery here (change L registers the hook).

## 4. Middleware

- [x] 4.1 Port feature flags. **Where:** create `service/src/middleware/feature-flags.middleware.ts` from legacy file of the same name. **How:** copy; build `RESERVED_QUERY_KEYS` from D's exported `LEGACY_IDENTITY_QUERY_KEYS` plus `limit`, `offset`, `since`, `locale` (never write the literal `userEmail` in G code); replace `decodeURIComponent` by a try/catch returning the raw value on `URIError`. **Done when:** `tests/wire/feature-flags.spec.ts`: `customView=X` -> `{customView:'X'}`, `limit=3` ignored, `a=true` -> boolean, malformed `%E0%A4%A` does not throw.
- [x] 4.2 `loadSession` middleware. **Where:** create `service/src/middleware/load-session.middleware.ts` (replaces legacy `session.middleware.ts`). **How:** read `req.params.sessionId`, `sessions.get`, check owner, `res.locals.session = session`; otherwise `fail(res,404,'Session not found')`. **Done when:** supertest: other user's id -> 404, own id -> next(). **Watch out:** H reuses this middleware on the stream route.

## 5. Message service

- [x] 5.1 Create `MessageService`. **Where:** create `service/src/services/message.service.ts`; logic from legacy `chat.service.ts` lines 435-520 (`sendMessages`, `getMessages`).
  **How:** `appendMissing(sessionId, msgs)`: stamp `timestamp = Date.now()` on missing ones via `MessageStore.appendMissing` then `sessions.patch(sessionId,{updatedAt: Date.now()})`; `list(sessionId,{limit,offset})`; `lastN(sessionId, n)` = `store.list(..., {limit:n, order:'desc'})` reversed. **Done when:** tests "append idempotent" and "lastN chronological" (spec scenarios). **Watch out:** the user message is saved by the stream route *and* re-sent in `onFinish.messages`; idempotency by id is what prevents duplicates.

## 6. Session routes

- [x] 6.1 Create `service/src/routes/session.route.ts`.
  **Why:** rows 3-9 of the REST table. **Where:** new file; port from legacy `routes/session.route.ts` lines 22-392 (drop the commented-out block 406-483).
  **How:** `router.use(flagsMiddleware)`; routes in this order so `/all` is not captured by `/:sessionId`: `POST /`, `GET /`, `GET /all`, `GET /:sessionId`(+`loadSession`), `PUT`, `DELETE`, `GET /:sessionId/messages`. The messages handler keeps the flag-mismatch fallback (OQ-G3): if session flags do not match request flags, use `sessions.lastByFlags`, else 404. `limit/offset` parsed with `Number.parseInt`, ignored when NaN or <0.
  **Done when:** `tests/wire/session-routes.spec.ts` (supertest + fake auth setting `req.user`) covers 201 create, 404 foreign, list order, limit, 404 last-session-none, delete idempotency. **Watch out:** every handler uses `ok/fail`; never `res.status(500).json({message: error.message})` (leaks internals) - log and answer `fail(res,500,'Failed to ...')`.
- [x] 6.2 Mount routes. **Where:** `service/src/routes/service.route.ts` (created by C/D). **How:** `serviceRouter.use('/session', verifyMcSession, sessionRouter)`. **Done when:** `curl -i localhost:8080/service/session/all` without token -> 401.

## 7. Digest

- [x] 7.1 Port the digest generator. **Where:** create `service/src/agents/session-digest.agent.ts` from `.../functional-agent/agents/session-digest.agent.ts`; `sanitizeMessages` comes from `service/src/utils/message.utils.ts` (created by H task 3.1 - until H lands, copy the function to `service/src/utils/message.utils.ts` yourself; H will keep your copy). **How:** replace `import { model as liteModel, providerOptions } from '../providers/gemini-lite'` with `const lite = () => getModel('lite');`; keep `DIGEST_HISTORY_CUTOFF=20`, `LIMITS`, clamp, `normaliseDigest`, transcript-as-one-message, `AbortSignal.timeout(20_000)`. **Done when:** port `tests/wire/session-digest.spec.ts` unchanged except import paths; `MockLanguageModelV3` from `ai/test` is used, all tests green. **Watch out:** the transcript design (comment lines 183-198 of the legacy file) is deliberate - do not "simplify" into a chat history; Gemini rejects requests ending with a model turn.
- [x] 7.2 Port the turn runner. **Where:** create `service/src/agents/turn-digest.ts` from legacy `functional-agent/turn-digest.ts`. **How:** keep `producedAnswer`, `runTurnDigest(params): void`; replace `chatService.applySessionDigest` with `sessionService.applySessionDigest(sessionId, userId, digest)`; params use `userId` not `userEmail/projectKey`. **Done when:** `tests/wire/turn-digest.spec.ts` ported + new test "onFinish returns before a 2 s deferred digest resolves" (use fake timers or a `Promise` the test resolves manually) + "rejection is caught" (`process.on('unhandledRejection')` spy not called).
- [x] 7.3 Digest view and route. **Where:** create `service/src/services/session-digest.view.ts` (copy) and add the route in `session.route.ts`: `GET /:sessionId/digest` -> `ok(res, toSessionDigestView(session, since))`. **Done when:** supertest scenarios "stale -> pending", "fresh -> data" pass. **Watch out:** the route MUST NOT import any model code.

## 8. Suggestions

- [x] 8.1 Port `suggestions.agent.ts`. **Where:** create `service/src/agents/suggestions.agent.ts` from legacy; model via `getModel('lite')`; keep timeouts, clamps, `WANTED_SUGGESTIONS=4`. **Done when:** ported `tests/wire/suggestions.spec.ts` (normalisation + prompt describes) passes.
- [x] 8.2 Port `suggestions.service.ts`. **Where:** create `service/src/services/suggestions.service.ts`. **How:** inputs `(user, locale)`; sessions from `SessionService.list(user)`; cache from `SuggestionStore.get(user.userId)`; `systemPrompt` from `SettingsService`; connected sources from `getConnectedSourcesProvider().list()` (default `[]`, setter exported for H). Whole body inside try/catch returning `DEFAULT_SUGGESTIONS`; keep `isCacheFresh`, `SUGGESTIONS_TTL_MS`, `HISTORY_DEPTH`. **Done when:** tests: cache freshness (3 reasons), "always four", "store failure -> defaults", "model failure -> defaults", "no history -> no model call".
- [x] 8.3 Route. **Where:** create `service/src/routes/suggestions.route.ts` (`GET /`, member). **Done when:** supertest returns 200 + 4 cards with a throwing store.

## 9. Tools menu

- [x] 9.1 Provider interface. **Where:** create `service/src/services/tool-menu.provider.ts`:
  ```ts
  export type MenuGroup = { mcp: string; toolNames: string[] };
  export interface ToolMenuProvider { listMenuGroups(ctx: { user: RequestUser; sessionId: string; locale?: string }): Promise<MenuGroup[]>; }
  let provider: ToolMenuProvider = { listMenuGroups: async () => [] };
  export const setToolMenuProvider = (p: ToolMenuProvider) => { provider = p; };
  export const getToolMenuProvider = () => provider;
  ```
  **Done when:** compiles; default returns `[]`.
- [x] 9.2 Port `tools.service.ts` (`toSessionTools`, negative-list helpers) from legacy (copy; delete `req`-based loaders). **Done when:** `tests/wire/tools-service.spec.ts`: descriptions dropped, absent = enabled.
- [x] 9.3 Controller + routes. **Where:** create `service/src/controllers/tools.controller.ts`; routes `GET|POST /:sessionId/tools`, `PUT /:sessionId/tools` in `session.route.ts` (after `loadSession`). **How:** port `updateSessionTools` validation and negative-list computation (legacy lines 174-257) using `sessions.patch(id,{disabledTools})`. **Done when:** supertest scenarios of `specs/session-tools-menu/spec.md` pass with a fake provider. **Watch out:** a group missing from the body must stay untouched.

## 10. Settings

- [x] 10.1 `SettingsService` + controller + routes. **Where:** create `service/src/services/settings.service.ts`, `controllers/settings.controller.ts`, `routes/settings.route.ts`. **How:** `GET /system-prompt` and `/tool-call-logs` = member; `PUT` = `requireAdmin` (D; backed by `ADMIN_USER_IDS`, 403 `ADMIN_REQUIRED`); validations per spec (string, <=20 000 chars; modes). `settings.patch({ systemPrompt })` preserves other fields. **Done when:** supertest (fake auth sets `req.user.isAdmin` true/false): admin PUT ok, non-admin PUT 403 `ADMIN_REQUIRED` (stored value unchanged), invalid mode 400, default mode `all` without write (spy on `SettingsStore.patch`).
- [x] 10.2 Request-scoped memo. **How:** `SettingsService.get()` stores the promise in the C request context; test "two calls, one store read".
- [x] 10.3 Forged-identity tests. **Why:** the browser must never decide admin status or ownership. **Where:** `service/tests/wire/forged-identity.spec.ts`. **How:** with a non-admin fake user (`isAdmin:false`), call `PUT /system-prompt`, `PUT /tool-call-logs`, `GET /session/<other user's id>` and `GET /session/all?userEmail=<admin address>` while sending header `x-admin-email`, body `userEmail`/`userLabel` and query `userEmail` equal to an admin address. **Done when:** PUTs answer 403 `ADMIN_REQUIRED` with nothing stored, the foreign session answers 404, the list holds only the caller's sessions. **Watch out:** the test must fail if any handler reads those values (spy on `req.headers['x-admin-email']` access is not needed; asserting outcomes is enough).

## 11. Contract test and wiring

- [x] 11.1 Contract test. **Where:** create `service/tests/contract/routes.spec.ts`. **How:** build the app with in-memory stores, walk `app._router.stack` recursively collecting `(method, fullPath)`, compare with a constant array copied from the table in `specs/rest-api-contract/spec.md` rows 1-25 plus row 28 `GET /files/:sessionId/:fileName` (L; `pendingUntil: 'L'`) (H/N rows are `todo` entries marked `pendingUntil: 'H'|'N'` that the test skips until those changes land - remove the skip in H/N tasks). **Done when:** test green; adding a stray route turns it red.
- [x] 11.2 Error-envelope test. **Where:** `service/tests/wire/error-envelope.spec.ts`: thrown `CustomError`, body-parser 413 (`entity.too.large`), unknown path 404 all contain `"success": false`. **Watch out:** if C's error middleware lacks `success`, change it there (small edit) and note it in the commit.
- [x] 11.3 Composition. **Where:** `service/src/app.ts`/`routes/service.route.ts`: mount `/session`, `/suggestions`, `/system-prompt`, `/tool-call-logs`. **Done when:** `npm run build && npm test` green.

## Last: Verification

- [x] Unit/wire tests: `tests/wire/{api-response,session-service,session-summary,session-routes,feature-flags,session-digest,turn-digest,suggestions,tools-service,settings,forged-identity}.spec.ts`, `tests/contract/routes.spec.ts`, `tests/wire/error-envelope.spec.ts`.
- [x] Local run with `MC_AUTH_DISABLED=true` (D) and the in-memory persistence: `curl -s -XPOST localhost:8080/service/session -H 'content-type: application/json' -d '{}'` -> `{"success":true,"data":{"id":"...","title":"New chat",...}}`.
- [ ] Chrome E2E (spec V implements; once P exists run against the app): **E2E-G-01** new chat creates a session shown in the drawer; **E2E-G-02** list/limit/delete leaves no orphan (network log shows 200 then 404); **E2E-G-03** digest arrives after a turn (title + chips); **E2E-G-04** `/suggestions` returns four cards for a new user and a model-less run; **E2E-G-05** tools menu toggle persists after reload; **E2E-G-06** admin user (A, user id in `ADMIN_USER_IDS`) saves the system prompt; non-admin user (B) PUT gets 403 `ADMIN_REQUIRED` and the UI hides the control; **E2E-G-07** custom-view session isolation (`customView` flag); **E2E-G-08** tool-call-log mode round trip. Evidence under `plans/evidence/G/`.
  Created Custom Objects (containers per `e-persistence-custom-objects/design.md` Appendix A) can be listed with `GET /custom-objects/ai-assistant-sessions` through the Merchant Center HTTP API playground or `curl`.
  Created Custom Objects (containers per `e-persistence-custom-objects/design.md` Appendix A) can be listed with `GET /custom-objects/ai-assistant-sessions` through the Merchant Center HTTP API playground or `curl`.
- [x] `commercetools connect validate` unchanged (no `connect.yaml` edits in G). `node scripts/spdx-check.mjs` clean. `openspec validate g-chat-sessions-and-digest --strict` passes.

## Docs to update (for change W)

- `docs/api.md`: copy the REST table from `specs/rest-api-contract/spec.md` (rows 1-25 and 28-30, the binary image route, which is not enveloped on success) and the envelope rules.
- Architecture doc: sessions/digest/suggestions data flow; digest is detached from the stream.
- FEATURES.md regeneration: remove `FEATURE_SESSION_DIGEST/NEXT_PROMPTS/SUGGESTIONS`, `migrate:session-tools`, `backfill-session-digests`; state "system prompt and tool-call-log writes need an administrator (Merchant Center user id listed in `ADMIN_USER_IDS`)"; note that sessions/messages are kept forever (no retention job).
- Config reference: no new env keys from G.
