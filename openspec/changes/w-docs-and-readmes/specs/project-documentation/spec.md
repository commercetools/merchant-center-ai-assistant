## ADDED Requirements

### Requirement: Root README is the connector README
The root `README.md` SHALL begin with the unsupported-software banner from change A, and SHALL contain the sections: overview, what it is not, architecture at a glance, repository layout, prerequisites, quick start (local), deployment summary, configuration table, required scopes, administrator access, fail-open versus fail-closed behaviour per dependency, operations (health, logs, correlation ids), poison-message and replay statement, testing, contributing, support, licence.

#### Scenario: Certification contract
- **WHEN** `node scripts/docs/check-docs-claims.mjs` runs
- **THEN** it finds in `README.md` a fail-open/closed table, a required-scopes table, a configuration table covering every key of `connect.yaml`, and the poison/replay statement, and exits 0

#### Scenario: Unsupported wording in three places
- **WHEN** the repository is searched for the word "unsupported" case-insensitively
- **THEN** it occurs in the SPDX/disclaimer header of source files, in the first 15 lines of `README.md` inside a banner, and in `SUPPORT.md`

### Requirement: Poison-message and replay statement for a service-only connector
Because the connector contains no `event` or `job` application, the README and `docs/operations.md` SHALL state that no message redelivery or dead-letter processing exists, that no Subscription or API Extension is registered, and what the equivalent operator recovery paths are (retrying a chat turn, deleting a session, re-connecting identity, redeploying).

#### Scenario: Statement present
- **WHEN** `docs/operations.md` is read
- **THEN** it contains a section "Poison messages and replay" that states "not applicable" with the reason and lists the recovery paths

### Requirement: Fail-open versus fail-closed documentation
The documentation SHALL state, for every external dependency (Merchant Center gateway JWKS, the `ADMIN_USER_IDS` configuration, commercetools Custom Objects, Vertex AI, identity Managed MCP server, Knowledge MCP, third-party tool sources, embedded Nimbus MCP, BigQuery, Cloud Storage), what the user experiences when it is unavailable, whether the service fails open or closed for that dependency, and the timeout budget, each row verified against the owning change's spec.

#### Scenario: Table completeness
- **WHEN** the table in `docs/operations.md` is compared with the dependency list in `docs/architecture.md`
- **THEN** every dependency has a row with behaviour, stance and timeout

### Requirement: Administrator access documentation
The documentation SHALL explain that an administrator is a user whose Merchant Center user id is in the Connect configuration `ADMIN_USER_IDS` (optional, comma-separated; empty means nobody is admin and the service warns at start), how a user finds their own id (the read-only "Your user ID" line) and the first-administrator bootstrap (deploy, read the id, `configure ADMIN_USER_IDS=<id>`, refresh), the experience of a non-admin user, that any e-mail, label or flag sent by the browser (header, body, query, `userEmail`, `isAdmin`) is never trusted, that `userLabel` is a display-only unverified label, and that no Merchant Center permission group for administrators exists. It SHALL NOT mention features dropped from the product.

#### Scenario: Admin documentation present
- **WHEN** `node scripts/docs/check-docs-claims.mjs --certify` runs
- **THEN** `README.md` has an "Administrator access" section and a configuration-table row for `ADMIN_USER_IDS`, `docs/permissions.md` covers finding your user ID, the bootstrap, the non-admin experience, what is not trusted and `userLabel`, and `docs/troubleshooting.md` has entries for "nobody is admin because ADMIN_USER_IDS is empty" and "I am not shown as administrator"

### Requirement: Data retention statement
`docs/operations.md` and `docs/privacy.md` SHALL state that chat messages and feedback are kept until an operator deletes them, that no automatic deletion, expiry or cleanup job exists, and how an operator deletes Custom Objects (session delete in the app, Merchant Center Custom Objects or the Custom Objects API).

#### Scenario: Retention statement present
- **WHEN** `docs/operations.md` is read
- **THEN** it contains a "Data retention" section with the no-automatic-deletion statement and the operator deletion procedure

### Requirement: Scopes and permissions reference
The documentation SHALL list the exact API client scopes of the service (`inheritAs.apiClient.scopes`), the OAuth scopes of each Custom Application and the Custom View, the default Merchant Center View and Manage permission pair of each application (access to the app only, not administrator rights) and how administrators are decided (`ADMIN_USER_IDS`), and the required Google Cloud roles, each with the reason it is needed, generated or checked against the real configuration files.

#### Scenario: Scope drift
- **WHEN** a scope is added to `connect.yaml` or a `custom-application-config.mjs` without updating the docs
- **THEN** `node scripts/docs/gen-config-table.mjs --check` exits non-zero and names the file

### Requirement: Configuration reference
`docs/configuration.md` SHALL document every `standardConfiguration` and `securedConfiguration` key of every application in `connect.yaml` (name, application, secured or not, required, default, description, example value that is obviously fake), plus the keys Connect injects, and SHALL be produced by `gen-config-table.mjs` between generated markers. It SHALL include the third-party provider keys (`CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION`, `ALGOLIA_MCP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_CONNECTED_ACCOUNT_ID`) with which are secured and the rule that a provider is enabled only when its required keys are set and valid, and `docs/security.md` SHALL state that these credentials are Connect configuration only (no UI, no Custom Objects). It SHALL document every Google Cloud setting with its default (`GCP_PROJECT_ID` = the service-account key's project, `GCP_VERTEX_LOCATION`, `GCP_BIGQUERY_DATASET_ID`, `GCP_BIGQUERY_LOCATION`, `GCP_BUCKET_NAME`, `GCP_BUCKET_LOCATION`, `IMAGE_URL_MODE` = `private`), the single `GCP_SA_KEY_BASE64` credential, the required IAM roles with the least-privilege and the bucket-creating alternatives, and `docs/security.md` SHALL describe the image privacy model (private bucket, backend-streamed images through an authenticated endpoint, no signed URLs, `public` mode caveats).

#### Scenario: Every key documented
- **WHEN** `node scripts/docs/gen-config-table.mjs --check` runs
- **THEN** the generated block equals the committed block and the number of keys equals the number in `connect.yaml`

### Requirement: REST API reference from the contract
`docs/api.md` SHALL document every route of the service (method, path, auth requirement, admin requirement, request, response envelope, errors) in agreement with the REST contract of changes D, G, H, I, J and N, and SHALL be checked against the Express routes.

#### Scenario: Route drift
- **WHEN** a route is added in `service/src/routes` and not in `docs/api.md`
- **THEN** `node scripts/docs/check-api-doc.mjs` exits non-zero and prints the route

### Requirement: Architecture and how-it-works accuracy
`docs/architecture.md` and `docs/how-it-works.md` SHALL describe the single-tenant Connect topology (Merchant Center apps, forward-to gateway, service, Custom Objects, Vertex AI, identity Managed MCP, embedded Nimbus MCP, BigQuery, Cloud Storage), the request lifecycle of a chat turn, persistence, identity authentication, the five-minute budget, and composed pages; every claim SHALL cite a repository path or a documentation URL.

#### Scenario: Citations
- **WHEN** `check-docs-claims.mjs --citations` scans these two files
- **THEN** every section contains at least one backtick-quoted repository path or a documentation URL, and all quoted paths exist

### Requirement: Deployment guide
`docs/deployment.md` SHALL explain the two-phase deployment, manual steps in order (Merchant Center registration with a placeholder URL first, update URL last), regions, sandbox versus production behaviour and rollback, and SHALL link to the command-level runbook of change U without duplicating its commands.

#### Scenario: Single source of commands
- **WHEN** both `docs/deployment.md` and `docs/deployment-runbook.md` are searched for `commercetools connect `
- **THEN** commands appear only in the runbook

### Requirement: Troubleshooting
`docs/troubleshooting.md` SHALL list symptom, cause and fix for every failure mode documented by the feature changes, including at least: "nobody is admin because ADMIN_USER_IDS is empty", "I am not shown as administrator", service exits at start with invalid environment (including an invalid `ADMIN_USER_IDS` entry), gateway 401/403, project key mismatch, invalid Merchant Center permission, panel blank in a Custom View, "not connected to Managed MCP", identity popup blocked, stream cut at five minutes, Custom Object limit errors, Vertex credential errors, cold start, E2E tunnel problems.

#### Scenario: Coverage
- **WHEN** the list of "Troubleshooting" bullets collected from all changes is compared with the document
- **THEN** every bullet maps to an entry

### Requirement: FEATURES.md regenerated from code
`FEATURES.md` SHALL be regenerated from the current code, listing each feature with key file paths, and SHALL NOT contain stale statements (multi-tenancy, Firestore, the former permission-group scheme, Team MCP, Data Warehouse, other LLM providers, starter boilerplate).

#### Scenario: Stale vocabulary
- **WHEN** `grep -rinE "tenant|firestore|team mcp|data warehouse|gecx|anthropic|openai|assistant-admin|permission group|cloud run|pub/sub" FEATURES.md README.md docs` runs
- **THEN** it prints nothing

### Requirement: Per-application READMEs
Each application folder (`service`, `mc-app`, `composed-apps`, `mc-view-app`) SHALL contain a README that states what it is, its configuration keys, required scopes or permissions, how to run and test it locally, its fail-open/closed behaviour and a link to the root documentation.

#### Scenario: Four READMEs
- **WHEN** `ls */README.md` is run
- **THEN** exactly the four application READMEs exist, none contains starter-template text

### Requirement: Scrub rules
Published documentation SHALL NOT contain the words demo, POC or presales, customer or project names, internal hostnames, tunnel hosts, real project keys or identifiers, links to internal documents or to `plans/` and `openspec/`, emojis, or marketing superlatives, and SHALL pass the prose check of change A.

#### Scenario: Prose check
- **WHEN** `node scripts/check-repo-rules.mjs --prose` runs
- **THEN** it exits 0

#### Scenario: No internal links
- **WHEN** `node scripts/docs/check-links.mjs` runs
- **THEN** no link targets `plans/`, `openspec/` or an absolute local path

### Requirement: Contribution and support documents
`SUPPORT.md` SHALL state that the project is unsupported and where discussions happen; `CONTRIBUTING.md` SHALL describe development setup, required checks, how to add a tool source, how to add an E2E card, commit conventions and that contributions carry no support commitment.

#### Scenario: Required checks listed
- **WHEN** `CONTRIBUTING.md` is read
- **THEN** it lists `node scripts/spdx-check.mjs`, `node scripts/check-repo-rules.mjs`, `node scripts/check-duplicates.mjs`, `node scripts/docs/*` checks and per-app test commands
