## ADDED Requirements

### Requirement: Source availability follows configuration
The `contentstack`, `algolia` and `stripe` sources (change H `ToolSource` contract; `displayName` "Contentstack", "Algolia", "Stripe") SHALL report `isEnabled(ctx)` true only when the provider is enabled in `config.providers` (all required deployment keys set and valid, see `mcp-provider-configs`). A disabled or unconfigured provider SHALL produce no menu group (`listForMenu` returns `null`) and an empty tool set. Sources SHALL NOT implement session switch filtering: change H's registry removes tools named in `session.disabledTools[<source name>]` and drops a whole source whose list contains the sentinel `all_tools`.

#### Scenario: Not configured
- **WHEN** `STRIPE_SECRET_KEY` is not set
- **THEN** the tools menu has no `stripe` group and the stripe agent receives no tools

#### Scenario: Partially configured
- **WHEN** `CONTENTSTACK_API_KEY` is set without `CONTENTSTACK_MANAGEMENT_TOKEN`
- **THEN** the contentstack group is hidden and no request to Contentstack is attempted

### Requirement: Contentstack tools
The `contentstack` source SHALL provide exactly these 15 tools backed by the Contentstack Content Management API, authenticated with the configured `api_key` (`CONTENTSTACK_API_KEY`) and `authorization` (`CONTENTSTACK_MANAGEMENT_TOKEN`) headers and the optional `branch` (`CONTENTSTACK_BRANCH`): create/update/delete content type, create/update/delete/publish/unpublish entry, create/update global field (update tools: 10) and get content type, get all content types, get entry, get entries, get all global fields (read tools: 5). The base URL SHALL follow `CONTENTSTACK_REGION` (default `na` -> `https://api.contentstack.io/v3`, `eu` -> `https://eu-api.contentstack.com/v3`, `au` -> `https://au-api.contentstack.com/v3`, and the Azure/GCP hosts). Errors SHALL be returned to the model as text, never thrown out of the turn, and SHALL NOT include the credentials.

#### Scenario: Tool count
- **WHEN** the source returns tools for a configured stack with nothing disabled
- **THEN** exactly 15 tool names are returned

#### Scenario: Region
- **WHEN** `CONTENTSTACK_REGION=eu`
- **THEN** requests go to `https://eu-api.contentstack.com/v3/...`

#### Scenario: API error
- **WHEN** Contentstack answers 422 with a JSON error
- **THEN** the tool result is a string starting `API Error: 422 -` and containing no header values

### Requirement: Algolia tools
The `algolia` source SHALL connect to the configured MCP URL (`ALGOLIA_MCP_URL`; cached 10 minutes, keyed by a hash of the URL), expose the server's tools, and present the group as a single switch: `listForMenu` returns `{ toolNames: ["all_tools"] }`. When the session disabled `all_tools` the registry (change H) SHALL drop the source before any handshake (the legacy service ignored the switch).

#### Scenario: Switch honoured
- **WHEN** the session disabled `all_tools` for `algolia`
- **THEN** the registry does not call the source's `getTools` and no Algolia handshake is performed

#### Scenario: Unreachable
- **WHEN** the Algolia MCP URL times out
- **THEN** the source returns `{}`, logs a warning with the URL host only, and the turn completes

### Requirement: Stripe tools
The `stripe` source SHALL build a Stripe agent toolkit from `STRIPE_SECRET_KEY` and, when present, `STRIPE_CONNECTED_ACCOUNT_ID`, expose the 24 tool names (`resource.action`: 11 update, 13 read) and return tools whose input schemas are valid for the model provider (argument schema present, no unsupported constructs).

#### Scenario: Read-only session
- **WHEN** all `*.create`/`*.update` tools are disabled in the session
- **THEN** the registry leaves only the 13 read tools in the model's tool set

#### Scenario: Argument schema present
- **WHEN** the tool set is serialised to JSON Schema
- **THEN** every tool has an object `properties` schema (regression for the ai@4 `parameters` mismatch)

### Requirement: Failure isolation and logging
A failure inside a third-party source (credentials rejected, network error, schema conversion error, exception) SHALL be logged by the source with provider, error class and duration but no secrets or URLs; the source SHALL either return `{}` (expected failures such as an unreachable endpoint) or let the exception propagate to change H's registry, which isolates it (the source contributes nothing and the turn continues). A source that contributes no tool contributes no prompt (registry gating), so the model is never told about tools it does not have.

#### Scenario: Throwing source
- **WHEN** `getTools` of one source throws
- **THEN** other sources still contribute and the SSE stream completes normally

#### Scenario: No secret in logs
- **WHEN** Stripe rejects a key
- **THEN** no log line contains the key or any `sk_`/`rk_` token

### Requirement: Menu groups
`listForMenu(ctx)` SHALL return `{ toolNames }` (or `null` for an unconfigured or disabled provider) per source, and the registry maps it to the menu group named after the source: `contentstack` (15 names), `algolia` (`["all_tools"]`), `stripe` (24 names), `commercetools-knowledge` (live or fallback list). The `order` values SHALL be commercetools (change I) < `commercetools-knowledge` < `contentstack` < `algolia` < `stripe`.

#### Scenario: Menu with two providers
- **WHEN** the Contentstack and Stripe keys are set and valid
- **THEN** the groups (after `commercetools`) are `commercetools-knowledge`, `contentstack`, `stripe`
