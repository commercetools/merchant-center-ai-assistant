## ADDED Requirements

### Requirement: Knowledge MCP tool source
The service SHALL register a `ToolSource` (change H contract) named `commercetools-knowledge` (`displayName` "commercetools Knowledge") that connects to `https://docs.commercetools.com/apis/mcp` over streamable HTTP without credentials, exposes its tools (expected: `commercetools-documentation-search`, `commercetools-documentation-by-id`, `commercetools-graphql-schemata`, `commercetools-oas-schemata`, `commercetools-graphql-validate`, `commercetools-rest-validate`), caches the tool set for `MCP_TOOLS_TTL_MS` (default 30 minutes), follows redirects for this fixed host, and is always enabled (`isEnabled` true) because it needs no configuration. It SHALL NOT filter by session switches itself: change H's registry applies `session.disabledTools['commercetools-knowledge']`, the 15 s per-source timeout and failure isolation.

#### Scenario: Tools listed
- **WHEN** the source is asked for the menu (`listForMenu`)
- **THEN** it returns `{ toolNames }` with the live tool names, or the six expected names when the handshake fails (menu still renders)

#### Scenario: Drift warning
- **WHEN** the server serves a tool not in the expected list or omits one
- **THEN** a warning log names the added/removed tools and the live set is still used

### Requirement: Handshake is best effort
A Knowledge MCP handshake that fails or exceeds `MCP_HANDSHAKE_TIMEOUT_MS` (10 s) SHALL yield an empty tool set for that request, SHALL NOT fail the turn, and a handshake that completes after the deadline SHALL still populate the cache.

#### Scenario: Endpoint down
- **WHEN** the endpoint answers 503
- **THEN** the commercetools agent runs with only its identity-mode tools and the turn completes

### Requirement: Developer-tips prompt fragment
The source SHALL fetch the MCP prompt `commercetools-developer-tips`, cache it for 30 minutes, and return it from `getPrompt(ctx)` (synchronous) as `<commercetools_api_tips>...</commercetools_api_tips>`. Because the registry includes a source's prompt only when the source contributed at least one tool after session filtering, the tips appear exactly when a Knowledge tool is enabled. `getPrompt` SHALL return `''` when the prompt could not be fetched. Fetching SHALL be warmed during `getTools` (which the registry runs before building instructions) so `getPrompt` never waits.

#### Scenario: Group switched off
- **WHEN** the user disabled every Knowledge tool for the session
- **THEN** the registry contributes no tools from this source and therefore no tips reach the model

#### Scenario: Cold process
- **WHEN** `getTools` ran first in the request
- **THEN** `getPrompt` returns the tips block without a network call

### Requirement: Session switches are applied by the registry
Tools of the group `commercetools-knowledge` disabled in the session negative list (change G) SHALL be absent from the model's tool set; this is done by change H's registry, not by the source (the source returns all served tools).

#### Scenario: One tool off
- **WHEN** `commercetools-rest-validate` is disabled
- **THEN** the model's tool set lacks it and contains the other five, while the source's own `getTools` result still contains all six
