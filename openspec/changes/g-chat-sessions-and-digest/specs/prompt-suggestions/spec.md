## ADDED Requirements

### Requirement: Always four cards
`GET /service/suggestions` SHALL answer HTTP 200 with `{ suggestions, personalised }` where `suggestions` has exactly four `PromptSuggestion` items (`icon, title, detail, prompt`) in every situation: cold cache, no history, model failure, persistence failure. `personalised` MUST be `false` when the static defaults are returned.

#### Scenario: No history
- **WHEN** a user without digested sessions calls the endpoint
- **THEN** the four static defaults are returned, `personalised: false`, and no model call is made

#### Scenario: Model failure
- **WHEN** the user has history, the cache is stale and the model throws
- **THEN** the status is 200 with the four defaults

#### Scenario: Store failure
- **WHEN** `SuggestionStore.get` rejects
- **THEN** the status is 200 with the four defaults

### Requirement: Cache freshness
A cached set SHALL be reused only when it has cards, its `locale` equals the request locale, it is younger than 24 h, and no digest newer than `generatedAt` exists among the user's last five digested sessions. Generated sets MUST be written to `SuggestionStore` keyed by `userId`; losing the cache MUST be harmless.

#### Scenario: Newer digest invalidates cache
- **WHEN** a session digest is written after the cache's `generatedAt`
- **THEN** the next call regenerates

#### Scenario: Locale change
- **WHEN** the cached locale is `en` and the request asks `de`
- **THEN** the cache is not used

### Requirement: Card normalisation
Generated cards SHALL be clamped (title <= 40, detail <= 90, prompt <= 200), icons validated against `DIGEST_ICON_NAMES`, entries without title or prompt dropped, and the list cut to four. Fewer than one valid card MUST fall back to the defaults.

#### Scenario: Chatty model
- **WHEN** the model returns six cards
- **THEN** four are stored

### Requirement: Connected sources input
The suggestion prompt SHALL list the data sources reported by an injected `ConnectedSourcesProvider` (default: none) and the project system prompt from `SettingsStore`, so it never proposes work for a source that is not connected.

#### Scenario: No third-party sources
- **WHEN** the provider returns an empty list
- **THEN** the user prompt says `Data sources available: commercetools (always)`
