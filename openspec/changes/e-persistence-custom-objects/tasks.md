## 0. Read first

- [x] 0.1 Read `proposal.md`, `design.md` in full (Explore findings P1-P15 and L1-L9, Decisions D1-D11, Appendix A containers, Appendix B interfaces), and all five specs in `specs/`.
- [x] 0.2 Read `plans/05-data-persistence.md` and the commercetools pages: https://docs.commercetools.com/api/projects/custom-objects.md, https://docs.commercetools.com/api/limits.md (JSON document size, Queries), https://docs.commercetools.com/api/predicates/query.md (Input variables, Performance considerations), https://docs.commercetools.com/api/general-concepts.md (Client resiliency, Strong consistency, Pagination).
- [x] 0.3 Read the legacy code (read-only), in this order: `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/utils/firestore.utils.ts` (skim all, read closely lines 444-910 chat, 1335-1600 feedback, 1806-2138 identity + suggestions), `src/utils/crypto.utils.ts`, `src/utils/feedback-snapshot.utils.ts`, `src/types/{chat,service,mcp,feedback}.types.ts`, `src/services/chat.service.ts` lines 385-470.

You should now be able to explain: (a) why messages are one object each in a per-session container and not packed in pages; (b) why `null` forces `partsJson`; (c) what happens on a 409 and why the SDK concurrency middleware is wrong here; (d) how a PKCE state is claimed exactly once across two instances without transactions; (e) which assumptions are only *probable* and which probe checks each; (f) why secrets are readable by anyone with `view_key_value_documents` and how encryption addresses it.

## 1. Setup

- [x] 1.1 Confirm spec C is merged (`ls service/src/config/index.ts service/src/client/create.client.ts`) and `cd service && npm test` is green.
- [x] 1.2 Branch: `git checkout -b spec/e-persistence-custom-objects`. (not needed: work happens on the harness branch)
- [x] 1.3 Create folders: `mkdir -p service/src/{persistence/{gateway,types,stores,feedback},crypto} service/tests/{unit/persistence,integration,helpers} service/scripts`.
  **Done when:** `find service/src/persistence -type d | sort` lists `gateway stores types feedback`.
- [ ] 1.4 Optional now, required in section 7: ask the owner for manual step M3 (scratch project, API client with `manage_key_value_documents` + `view_key_value_documents`) - section 7 tasks cannot run without it, sections 2-6 can.

## 2. Configuration and encryption

- [x] 2.1 Persistence config section.
  **Why:** fail-fast key validation (spec `secret-storage`).
  **Where:** `service/src/config/sections/persistence.ts` (replace C's placeholder; keep exported type name `PersistenceConfig`).
  **How:**
  ```ts
  export interface PersistenceConfig {
    driver: 'custom-objects' | 'memory';
    concurrency: number;                 // PERSISTENCE_CONCURRENCY default 8, 1..32
    settingsCacheTtlMs: number;          // SETTINGS_CACHE_TTL_MS default 5000, 0..60000
    encryptionKey: Secret<Buffer>;       // ENCRYPTION_KEY base64 -> exactly 32 bytes
    previousEncryptionKeys: Secret<Buffer>[]; // ENCRYPTION_KEY_PREVIOUS comma-separated base64, each 32 bytes
  }
  ```
  `PERSISTENCE_DRIVER` accepts `custom-objects|memory` (memory + production already refused by C task 3.4; keep that test). `ENCRYPTION_KEY` is required in all environments (tests set a fixed one). Messages: `ENCRYPTION_KEY: must be base64 of exactly 32 bytes (generate with: openssl rand -base64 32)` - never print the value or its length of what was supplied beyond "wrong length".
  **Done when:** `tests/unit/persistence/config.persistence.spec.ts` passes (defaults, bounds, weak key `password` rejected without echo, previous keys parsed).
  **Watch out:** `Buffer.from(x,'base64')` silently ignores junk - validate with a strict regex `^[A-Za-z0-9+/]{43}=$` before decoding (32 bytes -> 44 chars with one `=`).

- [x] 2.2 AES-256-GCM envelope helpers.
  **Why:** replace legacy `crypto.utils.ts` (no legacy layouts).
  **Where:** `service/src/crypto/envelope.ts`, `service/src/crypto/keys.ts` (new). Legacy source: `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/utils/crypto.utils.ts`.
  **How:**
  ```ts
  export type EncryptedKind = 'identity-client' | 'identity-tokens' | 'identity-verifier';
  export interface Envelope { v: 1; kind: EncryptedKind; kid: string; iv: string; tag: string; ct: string }
  export const kidOf = (key: Buffer) => createHash('sha256').update(key).digest('hex').slice(0, 8);
  export function encryptJson<T>(kind: EncryptedKind, value: T, aad: string, keys = loadKeys()): Envelope {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', keys.primary, iv);
    c.setAAD(Buffer.from(`${kind}|${aad}`));
    const ct = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
    return { v: 1, kind, kid: kidOf(keys.primary), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') };
  }
  export function decryptJson<T>(kind: EncryptedKind, env: Envelope | undefined, aad: string, keys = loadKeys()): T { /* check shape, kind, v===1; pick key by kid among primary+previous; setAAD; setAuthTag; JSON.parse */ }
  ```
  Throw `CryptoError` subclasses (`EnvelopeKindMismatch`, `EnvelopeKeyUnknown`, `EnvelopeAuthFailed`) with fixed messages; never include plaintext/ciphertext/aad values in messages.
  **Done when:** `tests/unit/persistence/envelope.spec.ts`: round trip; wrong aad fails; wrong kind fails; tampered ct/tag fails; rotation (encrypt with K1, decrypt with primary K2 + previous K1; new encrypt has K2's `kid`); error messages contain neither the secret nor the aad.
  **Watch out:** IV must be fresh per encryption (never derive from data); do not reuse the legacy 16-byte IV; do not log envelopes at `info`.

## 3. Gateway

- [x] 3.1 Errors, names, limits.
  **Where:** `service/src/persistence/gateway/errors.ts`, `service/src/persistence/names.ts`, `service/src/persistence/limits.ts`.
  **How:** error classes `PersistenceError` (base) -> `NotFoundError`, `ConflictError`, `TooLargeError`, `InvalidIdError`, `QueryLimitError`, `UnavailableError`. `names.ts`: `PREFIX = 'ai-assistant'`, `containers(prefix = PREFIX)` returning functions (`settings()`, `sessions()`, `messages(sessionId)`, ...) per Appendix A; `assertSafeName(s)` regex `^[A-Za-z0-9_.~-]{1,256}$`; `assertSafeId(s)` regex `^[A-Za-z0-9_-]{1,100}$`; `stateKey(state) = sha256hex`. `limits.ts`: `SOFT_OBJECT_BYTES = 1 MiB`, `HARD_OBJECT_BYTES = 6 MiB`, `FEEDBACK_CHUNK_BYTES = 524288`, `MAX_SNAPSHOT_BYTES = 24 MiB`, `PAGE = 500`, `MAX_OFFSET = 10000`, `KEYIN_MAX = 50`, `MESSAGES_CEILING = 10000`.
  **Done when:** `tests/unit/persistence/names.spec.ts`: `../x`, `a b`, 101-char id, empty -> `InvalidIdError`; `stateKey` of `abc+/=` is 64 hex chars.

- [x] 3.2 Query model and predicate compiler.
  **Where:** `service/src/persistence/gateway/query.ts`.
  **How:**
  ```ts
  export function compileQuery(q: ObjectQuery): { where: string[]; vars: Record<string, string>; sort: string[]; limit: number; offset: number; withTotal: boolean } {
    // validate limit 1..500, offset 0..10000 (QueryLimitError); sort field in allow-list
    // valueEquals -> `value(${path.split('.').reduceRight((inner, seg, i, a) => i === a.length-1 ? `${seg} = :v${n}` : `${seg}(${inner})`, '')})`
    // keyIn -> `key in :k0` with var.k0 repeated per key (<= 50)
    // time -> `createdAt > "2026-01-01T00:00:00.000Z"` only after /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/ test
  }
  ```
  Booleans/numbers as variables: values sent as strings in `var.vN`; numbers/booleans need literal comparison without quotes - **check against the real API in probe 7.3 (`P-var-types`)**; until proven, restrict `valueEquals` to strings and booleans formatted `true|false` inline (validated) and numbers inline (validated finite).
  **Done when:** `tests/unit/persistence/query.spec.ts`: nested path `featureFlags.customView` -> `value(featureFlags(customView = :v0))`; hostile string stays in `vars`; bad path/iso/limit/sort rejected; `keyIn` with 51 keys rejected.
  **Watch out:** variable names must be alphanumeric (`v0`, `k0`) per the docs; the same variable may repeat for arrays.

- [x] 3.3 `CustomObjectGateway`.
  **Where:** `service/src/persistence/gateway/custom-object.gateway.ts`. Uses `getApiRoot()` from spec C.
  **How:**
  ```ts
  export class CustomObjectGateway implements ObjectGateway {
    constructor(private readonly root: ByProjectKeyRequestBuilder = getApiRoot()) {}
    async get(c, k) { return this.call(() => this.root.customObjects().withContainerAndKey({ container: assertSafeName(c), key: assertSafeName(k) }).get().execute()).then(r => r.body).catch(notFoundToNull); }
    async put(c, k, value, o) { checkSize(value); const body = { container: c, key: k, value, ...(o?.ifVersion != null ? { version: o.ifVersion } : {}) }; ... .customObjects().post({ body }).execute() }
    async delete(c, k, o) { ... withContainerAndKey(...).delete({ queryArgs: o?.ifVersion != null ? { version: o.ifVersion } : {} }) ; 404 -> null; 409 -> ConflictError }
    async query(c, q) { const cq = compileQuery(q); ... .customObjects().withContainer({ container: c }).get({ queryArgs: { where: cq.where, sort: cq.sort, limit, offset, withTotal, ...vars } }) }
  }
  ```
  Map errors: SDK error `statusCode` 404 -> null/NotFound, 409 -> `ConflictError` (keep `currentVersion` from `body.errors[0].currentVersion`), 400 `InvalidInput`/`ResourceSizeLimitExceeded` -> `TooLargeError`/`PersistenceError`, 429/502/503/504/network -> retry (task 3.4) then `UnavailableError`. `queryArgs` for variables are passed as `{ 'var.v0': 'x' }`.
  **Done when:** `tests/unit/persistence/custom-object.gateway.spec.ts` (msw against the CT API host): URL/method/body of each call; `where` + `var.v0` encoded as expected; 404 -> null; 409 -> `ConflictError` with `currentVersion`; no request is made for an unsafe name.
  **Watch out:** `version` in the draft means "must match" - never send `version: 0` or a guess. Do NOT enable `concurrentModificationMiddleware` on the client. Check the real SDK method names (`customObjects().withContainerAndKey`, `.withContainer`) in the installed typings before copying.

- [x] 3.4 Retry, bounded concurrency, CAS helper.
  **Where:** `service/src/persistence/gateway/retry.ts`, `.../concurrency.ts`, `.../cas.ts`.
  **How:**
  ```ts
  export async function withTransportRetry<T>(fn: () => Promise<T>, o = { attempts: 3, baseMs: 200 }): Promise<T> // retry 429/502/503/504/ECONNRESET/ETIMEDOUT; honour Retry-After seconds; else baseMs*2^n +- 50% jitter
  export async function mapBounded<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> // stop scheduling after first rejection
  export const SKIP = Symbol('skip');
  export async function updateWithRetry<V>(gw: ObjectGateway, container: string, key: string,
    mutate: (cur: V | null) => V | typeof SKIP, o?: { attempts?: number; sleep?: (ms: number) => Promise<void> }): Promise<{ value: V; object: StoredObject }> {
    for (let attempt = 0; ; attempt++) {
      const cur = await gw.get(container, key);
      const next = mutate(cur ? (cur.value as V) : null);
      if (next === SKIP) return { value: (cur?.value as V), object: cur! };
      try { const object = await gw.put(container, key, next, { ifVersion: cur?.version }); return { value: next, object }; }
      catch (e) { if (!(e instanceof ConflictError) || attempt + 1 >= (o?.attempts ?? 5)) throw e; await (o?.sleep ?? sleep)(backoff(attempt)); }
    }
  }
  ```
  When creating (no `cur`), omit `ifVersion` (creation races surface as `ConflictError` from the platform, retried).
  **Done when:** `tests/unit/persistence/{retry,concurrency,cas}.spec.ts`: Retry-After honoured with injected sleep; max-in-flight never exceeds the limit (use counters); two interleaved CAS updaters both land; 5 consecutive conflicts -> `ConflictError`; SKIP does not write.
  **Watch out:** the mutate function can run several times - it must be pure.

- [x] 3.5 `MemoryObjectGateway`.
  **Where:** `service/src/persistence/gateway/memory.gateway.ts`.
  **How:** `Map<container, Map<key, StoredObject>>`; ids `crypto.randomUUID()`; **JSON round-trip on every put and get** (`JSON.parse(JSON.stringify(v))`) so `undefined`/`null` members vanish like the real service; versions start at 1 and increment; `createdAt` fixed at creation, `lastModifiedAt` bumped; timestamps from an injectable clock that is strictly monotonic (+1 ms when equal) so ordering tests are deterministic; implement `ifVersion` mismatch -> `ConflictError`; `put` with `ifVersion` on a missing object -> `ConflictError`; `query` applies filters (`valueEquals` via path walk, `keyIn`, `time`), sort, offset/limit, `total` (capped at 10000 when filters present, exact otherwise); enforce the same `assertSafeName`, size guard (`HARD_OBJECT_BYTES`) and `QueryLimitError`. Throw in the constructor when `NODE_ENV==='production'`.
  **Done when:** `tests/unit/persistence/memory.gateway.spec.ts` covers nulls dropped, version semantics, delete with version, sort/limit/offset/total, time filter.

- [x] 3.6 Shared gateway contract suite.
  **Where:** `service/tests/helpers/gateway-contract.ts` exporting `describeGatewayContract(name, makeGateway)`; `service/tests/unit/persistence/gateway.contract.memory.spec.ts` calls it with `MemoryObjectGateway`.
  **How:** scenarios from `specs/object-gateway/spec.md`: missing -> null, conflict, nulls dropped, version increments, delete missing -> null, query filters/sort/limit/offset/total, `keyIn`, size guard, hostile string filter.
  **Done when:** suite green for memory. (Section 7 runs the same function against the real gateway.)

## 4. Stores: settings, suggestions, sessions, messages

- [x] 4.1 Types and codecs.
  **Where:** `service/src/persistence/types/{session,message,settings,suggestion,identity,feedback}.ts`. Copy shapes from legacy `src/types/{chat,service,feedback}.types.ts`.
  **How:** apply the changes in the Source map: `projectKey` removed, `userEmail` -> `userId` + `userLabel?`, `Date` -> epoch-ms `number`, `Envelope` from task 2.2, `IdentityMcpBindingRecord` mirrors legacy `IdentityMcpConfig`/`IdentityMcpClient`/`IdentityMcpDiscovery` with numbers for dates. Add `schemaVersion: 1` to every stored value. Codecs: `toValue(domain) -> JSON-safe`, `fromValue(value) -> domain` (default missing optional fields, tolerate unknown fields).
  **Done when:** `npm run typecheck` passes; `tests/unit/persistence/codecs.spec.ts` round-trips one sample of each type through `JSON.parse(JSON.stringify(...))`.
  **Watch out:** never put `Date` objects or `undefined` in a value; never rely on `null` surviving.

- [x] 4.2 `SettingsStore`.
  **Where:** `service/src/persistence/stores/settings.store.ts`.
  **How:** `get()` returns cached value if `ttl>0 && fresh`, else `gw.get('ai-assistant-settings','default')` and maps via codec (defaults when absent: `{schemaVersion:1, systemPrompt:'', toolCallLogs:'all', updatedAt:0}`); `update(mutate)` -> `updateWithRetry`, validate `toolCallLogs` in `none|thinking|tools|all` (throw `ValidationError` mapped to 400), set `updatedAt = Date.now()`, invalidate cache. Legacy: `firestore.utils.ts` 1604-1740, 1806-1900.
  **Done when:** `tests/unit/persistence/settings.store.spec.ts`: defaults, partial concurrent updates both visible, invalid mode rejected, cache TTL 0 vs >0 (use fake timers), `identityMcp` round trip with numeric `connectedAt`.

- [x] 4.3 `SuggestionStore`.
  **Where:** `.../stores/suggestion.store.ts`. Legacy: `firestore.utils.ts` 2092-2138 (note: key becomes `userId`, no project part).
  **How:** `get` returns `null` on any error (log warn); `set` swallows errors (log warn).
  **Done when:** `tests/unit/persistence/suggestion.store.spec.ts` incl. failing-gateway cases.

- [x] 4.4 `SessionStore`.
  **Where:** `.../stores/session.store.ts`. Legacy: `firestore.utils.ts` 444-640.
  **How:**
  - `create`: `gw.put(container, id, value)` guarded: first `get`; if present throw `ConflictError`; (race: second writer gets the platform conflict because we pass no version only when absent - use `updateWithRetry` with `mutate(cur => cur ? throw : value)`.)
  - `get`: `assertSafeId(id)`.
  - `update(id, mutate)`: `updateWithRetry`; `NotFoundError` when `cur===null`; always set `updatedAt = Date.now()`.
  - `touch(id)`: `update(id, s => ({...s}))` inside try/catch (warn).
  - `listByUser(userId, {limit, featureFlags})`: loop pages of 500: `query(container, { filters:[{kind:'valueEquals',path:'userId',value:userId}], sort:{field:'lastModifiedAt',dir:'desc'}, limit:500, offset })` until `limit` reached or <500 results or offset 10000; map codec; then in-memory flag match (`matchesFlags(session.featureFlags, requested)`: no request flags -> session has no flags; request flags -> every given key equals).
  - `listAll`: `valueEquals(userId)` if given + `time` filters, sorted `createdAt desc`, `withTotal: true`.
  - `delete`: `gw.delete(container,id)` -> boolean.
  **Done when:** `tests/unit/persistence/session.store.spec.ts`: create twice -> Conflict; concurrent digest + touch; isolation between users; flag filtering; ordering by recency (touch moves a session to the top); `listAll` time range; > 500 sessions paged; invalid id rejected.
  **Watch out:** `lastModifiedAt` changes on every write including `touch` - that is the intended "recent activity" order. Do not filter with negations.

- [x] 4.5 `MessageStore`.
  **Where:** `.../stores/message.store.ts`. Legacy: `firestore.utils.ts` 648-850, `chat.service.ts` 385-470.
  **How:**
  ```ts
  async put(sessionId, messages) {
    const container = containers.messages(assertSafeId(sessionId));
    let last = this.lastTs.get(sessionId) ?? 0;              // per-process memo only; correctness comes from createdAt
    const out: StoredMessage[] = [];
    for (const m of messages) {                               // SEQUENTIAL on purpose
      const ts = Math.max(m.timestamp ?? Date.now(), last + 1); last = ts;
      const value = { v: 1, id: m.id, role: m.role, timestamp: ts, partsJson: JSON.stringify(m.parts) };
      await this.gw.put(container, assertSafeId(m.id), value);
      out.push({ ...m, timestamp: ts });
    }
    this.lastTs.set(sessionId, last); return out;
  }
  ```
  `list(sessionId, {limit, order})`: desc + limit N -> single query then reverse; full read -> pages of 500 sorted `createdAt asc` using offset up to 10000 (`SessionTooLongError` beyond); after reading re-sort by `(timestamp, id)` within the whole result. `count`: `limit:1, withTotal:true` -> `total`. `has`: chunks of 50 with `keyIn` -> `Set`. `delete`, `get`. `deleteAll(sessionId)`: loop { `query` `limit:500, withTotal:false` sorted `key asc` (no offset!) ; if empty break; `mapBounded(results, concurrency, r => gw.delete(container, r.key))` } returns count.
  **Done when:** `tests/unit/persistence/message.store.spec.ts`: nulls survive; order for a batch; upsert keeps position and count; newest-N; 1 200-message read uses 3 queries (spy); `has` chunking; `deleteAll` respects concurrency (spy on in-flight); invalid message id rejected.
  **Watch out:** message ids from the AI SDK are short random strings - validate with `assertSafeId`; if a client sends something else, the controller gets `InvalidIdError` (400) instead of corrupting a key. A message part larger than 6 MiB throws `TooLargeError`: spec G strips big tool outputs before storing.

- [x] 4.6 `deleteSessionCascade`.
  **Where:** `service/src/persistence/index.ts` (function) - add after the factory exists (task 6.1).
  **How:** `const had = await p.sessions.get(id); await p.messages.deleteAll(id); await p.sessions.delete(id); return Boolean(had)`.
  **Done when:** unit test: 50 messages removed then session; failure injected after 20 deletes, rerun completes.

## 5. Stores: secrets, feedback

- [x] 5.1 `TokenStore` - token records.
  **Where:** `.../stores/token.store.ts`. Legacy: `firestore.utils.ts` 1906-2000.
  **How:** key = `assertSafeId(userId)`; value stores `encryptedTokens: encryptJson('identity-tokens', tokens, aad=userId)` (the domain `IdentityTokenRecord` carries the encrypted envelope already - the store never sees plaintext; the identity spec I calls `encryptJson`). `putTokens`: `updateWithRetry` with mutate returning `SKIP` when `cur.issuedAt > record.issuedAt` -> result `'stale-ignored'`.
  **Done when:** `tests/unit/persistence/token.store.spec.ts`: out-of-order grants; raw object (read via gateway) contains none of the token strings (use a fake token `SECRET-TOKEN-123` and grep the JSON).

- [x] 5.2 `TokenStore` - PKCE states and sweeping.
  **Where:** same file.
  **How:**
  ```ts
  async createAuthState(r) { maybeSweep(); await this.gw.put(C.states(), stateKey(r.state), toValue(r)); }  // encryptedVerifier aad = stateKey
  async claimAuthState(state) {
    const key = stateKey(state);
    const obj = await this.gw.get(C.states(), key);
    if (!obj) return { outcome: 'unknown' };
    const rec = fromValue(obj.value);
    const won = await this.gw.delete(C.states(), key, { ifVersion: obj.version }).catch(e => e instanceof ConflictError ? null : Promise.reject(e));
    if (!won) return { outcome: 'unknown' };
    if (rec.expiresAt <= Date.now()) return { outcome: 'expired', ageMs: Date.now() - rec.createdAt };
    return { outcome: 'claimed', record: rec };
  }
  async sweepExpiredAuthStates({ olderThanMs = 3_600_000, max = 100 } = {}) { /* time filter createdAt < now-olderThan, sort createdAt asc, limit max, mapBounded delete */ }
  ```
  `maybeSweep`: module-level timestamp; at most once per 60 s; `void this.sweepExpiredAuthStates().catch(warn)`.
  **Done when:** tests: replay (second claim `unknown`); two concurrent claims -> exactly one `claimed` (`Promise.all`); expired -> `expired` and object removed; sweep deletes only old; sweep failure never throws from `createAuthState`.
  **Watch out:** delete-with-version returning 404/409 both mean "someone else won" (probe `P-claim` confirms which one the platform returns). Never log the raw `state`.

- [x] 5.3 Feedback chunk helpers.
  **Where:** `service/src/persistence/feedback/chunks.ts`. Legacy: `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/utils/feedback-snapshot.utils.ts` lines 45-100, 175-295 (`byteLength`, `truncateToBytes`, `snapshotChunkDocId`, `buildSnapshotChunks`, `reassembleSnapshot`).
  **How:** copy; change the default chunk size to `FEEDBACK_CHUNK_BYTES` (524288); keep byte-boundary logic untouched. Leave `stripInlineDataUrls`, comment/system-prompt caps for spec N.
  **Done when:** `tests/unit/persistence/feedback-chunks.spec.ts` (port the legacy chunk tests if any exist under `.../tests`; otherwise write): 1.3 MB -> 3 chunks each <= 524288; multibyte at the boundary; empty message -> one empty chunk; reassembly equality; out-of-order input re-sorted.

- [x] 5.4 `FeedbackStore`.
  **Where:** `.../stores/feedback.store.ts`. Legacy: `firestore.utils.ts` 1335-1600.
  **How:** `put`: `mapBounded(chunks, concurrency, c => gw.put(C.feedbackSnap(record.id), c.docId, { index, chunk, chunks, role?, payload }))` then **only after all resolve** `gw.put(C.feedback(), record.id, toValue(record))`. `list`: `time` + `valueEquals('userId')`, sort `createdAt desc`, `withTotal`, map to the list projection (`FEEDBACK_LIST_FIELDS` minus `projectKey`, plus `userId`). `get`: parent, then snapshot pages sorted `key asc` (500/page) -> `reassembleSnapshot`. `delete`: parent first (`gw.delete`), then loop deleting snapshot keys in pages of 500 with `mapBounded`.
  **Done when:** `tests/unit/persistence/feedback.store.spec.ts`: parent-last on failure injection (3rd chunk throws -> no parent, not listed); reassembly byte-identical for a transcript containing emoji and `null` JSON; projection excludes `systemPrompt`; delete order (spy order: parent delete precedes chunk deletes); re-run after interruption.
  **Watch out:** payload stays a *string* (legacy reason differs, ours is null-preservation and fidelity); the record value itself may lose `null` members - the record type must not use `null` meaningfully.

## 6. Factory, error mapping, scripts

- [x] 6.1 `createPersistence` and exports.
  **Where:** `service/src/persistence/index.ts`, `.../create-persistence.ts`.
  **How:** choose gateway by `cfg.persistence.driver` (`memory` -> `MemoryObjectGateway`, else `CustomObjectGateway`) unless `opts.gateway` is given; wire stores with `{ gw, containers(prefix), concurrency, keys }`; export interfaces + types + `deleteSessionCascade` + `SKIP`. Memoise a process-wide instance via `getPersistence()` for the app; tests call `createPersistence` directly.
  **Done when:** `tests/unit/persistence/factory.spec.ts`: memory driver returns working stores; passing a custom gateway is honoured; prefix override applied to container names.

- [x] 6.2 Error mapping.
  **Where:** edit `service/src/middleware/error.middleware.ts` (spec C file) adding `mapPersistenceError`.
  **How:** `NotFoundError|InvalidIdError` -> 404, `ConflictError` -> 409 (message `Conflict, please retry`), `TooLargeError` -> 413, `UnavailableError` -> 503, `ValidationError` -> 400, others unchanged. Messages generic; log details at warn with the container name only.
  **Done when:** `tests/unit/persistence/error-mapping.spec.ts` via supertest on a throwing route for each class.

- [x] 6.3 Maintenance scripts.
  **Where:** `service/scripts/purge-containers.mjs`, `service/scripts/reencrypt.mjs` (plus npm scripts `persistence:purge`, `persistence:reencrypt`).
  **How:** purge: needs `--prefix` (refuses `--prefix ''` and prefixes not starting with `ai-assistant-it-` unless `--i-know`), lists known container names (settings, sessions, ... and for per-session containers discovers ids by listing the sessions container), deletes in bounded batches. reencrypt: with `ENCRYPTION_KEY` (new) and `ENCRYPTION_KEY_PREVIOUS` set, iterates tokens, auth states, identity binding secrets: decrypt (any known key) -> encrypt (primary) -> CAS write; prints counts, never values; `--dry-run`.
  **Done when:** unit tests run both scripts' core functions against `MemoryObjectGateway` (export the logic from `src/persistence/maintenance.ts`; the `.mjs` files are 10-line wrappers).

## 7. Live verification (manual step M3 required)

- [x] 7.1 Integration Jest config.
  **Where:** `service/jest.integration.config.cjs`, npm script `test:integration`.
  **How:** copy `jest.config.cjs`, `testMatch: ['**/tests/integration/**/*.spec.ts']`, `testTimeout: 60000`; each suite starts with `const live = Boolean(process.env.CTP_CLIENT_SECRET); const d = live ? describe : describe.skip;`; script `node --env-file=.env.local --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.integration.config.cjs`.
  **Done when:** without `.env.local` the script reports all suites skipped, exit 0.

- [ ] 7.2 Contract suite on the real gateway.
  **Where:** `service/tests/integration/contract.custom-objects.spec.ts`.
  **How:** `describeGatewayContract('custom-objects', () => new CustomObjectGateway())` with all names under prefix `ai-assistant-it-<random>-` (use `containerPrefix` in the factory; for raw gateway tests build names with the same prefix helper); `afterAll` calls the purge function for that prefix. Also run the store-level contract tests (sessions/messages/feedback/tokens) through `createPersistence(cfg, { containerPrefix })`.
  **Done when:** green against the scratch project; paste the final summary line into the PR.

- [ ] 7.3 Fact probes.
  **Where:** `service/tests/integration/probes.spec.ts` (one `test` per id, each with a comment naming the design.md fact).
  **How:** `P-charset` create keys `a b`, `a:b`, `a@b`, `a/b`, `é`, and a 257-char key -> expect the API to reject (400) and `a_b.c~d-e` accepted (records the real rule); `P-created` put twice, assert `createdAt` unchanged and `lastModifiedAt` increased and `version` 1 -> 2; `P-409` stale `ifVersion` -> 409 with `currentVersion`; `P-claim` create then two parallel `delete(ifVersion)` -> exactly one non-null (record whether the loser sees 404 or 409); `P-list-after-write` put then query immediately 20 times -> always visible; `P-var` `valueEquals` string via `var.v0`, and numeric/boolean variants (decides task 3.2 restriction); `P-keyin` 50 keys; `P-sort` `createdAt asc/desc`, `key asc`, `lastModifiedAt desc`; `P-order` 50 sequential puts -> `createdAt asc` equals append order (spec message-order probe); `P-null` null member dropped; `P-size` 1.9 MB value accepted, 3 MB accepted (soft only), and a request over `HARD_OBJECT_BYTES` is refused client-side (do NOT send 16 MB); `P-offset` offset 10001 -> error; `P-limit` limit 501 -> error; `P-total` total with and without predicate.
  **Done when:** all probes pass or each failing probe is documented in `design.md` Appendix C with the consequence and the fallback decision (D2/D5) taken.
  **Watch out:** probes create real objects: always under the random prefix; keep each probe under ~2 s and the whole file under 2 minutes.

- [ ] 7.4 Session-list benchmark.
  **Where:** `service/tests/integration/perf.sessions.spec.ts` (runs only when `PERF=1`).
  **How:** seed 5 000 sessions across 20 user ids with `mapBounded` (concurrency 8); measure 50 calls of `listByUser(u, {limit: 100})`; assert p95 < 1000 ms; also measure `listAll({limit:50})`. Clean up with purge.
  **Done when:** numbers recorded in design.md Appendix C. If p95 >= 1 s: STOP, implement the fallback index in `SessionStore` only (D5) before merging.

- [ ] 7.5 Record the results.
  **Where:** `openspec/changes/e-persistence-custom-objects/design.md` Appendix C (amend through `/opsx:update e-persistence-custom-objects`, note it in a `## Changelog` section).
  **Done when:** a table with one row per probe and the benchmark numbers exists.

## Last: Verification

- [x] V.1 Unit tests (`cd service && npm test`): `tests/unit/persistence/{config.persistence,envelope,names,query,custom-object.gateway,retry,concurrency,cas,memory.gateway,gateway.contract.memory,codecs,settings.store,suggestion.store,session.store,message.store,token.store,feedback-chunks,feedback.store,factory,error-mapping,maintenance}.spec.ts`.
- [ ] V.2 Integration (needs M3): `npm run test:integration` (contract + probes) and `PERF=1 npm run test:integration -- perf.sessions` once.
- [ ] V.3 `npm run typecheck && npm run lint && npm run check:foundation && npm run build`; `commercetools connect application test` exit 0; `commercetools connect validate` exit 0 (confirm `connect.yaml` has `view_key_value_documents` + `manage_key_value_documents` under `inheritAs.apiClient.scopes`, `ENCRYPTION_KEY` in `securedConfiguration`, and does NOT contain `PERSISTENCE_DRIVER`).
- [x] V.4 Grep gates: `grep -rn "firestore\|Firestore\|tenant" service/src/persistence service/src/crypto` -> no output; `grep -rln "customObjects()" service/src` -> only `persistence/gateway/custom-object.gateway.ts` (and spec M's page tool if present).
- [x] V.5 Chrome E2E: none directly (no UI). The feature specs G/I/N own scenarios (`E2E-G-*`, `E2E-I-*`, `E2E-N-*`) that exercise this layer through the app; each of their `tasks.md` carries a note pointing at `design.md` Appendix A to find the created Custom Objects (`GET /custom-objects/ai-assistant-sessions` via the MC HTTP API playground or `curl`). (done: the note is in the tasks of G, I and N)
- [x] V.6 Definition of Done (`plans/04-workflow.md` section 4): SPDX headers, no `console.log`, no `any`, no tenant words.

## Docs to update (for spec W)

- Data model page: Appendix A table (containers, keys, what is encrypted), the "why object per message" reasoning, retention statement (messages and feedback are kept forever, there is no cleanup job; how to delete explicitly: `deleteSessionCascade` / feedback delete, and `persistence:purge` for test containers).
- Operations: scopes required (`view_key_value_documents`, `manage_key_value_documents`) and the warning that project members with those scopes can read stored objects (secrets are encrypted); `ENCRYPTION_KEY` generation (`openssl rand -base64 32`), backup, rotation (`ENCRYPTION_KEY_PREVIOUS` + `npm run persistence:reencrypt`).
- Troubleshooting: 409 retries in logs, 503 `UnavailableError`, 413 `TooLargeError`, "session too long".
- Developer guide: running with `PERSISTENCE_DRIVER=memory`, running integration tests (M3), adding a new store (gateway + codec + contract test).
- Limits table copied from `design.md` P1-P15 with their sources.
