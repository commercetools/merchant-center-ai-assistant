## ADDED Requirements

### Requirement: Custom Application identity and menu entry
The `composed-apps` application SHALL be a Merchant Center Custom Application named "AI Assistant Pages" whose `entryPointUriPath`, `applicationId`, `url` and `cloudIdentifier` are read exclusively from `${env:...}` placeholders in `custom-application-config.mjs`, with a main-menu link labelled "AI Assistant Pages" guarded by the app's implicit View permission.

#### Scenario: Menu entry visible to a user with View permission
- **WHEN** a user with the application's View permission opens the Merchant Center in the test project
- **THEN** the main menu contains an entry "AI Assistant Pages" and following it loads `/{projectKey}/{entryPointUriPath}`

#### Scenario: No hard-coded project values
- **WHEN** `custom-application-config.mjs` and `src/**` are scanned for the legacy project key, dev-tunnel hosts and application ids
- **THEN** no match is found and every per-deployment value comes from an environment placeholder

### Requirement: Composed pages list
The application SHALL list every composed page stored as a Custom Object in the composed-pages container (name from change M, default `shared-composed-pages`) in a sortable table showing name, key, icon, Published/Draft status and created/updated dates, and SHALL navigate to `/:pageKey` when a row is activated.

#### Scenario: Table shows seeded pages
- **WHEN** the container holds two pages `e2e-orders` and `e2e-draft` and the user opens the app root
- **THEN** a table with both rows is shown, `e2e-draft` carries the "Draft" badge and `e2e-orders` the "Published" badge

#### Scenario: Empty container
- **WHEN** the container holds no pages
- **THEN** an informational message states that no composed pages are available and tells the user pages are created in the AI Assistant chat

#### Scenario: Pagination beyond one request
- **WHEN** the container holds more pages than a single GraphQL page returns
- **THEN** the list loads every page (offset pagination up to the Custom Object limits verified in change E) and shows the total count

### Requirement: Page rendering
The application SHALL render a stored page of schema version 5.0 by transpiling each component's JSX in the browser and executing it with the documented injected scope (React, react-router-dom v5 members, the Nimbus export surface, `Icons`, `Chart`), inside an error boundary keyed by page key and schema version.

#### Scenario: Valid page renders
- **WHEN** the user opens `/e2e-orders` for a valid v5.0 page
- **THEN** the component tree renders, a back button returns to the list, and no console error is logged

#### Scenario: Generated code throws
- **WHEN** a stored component throws while rendering
- **THEN** the error boundary shows a diagnostic naming the phase (`decode`, `transpile`, `execute`, `render` or `data-fetch`) and the component, and the Merchant Center chrome stays usable

#### Scenario: Unknown key
- **WHEN** the user opens `/does-not-exist`
- **THEN** a warning alert "Page not found: does-not-exist" is shown instead of a blank page

#### Scenario: Unsupported schema version
- **WHEN** a stored page has a schema version other than 5.0
- **THEN** the page shows a "Legacy Page Format (<version>)" warning that asks the user to rebuild the page in the assistant, rather than attempting to render it

### Requirement: GraphQL data sources only
Data sources SHALL be GraphQL documents executed against the commercetools Platform GraphQL endpoint through the Merchant Center proxy using the signed-in user's own permissions. Variables SHALL resolve from literals, context (`projectKey`, `dataLocale`, `userId`) and route params (`fromUrl`). A data source whose `target` is present and not `COMMERCETOOLS_PLATFORM` SHALL fail individually with an explicit "unsupported data source target" error. The application SHALL NOT contain any BigQuery, SQL, data-warehouse or chat-service client code.

#### Scenario: Route parameter binds a variable
- **WHEN** a page declares a variable `fromUrl: ":orderId"` and is opened at a URL whose route param `orderId` equals an existing order id
- **THEN** the GraphQL request carries that id and the component receives the order data

#### Scenario: Polling data source
- **WHEN** a data source has `pollInterval` of 5000
- **THEN** it is re-fetched on that cadence while the page is mounted and polling stops after navigating away

#### Scenario: Legacy BigQuery target
- **WHEN** a stored page contains a data source with `target: "BIG_QUERY"`
- **THEN** only that data source reports the unsupported-target error and the other data sources and components still render

#### Scenario: No service calls
- **WHEN** the user lists and opens pages with the network panel recorded
- **THEN** no request to `/proxy/forward-to` or to the chat service URL is made (in particular no `/files/...` image request: private assistant images are not displayed in this app)

### Requirement: Never blocked by the AI service
The application SHALL render its list and page views whether or not the AI service is deployed, reachable or configured, and SHALL NOT require a session bootstrap against it.

#### Scenario: Service not deployed
- **WHEN** the application is run with no `CHAT_SERVICE_ENDPOINT_URL`
- **THEN** the page list and a composed page render normally

### Requirement: Least-privilege permissions
The application SHALL declare `oAuthScopes` limited to the scopes needed by stored pages' GraphQL (the `view_*` set documented in the design), `view_key_value_documents` for reading pages, and only those `manage_*` scopes that generated pages demonstrably use for UI-action mutations, each listed in the app README. A user without the View permission SHALL NOT see the menu entry or load the routes.

#### Scenario: Scope table matches the config
- **WHEN** the README scope table is compared with `oAuthScopes`
- **THEN** every scope appears in both, with a justification for each `manage_*` scope

#### Scenario: Permission denied
- **WHEN** a Merchant Center user without the application's View permission opens the application URL
- **THEN** the Merchant Center shows its unauthorized page and no composed-page data is requested

### Requirement: Content security policy
The application CSP SHALL allow only `*.commercetools.app` and `*.gstatic.com` for connections and fonts/styles, and `'unsafe-eval'` plus `'unsafe-inline'` in `script-src` solely because the renderer executes generated code. Dev-tunnel hosts and Cloud Run hosts SHALL NOT appear.

#### Scenario: CSP is minimal
- **WHEN** `custom-application-config.mjs` is read
- **THEN** `headers.csp` contains no `ngrok`, `run.app` or `localhost` host

### Requirement: Build, quality gates and hygiene
The folder SHALL install, typecheck, lint, test and build independently (`yarn install`, `yarn typecheck`, `yarn lint`, `yarn test`, `yarn build`) on Node 22 with no root workspace, SHALL contain no committed build output, `.env`, `console.*` calls or starter leftovers, and SHALL carry the SPDX MIT header in every source file.

#### Scenario: Clean build
- **WHEN** the five commands are run in `composed-apps/` on a fresh clone
- **THEN** all exit with status 0

#### Scenario: Hygiene scan
- **WHEN** `node scripts/spdx-check.mjs` and a grep for `console\.` and `BIG_QUERY` are run on `composed-apps/src`
- **THEN** the header check passes and the greps return nothing outside test fixtures

### Requirement: Shared renderer code stays in step with mc-app
Files shared with `mc-app` (renderer chain, chart component, schema helpers, composed-page types, storage hook) SHALL be registered in the duplicate-drift check so any divergence fails the check.

#### Scenario: Drift detected
- **WHEN** one copy of `babel-renderer.tsx` is edited without the other
- **THEN** `node scripts/check-duplicates.mjs` exits non-zero and names both files
