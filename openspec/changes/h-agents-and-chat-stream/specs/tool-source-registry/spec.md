## ADDED Requirements

### Requirement: ToolSource contract
Every tool provider SHALL implement `ToolSource` exactly as below and be registered through `registerToolSource(source)` in `service/src/tool-sources/index.ts`. `name` is simultaneously the registry key, the tools-menu group id (`GroupedSessionTools.mcp`) and the key under which the session stores `disabledTools`; it MUST be unique, lower-case kebab or camel, and stable across releases.

```ts
export interface ToolContext {
  user: RequestUser;            // verified (change D)
  sessionId: string;
  session: ChatSession;         // loaded once per request
  locale: string;               // request locale, default 'en'
  projectSystemPrompt: string;  // from SettingsStore
  temporaryTableMessages: string[];
  urlReferences: UrlReference[];
  config: AppConfig;            // change C
  stores: Persistence;          // change E
  abortSignal: AbortSignal;     // hard budget + client disconnect
  budget: RequestBudget;        // soft/hard deadlines (request-time-budget)
  logger: Logger;
}
export interface ToolSource {
  readonly name: string;
  readonly displayName: string;
  readonly order: number;       // ascending merge order; ties broken by name
  isEnabled(ctx: ToolContext): Promise<boolean>;   // false => contributes nothing, never throws
  getTools(ctx: ToolContext): Promise<ToolSet>;    // keys are the tool names shown in the menu
  listForMenu(ctx: ToolContext): Promise<{ toolNames: string[] } | null>; // null => no menu group
  getPrompt(ctx: ToolContext): string;             // '' when none; MUST NOT embed the project system prompt
}
```

#### Scenario: Registration rejects duplicates
- **WHEN** two sources are registered with the same `name`
- **THEN** `registerToolSource` throws at startup naming the duplicate

#### Scenario: Stub source
- **WHEN** a test registers `StubToolSource({ name: 'stub', tools: { echo } })`
- **THEN** the registry resolves `echo` for a session without any other source present

### Requirement: Concurrent, isolated resolution
`registry.resolve(ctx)` SHALL call `isEnabled` then `getTools` of all sources concurrently, bound each source's total time by `SOURCE_RESOLVE_TIMEOUT_MS = 15000`, and treat a throw, rejection or timeout as "source contributes nothing" with a warning log naming the source. A failing source MUST NOT fail the chat turn.

#### Scenario: One source hangs
- **WHEN** source A never resolves and source B returns one tool
- **THEN** `resolve` returns B's tool after about 15 s and a warning for A

#### Scenario: One source throws
- **WHEN** source A's `getTools` throws
- **THEN** the rest of the sources are merged and the turn proceeds

### Requirement: Deterministic merge
Tools and prompt fragments SHALL be merged in ascending `order` (ties by `name`), regardless of completion order. On a tool-name collision the later source wins and a warning is logged. A source's prompt fragment is included only when that source contributed at least one tool after filtering, formatted `\n\n# <displayName>\n\n<fragment>`.

#### Scenario: Completion order does not matter
- **WHEN** a slow source with order 10 and a fast source with order 20 both resolve
- **THEN** instructions list the order-10 fragment first

#### Scenario: Gated source adds no prompt
- **WHEN** a source has `isEnabled === false`
- **THEN** its prompt fragment is absent from the instructions

### Requirement: Session tool switches applied centrally
After resolution the registry SHALL remove, per source, every tool whose name appears in `session.disabledTools[source.name]`, and the whole source when that list contains the sentinel `all_tools`. Sources MUST NOT implement their own disabled-tool filtering. A source left with no tools contributes no prompt.

#### Scenario: Disabled tool removed
- **WHEN** `disabledTools = { stub: ['echo'] }`
- **THEN** `echo` is not in the resolved tool set and the stub prompt is omitted

#### Scenario: All-or-nothing source
- **WHEN** `disabledTools = { algolia: ['all_tools'] }`
- **THEN** no Algolia tool is resolved

### Requirement: Menu provider
The registry SHALL implement G's `ToolMenuProvider`: `listMenuGroups(ctx)` calls every source's `listForMenu` concurrently (same timeout and isolation) and returns `{ mcp: source.name, toolNames }` for each non-null result, in merge order, independent of `isEnabled`. The registry MUST install itself with `setToolMenuProvider` at composition time.

#### Scenario: Menu lists configured sources only
- **WHEN** source X returns `null` from `listForMenu`
- **THEN** no group for X is returned

#### Scenario: Empty group still shown
- **WHEN** the commercetools source returns `{ toolNames: [] }`
- **THEN** the menu contains an empty `commercetools` group

### Requirement: Connected-source names
The registry SHALL expose `listConnectedSourceNames(ctx)` (names of enabled sources that declare `kind: 'integration'`) and install it as G's `ConnectedSourcesProvider`.

#### Scenario: Suggestions input
- **WHEN** only the Stripe integration source is enabled
- **THEN** the provider returns `['stripe']`
