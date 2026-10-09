## ADDED Requirements

### Requirement: Providers are configured at deployment, not in the product
The service SHALL support exactly the providers `contentstack`, `algolia` and `stripe`, configured only through Connect deployment configuration read once by `readConfiguration()` (change C): `CONTENTSTACK_API_KEY` and `CONTENTSTACK_MANAGEMENT_TOKEN` (secured), `CONTENTSTACK_BRANCH` and `CONTENTSTACK_REGION` (standard, region default `na`), `ALGOLIA_MCP_URL` (secured, because the URL may embed a key), `STRIPE_SECRET_KEY` (secured) and `STRIPE_CONNECTED_ACCOUNT_ID` (standard). The service SHALL NOT expose any route that creates, updates or deletes provider configuration, SHALL NOT store provider credentials in Custom Objects or any other persistence, and SHALL NOT log, return or place in an error message any credential value (including the Algolia URL beyond its host).

#### Scenario: No write routes
- **WHEN** a client sends `POST`, `PUT` or `DELETE` to `/service/mcp/configs`, `/service/mcp/configs/upsert` or `/service/mcp/providers`
- **THEN** the response is 404 (or 405) and nothing is stored

#### Scenario: Nothing stored
- **WHEN** the service starts with all provider keys set and serves requests
- **THEN** no Custom Object container with a provider credential exists (`ai-assistant-mcp-configs` is never created)

### Requirement: A provider is enabled iff its required keys are set and valid
A provider SHALL be enabled if and only if all of its required keys are set and valid: Contentstack `CONTENTSTACK_API_KEY` and `CONTENTSTACK_MANAGEMENT_TOKEN` non-empty, optional `CONTENTSTACK_BRANCH` matching `^[A-Za-z0-9._-]{1,64}$`, `CONTENTSTACK_REGION` in `{na, eu, au, azure-na, azure-eu, gcp-na, gcp-eu}` (default `na`); Stripe `STRIPE_SECRET_KEY` matching `^(sk|rk)_(test|live)_[A-Za-z0-9]+$`, optional `STRIPE_CONNECTED_ACCOUNT_ID` matching `^acct_[A-Za-z0-9]+$`; Algolia `ALGOLIA_MCP_URL` an `https://` URL without user-info. A partial set (some but not all required keys) or an invalid value SHALL NOT stop the service: the provider is disabled, one startup warning names the offending keys (never values), and the provider contributes no tools and no menu group.

#### Scenario: Partial Contentstack set
- **WHEN** only `CONTENTSTACK_API_KEY` is set
- **THEN** the service starts, Contentstack is disabled, and a startup warning names `CONTENTSTACK_MANAGEMENT_TOKEN` as missing

#### Scenario: Bad Stripe key
- **WHEN** `STRIPE_SECRET_KEY=hello`
- **THEN** Stripe is disabled, the warning names `STRIPE_SECRET_KEY` and does not contain `hello`

#### Scenario: Region default
- **WHEN** `CONTENTSTACK_REGION` is not set but both Contentstack secrets are
- **THEN** Contentstack is enabled with region `na`

### Requirement: Algolia URL is not a server-side request forgery vector
The Algolia URL SHALL be rejected during configuration validation (provider disabled, warning naming `ALGOLIA_MCP_URL`) when its host is an IP literal in a loopback, private, link-local (including `169.254.169.254`) or unique-local range, `localhost`, `*.internal` or `metadata.google.internal`, or when it contains user-info; the check SHALL be repeated when the source builds its connection, and the MCP transport SHALL use `redirect: "error"`.

#### Scenario: Metadata endpoint
- **WHEN** `ALGOLIA_MCP_URL=https://169.254.169.254/mcp`
- **THEN** Algolia is disabled at startup and no outbound request is ever made to it

### Requirement: Read-only provider status endpoint
`GET /service/mcp/providers` SHALL require a verified Merchant Center session (any project member with access to the app, administrator or not; administrators are users whose Merchant Center user id is in `ADMIN_USER_IDS`, change D), SHALL be the only route of this change under `/service/mcp`, and SHALL return `{ success: true, data: [ { provider, configured, enabled, missingKeys } ] }` for `contentstack`, `algolia` and `stripe`, in that order, where `configured` means every required key is set, `enabled` means configured and valid, and `missingKeys` lists the names of required keys that are unset or invalid (empty when enabled). The response SHALL contain no configuration value, no key length, no URL and no host.

#### Scenario: Status for an administrator
- **WHEN** Stripe is fully configured, Contentstack lacks its management token and Algolia has nothing set
- **THEN** the data is `[{contentstack, configured:false, enabled:false, missingKeys:["CONTENTSTACK_MANAGEMENT_TOKEN"]}, {algolia, configured:false, enabled:false, missingKeys:["ALGOLIA_MCP_URL"]}, {stripe, configured:true, enabled:true, missingKeys:[]}]`

#### Scenario: Member who is not an administrator
- **WHEN** a signed-in user whose user id is not in `ADMIN_USER_IDS` calls `GET /service/mcp/providers`, with or without a forged `x-admin-email` header, `userEmail` query parameter or `userLabel` body field naming an administrator
- **THEN** the response is 200 with the same data, identical for every member

#### Scenario: Unauthenticated
- **WHEN** the request carries no valid Merchant Center session
- **THEN** the response is 401 or 403 per change D and no status is revealed

#### Scenario: No values leak
- **WHEN** all keys are set to the sentinel values `sk_test_SENTINEL`, `https://sentinel.example/mcp`, `cs_key_SENTINEL`
- **THEN** the serialised response contains none of the sentinels

### Requirement: Responses use the service envelope
Success SHALL be `{ success: true, data }`; errors `{ success: false, error }` with 401/403/500 and no internals.

#### Scenario: Unexpected failure
- **WHEN** reading the provider status throws unexpectedly
- **THEN** the response is 500 with a generic message
