## ADDED Requirements

### Requirement: Nimbus ToolSource
The service SHALL register a `ToolSource` (change H contract) named `nimbus` (`displayName` "Nimbus design system", `order` immediately after the `commercetools-ui` source of change M) whose `getTools(ctx)` returns the AI SDK tools of the embedded child (through an `MCPClient` over the manager's transport), with `get_component` replaced by `get_components`. `isEnabled` SHALL be true unless the kill switch is off. `listForMenu` SHALL return `null` (no menu group) and the source SHALL NOT filter by session switches (there are none for it); `getPrompt` SHALL return `''` (the Nimbus usage guidance is part of the page-generation prompt owned by change M). The source SHALL take part in standard orchestrator turns only: the custom-view orchestrator, which selects exactly `commercetools` and `commercetools-knowledge`, SHALL NOT receive Nimbus tools.

#### Scenario: Custom-view turn
- **WHEN** a session with the `customView` feature flag runs
- **THEN** no Nimbus tool is in its tool set and the Nimbus child is not started

#### Scenario: Tool set
- **WHEN** a standard turn builds its tools on a healthy instance
- **THEN** the set contains `list_components`, `get_components`, `get_docs_page`, `search_docs`, `get_tokens`, `search_icons`, `migrate_from_uikit` and not `get_component`, and the tools menu has no `nimbus` group

### Requirement: Cold start does not delay a turn
`getTools` SHALL wait at most 3 seconds for the first handshake; on timeout it SHALL return `{}` for that turn, SHALL let the handshake finish in the background and SHALL serve the tools on later turns. The tool list SHALL be cached for the life of the child generation.

#### Scenario: Slow first spawn
- **WHEN** the handshake takes longer than 3 s
- **THEN** the first turn runs without Nimbus tools and the second turn has them

### Requirement: Tools survive a respawn
Tool objects handed to an agent SHALL resolve the live generation at call time, so a turn that started before a respawn does not call a closed client.

#### Scenario: Respawn mid-conversation
- **WHEN** the child is recycled between two tool calls of one turn
- **THEN** the second call succeeds on the new child

### Requirement: Batched component lookup
`get_components({ names, sections? })` SHALL call the underlying `get_component` for each unique (name, section) pair with concurrency 6, at most 24 lookups per call (over the cap: an error result that says how to split), returning per-item results where a failing item does not lose the others.

#### Scenario: One bad name
- **WHEN** 10 names are requested and one is unknown
- **THEN** 9 results carry content and one carries `error`

#### Scenario: Over the cap
- **WHEN** 30 lookups are requested
- **THEN** the result is an error with a hint, and no child call is made

### Requirement: Drift and version consistency
The source SHALL log a warning when the child serves tools not in, or lacks tools from, the expected list. The exact `@commercetools/nimbus-mcp` version in `service/package.json` SHALL equal `NIMBUS_VERSION` in the generated Nimbus surface manifest used by the page-generation prompt; a test SHALL fail otherwise.

#### Scenario: Version drift
- **WHEN** `package.json` pins 3.6.0 but the manifest says 3.5.1
- **THEN** `nimbus-pin.spec.ts` fails with both values in the message
