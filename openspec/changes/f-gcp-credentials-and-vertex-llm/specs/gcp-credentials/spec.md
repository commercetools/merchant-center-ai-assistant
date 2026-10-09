## ADDED Requirements

### Requirement: Decode and validate the service-account key
The `gcp` configuration section SHALL read `GCP_SA_KEY_BASE64` (secured configuration), remove all whitespace, accept standard or URL-safe Base64, reject values over 16 KiB, decode to UTF-8, parse as JSON, and validate that the object has `type: "service_account"`, non-empty string `project_id`, `client_email` (contains `@` and ends with `gserviceaccount.com`), and `private_key` beginning with `-----BEGIN PRIVATE KEY-----` or `-----BEGIN RSA PRIVATE KEY-----`. A `private_key` containing literal `\n` sequences and no real line breaks MUST be normalised to real newlines. Only `type`, `project_id`, `private_key_id`, `private_key`, `client_email`, `client_id`, `token_uri` are retained. The result MUST be wrapped in `Secret`.

#### Scenario: Valid key
- **WHEN** `GCP_SA_KEY_BASE64` is the Base64 of a well-formed service-account JSON
- **THEN** configuration succeeds and `gcp.projectId` equals the key's `project_id`

#### Scenario: URL-safe Base64 and line breaks
- **WHEN** the value is URL-safe Base64 split across lines
- **THEN** it decodes identically

#### Scenario: Escaped newlines
- **WHEN** the `private_key` string contains `\\n` literals
- **THEN** the retained key contains real newlines

### Requirement: Errors never leak the key
Every validation failure SHALL be reported as `GCP_SA_KEY_BASE64: <fixed reason>` with a reason from a closed list (`empty`, `not valid base64`, `too large`, `decoded value is not JSON`, `decoded JSON is not an object`, `missing field "<name>"`, `field "type" must be "service_account"`, `client_email is not a service-account address`, `private_key is not a PEM private key`). Reasons MUST NOT contain any substring of the decoded or encoded input, parse-error excerpts, or field values (field *names* are allowed).

#### Scenario: Not JSON
- **WHEN** the value is Base64 of `hello`
- **THEN** the error is exactly `GCP_SA_KEY_BASE64: decoded value is not JSON` and does not contain `hello` or its Base64

#### Scenario: Whole key is wrong type
- **WHEN** the decoded JSON has `"type": "authorized_user"`
- **THEN** the error is `GCP_SA_KEY_BASE64: field "type" must be "service_account"`

#### Scenario: Config object is not printable
- **WHEN** `JSON.stringify(readConfiguration())` is evaluated
- **THEN** no part of `private_key` appears

### Requirement: Project and location resolution
`gcp.projectId` SHALL be `GCP_PROJECT_ID` if set (validated `^[a-z][a-z0-9-]{4,28}[a-z0-9]$`), otherwise the key's `project_id`. `gcp.vertexLocation` SHALL be `GCP_VERTEX_LOCATION` (default `us-central1`), accepted when it equals `global`, `us`, `eu` or matches `^[a-z]+-[a-z]+[0-9]+$`. The old name `GCP_LOCATION` SHALL NOT be read (a boot warning names it when present). Every Google Cloud setting (`GCP_PROJECT_ID`, `GCP_VERTEX_LOCATION`, `GCP_BIGQUERY_DATASET_ID`, `GCP_BIGQUERY_LOCATION`, `GCP_BUCKET_NAME`, `GCP_BUCKET_LOCATION`, `IMAGE_URL_MODE`) SHALL be optional, have a documented default and be set through the connector's `connect.yaml` `service` configuration.

#### Scenario: Default project from key
- **WHEN** `GCP_PROJECT_ID` is unset
- **THEN** `gcp.projectId` is the key's `project_id`

#### Scenario: Explicit project overrides
- **WHEN** `GCP_PROJECT_ID=my-vertex-project` and the key belongs to another project
- **THEN** `gcp.projectId` is `my-vertex-project`

#### Scenario: Bad location
- **WHEN** `GCP_VERTEX_LOCATION=Iowa`
- **THEN** configuration fails naming `GCP_VERTEX_LOCATION`

### Requirement: Required in production
`GCP_SA_KEY_BASE64` MUST be present when `NODE_ENV=production`. In `development`/`test` it MAY be absent, in which case `getGoogleCredentials()` and every model/client factory throws `GcpNotConfiguredError` on first use (the service still boots).

#### Scenario: Missing in production
- **WHEN** `NODE_ENV=production` and the key is unset
- **THEN** startup fails naming `GCP_SA_KEY_BASE64`

#### Scenario: Missing in development
- **WHEN** `NODE_ENV=development` and the key is unset
- **THEN** the service boots and `getModel('main')` throws `GcpNotConfiguredError`

### Requirement: Single credentials provider
`getGoogleCredentials()` SHALL return `{ projectId, location (the Vertex location), credentials: { client_email, private_key }, googleAuthOptions }` where `googleAuthOptions = { projectId, credentials, scopes: ['https://www.googleapis.com/auth/cloud-platform'] }`, and Vertex (text and image models), BigQuery, Storage and `@google/genai` MUST all be constructed from it; there is no other Google credential and no API key. No code MAY read `GOOGLE_APPLICATION_CREDENTIALS`, `GEMINI_API_KEY`, or fall back to Application Default Credentials.

#### Scenario: One source of truth
- **WHEN** the unit test constructs all four clients with a fake key
- **THEN** each receives credentials equal to those returned by `getGoogleCredentials()`

### Requirement: Refuse API-key mode
Configuration SHALL fail if `GOOGLE_VERTEX_API_KEY` is set, naming the variable, because `@ai-sdk/google-vertex` silently switches to API-key "express mode" when it is present. The legacy variables `GEMINI_API_KEY`, `CLAUDE_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` MUST be ignored (never read) and, when present, produce a single warning at boot naming the variable (not its value), so a developer's shell does not break local runs.

#### Scenario: Express mode guard
- **WHEN** `GOOGLE_VERTEX_API_KEY=x` is in the environment
- **THEN** startup fails naming `GOOGLE_VERTEX_API_KEY`

#### Scenario: Stale legacy variable
- **WHEN** `GEMINI_API_KEY=x` is in the environment
- **THEN** startup succeeds, one warning names `GEMINI_API_KEY`, and no request uses it

### Requirement: Readiness report
`checkGcpReadiness({ deep })` SHALL return `{ ok, checks: [{ name, ok, detail }] }` covering `decode`, `token` (mint an access token through `GoogleAuth`), `vertex` (a tiny `countTokens` on the main model) and, when `deep` and the respective settings exist, `bigquery` (dry-run `SELECT 1`) and `storage` (`bucket.exists()`; a 403 meaning the roles do not include `storage.buckets.get`, as with a bucket-scoped `roles/storage.objectAdmin`, is reported as `ok` with the detail `not inspectable with the current roles`, and a missing bucket is `ok` with the detail `missing`: creating or probing it is the job of change L's `checkGcpAnalytics()`). `detail` MUST NOT contain tokens or key material; the function MUST NOT throw.

#### Scenario: Bad key
- **WHEN** the key decodes but Google rejects it
- **THEN** `ok` is false, the `token` check is false, and the detail is a short fixed reason
