## ADDED Requirements

### Requirement: BigQuery client
`getBigQueryClient()` SHALL return a lazily created singleton `new BigQuery({ projectId, credentials, location })` built from `getGoogleCredentials()` and `gcp.bigquery.location` (`GCP_BIGQUERY_LOCATION`, default `us-central1`). The BigQuery project is always `gcp.projectId` (there is no separate BigQuery project key). Dataset id (`GCP_BIGQUERY_DATASET_ID`, default `aiassistant`) and location MUST be exposed through typed configuration (`gcp.bigquery.datasetId`, `gcp.bigquery.location`, both always defined) and MUST NOT be read from `process.env` by spec L.

#### Scenario: Credentials, not ADC
- **WHEN** `getBigQueryClient()` is constructed in a unit test with module mocks
- **THEN** the constructor receives `credentials.client_email` and `credentials.private_key` from the decoded key and never `keyFilename`

#### Scenario: Singleton
- **WHEN** it is called twice
- **THEN** the same instance is returned

### Requirement: Storage client
`getStorageClient()` SHALL return a lazily created singleton `new Storage({ projectId, credentials })`; the bucket name MUST be exposed as `gcp.bucket.name`: `GCP_BUCKET_NAME` when set, otherwise `<gcp project id>-ai-assistant-images` (derived once the project id is known), and the bucket creation location as `gcp.bucket.location` (`GCP_BUCKET_LOCATION`, default `us-central1`). `gcp.imageUrlMode` SHALL be `IMAGE_URL_MODE` (`private` default, `public`; anything else is a configuration error naming `IMAGE_URL_MODE`). When no service-account key is configured (development), `requireBucketName()` MUST throw `GcpNotConfiguredError`.

#### Scenario: Derived bucket name
- **WHEN** `GCP_BUCKET_NAME` is unset and the project id is `acme-dev-123`
- **THEN** `requireBucketName()` returns `acme-dev-123-ai-assistant-images`

#### Scenario: Explicit bucket name wins
- **WHEN** `GCP_BUCKET_NAME=my-images`
- **THEN** `requireBucketName()` returns `my-images`

#### Scenario: Unknown image mode
- **WHEN** `IMAGE_URL_MODE=signed`
- **THEN** configuration fails naming `IMAGE_URL_MODE` (signed URLs are not supported)

### Requirement: Dataset and bucket names validated
`GCP_BIGQUERY_DATASET_ID` SHALL match `^[A-Za-z0-9_]{1,1024}$` (default `aiassistant`); `GCP_BIGQUERY_LOCATION` SHALL be non-empty `^[A-Za-z0-9-]+$` (default `us-central1`); `GCP_BUCKET_NAME` SHALL match `^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$` and `GCP_BUCKET_LOCATION` SHALL match `^[A-Za-z0-9-]+$` (default `us-central1`; a multi-region such as `US` is allowed).

#### Scenario: Invalid dataset
- **WHEN** `GCP_BIGQUERY_DATASET_ID=my-dataset;drop`
- **THEN** configuration fails naming `GCP_BIGQUERY_DATASET_ID`

### Requirement: Live smoke suite
The repository SHALL contain `tests/integration/gcp.smoke.spec.ts` that runs only when `GCP_SA_KEY_BASE64` is set and otherwise reports skipped; it MUST cover token mint, one `generateText` per tier (`main`, `agent`, `lite`), `image` generation, `countTokens`, a BigQuery dry-run `SELECT 1` when a dataset or project is configured, and `bucket.exists()` for the effective bucket name when the bucket is known to exist, each independently skipped when its prerequisite is absent.

#### Scenario: No key
- **WHEN** `npm run test:integration` runs without `GCP_SA_KEY_BASE64`
- **THEN** the suite is reported as skipped and the exit code is 0
