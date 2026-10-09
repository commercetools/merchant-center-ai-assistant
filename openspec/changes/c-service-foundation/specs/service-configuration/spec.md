## ADDED Requirements

### Requirement: Single validated configuration entry point
The service SHALL read `process.env` in exactly one module (`service/src/config/`) through `readConfiguration()`, which returns a deeply frozen `AppConfig` cached after first success. No other module MUST read `process.env` (enforced by an ESLint `no-restricted-properties` rule with an allow-list of that directory and `tests/`).

#### Scenario: Repeated calls return the same object
- **WHEN** `readConfiguration()` is called twice
- **THEN** both calls return the identical frozen object

#### Scenario: Direct env access is a lint error
- **WHEN** a file outside `src/config/` contains `process.env.FOO`
- **THEN** `npm run lint` fails

### Requirement: Fail fast with named keys and no values
`readConfiguration()` MUST validate every section and throw one `Error` whose message lists every invalid or missing key as `KEY: <rule violated>` and never contains a configured value. `src/index.ts` MUST call it before `app.listen`, log the message with `logger.error`, and exit with code 1.

#### Scenario: Several problems reported together
- **WHEN** `CTP_PROJECT_KEY` is missing and `LOG_LEVEL=loud`
- **THEN** the thrown message contains both `CTP_PROJECT_KEY` and `LOG_LEVEL` and neither `loud` nor any secret value

#### Scenario: Process refuses to start
- **WHEN** the service is started with an invalid configuration
- **THEN** it exits with code 1 and never binds the port

### Requirement: AppConfig sections and owners
`AppConfig` SHALL be composed of independently parsed sections: `server`, `ctp`, `auth`, `persistence`, `gcp`, `llm`, `cache`, `providers` and `integrations`, each implemented in `service/src/config/sections/<name>.ts` and registered in one list. Spec C owns `server`, `ctp`, `cache`; spec D owns `auth` (except the parsing of `auth.adminUserIds`, which spec C owns, see `Administrator user id allowlist`); spec E owns `persistence`; spec F owns `gcp` and `llm`; spec C owns the `providers` section (its validators are completed by spec J). Later specs MAY add keys to `integrations` (or a new section) by adding a section file and one registry line, and MUST add the key to the env-key registry in `design.md`'s successor documentation and to `connect.yaml`.

#### Scenario: Section registration
- **WHEN** a new section file is added to the registry
- **THEN** its parsed value appears on `AppConfig` and its errors are reported together with all other sections' errors

### Requirement: Environment rules
`NODE_ENV` SHALL be one of `development`, `test`, `production` (default `production` when unset, because Connect does not set it). When `NODE_ENV=production`: `MC_AUTH_DISABLED` MUST be absent or `false`, and `PERSISTENCE_DRIVER` MUST NOT be `memory`; violating either MUST fail configuration. The service MUST NOT import `dotenv`; local runs load `service/.env.local` through `node --env-file`.

#### Scenario: Bypass refused in production
- **WHEN** `NODE_ENV=production` and `MC_AUTH_DISABLED=true`
- **THEN** `readConfiguration()` throws a message naming `MC_AUTH_DISABLED`

#### Scenario: Memory persistence refused in production
- **WHEN** `NODE_ENV=production` and `PERSISTENCE_DRIVER=memory`
- **THEN** `readConfiguration()` throws a message naming `PERSISTENCE_DRIVER`

### Requirement: Connect-injected commercetools credentials
The `ctp` section SHALL read `CTP_PROJECT_KEY`, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_SCOPE`, `CTP_API_URL`, `CTP_AUTH_URL` (injected by Connect when `inheritAs.apiClient.scopes` is set) and `CTP_REGION` (standard configuration, API-host spelling such as `us-central1.gcp`). `CTP_PROJECT_KEY` and `CTP_REGION` are always required; the client credentials and URLs are required unless `PERSISTENCE_DRIVER=memory`. The section MUST derive `mcCloudIdentifier` (`gcp-us`, `gcp-eu`, `gcp-au`, `aws-eu`, `aws-us`) from `CTP_REGION` and fail on an unknown region.

#### Scenario: Region mapping
- **WHEN** `CTP_REGION=europe-west1.gcp`
- **THEN** `config.ctp.mcCloudIdentifier` is `gcp-eu`

#### Scenario: Unknown region
- **WHEN** `CTP_REGION=mars-1.gcp`
- **THEN** configuration fails naming `CTP_REGION`

### Requirement: Single commercetools API client
The service SHALL expose `getApiRoot()` returning a `ByProjectKeyRequestBuilder` built once from `AppConfig.ctp` with `@commercetools/ts-client` (client-credentials flow, retry on 5xx/network errors with exponential backoff) and MUST NOT register the concurrent-modification middleware (callers re-read and re-merge on 409).

#### Scenario: Built once
- **WHEN** `getApiRoot()` is called twice
- **THEN** the same instance is returned and one OAuth client was constructed

### Requirement: Secrets never serialised
`AppConfig` secret fields (`ctp.clientSecret`, `persistence.encryptionKey`, `gcp.serviceAccount`, `providers.contentstack.apiKey`, `providers.contentstack.managementToken`, `providers.algolia.url`, `providers.stripe.secretKey`) SHALL be wrapped in a `Secret<T>` holder whose `toJSON()` and `toString()` return `"[secret]"`; `logger` output of the whole config MUST NOT reveal them.

#### Scenario: Logging the config object
- **WHEN** `JSON.stringify(readConfiguration())` is evaluated
- **THEN** the result contains `[secret]` and no secret value

### Requirement: Third-party providers come from deployment configuration
The `providers` section SHALL read `CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN` (secured), `CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION` (standard, region default `na`), `ALGOLIA_MCP_URL` (secured), `STRIPE_SECRET_KEY` (secured) and `STRIPE_CONNECTED_ACCOUNT_ID` (standard). A provider SHALL be enabled if and only if all of its required keys (Contentstack: API key and management token; Algolia: URL; Stripe: secret key) are set and valid. A partial or invalid set SHALL NOT fail startup: the provider is disabled and `warnings` names the keys (never values). `AppConfig.providers.status` SHALL list `{ provider, configured, enabled, missingKeys[] }` for `contentstack`, `algolia` and `stripe`.

#### Scenario: Fully configured provider
- **WHEN** `STRIPE_SECRET_KEY` is set
- **THEN** `providers.stripe` is enabled and the status entry is `{ provider: "stripe", configured: true, enabled: true, missingKeys: [] }`

#### Scenario: Partial Contentstack set
- **WHEN** `CONTENTSTACK_API_KEY` is set and `CONTENTSTACK_MANAGEMENT_TOKEN` is not
- **THEN** startup succeeds, Contentstack is disabled, `missingKeys` is `["CONTENTSTACK_MANAGEMENT_TOKEN"]` and a warning names that key without any value

#### Scenario: Nothing configured
- **WHEN** none of the provider keys is set
- **THEN** all three providers are disabled and `warnings` is empty

### Requirement: Administrator user id allowlist
The `auth` section SHALL expose `adminUserIds: readonly string[]` parsed from the optional `ADMIN_USER_IDS` standard configuration key by `parseAdminUserIds`. An unset or whitespace-only value SHALL yield `[]` (nobody is an administrator). The value SHALL be split on commas (semicolons and whitespace between entries SHALL also separate entries); entries SHALL be trimmed and de-duplicated (first position wins, comparison is exact and case-sensitive); empty segments SHALL be ignored; more than 50 entries SHALL be an error `ADMIN_USER_IDS: at most 50 entries`; an entry that does not match `^[A-Za-z0-9._:-]{1,128}$` SHALL be an error `ADMIN_USER_IDS: entry <n> is not a valid user id` where `n` is the 1-based position among the non-empty entries. Error messages MUST NOT contain the entry text. Startup SHALL fail through the normal aggregated configuration error. When the resulting list is empty the service SHALL log `ADMIN_USER_IDS is empty: no administrator` once at startup at `warn` level. The service MUST NOT read any permission-name key (the legacy `ADMIN_PERMISSION_KEY` is removed).

#### Scenario: Whitespace, duplicates and semicolons
- **WHEN** `ADMIN_USER_IDS=" u-1, u-2 ;u-1,\n u-3,"`
- **THEN** `config.auth.adminUserIds` equals `["u-1", "u-2", "u-3"]`

#### Scenario: Case is significant
- **WHEN** `ADMIN_USER_IDS="Abc,abc"`
- **THEN** `config.auth.adminUserIds` equals `["Abc", "abc"]`

#### Scenario: Unset or blank means nobody and a warning
- **WHEN** `ADMIN_USER_IDS` is unset or `"   "`
- **THEN** `config.auth.adminUserIds` is `[]`, startup succeeds and one `warn` log line `ADMIN_USER_IDS is empty: no administrator` is written

#### Scenario: Invalid entry
- **WHEN** `ADMIN_USER_IDS="u-1,alice@example.com,u-3"`
- **THEN** `readConfiguration()` throws a message containing `ADMIN_USER_IDS: entry 2 is not a valid user id` and not containing `alice@example.com`

#### Scenario: Too many entries
- **WHEN** `ADMIN_USER_IDS` contains 51 distinct valid ids
- **THEN** `readConfiguration()` throws a message containing `ADMIN_USER_IDS: at most 50 entries`

#### Scenario: Reported together with other problems
- **WHEN** `ADMIN_USER_IDS` contains an invalid entry and `LOG_LEVEL=loud`
- **THEN** one thrown message names both `ADMIN_USER_IDS` and `LOG_LEVEL`
