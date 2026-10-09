## ADDED Requirements

### Requirement: Per-session switchboard
The Tools control MUST open a panel that lists tools grouped by provider with a search filter, per-tool and per-group toggles and a count, reading `GET session/<id>/tools`.

#### Scenario: Search
- **WHEN** the user types "order" in the filter
- **THEN** only matching tools remain visible

### Requirement: Explicit save, discard on dismiss
Changes MUST be persisted only through an explicit Save (`PUT session/<id>/tools` with the full grouped list); dismissing the panel without saving MUST discard unsaved toggles.

#### Scenario: Save persists
- **WHEN** the user disables a tool, presses Save and reloads
- **THEN** the tool is still disabled

#### Scenario: Dismiss discards
- **WHEN** the user toggles a tool and closes the panel without Save
- **THEN** reopening shows the previous state and no PUT was sent

### Requirement: Provider changes refresh the menu
The session context MUST expose `fetchSessionTools()` so that Q's provider-save flow can refresh the menu without a reload.

#### Scenario: Refresh
- **WHEN** `fetchSessionTools()` is called
- **THEN** one GET `session/<id>/tools` is sent and the panel shows the new list
