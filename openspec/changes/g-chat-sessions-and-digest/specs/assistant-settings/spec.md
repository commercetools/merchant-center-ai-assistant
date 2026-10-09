## ADDED Requirements

### Requirement: System prompt endpoints
`GET /service/system-prompt` SHALL return `{ systemPrompt }` (empty string when unset) from the `SettingsStore` single object for any member. `PUT /service/system-prompt` SHALL require `requireAdmin` (the caller's verified user id is in `ADMIN_USER_IDS`, evaluated by the service per request; answer 403 `{ code: 'ADMIN_REQUIRED' }` otherwise), require `systemPrompt` to be a string (400 otherwise), cap it at 20 000 characters (400 when exceeded), and persist it with an optimistic-concurrency retry.

#### Scenario: Admin sets prompt
- **WHEN** an admin PUTs `{ "systemPrompt": "Be brief." }`
- **THEN** a following GET returns `Be brief.`

#### Scenario: Non-admin write
- **WHEN** a non-admin member (verified user id not in `ADMIN_USER_IDS`, or the list is empty) PUTs a prompt
- **THEN** the status is 403 with `code: 'ADMIN_REQUIRED'` and the stored value is unchanged

#### Scenario: Forged e-mail or label does not grant admin
- **WHEN** a non-admin member PUTs a prompt or a tool-call-log mode with the header `x-admin-email`, the body field `userEmail` or `userLabel`, or the query `?userEmail=` set to an administrator's user id or e-mail address (a forged label never grants admin)
- **THEN** the status is still 403 `ADMIN_REQUIRED`, the stored value is unchanged, and the forged values are not read

#### Scenario: Not a string
- **WHEN** the body is `{ "systemPrompt": 5 }`
- **THEN** the status is 400

### Requirement: Tool-call-log mode endpoints
`GET /service/tool-call-logs` SHALL return `{ mode }` defaulting to `all`. `PUT` SHALL require `requireAdmin` (same 403 `ADMIN_REQUIRED` for non-admins) and accept only `none`, `thinking`, `tools`, `all`.

#### Scenario: Invalid mode
- **WHEN** an admin PUTs `{ "mode": "verbose" }`
- **THEN** the status is 400 and the error lists the four valid modes

#### Scenario: Non-admin mode write
- **WHEN** a non-admin member PUTs `{ "mode": "none" }`
- **THEN** the status is 403 `ADMIN_REQUIRED` and the stored mode is unchanged

#### Scenario: Default
- **WHEN** the settings object does not exist yet
- **THEN** GET returns `{ mode: 'all' }` and no write happens

### Requirement: Single settings read per request
Handlers that need both settings values SHALL read the settings object once per request (cached in the request context), and writes to one field MUST preserve the other fields (`identityMcp`, `schemaVersion`).

#### Scenario: Field preservation
- **WHEN** the system prompt is written while `identityMcp` is set
- **THEN** `identityMcp` is unchanged afterwards
