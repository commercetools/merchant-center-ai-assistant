## Context

Change **J** ports the non-commercetools-project tool sources and their deployment-configuration handling (validation + read-only status endpoint). Needs: C, H (and D for the session). "R/" = `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/`; "C/" = `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/`. Planning date 2026-10-08. Owner decisions in force: Q2 keep Contentstack (DECIDED; it is a third-party integration, unrelated to the retired `cms` package), Q3 Nimbus embedded (DECIDED, change K), **Q4 provider credentials are Connect `securedConfiguration`/`standardConfiguration` (DECIDED 2026-10-09: no admin UI, no Custom Objects)**.

## Goals / Non-Goals

**Goals:** feature parity for Knowledge MCP, Contentstack, Algolia, Stripe; credentials supplied only as deployment configuration, validated at startup and never exposed (a read-only status endpoint reports configured/enabled, never values); best-effort failure semantics proven by tests; each provider is one `ToolSource` file set.
**Non-Goals:** see proposal "Out of scope".

## Explore findings

### Knowledge MCP
1. **[probe 2026-10-08]** `POST https://docs.commercetools.com/apis/mcp` `initialize` (protocol `2025-06-18`) answers `serverInfo.name = "commercetools knowledge"`, `capabilities: tools, prompts, resources`, no authentication. This session's own Knowledge MCP exposes the same six tools (`commercetools-documentation-search`, `-documentation-by-id`, `-graphql-schemata`, `-oas-schemata`, `-graphql-validate`, `-rest-validate`) and the prompt `commercetools-developer-tips` ("recommended to read this ... best practice patterns"). Docs page: https://docs.commercetools.com/dev-tooling/mcp/knowledge-mcp (HTTP 200).
2. **[code]** Legacy hardcodes the URL, follows redirects (`redirect:'follow'`, v2 SDK defaults to `error`), caches 30 min, warns on tool drift, and filters by the session group (`R/service/src/client/ct-knowledge.mcp.ts` 1-144).
3. **[code]** `AgentDefinition.getPrompt` is synchronous in legacy, so the tips are fetched during `createCommercetoolsKnowledgeAgent` and read back from a module memo by `getDeveloperTipsSection(req)`; the request carries a flag `knowledgeToolsEnabled` set as a side effect (`ct-knowledge.mcp.ts` 20-35, 86-96, 140). Fragile ordering ("both callers build their tools before their instructions"). **Port keeps the memo but replaces the request side-effect flag by per-request state on the ToolSource context.**
4. **[code]** `getMcpTools`: in-process cache (default `MCP_TOOLS_TTL_MS` 30 min), handshake deadline `MCP_HANDSHAKE_TIMEOUT_MS` default 10 s, abandoned handshake still fills the cache, returns `null` rather than throwing (`R/service/src/cache/mcp-tools.cache.ts` 12-35, 249-376). Tested by `tests/wire/mcp-handshake-timeout.spec.ts`. These helpers belong to change H (they also serve I and K); J consumes them. If H did not ship them, task 0.2 stops the work.

### Legacy configuration API (facts kept for context; NOT ported after owner decision Q4)
5. **[code]** `R/service/src/routes/mcp.route.ts`: `GET /configs`, `POST /configs` (409 when provider exists), `PUT /configs/:configId`, `DELETE /configs/:configId`, `POST /configs/upsert`; middleware is `[verifyMcSession, validateProject]` only - **no admin check**, and `POST` accepts any `provider` string (only truthiness is checked, lines ~60-75).
6. **[code]** Legacy FEATURES.md "Known gaps" confirms: "Third-party MCP credentials ... are stored **unencrypted** and the write routes are project-scoped, not admin-gated ... `MCPProvider` also lists `'commercetools'` and `'commercetools-knowledge'`, which have no config shape" (R/FEATURES.md ~line 676). Blanking: `sanitizeMCPConfigForFrontend` replaces sensitive fields with `''` (`firestore.utils.ts` 918-935). Keep-on-empty: `updateMCPConfig` drops sensitive keys whose value is `''` (lines ~1085-1105). Sensitive map `SENSITIVE_FIELDS` = contentstack `[apiKey, managementToken]`, stripe `[secretKey]`, algolia `[]` (`types/mcp.types.ts` 60-75). Secrets are stored **in clear text** in Firestore (legacy) - the single-tenant port does not store them at all: they are Connect configuration (Q4).
7. **[code]** Legacy ids are uuids generated per config and the frontend echoes `config.id` (C/mc-app `use-chat-service-connector.ts` 220-325: `PUT/DELETE /mcp/configs/${configId}`, `POST /mcp/configs/upsert`). Not ported: there are no config ids any more; change Q drops these connector methods.
8. **[code]** Config form components: `C/mc-app/src/components/configure-mcp/{contentstack,algolia,stripe}-config.tsx`, shown only for admins (`useIsAssistantAdmin`). Not ported: change Q shows read-only status cards instead.
9. **[doc]** Connect configuration: `standardConfiguration` values are plain environment variables, `securedConfiguration` values are write-only secrets; both change only through a configuration redeploy (`deployment redeploy --configuration KEY=VALUE`, runbook in change U); https://docs.commercetools.com/connect/development.md . Keys are declared in `connect.yaml` by change B and read once by `readConfiguration()` (change C `providers` section).

### Contentstack
10. **[code]** 15 tools: `CONTENTSTACK_UPDATE_TOOLS` (10) + `CONTENTSTACK_READ_TOOLS` (5) in `R/service/src/constants.ts` 14-40; implementation `R/service/src/client/contentstack.ai-sdk.ts` (1,739 lines, class `ContentstackAgent` with `allTools` map, hand-built zod input schemas, direct HTTP to `https://api.contentstack.io/v3`, headers `api_key` + `authorization` (+ `branch`)); returns `{}` when `apiKey`/`managementToken` missing (lines 1700-1722). Types in `R/service/src/types/contentstack.ts` (138 lines).
11. **[doc]** Content Management API base URL is **region specific**: NA `https://api.contentstack.io/`, EU `https://eu-api.contentstack.com/`, AU `https://au-api.contentstack.com/`, Azure NA/EU `https://azure-{na,eu}-api.contentstack.com/`, GCP NA/EU `https://gcp-{na,eu}-api.contentstack.com/` - https://www.contentstack.com/docs/administration/api-endpoints. Legacy hardcodes NA, so EU/AU stacks cannot work. Port adds an optional `region` (default NA, parity).
12. **[code]** Contentstack agent `createAgent` uses `toolChoice: 'auto'` and model `providers/gemini` (`agents/definitions/contentstack.agent.ts`); agent definitions are owned by H, J supplies only the source.

### Algolia
13. **[code]** `algolia.mcp.ts` (33 lines): reads config, `getMcpTools({cacheKey: 'algolia:{project}', url, ttlMs: 10 min})`, returns `null` on failure. No headers; the URL is the only credential-like value. **Finding: the session switch is not honoured.** The menu shows a pseudo tool `all_tools` (`controllers/tools.controller.ts` 138-145) but neither `algolia.mcp.ts` nor `algolia.agent.ts` reads `disabledTools` (`grep all_tools` finds only the menu). **Fixed in the port: change H's registry applies the sentinel (`openspec/changes/h-agents-and-chat-stream/specs/tool-source-registry/spec.md`, "Session tool switches applied centrally": a source whose list contains `all_tools` is dropped).**
14. **[code]** `getMcpTools` default redirect mode is `'error'` - good for an operator-supplied URL; keep. No private-address check exists (SSRF by an operator-supplied URL, e.g. `http://169.254.169.254`) - **hardening added**.

### Stripe
15. **[code]** `stripe.ai-sdk.ts`: `StripeAgentToolkit({ secretKey, configuration: { actions, context: { account } } })`, with `actions` built from enabled `resource.action` names; then `adaptLegacyToolSet` because `@stripe/agent-toolkit@0.7.12` targets ai@4/zod@3 (`parameters`, `z.record(z.any())`, `z.tuple`) while the service runs ai 7 + zod 4 (`legacy-tool-schema.ts` docblock lines 1-40; test `tests/wire/legacy-tool-schema.spec.ts`).
16. **[npm probe 2026-10-08]** `@stripe/agent-toolkit` latest is **0.9.0**, peer `ai ^5.0.89`, depends on `zod ^3.25.76`; its `ai-sdk` build contains `inputSchema` (2 hits, 0 `parameters:`), i.e. fix 1 of the shim (parameters -> inputSchema) is probably no longer needed, fixes 2 and 3 (zod 3 constructs under zod 4) probably still are. Upgrade is a **spike in task 7.1**, not a given. Latest `ai` is 7.0.134 and `@ai-sdk/mcp` 2.0.71 (legacy pins 7.0.92 / ^2.0.44) - H decides versions.
17. **[doc]** Stripe's hosted MCP server (`https://mcp.stripe.com`) is a different integration: from **2026-10-31** it no longer accepts full-access secret keys or restricted keys without the Agent tag ("Update API key authentication by October 31, 2026") - https://docs.stripe.com/mcp. The toolkit used here calls the Stripe REST API with the key directly, so the change does not apply to it, but the README SHOULD recommend a **restricted key limited to the tools the operator wants** and the `STRIPE_SECRET_KEY` description in `connect.yaml` (change B) and the docs SHOULD say so.
18. **[code]** Stripe names: `STRIPE_UPDATE_TOOLS` (11) + `STRIPE_READ_TOOLS` (13) = 24 (`constants.ts` 44-70; matches https://docs.stripe.com/mcp "#tools" naming at the time of writing).

### Menu
19. **[H contract]** Change H's `ToolSource` is `{ name, displayName, order, isEnabled(ctx), getTools(ctx), listForMenu(ctx) -> {toolNames}|null, getPrompt(ctx) }` with `ToolContext = { user, sessionId, session, locale, projectSystemPrompt, temporaryTableMessages, urlReferences, config, stores, abortSignal, budget, logger }`; the registry owns timeout (15 s), isolation, `disabledTools`, Gemini normalisation, prompt gating, and implements G's `ToolMenuProvider`. The legacy per-agent `createAgent` factories are dead code (the active orchestrator is flat - H finding 1), so the J sources replace `contentstack.agent.ts`, `algolia.agent.ts`, `stripe.agent.ts` and the knowledge half of `commercetools.agent.ts` entirely; their prompts stay in H (`agents/prompts/*`, H risk R-H5), the Knowledge tips come from J.
20. **[code]** `tools.controller.ts` 102-150 builds groups: commercetools (live, I), knowledge (always), contentstack/algolia/stripe only `if config.enabled`; Algolia has the pseudo tool `all_tools`. Session state is the negative list `disabledTools[group]` (G). The `ToolSource.listForMenu` of this change replaces that hand-built list.

## Glossary

- **MCP / Model Context Protocol**: JSON-RPC protocol through which an agent lists and calls tools; here over streamable HTTP.
- **Knowledge MCP**: public commercetools docs/schema/validation MCP server (no auth).
- **ToolSource**: registry entry from change H (`name`, `displayName`, `order`, `isEnabled(ctx)`, `getTools(ctx)`, `listForMenu(ctx)` -> `{toolNames}|null`, `getPrompt(ctx)`); the registry owns timeouts, isolation, session switches, normalisation and prompt gating.
- **Tool group / menu group**: the name under which tools appear in the per-session tools menu (`mcp` field); equals the ToolSource name.
- **Negative list**: session `disabledTools = { [group]: string[] }`; anything absent is enabled.
- **Provider keys**: the seven deployment configuration keys (`CONTENTSTACK_*`, `ALGOLIA_MCP_URL`, `STRIPE_*`); secrets are `securedConfiguration`.
- **Handshake deadline**: time we wait for `initialize`+`tools/list` before continuing without the tools.
- **Enabled provider**: all required keys set and valid (the only on/off switch; the session menu switches are separate).
- **SSRF**: server-side request forgery - making the service call an internal address.

## Source map

| Legacy file (R/service/src/...) | New file (service/src/...) | Verdict |
|---|---|---|
| `routes/mcp.route.ts` | `mcp-providers/{controller,routes}.ts` | CHANGE: five CRUD routes DROPPED; one read-only `GET /providers` (status only), envelope from G |
| `services/mcp.service.ts` | `mcp-providers/status.ts` | CHANGE: pure `getProviderStatuses(config.providers)`; no store, no encryption, no write path |
| `types/mcp.types.ts` | `mcp-providers/{types,schemas}.ts` | CHANGE: drop `commercetools*` pseudo providers and `SENSITIVE_FIELDS`; zod schemas validate deployment values |
| `utils/firestore.utils.ts` 915-1170 | - | DROP (credentials are Connect configuration, change C `providers` section) |
| `client/ct-knowledge.mcp.ts` | `tool-sources/knowledge/source.ts`, `tips.ts` | CHANGE: ToolSource, per-request state instead of request flag |
| `client/contentstack.ai-sdk.ts` | `tool-sources/contentstack/{source,client,tools-content-type,tools-entry,tools-global-field}.ts` | KEEP logic, split file, add region |
| `types/contentstack.ts` | `tool-sources/contentstack/types.ts` | KEEP |
| `client/algolia.mcp.ts` | `tool-sources/algolia/source.ts` | CHANGE: honour `all_tools`, URL from `config.providers.algolia`, cache key by URL hash |
| `client/stripe.ai-sdk.ts`, `client/legacy-tool-schema.ts` | `tool-sources/stripe/{source,legacy-tool-schema}.ts` | KEEP (+ spike 7.1 to shrink the shim) |
| `controllers/tools.controller.ts` (groups) | each source's `listForMenu` (H's registry implements G's `ToolMenuProvider`) | CHANGE |
| `constants.ts` (group names, tool lists) | `tool-sources/*/constants.ts` | CHANGE: per source |
| `cache/mcp-tools.cache.ts` | owned by H | consumed |
| `functional-agent/agents/definitions/{contentstack,algolia,stripe}.agent.ts`, prompts | owned by H | consumed |
| `tests/wire/legacy-tool-schema.spec.ts` | `tests/tool-sources/stripe/legacy-tool-schema.spec.ts` | KEEP |
| `tests/wire/mcp-handshake-timeout.spec.ts` | owned by H | - |
| `ARCHITECTURE`/`FEATURES` mentions of Firestore `mcp_configs` | - | DROP |
| `client/algolia.mcp.ts` URL check (none) | `mcp-providers/ssrf.ts` | NEW: applied at config validation and at connect time |

## Decisions

**DJ-1. Provider credentials are Connect configuration (owner decision Q4, 2026-10-09).** Keys: `CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN` (secured), `CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION` (standard, default `na`), `ALGOLIA_MCP_URL` (secured: the URL may embed a key), `STRIPE_SECRET_KEY` (secured), `STRIPE_CONNECTED_ACCOUNT_ID` (standard). They are read once by `readConfiguration()` (change C `providers` section); J owns **no storage code and no write API**. Consequence accepted by the owner: rotating or changing a key needs a Connect configuration redeploy (documented in change U's runbook), and there is no runtime enable/disable toggle (remove the keys to disable). Alternatives rejected by the owner: admin UI + AES-GCM-encrypted Custom Objects (the earlier default; larger attack surface: write routes, ciphertext readable by `view_key_value_documents` holders, key-rotation tooling).

**DJ-2. Enablement rule: enabled iff all required keys are set and valid; partial or invalid sets warn and disable, never fail startup.** Required: Contentstack API key + management token; Algolia URL; Stripe secret key. Optional: branch, region, connected account. Providers are optional integrations, so one typo must not take the assistant down (alternative: fail fast - rejected). Warnings list key names only. C ships presence logic and the exported types; J adds the format validators (zod `.strict()`-style per provider, messages that never echo the value) to the same section file.

**DJ-3. Read-only `GET /service/mcp/providers` for any verified member; no admin gate.** It returns `{provider, configured, enabled, missingKeys[]}` only, which discloses no secret, URL or host, so admin gating adds nothing; Q shows it as status cards (administrators listed in `ADMIN_USER_IDS` additionally see the setup hint; everyone else sees only the status). Alternative: admin only (the legacy GET leaked the Algolia URL, this one cannot) - rejected as unnecessary. Alternative: no endpoint, derive from the tools menu - rejected: the menu hides unconfigured providers, so the UI could not say what is missing.

**DJ-4. Validation with zod per provider; secrets never echoed in warnings or errors.** Alternative: trust the deployment values - rejected: a typo'd `STRIPE_SECRET_KEY` would otherwise surface as a failing tool call mid-chat.

**DJ-5. Algolia SSRF guard = syntactic host check + `redirect:'error'`, applied at startup validation and again when the source connects.** DNS rebinding is not solved (resolve-then-connect pinning would need a custom dispatcher); accepted risk because the URL is operator-supplied deployment configuration (not user input). Alternative: allow-list `*.algolia.com` - rejected: self-hosted/proxied Algolia MCP is legitimate; revisit in Open question OQ-J2.

**DJ-6. Failure isolation is H's registry job; J's sources add only safe logging.** The registry (spec `tool-source-registry`) applies a 15 s per-source timeout, catches throws/rejections, and drops the prompt of a source that contributed no tools - so no "unavailable" prompt is needed or possible (the preamble is generated from contributing sources only). Sources catch *expected* failures (unreachable endpoint, bad credentials), log provider + error class + duration without URLs or secrets, and return `{}`; unexpected errors propagate to the registry. Alternative (legacy): each agent definition swallowed errors with `console.error` - rejected.

**DJ-7. Contentstack: port the 1,739-line client as-is but split by resource and test through an injectable `fetch`.** Alternative: rewrite on the official `@contentstack/management` SDK - rejected: no behaviour benefit, large review surface, changes tool outputs. Region support is additive.

**DJ-8. Honour `all_tools` for Algolia through the registry sentinel.** H's registry drops a source whose `disabledTools[name]` contains `all_tools` before calling it (spec "Session tool switches applied centrally"), which fixes the legacy no-op switch without any Algolia-specific code; the source only has to return `{ toolNames: ['all_tools'] }` from `listForMenu`. Alternative: expand to the real tool names in the menu - rejected: a handshake per menu render.

**DJ-9. Stripe toolkit stays in-process, key from deployment configuration.** Alternative: Stripe's hosted MCP with OAuth/agent keys - rejected for v1: needs per-user OAuth plumbing (see change I) and the key policy is in flux (finding 17).

**DJ-10. Knowledge tips memo lives next to the source; `getPrompt(ctx)` is synchronous in H's contract.** `getTools` warms the memo (the registry resolves tools before building instructions), `getPrompt` reads it. Because the registry includes a source's prompt only when the source contributed tools, the legacy request flag `knowledgeToolsEnabled` is no longer needed. Alternative: ask H for an async `getPrompt` - not needed.

## Risks / Trade-offs

- **[Contentstack file is big]** -> split by resource, keep tool names/descriptions byte-identical to preserve model behaviour; tests assert names and zod schemas per tool.
- **[Stripe toolkit/zod/ai version mismatch]** -> keep the shim and its test until spike 7.1 proves it unnecessary; pin exact versions.
- **[Secrets in Connect configuration]** visible to anyone who can read the deployment's configuration in the Connect API (secured values are write-only after deploy) -> least-privilege keys (Stripe restricted key, scoped Contentstack token); rotation = configuration redeploy (change U runbook).
- **[Status endpoint open to members]** -> returns only names and booleans; unit test with sentinel values proves nothing else is serialised.
- **[Config changes need a redeploy]** -> documented in the runbook and the status card text ('Configured at deployment (Connect configuration)').
- **[Algolia URL as credential]** appears in server logs if logged -> log host only; secured configuration.
- **[Prompt injection through third-party tool output]** (Contentstack entries, Stripe data) can steer the model into write tools -> existing mitigation is the session menu switches; document read-only presets (disable all update tools) in README; no new enforcement in v1.
- **[Knowledge MCP is a public dependency]** -> best-effort + fallback names + 30 min cache.
- **[Cost]** Stripe/Contentstack calls are billed to the operator's accounts -> README note.

## Migration Plan

Fresh deployment; no data import (legacy secrets are in another project's Firestore). To enable a provider, set its keys with a configuration redeploy (`--configuration KEY=VALUE`, change U); to disable it, clear them. Rollback = redeploy with the previous configuration. Deployment order: C, H first; J's route mounts under `/service/mcp`.

## Open questions

- **OQ-J1** (resolved) H's `getPrompt` is synchronous; the memo approach (DJ-10) stands. Residual: confirm H resolves tools before building instructions (spec "Orchestrator composition") so the memo is warm.
- **OQ-J2** Allow-list for Algolia hosts or syntactic guard only? Default: syntactic guard.
- **OQ-J3** (resolved, Q4) Credentials are Connect `securedConfiguration`; no UI, no Custom Objects.
- **OQ-J4** (resolved, Q2) Contentstack is kept; `CONTENTSTACK_REGION` (default `na`) is the only addition.
- **OQ-J5** (resolved) The Algolia URL is a secured key (`ALGOLIA_MCP_URL`) because it may embed a key; no store, no version handling.
- **OQ-J6** (resolved) `GET /service/mcp/providers` is open to any verified member because it returns no values (DJ-3).

## Changelog

- 2026-10-09 (owner decision Q4): replaced the encrypted `McpConfigStore` + admin CRUD API with Connect deployment configuration (`config.providers`, change C), startup validation (zod, Contentstack region, Algolia SSRF guard) and a read-only `GET /service/mcp/providers` status endpoint; removed the Custom Object container `ai-assistant-mcp-configs`, `McpConfigService`, the cache-invalidation hook and the write routes; DJ-1..DJ-5 rewritten; tasks 2.x/3.x replaced; E2E-J-02/03 reworked. Needs now C, H, D (E no longer needed by J).
- 2026-10-09 (owner decision: admin by user id; Q12/Q46 test users): wording only. "Admin" means a user whose Merchant Center user id is in `ADMIN_USER_IDS` (no permission group); the providers status route stays open to every verified member; the non-admin scenario includes a forged-label/e-mail case; E2E-J-02/J-03 run as the admin user A and the non-admin user B of the scratch project. No change to tasks structure or numbering.
