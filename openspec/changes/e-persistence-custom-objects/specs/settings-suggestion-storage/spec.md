## ADDED Requirements

### Requirement: Single settings object
`SettingsStore` SHALL keep one object at container `ai-assistant-settings`, key `default`, value `{ schemaVersion: 1, systemPrompt?, toolCallLogs, identityMcp?, updatedAt }`. `get()` MUST return defaults (`toolCallLogs: 'all'`, `systemPrompt: ''`) when the object does not exist and MUST NOT create it. `update(mutate)` MUST use the optimistic-concurrency helper and create the object on first write. `toolCallLogs` MUST be one of `none|thinking|tools|all`.

#### Scenario: Defaults
- **WHEN** settings were never written
- **THEN** `get()` returns `toolCallLogs: 'all'` and an empty prompt

#### Scenario: Concurrent partial updates
- **WHEN** one request sets `systemPrompt` and another sets `toolCallLogs` at the same time
- **THEN** both values are present afterwards

#### Scenario: Invalid mode
- **WHEN** `toolCallLogs` is set to `'verbose'`
- **THEN** a validation error is thrown and nothing is written

### Requirement: Read-through cache is optional
`SettingsStore.get()` MAY cache the value in process for at most `SETTINGS_CACHE_TTL_MS` (default 5000) and MUST invalidate on its own writes; correctness MUST NOT depend on the cache.

#### Scenario: Cache disabled
- **WHEN** the TTL is 0
- **THEN** every `get()` reads the gateway

### Requirement: Identity binding record
The settings value MAY hold `identityMcp` (`serverKey`, `url`, `majorVersion`, `authenticationMode`, `connectedAt` epoch ms, optional `discovery`, optional `client` with an encrypted envelope); dates MUST be stored as epoch milliseconds, never `Date` objects, and secrets inside it MUST already be encrypted envelopes.

#### Scenario: Round-trip
- **WHEN** a binding is stored and read
- **THEN** `connectedAt` is a number equal to the stored value

### Requirement: Suggestion cache
`SuggestionStore` SHALL store one object per user in container `ai-assistant-suggestions`, key = user id, value `{ suggestions, generatedAt, locale, basedOn }`; reads that fail MUST return `null` and writes that fail MUST be logged and swallowed because it is a cache.

#### Scenario: Cache failure is not fatal
- **WHEN** the gateway throws on `set`
- **THEN** `set` resolves and a warning is logged
