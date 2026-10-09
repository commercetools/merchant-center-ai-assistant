## ADDED Requirements

### Requirement: Vertex provider
Language models SHALL be created with `createVertex({ project, location, googleAuthOptions })` from `@ai-sdk/google-vertex`, once per process and lazily. The packages `@ai-sdk/google` (direct), `@ai-sdk/anthropic` and `openai` MUST NOT be dependencies, and no source file MAY contain `GEMINI_API_KEY`, `createGoogleGenerativeAI`, `createAnthropic` or `openai`.

#### Scenario: Provider options reach the factory
- **WHEN** `getModel('main')` is first called
- **THEN** `createVertex` was called with the configured project, location and the shared `googleAuthOptions`

#### Scenario: Grep gate
- **WHEN** `grep -rnE "GEMINI_API_KEY|createGoogleGenerativeAI|createAnthropic|from 'openai'" service/src` runs
- **THEN** there is no match

### Requirement: Model tiers
`getModel(tier)` SHALL support `main` (default `gemini-3.8-flash`, env `GEMINI_MODEL_NAME`), `agent` (default `gemini-2.5-flash`, env `GEMINI_AGENT_MODEL_NAME`), `lite` (default `gemini-3.5-flash-lite`, env `GEMINI_LITE_MODEL_NAME`) and `image` (default `gemini-2.5-flash-image`, env `GEMINI_IMAGE_MODEL_NAME`), each backed by `vertex.languageModel(name)`. Each tier MUST have its **own** variable (legacy collapsed two tiers into one variable). `getModelName(tier)` MUST return the resolved name.

#### Scenario: Defaults
- **WHEN** no model variables are set
- **THEN** the four resolved names are the defaults above

#### Scenario: Independent override
- **WHEN** only `GEMINI_MODEL_NAME=x` is set
- **THEN** `agent`, `lite` and `image` names are unchanged

### Requirement: Thinking configuration parity
`getProviderOptions(tier)` SHALL return, under the provider-options namespace `vertex`: for `main` `{ thinkingConfig: { thinkingLevel: 'high', includeThoughts: true } }`; for `agent` `{ thinkingConfig: { thinkingBudget: -1, includeThoughts: true } }`; for `lite` `{ thinkingConfig: { thinkingLevel: GEMINI_LITE_THINKING_LEVEL } }` with default `minimal`, allowed `minimal|low|medium|high`, anything else a configuration error, and **no** `includeThoughts`; for `image` `undefined`.

#### Scenario: Main tier
- **WHEN** `getProviderOptions('main')` is called
- **THEN** it equals `{ vertex: { thinkingConfig: { thinkingLevel: 'high', includeThoughts: true } } }`

#### Scenario: Invalid lite level
- **WHEN** `GEMINI_LITE_THINKING_LEVEL=extreme`
- **THEN** startup fails naming `GEMINI_LITE_THINKING_LEVEL`

#### Scenario: Provider accepts the options
- **WHEN** the live smoke test sends one request per tier with its provider options
- **THEN** none returns an options-validation error

### Requirement: Image generation model
`getModel('image')` SHALL return a **language** model (multi-modal output) that, when used with `generateText`, returns image files; `getProviderOptions('image')` MUST be `undefined`. The service MUST NOT pass image-model-only options (`aspectRatio`, `personGeneration`) to it.

#### Scenario: Live image smoke
- **WHEN** the live smoke test asks the image model for a small picture
- **THEN** the result contains at least one file with an `image/*` media type

### Requirement: Token counting through Vertex
`countTokens(text, tier = 'agent')` SHALL use `new GoogleGenAI({ vertexai: true, project, location, googleAuthOptions })` and `models.countTokens({ model, contents })`, return `totalTokens`, and on any error log at `error` (without the text) and return `0`, preserving the legacy "unknown means 0" contract. The client MUST be created once.

#### Scenario: Count
- **WHEN** the live smoke test counts `"hello world"`
- **THEN** the result is a positive integer

#### Scenario: Failure returns zero
- **WHEN** the underlying call rejects
- **THEN** `countTokens` resolves `0` and the log line does not contain the input text

### Requirement: Thought-signature continuity
History written by earlier turns MAY carry provider metadata under the legacy namespace `google`; the Vertex provider reads `googleVertex`, then `vertex`, then `google` from message parts, so stored conversations MUST keep working without rewriting; the service MUST NOT rename or strip provider metadata keys when persisting messages.

#### Scenario: Multi-turn tool call
- **WHEN** the live smoke test runs a two-step tool-calling turn on the `main` tier and replays the resulting messages as history
- **THEN** the second request succeeds without a missing-signature error

### Requirement: Removed provider surface
The service MUST NOT contain `utils/secrets.utils.ts`, `providers/anthropic.ts`, any `CLAUDE_*`, `OPENAI_*`, `ANTHROPIC_*`, `GEMINI_API_KEY`, `GCP_SERVICE_ACCOUNT_*` identifier, or a `FEATURE_*` provider switch.

#### Scenario: Deletion check
- **WHEN** `node scripts/check-foundation.mjs` runs
- **THEN** it reports none of the removed identifiers
