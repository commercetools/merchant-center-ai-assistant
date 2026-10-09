## ADDED Requirements

### Requirement: Menu is assembled from tool sources
`GET /service/session/:sessionId/tools` (and the `POST` alias) SHALL return `GroupedSessionTools[]` (`{ mcp: string, tools: { toolName, enabled }[] }`) built from the groups returned by the injected `ToolMenuProvider.listMenuGroups(ctx)` (implemented by change H's registry) and the session's stored `disabledTools`. A tool is `enabled` unless its name is in `disabledTools[group]`. Tool descriptions MUST NOT be included. With the default (empty) provider the answer is `[]`.

#### Scenario: Provider groups with state
- **WHEN** the provider returns group `knowledge` with tools `a`,`b` and the session has `disabledTools: { knowledge: ['b'] }`
- **THEN** the answer is `[{ mcp: 'knowledge', tools: [{toolName:'a',enabled:true},{toolName:'b',enabled:false}] }]`

#### Scenario: Descriptions dropped
- **WHEN** the provider returns descriptions
- **THEN** the serialised response contains no `description` key

### Requirement: Only disabled tools are stored
`PUT /service/session/:sessionId/tools` SHALL validate that `tools` is an array of `{ mcp: string, tools: array }`, then for each posted group store the names with `enabled: false` as `disabledTools[mcp]`, delete the key when none are off, and leave groups absent from the body untouched. The response echoes the posted groups.

#### Scenario: Switch off and on
- **WHEN** a tool is posted `enabled:false` and later `enabled:true`
- **THEN** the stored `disabledTools` first contains the name and afterwards no longer contains the group key

#### Scenario: Absent group untouched
- **WHEN** the body only contains group `stripe`
- **THEN** `disabledTools.knowledge` is unchanged

#### Scenario: Invalid body
- **WHEN** `tools` is missing or a group has no `mcp`
- **THEN** the status is 400

### Requirement: New tools are on by default
A tool name that is not present in the stored negative list SHALL be reported enabled, so tools added by a source after the user saved preferences are usable immediately and removed tools leave no stale rows.

#### Scenario: New tool
- **WHEN** a source starts offering tool `c` that was never stored
- **THEN** it is returned `enabled: true`
