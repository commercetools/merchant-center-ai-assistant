## Why

Besides the project's own Managed MCP Server (change I), the assistant talks to four other tool providers: the public commercetools **Knowledge MCP**, **Contentstack** (15 content-management tools), **Algolia** (a remote MCP URL) and **Stripe** (agent toolkit). In the multitenant router their credentials live in a per-project Firestore collection, the `/mcp/configs` API has **no admin check and no input validation** (any signed-in user can store any provider string, and an admin-supplied Algolia URL is fetched server-side without restrictions), and the Algolia "all tools" switch in the tools menu is never honoured. Owner decision **Q4**: in the single-tenant Connect connector these credentials are **not** entered in an admin UI and **not** stored in Custom Objects - they are Connect deployment configuration (secrets in `securedConfiguration`, non-secrets in `standardConfiguration`). This change reads them from `AppConfig.providers` (change C), validates them at startup, plugs the providers into the `ToolSource` registry from change H and exposes a read-only status endpoint.

## What Changes

- **Change ID: J** (`j-third-party-tool-sources`). **Needs:** C (`config.providers` section and keys), H (`ToolSource` registry, MCP client helpers, agent definitions), D (verified session). Unblocks: Q (read-only MCP providers status cards), U (postDeploy reports configured providers), V.
- Provider configuration comes from deployment keys: `CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN` (secured), `CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION` (standard, default `na`), `ALGOLIA_MCP_URL` (secured), `STRIPE_SECRET_KEY` (secured), `STRIPE_CONNECTED_ACCOUNT_ID` (standard). A provider is enabled iff its required keys are set and valid; a partial or invalid set logs a startup warning (key names only) and disables the provider.
- J completes change C's `providers` section with **format validation** (zod per provider, Contentstack region, Stripe key shape, Algolia URL SSRF guard), applied at startup and again when a source connects.
- **No configuration API**: the legacy `/mcp/configs` CRUD and `upsert` are not ported. A read-only **`GET /service/mcp/providers`** (any verified project member) returns only `{ provider, configured, enabled, missingKeys[] }` - never values.
- Port four **`ToolSource`s**: `commercetools-knowledge` (public Knowledge MCP + developer-tips prompt fragment, no configuration), `contentstack` (15 tools, direct Content Management API), `algolia` (remote MCP, all-or-nothing group), `stripe` (agent toolkit, 24 tool names, `namespace.action` filter).
- **Best-effort failure behaviour** specified and tested: a provider that is unconfigured, unreachable, slow or misconfigured contributes zero tools and never fails a turn; the registry drops the prompt of a source that contributed no tools, so the model is never told about tools it lacks.
- **Tool-menu groups**: each source's `listForMenu` produces the group the G tools-menu endpoint shows; group visible only when the provider is enabled (Knowledge is always visible).
- Fix legacy defects found: Algolia `all_tools` switch is now honoured; Stripe tool names derived from a typed constant; the `commercetools` and `commercetools-knowledge` pseudo-providers are not provider names; Contentstack gets a `CONTENTSTACK_REGION` (NA default) so EU/AU stacks work.
- **BREAKING (vs. legacy):** providers are configured at deployment (changing a key needs a Connect configuration redeploy, no admin forms, no runtime enable/disable toggle); `/mcp/configs*` does not exist.

## Capabilities

### New Capabilities
- `mcp-provider-configs`: provider configuration from Connect deployment keys (enablement rule, startup validation, Algolia SSRF guard) and the read-only provider status endpoint.
- `knowledge-mcp-source`: the commercetools Knowledge MCP tool source and the developer-tips prompt fragment.
- `third-party-tool-sources`: Contentstack, Algolia and Stripe tool sources, menu groups, per-session switches and best-effort failure behaviour.

### Modified Capabilities
<!-- none -->

## Impact

- New code under `service/src/mcp-providers/` (validation schemas, SSRF guard, status function, controller, route) plus the validator hook in change C's `config/sections/providers.ts`, and `service/src/tool-sources/{knowledge,contentstack,algolia,stripe}/`; legacy `contentstack.ai-sdk.ts` (1,739 lines) is ported mostly verbatim and split by tool group.
- Dependencies: `@stripe/agent-toolkit` (spike: 0.9.0 emits `inputSchema` already; legacy pinned 0.7.12 needing `parameters` -> `inputSchema` adaptation), `zod`, `@ai-sdk/mcp` (via H). The seven provider keys are added to `connect.yaml` by change B and to the env-key registry by change C; no new Connect scopes; no Custom Object containers. `MCP_TOOLS_TTL_MS` (standard config, default 30 min) governs Knowledge/Algolia tool caches.
- Consumers: Q (`GET /mcp/providers`, read-only status cards), U (postDeploy log of configured providers, via the same status function), G (menu groups via `listForMenu`), H (agents `contentstack`, `algolia`, `stripe`, `commercetools`), V (E2E-J-*).

## Out of scope

- The identity-mode commercetools tools (change I) and the Nimbus MCP (change K).
- The agent registry, orchestrator, prompts of the agents themselves, schema normalisation (H); the tools-menu endpoints (G); the status cards (Q).
- Any UI or API to enter, edit or delete provider credentials, and any runtime enable/disable toggle (owner decision Q4); storage of credentials in Custom Objects.
- OAuth against Stripe's hosted MCP server (`https://mcp.stripe.com`); the toolkit calls the Stripe REST API with the configured key.
- New Contentstack features beyond the 15 existing tools.

## Legacy source

Read-only, under `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/`:
`src/client/{ct-knowledge.mcp,contentstack.ai-sdk,algolia.mcp,stripe.ai-sdk,legacy-tool-schema}.ts`, `src/routes/mcp.route.ts`, `src/services/{mcp,tools}.service.ts`, `src/types/{mcp.types,contentstack}.ts`, `src/controllers/tools.controller.ts` (menu groups), `src/utils/firestore.utils.ts` lines ~915-1170 (legacy config CRUD, not ported), `src/cache/mcp-tools.cache.ts` (`getMcpTools`, `getMcpPrompt`), `src/constants.ts`, `src/functional-agent/agents/definitions/{contentstack,algolia,stripe,commercetools}.agent.ts`, `src/functional-agent/agents/prompts/{contentstack,algolia,stripe,commercetools}.prompt.ts`, `tests/wire/{legacy-tool-schema,mcp-handshake-timeout,mcp-tool-schema}.spec.ts`.
Frontend contract: `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-app/src/hooks/use-chat-service-connector/use-chat-service-connector.ts` (lines 220-325), `mc-app/src/components/{configuration/configure-mcp-providers.tsx,configure-mcp/*}`.
