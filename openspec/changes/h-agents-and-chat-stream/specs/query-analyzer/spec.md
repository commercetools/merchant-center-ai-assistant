## ADDED Requirements

### Requirement: Analyzer decision
`analyzeQueryTask({ messages, toolCallParams })` SHALL return `{ output: { hasAggregation: boolean } }`: `false` without a model call when the sanitised history (<= 10 messages, tool messages excluded, empty turns filtered, trailing non-user turns trimmed) is empty; `true` without a model call when `estimateTokens(resultChars) > 100000`; otherwise the verdict of a `getModel('lite')` structured call.

#### Scenario: Oversized result
- **WHEN** `resultChars` is 500000
- **THEN** `hasAggregation` is true and the model is not called

#### Scenario: No usable history
- **WHEN** all messages are assistant tool turns
- **THEN** `hasAggregation` is false and the model is not called

#### Scenario: Never ends with a model turn
- **WHEN** the history ends with an assistant reply
- **THEN** the messages sent to the model end with a user message

### Requirement: Size helpers
`estimateTokens(chars) = ceil(chars / 4)` and `sizeOf(value)` SHALL never throw: strings by length, objects by `JSON.stringify` length, unserialisable values by `String(value)` length (0 on failure).

#### Scenario: Circular value
- **WHEN** `sizeOf` receives a circular object
- **THEN** it returns a number and does not throw
