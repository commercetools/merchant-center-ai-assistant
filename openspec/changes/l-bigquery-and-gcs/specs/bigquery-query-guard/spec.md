## ADDED Requirements

### Requirement: Tools are bound to the calling session
`query_aggregated_data` and `get_table_info` SHALL be created per request with the session id and verified user bound at creation. They SHALL only operate on tables registered on that session (`temporaryTables`), whatever table references the model supplies.

#### Scenario: Another session's table
- **WHEN** the model passes a table reference that belongs to a different session (or another project/dataset)
- **THEN** `get_table_info` answers `{ success:false }` naming only the allowed references, and no BigQuery call touches the foreign table

### Requirement: SELECT-only guard through a dry run
Before executing, the service SHALL submit the SQL as a BigQuery **dry run** with the same configuration. It SHALL reject the query unless the job statistics report `statementType = "SELECT"` and every entry of `referencedTables` is a table registered on the calling session; a dry-run failure SHALL be returned as the BigQuery error. Multi-statement scripts (`SCRIPT`), DDL, DML, `EXPORT DATA`, `CALL`, wildcard tables and external tables SHALL therefore be rejected. A query that references no table (for example `SELECT 1`) SHALL be allowed.

#### Scenario: DML rejected
- **WHEN** the SQL is `DELETE FROM sess_orders WHERE true`
- **THEN** the result is `{ success:false, error }` stating only SELECT statements over this conversation's tables are allowed, and the real (non-dry) job is never created

#### Scenario: Cross-dataset read rejected
- **WHEN** the SQL selects from `` `other-project.public_data.users` ``
- **THEN** it is rejected because the referenced table is not a session table

#### Scenario: Script rejected
- **WHEN** the SQL is `SELECT 1; DROP TABLE x`
- **THEN** the dry run reports `SCRIPT` and the query is rejected

### Requirement: Cost, time and size caps
Every query job SHALL set `maximumBytesBilled` (default 200,000,000), `jobTimeoutMs` (default 60,000), `location`, and labels `app=ai-assistant`, `session_id`. Results SHALL be read with a maximum of 500 rows; when more rows exist the result SHALL include `truncated: true`, `totalRows` and a hint to aggregate or add a `LIMIT`. The serialized result returned to the model SHALL not exceed 256 KB (rows are dropped from the end with `truncated: true`). Results SHALL be converted to JSON-safe values.

#### Scenario: Too many rows
- **WHEN** a query returns 12,000 rows
- **THEN** 500 rows are returned with `truncated: true` and `totalRows: 12000`

#### Scenario: Billing limit
- **WHEN** the estimated bytes exceed `maximumBytesBilled`
- **THEN** the job fails without charge and the tool returns the error plus the session tables' real columns

### Requirement: Informed errors
A failed query SHALL return `{ success:false, error, query, availableTableRefs, tableColumns? , hint }` where `tableColumns` maps each session table to `name TYPE, ...` fetched best-effort; a metadata failure SHALL NOT replace the original error.

#### Scenario: Unknown column
- **WHEN** the SQL references a column that does not exist
- **THEN** the response contains BigQuery's message and `tableColumns` for the session tables

### Requirement: Table metadata tool
`get_table_info` SHALL return schema, `numRows`, `numBytes`, `creationTime`, `lastModifiedTime` (no row data) for a registered session table and SHALL accept `dataset.table` or `project.dataset.table` forms only when they resolve to a registered table.

#### Scenario: Short reference
- **WHEN** the model passes `aiassistant.sess_x_read_orders` and that table is registered
- **THEN** the metadata is returned
