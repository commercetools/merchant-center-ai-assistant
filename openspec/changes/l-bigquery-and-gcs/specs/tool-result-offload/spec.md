## ADDED Requirements

### Requirement: Analyzer-gated offload
`withToolResultPipeline(tools, ctx)` SHALL wrap each tool's `execute`. After the tool returns, the pipeline SHALL measure the serialized size once; when the estimated size exceeds 100,000 tokens it SHALL offload without asking the model; otherwise it SHALL ask the analyzer (lite model, structured output `{ hasAggregation }`) using the last 10 sanitised user/assistant messages, and offload only when `hasAggregation` is true. Tools whose result is not tabular, or when offload is disabled, SHALL return the original result unchanged. The pipeline SHALL NOT throw: any offload failure SHALL be logged (with the size of the raw result returned) and the original result returned.

#### Scenario: Small lookup
- **WHEN** a tool returns one order and the analyzer answers `hasAggregation: false`
- **THEN** the original result is returned and no BigQuery call is made

#### Scenario: Huge result skips the analyzer
- **WHEN** a result is estimated above 100,000 tokens
- **THEN** the analyzer model is not called and the result is offloaded

#### Scenario: Offload failure is swallowed
- **WHEN** BigQuery rejects the insert
- **THEN** the tool call returns the raw result and an error is logged containing the raw size and no row data

### Requirement: Payload normalisation
A tool result SHALL be converted into the envelope `{ "<TOOL NAME> RESULT": <payload> }` before parsing, where the payload is the MCP `structuredContent`, else the JSON parsed from the concatenated text parts, else the text. Parsing SHALL find `results`, `data` or `items` arrays (or nested arrays of objects, or a single object as a one-row table), SHALL keep the pagination numbers `total` and `count`, and SHALL derive the table name from the envelope key (`READ ORDER RESULT` -> `order`). When the original result is an MCP `CallToolResult`, the replacement message SHALL be returned as `{ content: [{type:"text", text}], isError: false }`.

#### Scenario: Managed MCP read_products payload
- **WHEN** the result text is `{"limit":100,"offset":0,"count":100,"total":4187,"results":[...]}`
- **THEN** the table is named from the tool (`products`) with `total` 4187 and `count` 100 retained

#### Scenario: MCP result shape preserved
- **WHEN** the original result has a `content` array
- **THEN** the returned replacement also has a `content` array, never a bare string

### Requirement: Per-session table with inferred schema
Rows SHALL be written to the dataset configured by `GCP_BIGQUERY_DATASET_ID` (default `aiassistant`; created idempotently in `GCP_BIGQUERY_LOCATION` on the first 404 when the service account may create datasets, otherwise the offload fails closed with a log naming the missing permission and the raw result is returned) in a table named `{sessionId}_{toolName}` with characters other than `[A-Za-z0-9_]` replaced by `_`. The schema SHALL be inferred from the first 10 rows (BOOLEAN, INTEGER, FLOAT, TIMESTAMP for ISO datetimes, DATE, JSON for objects/arrays, otherwise STRING; all NULLABLE); object and array values SHALL be stored as JSON strings. A second offload for the same session and tool SHALL append to the existing table. New tables SHALL carry labels `tool_name`, `session_id`, an `expirationTime` 7 days ahead, and SHALL be registered on the session (`tableRef`, `toolName`, `args`, `columnNames`) exactly once.

#### Scenario: Second call appends
- **WHEN** the same tool is offloaded twice in one session
- **THEN** one table exists, containing the rows of both calls, and the session lists it once

#### Scenario: Message names the columns
- **WHEN** a new table is created
- **THEN** the message to the model contains `BigQuery table created: <project>.<dataset>.<table>`, `Columns: name TYPE, ...` and, when known, `Number of rows inserted is N and the total number of available data is M`

#### Scenario: Expiry set
- **WHEN** a table is created
- **THEN** its metadata `expirationTime` is about 7 days after creation

### Requirement: Insert limits
Inserts SHALL be sent in chunks of at most 500 rows. A single offload SHALL be capped at 20,000 rows and 20 MB of serialized data; rows beyond the cap SHALL be dropped and the message to the model SHALL say how many were dropped.

#### Scenario: 60,000 rows
- **WHEN** a tool result has 60,000 rows
- **THEN** 20,000 rows are inserted in 40 requests and the message states 40,000 rows were not stored

### Requirement: Credentials and location
BigQuery and Storage access SHALL use change F's `getBigQueryClient()` and `getStorageClient()` (built from `getGoogleCredentials()`), the dataset from typed configuration `gcp.bigquery.datasetId` and the location `gcp.bigquery.location` (query jobs run there). Spec L MUST NOT read `process.env` or any other credential variable and MUST NOT construct its own clients.

#### Scenario: Missing credentials
- **WHEN** F throws `GcpNotConfiguredError` on first use
- **THEN** the offload is skipped with one warning per process and tool results are returned raw

#### Scenario: Missing dataset configuration
- **WHEN** `gcp.bigquery.datasetId` is unset
- **THEN** the `bigquery` ToolSource reports `isEnabled` false and the offload is skipped
