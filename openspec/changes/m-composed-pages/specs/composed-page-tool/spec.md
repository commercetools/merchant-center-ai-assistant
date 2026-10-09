## ADDED Requirements

### Requirement: Tool registration
The service SHALL register a ToolSource named `commercetools-ui` (order 60) that contributes exactly one tool named `create_composed_page` and the UI prompt from `commercetools-ui.prompt`. The tool name SHALL NOT change (it is listed in H's `STORABLE_TOOLS`). The source SHALL be enabled whenever the chat service runs and SHALL NOT contribute `query_aggregated_data`.

#### Scenario: Tool present
- **WHEN** the registry builds the tool set for a normal chat request
- **THEN** `create_composed_page` is in the set and its description mentions schema version 5.0 and not 4.0

#### Scenario: No SQL tool duplication
- **WHEN** the `commercetools-ui` source lists its tools
- **THEN** the list is exactly `["create_composed_page"]`

### Requirement: Input schema
The tool input SHALL be `{ title, description?, key?, components[], imports?, dataSources?, props? }` validated with zod: component names PascalCase and unique, `componentBody` a non-empty string of at most 20,000 characters, at most 20 components, at most 10 data sources, GraphQL variables typed, data source `target` only `COMMERCETOOLS_PLATFORM`. Validation failures SHALL be returned as a tool error result `{ success:false, errors:[{path,message}], hint }` rather than thrown.

#### Scenario: Lowercase component name
- **WHEN** a component is named `statsCard`
- **THEN** the result has `success:false` and an error at `components[0].name` saying the name must be PascalCase

#### Scenario: Too many components
- **WHEN** 21 components are supplied
- **THEN** the call is rejected with a message naming the limit of 20

### Requirement: AST-based code validation
Each `componentBody` SHALL be parsed with Babel (JSX enabled) as the body of a function. The tool SHALL reject a body that: has no top-level `return`; contains `import` or `export`; is wrapped in its own function/arrow declaration of the component; references the identifiers `eval`, `Function`, `window`, `document`, `globalThis`, `localStorage`, `sessionStorage`, `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`; or uses `constructor` member access chains. Detection SHALL use the syntax tree, not substring matching, so the words appearing in strings or comments SHALL NOT cause rejection. This validation is defence in depth; the isolation boundary remains the frontend renderer.

#### Scenario: Return inside a hook body only
- **WHEN** the body is `const x = useMemo(() => { return 1; }, []);` with no top-level return
- **THEN** it is rejected with "component body must end with a top-level return"

#### Scenario: Forbidden word in a string
- **WHEN** the body renders `<Text>Do not use window.open</Text>` and has a top-level return
- **THEN** it is accepted

#### Scenario: Real window access
- **WHEN** the body contains `window.location.href = "x"; return null;`
- **THEN** it is rejected naming `window`

#### Scenario: Syntax error
- **WHEN** the body has an unclosed JSX tag
- **THEN** the result has `success:false` with the Babel message and line/column relative to the component body

### Requirement: GraphQL data sources
Each data source query SHALL be a string starting (after whitespace and comments) with `query` or `{`, SHALL contain no `mutation` or `subscription` operation (checked with `graphql` parse), and its declared variable names SHALL match those referenced. Fragments are allowed.

#### Scenario: Mutation rejected
- **WHEN** a data source query is `mutation { deleteCart(id:"x") { id } }`
- **THEN** it is rejected with a hint that pages may only read data

#### Scenario: Valid query
- **WHEN** the query is `query($limit:Int){ products(limit:$limit){ total } }`
- **THEN** it is accepted

### Requirement: Transpile and output
For each component the tool SHALL wrap the body as `function Name({ renderData, dispatchUIAction }) {` + body + `}\nName;`, transpile it with `@babel/preset-react` using the classic runtime, and emit `code: { text, transpiledCode }`, both base64 encoded UTF-8. The result SHALL be `{ success:true, uri, schema }` where `uri` is `ui://composed-page/{key}/v{version}`, `schema.version` is `"5.0"`, and `key` is the supplied key or a new UUID. Version SHALL be 1 for a new key and previous version plus 1 when the model passes `key` together with `previousVersion`.

#### Scenario: New page
- **WHEN** a valid page is created without `key`
- **THEN** `uri` matches `^ui://composed-page/[0-9a-f-]{36}/v1$` and `schema.version` is `"5.0"`

#### Scenario: Edit existing page
- **WHEN** the model passes `key: "abc"` and `previousVersion: 2`
- **THEN** the uri ends `/abc/v3`

#### Scenario: Round trip
- **WHEN** `transpiledCode` is base64 decoded
- **THEN** it contains `function Name(` and ends with `Name;` and contains no JSX angle-bracket tags

### Requirement: Lazy transpiler and timing
Babel SHALL be imported lazily on the first call. A transpile of a 200-line component SHALL complete in under 2 s after warm-up and the tool SHALL return an error (not hang) if a single call exceeds 10 s.

#### Scenario: Cold start not paid at boot
- **WHEN** the service boots
- **THEN** `@babel/core` is not yet loaded (module-loaded check in test)
