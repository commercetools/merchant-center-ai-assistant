# Adding a store

A guide for developers who need the service to keep a new kind of data. All durable state of the connector lives
in commercetools Custom Objects, and every read and write goes through one gateway. A "store" is the small class
that owns one kind of data on top of that gateway. Read [architecture.md](./architecture.md#data-model) for the
containers that exist and [operations.md](./operations.md#data-retention) for what is kept and for how long.

The example is a hypothetical store of per-user bookmarks. Names are placeholders.

## The pieces

| Piece | File | Role |
| --- | --- | --- |
| Gateway | `service/src/persistence/gateway/types.ts` | `get`, `put` (create or replace, optional `ifVersion`), `delete` and `query` of one container |
| Real gateway | `service/src/persistence/gateway/custom-object.gateway.ts` | Calls the commercetools API with a timeout, retries and the size check |
| Memory gateway | `service/src/persistence/gateway/memory.gateway.ts` | Same contract in memory, used by every unit test and by `PERSISTENCE_DRIVER=memory` |
| Container names | `service/src/persistence/names.ts` | One function per container; identifiers are validated here |
| Value types | `service/src/persistence/types/` | The domain type, `xToValue` and `xFromValue` |
| Stores | `service/src/persistence/stores/` | One class per kind of data, plus its interface |
| Wiring | `service/src/persistence/create-persistence.ts` | Builds every store once and exposes them as `Persistence` |
| Limits | `service/src/persistence/limits.ts` | Object size, page size and offset limits |

## Steps

1. **Name the container and the key.** Add a function to `containers()` in `names.ts`, for example
   ``bookmarks: () => `${prefix}-bookmarks` ``. Use one container per kind of data and a stable key (the user ID,
   the session ID). Keys that come from a caller must go through `assertSafeId`; a value that is not an identifier
   (an OAuth state, for example) must be hashed first, as `stateKey` does. Per-parent containers
   (`ai-assistant-messages-<sessionId>`) exist for data that grows without bound and is deleted with its parent.
2. **Describe the value.** Add `types/bookmark.ts` with the domain type, `bookmarkToValue` and `bookmarkFromValue`.
   Store dates as epoch milliseconds or ISO strings, never as `Date` objects. Do not store `null` members (the
   platform drops them) and tolerate unknown or missing fields when reading, so that an older or newer object
   still loads. Add a `schemaVersion` when the shape may change.
3. **Write the store.** Add `stores/bookmark.store.ts` with an interface and a `Gateway...Store` class that takes
   `StoreDeps` (`gw`, `c`, `concurrency`). Rules:
   - Read with `deps.gw.get`; a missing object is `null`.
   - Change an existing object with `updateWithRetry` (`service/src/persistence/gateway/cas.ts`): it re-reads and
     re-applies your function on a version conflict. The function must be pure because it can run several times.
     Return `SKIP` when nothing changes.
   - Create with a plain `put`; a second creator surfaces as `ConflictError`.
   - Listings use `deps.gw.query` with an `ObjectQuery`. A page is at most 500 results and `offset` is capped at
     10,000 (`limits.ts`); for more rows, page with a key filter instead of a larger offset.
   - Decide for each store whether a failure is fatal or a cache miss. The suggestion store treats every failure
     as a miss (`stores/suggestion.store.ts`); the session store lets errors propagate so that routes answer 503.
   - Never put a secret in a value in clear text. Encrypt it with `service/src/crypto/envelope.ts` and bind the
     ciphertext to its record with the associated data, as `stores/token.store.ts` does.
   - Keep each object well below the 1 MiB soft limit; a write above the hard limit is refused before any request
     (`limits.ts`, `gateway/size.ts`). Split large data over several objects, as the feedback snapshot does.
4. **Wire it.** Add the field to the `Persistence` interface and construct the store in `createPersistence`.
   Export the types from `service/src/persistence/index.ts` if other modules need them.
5. **Clean up.** If the data belongs to a session or a user, decide when it is deleted. Session deletion runs
   through `deleteSessionCascade` and the cleanup hooks (`service/src/analytics/cleanup/bigquery-hook.ts` is an
   example); add your own step there. If a new top-level container must be removed by the test purge script, add it
   to the list in `service/src/persistence/maintenance.ts`.
6. **Test it.** Use `makePersistence()` from `service/tests/helpers/persistence.ts`, which builds the layer over the
   memory gateway. Copy `service/tests/unit/persistence/suggestion.store.spec.ts` for the shape: a round trip, a
   missing object, a conflict (wrap the gateway to force one) and a failing gateway. The shared gateway contract in
   `service/tests/helpers/gateway-contract.ts` runs against the memory gateway
   (`service/tests/unit/persistence/gateway.contract.memory.spec.ts`) and, as a live variant,
   against the real one (`service/tests/integration/contract.custom-objects.spec.ts`), which needs a scratch project and is skipped without
   credentials.
7. **Document it.** Add the container to the table in [architecture.md](./architecture.md#data-model) and, if it
   holds user data, to [privacy.md](./privacy.md).

## Things that surprise people

- The memory gateway mimics versions and conflicts, but it cannot reproduce platform limits or eventual
  consistency. Run the integration suite against a scratch project before relying on a query shape.
- Containers are created implicitly by the first write; there is no migration step. Renaming a container strands
  the old data, so treat container and key names as part of the public contract of an installation.
- Undeploying the connector does not delete Custom Objects, so a store has to be safe to find old data
  (`service/src/connector/pre-undeploy.ts`).
- A store must never receive an identity from the browser. The user ID comes from the verified token
  (`req.user`), and `npm run check:foundation` fails the build if request code reads identity hints from the
  client.
