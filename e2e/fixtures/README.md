# E2E fixtures

`composed-pages/*.json` are the inputs of five composed pages for the composed-apps scenarios
(`E2E-R-*`). `node scripts/e2e/seed.mjs composed-pages` turns each input into a stored page with the
service's own `createComposedPage` (build the service first: `cd service && npm run build`), so the
stored schema is exactly what the assistant would write, and writes it as a Custom Object into the
composed-pages container. The keys start with `e2e-`, which is the only thing
`scripts/e2e/cleanup.mjs` is allowed to delete.

| Key | Purpose |
|---|---|
| `e2e-orders` | published page with one valid platform data source |
| `e2e-draft` | draft page (`isPublished: false`) for the Draft badge |
| `e2e-broken` | component that throws while rendering (error boundary) |
| `e2e-bq` | legacy `BIG_QUERY` data source next to a valid one (per-source error isolation) |
| `e2e-param` | variable bound to the route param `:orderId` |

No customer data: the queries only count orders or products of the scratch project.

## Seeds with parameters

`seeds/*.json` define the two seeds that are not page fixtures:

| Seed | Command | Purpose |
|---|---|---|
| `sessions-many` | `node scripts/e2e/seed.mjs sessions-many --user-id <id> [--count N]` | writes N sessions (keys `e2e-sm-0001...`, titles `e2e-many-0001...`, default 120, at most 1000) owned by the given user, for list paging and the 500-session cap (`--count 520`) |
| `large-snapshot` | `node scripts/e2e/seed.mjs large-snapshot [--out <dir>] [--user-id <id>]` | writes two feedback request bodies of about 6 MiB (must be stored) and 11 MiB (must be refused readably) for `E2E-N-02`; with `--user-id` it also writes the session `e2e-large-snapshot` the bodies refer to |

Both use only `e2e-` keys, so `scripts/e2e/cleanup.mjs --sweep` removes what they create; `--dry-run`
writes nothing to the project.
