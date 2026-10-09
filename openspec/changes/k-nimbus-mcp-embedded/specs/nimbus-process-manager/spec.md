## ADDED Requirements

### Requirement: One shared child, started on demand
The service SHALL run at most one `@commercetools/nimbus-mcp` child process (`node <package>/dist/index.js` over stdio) per service instance, shared by all requests. The package location SHALL be resolved by walking up `node_modules` (the package `exports` map has no `require` condition) and the running version SHALL be read from its `package.json`. The child SHALL start lazily on first use; concurrent first callers SHALL share one start.

#### Scenario: Concurrent first use
- **WHEN** 8 requests ask for Nimbus tools at the same moment on a cold instance
- **THEN** exactly one child process is spawned and all 8 receive the tool list

#### Scenario: Package missing
- **WHEN** the package cannot be found on disk
- **THEN** the manager reports `unavailable` with the reason, the service keeps serving, and the log names the missing path once

### Requirement: Respawn on close
When the child's stdio closes unexpectedly the manager SHALL close the client (so the process is reaped), clear its state and respawn on the next request; the old generation's callbacks SHALL not affect the new one.

#### Scenario: Child killed
- **WHEN** the child is killed with SIGKILL between two calls
- **THEN** the next call succeeds on a new child, and exactly one nimbus-mcp child process exists afterwards

### Requirement: Recycle after consecutive timeouts
Each tool call SHALL have a timeout (default 20 s). After 3 consecutive call timeouts the manager SHALL recycle the child (close it; respawn on next use); any successful call SHALL reset the counter.

#### Scenario: Wedged child
- **WHEN** three calls in a row time out
- **THEN** a `recycling upstream` warning is logged and the fourth call runs on a fresh child

#### Scenario: Reset by success
- **WHEN** two timeouts are followed by a success and then one timeout
- **THEN** no recycle happens

### Requirement: Child stderr goes to structured logs
The child's stderr SHALL be piped (never inherited) and re-emitted line by line through the service logger at `warn` with `{ source: "nimbus-mcp", line }`; it SHALL never reach the JSON-RPC stream.

#### Scenario: Noisy child
- **WHEN** the child writes `deprecation notice` to stderr
- **THEN** one structured warn log is emitted and no tool call is affected

### Requirement: Readiness checks the expected tools
The manager SHALL expose `readiness()` that lists the child's tools and compares them with the 7 expected names (`list_components`, `get_component`, `get_docs_page`, `search_docs`, `get_tokens`, `search_icons`, `migrate_from_uikit`): `ok` when all are present (extra tools are warned about), `degraded` with `missing` when any is absent, `error` when the child cannot be reached. The result SHALL include the running `nimbus-mcp` version and SHALL be cached for 30 seconds.

#### Scenario: Healthy
- **WHEN** `GET /service/status/nimbus` is called
- **THEN** the response is 200 `{ status: "ok", nimbusMcp: "<version>", tools: 7 }`

#### Scenario: Missing tool
- **WHEN** the child serves only 6 of the 7
- **THEN** the response is 503 `{ status: "degraded", missing: ["..."] }`

### Requirement: Lifecycle bound to the service
The child SHALL be stopped when the service receives SIGTERM/SIGINT, SHALL exit when the parent dies (stdin EOF), and SHALL be shut down after 10 minutes without calls to release memory (a later call respawns it). The child's heap SHALL be capped (`--max-old-space-size=96` through `NODE_OPTIONS`) and its environment SHALL contain only the default safe variables (no service secrets).

#### Scenario: Idle shutdown
- **WHEN** no Nimbus call happens for 10 minutes
- **THEN** the child process is gone and the next call succeeds after a respawn

#### Scenario: Secrets not inherited
- **WHEN** the child's environment is inspected in a test
- **THEN** it does not contain `ENCRYPTION_KEY`, `GCP_SA_KEY_BASE64` or any `CTP_*` variable

### Requirement: Kill switch
When `NIMBUS_MCP_ENABLED=false` the manager SHALL never spawn a child, `readiness()` SHALL return `disabled`, and the tool source SHALL provide no tools.

#### Scenario: Disabled
- **WHEN** the switch is false and a page-generation turn runs
- **THEN** the turn completes using the prompt's built-in Nimbus guidance
