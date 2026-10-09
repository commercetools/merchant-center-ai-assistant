## ADDED Requirements

### Requirement: Orchestrator composition
`buildOrchestrator(ctx)` SHALL create one `ToolLoopAgent` with `getModel('main')`, `toolChoice: 'auto'`, `temperature: 0.3`, `stopWhen` containing `stepCountIs(CHAT_MAX_STEPS = 50)` and the time-budget stop condition, whose `instructions` are, in order: the orchestrator preamble, the project system prompt wrapped once in `<developer_instructions>` (omitted when blank), then each contributing source's fragment. Its tools are the registry's normalised tool set plus the built-in `create_entity_link`.

#### Scenario: Project prompt appears exactly once
- **WHEN** three sources contribute tools and the project prompt is `Be brief.`
- **THEN** `Be brief.` occurs exactly once in `instructions`

#### Scenario: No sources
- **WHEN** no integration source is enabled
- **THEN** the orchestrator still has `create_entity_link`, `visualize_data` and `export_data` and a valid preamble

### Requirement: Preamble reflects real tools
The preamble SHALL describe the domains of the tools actually present (generated from contributing sources' `displayName`), SHALL NOT mention sources that did not contribute, and SHALL keep the rules: prioritise the latest message, entity links are relative, ask-before-mutating confirmation text comes from the source fragments.

#### Scenario: Gated agent not advertised
- **WHEN** the Stripe source is disabled
- **THEN** the instructions do not contain the word `stripe` outside the project system prompt

### Requirement: Custom-view orchestrator
When `session.featureFlags.customView` is set, the stream SHALL use the custom-view orchestrator: instructions carry the base64-decoded Merchant Center URL and the URL-parsing guide, base rules and return format, plus only the sources `commercetools` and `commercetools-knowledge`, and the project system prompt once. A missing or non-base64 value MUST be logged and treated as an empty URL, not crash the turn.

#### Scenario: Entity context
- **WHEN** `customView` decodes to `/p/products/123/variants/456`
- **THEN** the instructions contain that URL and the example format list

#### Scenario: Malformed custom view value
- **WHEN** `customView` is `%%%`
- **THEN** the turn runs with an empty URL and a warning is logged

### Requirement: Agent keys and gating
`AGENT_KEYS` SHALL list `commercetools, contentstack, algolia, stripe, commercetoolsUI, visualize, bigquery, export, imageGeneration`. Each key maps to a prompt builder exported from `service/src/agents/prompts` (except `commercetoolsUI`, whose prompt is exported by change M). A key without a registered `ToolSource` contributes nothing; there MUST be no code path that instantiates an agent for a key whose source is disabled.

#### Scenario: Registry startup report
- **WHEN** the service starts with only H's sources registered
- **THEN** a single info log lists registered source names and the AGENT_KEYS that have no source yet

### Requirement: Built-in tools
H SHALL ship three always-on sources: `entity-link` (tool `create_entity_link`, project key injected from the verified user), `visualize` (`visualize_data`) and `export` (`export_data`, CSV only, base64 content, rows >= 1, headers must exist in the first row). They return `null` from `listForMenu`.

#### Scenario: Entity link
- **WHEN** the model calls `create_entity_link` with `{ entityType: 'order', id: 'o1', displayText: 'Order 1' }`
- **THEN** the result JSON has `success: true` and a relative URL beginning with `/<projectKey>/orders/`

#### Scenario: Export validation
- **WHEN** `export_data` is called with `data: []`
- **THEN** the result is `{ success: false, error: 'No data provided for export', hint }`

### Requirement: Subagent tool (image generation)
`createSubagentTool(def, ctx)` SHALL stream the child agent's `UIMessage` via `async function*`, pass the parent's `abortSignal`, and compress the result for the parent with `toModelOutput` (last text part or `Task completed.`). The `imageGeneration` source SHALL be enabled only when an `ImageUploader` (change L) is registered; generated `data:` images are uploaded and replaced by public URLs before being yielded.

#### Scenario: No uploader
- **WHEN** no `ImageUploader` is registered
- **THEN** `imageGeneration` is absent from the tools and from the instructions

#### Scenario: Abort propagates
- **WHEN** the parent abort signal fires during a subagent call
- **THEN** the child `agent.stream` receives an aborted signal

### Requirement: Usage metadata
Each `finish-step` part SHALL attach `{ usage }` as message metadata; stored messages keep only `metadata.usage.{inputTokens,outputTokens,totalTokens}`; `getAccumulatedUsage` sums top-level and nested tool-output usage and MUST NOT log.

#### Scenario: Nested usage
- **WHEN** a tool output carries `output.metadata.usage`
- **THEN** it is included in the accumulated total
