## ADDED Requirements

### Requirement: Single exported contract module
The service SHALL export from `composed-pages/contract.ts` the constants and pure functions that define the frontend contract: `COMPOSED_PAGE_SCHEMA_VERSION = "5.0"`, `COMPOSED_PAGES_CONTAINER_KEY`, `buildComposedPageUri(key, version)`, `parseComposedPageUri(uri)`, `encodeCode(text)`, `decodeCode(b64)`, and the TypeScript types of the page schema, stored value and render data. No other module SHALL repeat these literals.

#### Scenario: URI round trip
- **WHEN** `parseComposedPageUri(buildComposedPageUri("k1", 7))` is evaluated
- **THEN** it returns `{ key: "k1", version: 7 }`

#### Scenario: Reject malformed uri
- **WHEN** `parseComposedPageUri("ui://composed-page/k1")` is evaluated
- **THEN** it returns `null`

### Requirement: Storage container
Composed pages SHALL be stored by frontends as commercetools Custom Objects in the container named by `COMPOSED_PAGES_CONTAINER_KEY`, default `shared-composed-pages`. The value SHALL be `{ name, icon, schema, isPublished, createdBy }` and the Custom Object key a client-generated UUID. The service SHALL NOT write or read these Custom Objects; the container name SHALL change only through the contract module and an owner decision.

#### Scenario: Constant matches frontends
- **WHEN** the contract test compares the constant with the values in the fixture used by P and R
- **THEN** all equal `shared-composed-pages`

#### Scenario: Service has no custom-object write
- **WHEN** the module graph of `composed-pages/` is scanned
- **THEN** no import of the persistence layer or of a commercetools client is present

### Requirement: Code encoding contract
`code.text` SHALL be the base64 UTF-8 component body source as written by the model. `code.transpiledCode` SHALL be base64 UTF-8 of a script that, when evaluated with `new Function(...scopeNames, script)`, returns the component function; it SHALL start with `function` and end with the component name as an expression statement. Frontends SHALL accept the server's `transpiledCode` when it parses as a script whose last statement is that identifier expression, and SHALL NOT use a substring `return ` test. A frontend SHALL re-transpile from `code.text` only when `transpiledCode` is absent or fails to evaluate.

#### Scenario: Hooks component accepted
- **WHEN** the fixture contains a component using `useState` and `useEffect`
- **THEN** the contract check function `isUsableTranspiledCode(decoded, name)` returns true

#### Scenario: Pure return component
- **WHEN** the fixture contains a body that is only `return <Text>Hi</Text>;`
- **THEN** the same function returns true

#### Scenario: Garbage
- **WHEN** `transpiledCode` is `"alert(1)"` for component `Foo`
- **THEN** the check returns false

### Requirement: Version discrimination
The page schema SHALL carry `version` as a string discriminator. Consumers SHALL switch on `schema.version`; unknown versions SHALL render as an unsupported-page notice and SHALL NOT be coerced. A future schema version SHALL be added to the contract module as a new member of a discriminated union without altering `"5.0"`.

#### Scenario: Unknown version
- **WHEN** a stored value has `schema.version` equal to `"9.9"`
- **THEN** the contract's `isSupportedSchema` returns false

### Requirement: Shared fixture
The repository SHALL contain `contract/composed-page.fixture.json` produced by the tool from fixed inputs (stable key, fixed UUID injection) and a test in the service that regenerates it and fails on drift. Frontends SHALL validate their types and renderer against the same file.

#### Scenario: Drift
- **WHEN** the transpile output changes without regenerating the fixture
- **THEN** the service contract test fails with a diff and the command to regenerate
