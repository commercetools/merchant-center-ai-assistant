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
