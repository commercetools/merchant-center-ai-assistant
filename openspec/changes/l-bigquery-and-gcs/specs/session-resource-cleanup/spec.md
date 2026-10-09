## ADDED Requirements

### Requirement: Hooks registered with the session service
At service composition time L SHALL register two hooks through change G's `registerSessionCleanupHook(fn: (session: ChatSession) => Promise<void>)`: one dropping the session's BigQuery tables and one deleting its images. G calls every hook during `DELETE /session/:id` after the messages are removed and before the session object is deleted; a hook failure is logged by G and does not fail the request. Each L hook SHALL additionally catch its own errors so one cleanup type never prevents the other.

#### Scenario: Both hooks run
- **WHEN** a session is deleted
- **THEN** the BigQuery hook and the image hook are both invoked with the session record (id, userId, temporaryTables)

#### Scenario: One hook throws
- **WHEN** the BigQuery hook's call to BigQuery fails
- **THEN** the image hook still runs and the session is still deleted

### Requirement: BigQuery tables are dropped
The BigQuery hook SHALL delete every table registered on the session (idempotently: a missing table is not an error) using bounded concurrency (4), and SHALL only delete tables whose dataset equals the configured dataset and whose name starts with the sanitised session id.

#### Scenario: Foreign table in the list
- **WHEN** a corrupted session record lists a table in another dataset
- **THEN** that entry is skipped with a warning and not deleted

### Requirement: Images are deleted
The image hook SHALL delete all objects under `images/{sessionId}/` in the configured bucket (a missing bucket is not an error).

#### Scenario: Images removed
- **WHEN** a session with 3 generated images is deleted
- **THEN** the prefix `images/<sessionId>/` is empty afterwards

### Requirement: Expiry as a safety net
BigQuery tables SHALL expire 7 days after creation even if the session is never deleted. The README SHALL document the optional GCS bucket lifecycle rule for `images/`.

#### Scenario: Abandoned session
- **WHEN** a session is never deleted
- **THEN** its tables disappear by expiry and the session record's references simply fail on use with "table not found" (handled as an informed error)
