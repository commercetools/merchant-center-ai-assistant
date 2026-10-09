## ADDED Requirements

### Requirement: Envelope encryption
The service SHALL provide `encryptJson(kind, value, aad)` and `decryptJson(kind, envelope, aad)` using AES-256-GCM with a random 12-byte IV, `kind` in `identity-client|identity-tokens|identity-verifier`, additional authenticated data `kind|aad`, and envelope `{ v: 1, kind, kid, iv, tag, ct }` (base64). `ENCRYPTION_KEY` MUST be base64 that decodes to exactly 32 bytes (validated at boot); `ENCRYPTION_KEY_PREVIOUS` MAY list retired keys (comma-separated) used only for decryption, selected by `kid` (first 8 hex chars of SHA-256 of the key). Errors MUST NOT contain plaintext, ciphertext or key material.

#### Scenario: Round trip
- **WHEN** a token object is encrypted with aad `user-1` and decrypted with aad `user-1`
- **THEN** the original object is returned

#### Scenario: Wrong record
- **WHEN** an envelope encrypted for aad `user-1` is decrypted with aad `user-2`
- **THEN** decryption fails with a named error

#### Scenario: Wrong kind
- **WHEN** an `identity-tokens` envelope is decrypted as `identity-client`
- **THEN** a kind-mismatch error is thrown

#### Scenario: Rotation
- **WHEN** data is encrypted with key K1, then `ENCRYPTION_KEY=K2` and `ENCRYPTION_KEY_PREVIOUS=K1`
- **THEN** it still decrypts, and re-encrypting yields an envelope whose `kid` is K2's

#### Scenario: Weak key rejected
- **WHEN** `ENCRYPTION_KEY=password`
- **THEN** configuration fails naming `ENCRYPTION_KEY` and not printing the value

### Requirement: Identity token records
`TokenStore.getTokens(userId)`, `putTokens(record)` and `deleteTokens(userId)` SHALL store one object per user in `ai-assistant-identity-tokens` (key = user id) with `encryptedTokens` (aad = user id), `serverKey`, `accessTokenExpiresAt?`, `hasRefreshToken`, `scope?`, `issuedAt`, `updatedAt`, `bindingConnectedAt?`. `putTokens` MUST NOT overwrite a record whose `issuedAt` is strictly newer (returns `'stale-ignored'`), implemented with the optimistic-concurrency helper.

#### Scenario: Out-of-order grants
- **WHEN** a record with `issuedAt=200` exists and `putTokens` is called with `issuedAt=100`
- **THEN** the result is `'stale-ignored'` and the stored record is unchanged

#### Scenario: Plaintext never stored
- **WHEN** a record is stored and the raw object is read through the gateway
- **THEN** no access or refresh token string appears anywhere in it

### Requirement: Single-use PKCE state across instances
`TokenStore.createAuthState(record)` SHALL store the attempt in `ai-assistant-identity-auth-states` under key `sha256hex(state)` with the verifier encrypted (aad = state hash), `userId`, `redirectUri`, `createdAt`, `expiresAt`. `claimAuthState(state)` MUST read the object, return `{ outcome: 'expired' }` (and delete it) when `expiresAt` has passed, and otherwise delete it with `ifVersion` and return `{ outcome: 'claimed', record }` only if that delete succeeded; a missing, already-claimed or lost-race state MUST return `{ outcome: 'unknown' }`. Two simultaneous claims MUST yield exactly one `claimed`.

#### Scenario: Replay
- **WHEN** the same state is claimed twice
- **THEN** the first call returns `claimed` and the second `unknown`

#### Scenario: Race
- **WHEN** two instances claim the same state at the same time
- **THEN** exactly one receives `claimed`

#### Scenario: Expired
- **WHEN** `expiresAt` is in the past
- **THEN** `claimAuthState` returns `expired` and the object is removed

### Requirement: Expired-state sweeping
`TokenStore.sweepExpiredAuthStates({ olderThanMs = 3600000, max = 100 })` SHALL delete auth states whose platform `createdAt` is older than the threshold (query `createdAt < now - olderThanMs`, sorted `createdAt asc`) with bounded concurrency, and `createAuthState` SHALL trigger it fire-and-forget at most once per 60 s per process; failures are logged, never thrown.

#### Scenario: Old states removed
- **WHEN** one state is older than the threshold and one is fresh
- **THEN** a sweep deletes only the old one
