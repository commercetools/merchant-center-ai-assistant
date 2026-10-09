## 0. Read first

- [ ] 0.1 Read the context (30-45 min, no code)
      **Why:** the legacy code has several non-obvious behaviours (tips memo, Stripe shim, the dead `all_tools` switch); the legacy config CRUD is NOT ported (owner decision Q4).
      **Where:** this change's `proposal.md`, `design.md` ("Explore findings" 1-19), `specs/*/spec.md`; legacy `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/types/mcp.types.ts`, `client/{ct-knowledge.mcp,algolia.mcp,stripe.ai-sdk,legacy-tool-schema}.ts`, first 120 and last 40 lines of `client/contentstack.ai-sdk.ts`, `controllers/tools.controller.ts` lines 25-150, `cache/mcp-tools.cache.ts` lines 249-376; docs https://docs.commercetools.com/dev-tooling/mcp/knowledge-mcp, https://docs.stripe.com/mcp, https://www.contentstack.com/docs/administration/api-endpoints.
      **Done when:** you can explain (1) why provider credentials are Connect configuration and what a configuration redeploy is, (2) why the Knowledge tips are fetched before the prompt is built, (3) why Stripe tools needed `adaptLegacyToolSet`, (4) why the `all_tools` switch did nothing in the legacy code.
      **Watch out:** ignore anything about `projectKey`, Firestore and `validateProject`.

- [ ] 0.2 Confirm dependencies exist
      **Why:** J cannot compile without E and H.
      **Where:** `service/src/`.
      **How:** find (names per the designs of C/H/D, adjust if the merged code differs): C `config.providers` (`ProvidersConfig`, `ProviderStatus`, `Secret.reveal()`); H `ToolSource`, `ToolContext`, `registerToolSource` and the MCP helper module (`getMcpTools`, `getMcpPrompt`, `normalizeToolSchemas`); D the session middleware (`authed`).
      **Done when:** `grep -rn "ProvidersConfig\|registerToolSource\|getMcpTools" service/src | head` finds all three.
      **Watch out:** if `getMcpTools` is missing, stop and ask for H to be completed (do not re-implement it here).

## 1. Setup

- [ ] 1.1 Create folders and add dependencies
      **Why:** exact layout for later tasks.
      **Where:** create `service/src/mcp-providers/{types.ts,schemas.ts,ssrf.ts,status.ts,controller.ts,routes.ts}`, `service/src/tool-sources/{knowledge,contentstack,algolia,stripe}/` (each with `source.ts`, `constants.ts`), `service/tests/mcp-providers/`, `service/tests/tool-sources/`. SPDX header in every file.
      **How:** `cd service && npm install --save-exact @stripe/agent-toolkit@0.7.12` (parity first; the spike in 7.1 upgrades it) and make sure `zod` v4 is a dependency (`"zod": "^4.1.12"`).
      **Done when:** `npm run build` exits 0; `git status` shows only new files and `package.json`/lockfile.
      **Watch out:** no workspaces; install inside `service/` only.

## 2. Provider configuration validation (deployment keys)

- [ ] 2.1 Define types and zod schemas for the deployment values
      **Why:** single source of truth for what a valid provider configuration is (spec `mcp-provider-configs`); change C's `providers` section calls it.
      **Where:** `mcp-providers/types.ts`, `schemas.ts` (legacy provider shapes in `types/mcp.types.ts`).
      **How:**
      ```ts
      export const PROVIDERS = ['contentstack','algolia','stripe'] as const;
      export type Provider = typeof PROVIDERS[number];
      export const REQUIRED_KEYS: Record<Provider, string[]> = {
        contentstack: ['CONTENTSTACK_API_KEY', 'CONTENTSTACK_MANAGEMENT_TOKEN'],
        algolia: ['ALGOLIA_MCP_URL'],
        stripe: ['STRIPE_SECRET_KEY'],
      };
      export const contentstackEnv = z.object({
        CONTENTSTACK_API_KEY: z.string().min(1), CONTENTSTACK_MANAGEMENT_TOKEN: z.string().min(1),
        CONTENTSTACK_BRANCH: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/).optional(),
        CONTENTSTACK_REGION: z.enum(['na','eu','au','azure-na','azure-eu','gcp-na','gcp-eu']).default('na') });
      export const stripeEnv = z.object({
        STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/),
        STRIPE_CONNECTED_ACCOUNT_ID: z.string().regex(/^acct_[A-Za-z0-9]+$/).optional() });
      export const algoliaEnv = z.object({ ALGOLIA_MCP_URL: z.string().url().refine(u => u.startsWith('https://')) });
      ```
      A helper `validateProvider(provider, rawKeys): { ok: true } | { ok: false; invalidKeys: string[] }` maps zod issues to **key names only** (never `issue.message` or the input).
      **Done when:** `tests/mcp-providers/schemas.spec.ts` (new): bad Stripe key and bad region rejected with the key name, accepted examples, default region `na`, error text never contains the rejected value (use a sentinel); `npx jest tests/mcp-providers/schemas.spec.ts` green.
      **Watch out:** zod's default messages can echo input - build your own messages; unknown optional keys are simply absent (there is no request body any more).

- [ ] 2.2 SSRF guard for the Algolia URL
      **Why:** spec "Algolia URL is not a server-side request forgery vector".
      **Where:** `mcp-providers/ssrf.ts`.
      **How:** `assertPublicHttpsUrl(url: string): void` using `new URL`; reject non-https, `localhost`, `*.internal`, `metadata.google.internal`, IPv4 literals in 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.168/16, IPv6 `::1`, `fc00::/7`, `fe80::/10`; use `node:net` `isIP`. Also reject URLs with user-info (`url.username || url.password`).
      **Done when:** `tests/mcp-providers/ssrf.spec.ts` with 15+ cases (including `https://169.254.169.254/x`, `https://[::1]/`, `https://10.0.0.5`, `https://user:pw@host/x` rejected, `https://mcp.algolia.com/x` accepted) is green.
      **Watch out:** decimal/hex IPv4 forms (`https://2130706433/`) - `new URL` normalises them to dotted form, so test that.

- [ ] 2.3 Complete change C's `providers` section and log startup warnings
      **Why:** the enablement rule (spec: enabled iff required keys are set and valid; partial or invalid sets warn and disable, never fail startup).
      **Where:** edit `service/src/config/sections/providers.ts` (created by change C task 3.5; keep its exported types); `service/src/index.ts` (one line after `readConfiguration()`).
      **How:** in the section, after C's presence check, call `validateProvider` (2.1) and `assertPublicHttpsUrl` (2.2, Algolia); a failure adds the key names to `missingKeys`, sets `enabled: false`, drops the provider object from `ProvidersConfig` and appends a warning `PROVIDER stripe disabled: invalid STRIPE_SECRET_KEY` (names only). In `index.ts` log every `config.providers.warnings` entry with `logger.warn` and one `info` line `providers enabled: contentstack,stripe` (names only).
      **Done when:** extend `tests/unit/config.providers.spec.ts` (C's file) or add `tests/mcp-providers/section.spec.ts`: valid sets enabled; partial set disabled with `missingKeys`; private Algolia URL disabled; no warning contains a sentinel value; `readConfiguration()` never throws because of a provider key. `npx jest tests/mcp-providers` green.
      **Watch out:** the section must stay free of network calls (no reachability probe at boot).

## 3. Read-only status endpoint

- [ ] 3.1 Implement `getProviderStatuses`, controller and route
      **Why:** `GET /service/mcp/providers` is the contract for change Q's status cards and the data source of change U's postDeploy report.
      **Where:** `mcp-providers/status.ts`, `controller.ts`, `routes.ts`; mount in `service/src/app.ts` at `/mcp` (follow C's pattern; `/providers` is the only route of this router). Legacy: `routes/mcp.route.ts` (not ported).
      **How:** `getProviderStatuses(cfg: ProvidersConfig): ProviderStatus[]` returns the three entries in the order `contentstack, algolia, stripe` straight from `cfg.status` (pure, no I/O). Route `GET /providers` behind D's session middleware only (any verified member; **no** `requireAdmin`); envelope per change G (`{success:true,data}`). Export `getProviderStatuses` for change U's `post-deploy.ts`.
      **Done when:** supertest `tests/mcp-providers/routes.spec.ts`: a non-admin member (user id not in `ADMIN_USER_IDS`, D's dev bypass without `x-dev-admin`) gets 200 with the three entries, also when the request carries a forged `x-admin-email` header; unauthenticated is rejected per D; `POST/PUT/DELETE /mcp/providers` and `/mcp/configs*` answer 404; a sentinel-valued configuration never appears in the serialised body (assert none of `sk_test_SENTINEL`, the Algolia URL, the Contentstack key). `npx jest tests/mcp-providers/routes.spec.ts` green.
      **Watch out:** return `missingKeys` as names only; do not add fields (no lengths, no hosts) - Q relies on the exact shape.

## 4. Knowledge MCP source

- [ ] 4.1 Port the Knowledge source
      **Why:** spec `knowledge-mcp-source`.
      **Where:** `tool-sources/knowledge/{constants.ts,source.ts,tips.ts}` from legacy `client/ct-knowledge.mcp.ts` and `constants.ts` (`COMMERCETOOLS_KNOWLEDGE_MCP`, `COMMERCETOOLS_KNOWLEDGE_TOOLS`).
      **How:**
      ```ts
      export const knowledgeToolSource: ToolSource = {
        name: 'commercetools-knowledge', displayName: 'commercetools Knowledge', order: 20,
        isEnabled: async () => true,
        getTools: async (ctx) => {
          const [tools] = await Promise.all([getMcpTools({ cacheKey: 'commercetools-knowledge', url: KNOWLEDGE_URL,
            ttlMs: ctx.config.mcp.toolsTtlMs, redirect: 'follow' }), warmTips()]);
          if (!tools) return {};
          warnOnToolDrift(Object.keys(tools));
          return tools as ToolSet;                       // NO session filtering: the registry does it
        },
        listForMenu: async () => ({ toolNames: liveNamesOrFallback() }),
        getPrompt: () => tipsBlockOrEmpty(),             // sync read of the memo
      };
      ```
      `tipsBlockOrEmpty()` returns `<commercetools_api_tips>\n${text}\n</commercetools_api_tips>` when the 30-minute memo is fresh, else `''`. `warmTips()` never throws.
      **Done when:** `tests/tool-sources/knowledge.spec.ts` with fake `getMcpTools`/`getMcpPrompt`: 6 tools returned; handshake `null` -> `{}`; tips block present after `getTools`, empty when the fetch failed; drift logged; plus a registry-level test (use H's `createToolSourceRegistry`) proving that disabling every tool removes the tips from the instructions. Green.
      **Watch out:** the URL is fixed `https://docs.commercetools.com/apis/mcp`; do not make it configurable. `config.mcp.toolsTtlMs` = `MCP_TOOLS_TTL_MS` (change C).

## 5. Contentstack source

- [ ] 5.1 Port the HTTP client and error handling
      **Why:** testable seam for 15 tools.
      **Where:** `tool-sources/contentstack/client.ts` (class wrapping `fetch`), `types.ts` from legacy `types/contentstack.ts`.
      **How:** `ContentstackClient({apiKey, managementToken, branch, region, fetchImpl})` with `baseUrl(region)` map from the spec; `request(method, path, body?)` returns parsed JSON or throws `ApiError`-shaped object; `formatError()` as legacy `handleError` (never include headers).
      **Done when:** `contentstack.client.spec.ts`: region -> URL table (7 cases), headers contain `api_key` and `authorization`, `branch` only when set, 422 error text starts `API Error: 422 -`.
      **Watch out:** legacy used `axios`-like error shapes (`error.response.status`); use `fetch` and map explicitly.

- [ ] 5.2 Port the 10 update tools
      **Why:** parity.
      **Where:** `tools-content-type.ts` (create/update/delete content type), `tools-entry.ts` (create/update/delete/publish/unpublish entry), `tools-global-field.ts` (create/update global field). Source: legacy `client/contentstack.ai-sdk.ts` `allTools` (lines ~50-1690; locate each key with `grep -n "^    [a-z_]*: {" client/contentstack.ai-sdk.ts`).
      **How:** copy each tool's description and zod `inputSchema` verbatim; replace the inline axios-style call by `client.request(...)`; keep return strings.
      **Done when:** per-file spec asserts tool names, that each `inputSchema` parses a minimal valid payload, and that `execute` calls the expected method+path (stub fetch). All 10 names present.
      **Watch out:** `z.array(z.object({}).loose())` (zod 4 syntax) appears in schemas - keep, do not "fix" to `passthrough()`.

- [ ] 5.3 Port the 5 read tools and the source
      **Why:** finish the 15; wire `ToolSource`.
      **Where:** `tools-read.ts` (get content type, get all content types, get entry, get entries, get all global fields), `source.ts`.
      **How:** `{ name: 'contentstack', displayName: 'Contentstack', order: 30, isEnabled: `ctx.config.providers.contentstack` is present (the section only keeps enabled providers), getTools: new ContentstackClient(...) tools (all 15), listForMenu: enabled ? { toolNames: all15 } : null, getPrompt: () => contentstackPrompt }` (prompt text is H's `agents/prompts/contentstack.prompt.ts`; import it). credentials from `ctx.config.providers.contentstack` (`apiKey.reveal()`, `managementToken.reveal()`, `branch`, `region`); log provider + error class only on failure.
      **Done when:** `contentstack.source.spec.ts`: 15 names; provider absent from `config.providers` -> `isEnabled` false and `listForMenu` null; the 5 read + 10 update split matches constants; `npx jest tests/tool-sources/contentstack` green.
      **Watch out:** no session filtering in the source. README must say "use a Management Token scoped to what you want the assistant to change".

## 6. Algolia source

- [ ] 6.1 Implement the Algolia source
      **Why:** spec requirements incl. SSRF; the `all_tools` switch is applied by H's registry.
      **Where:** `tool-sources/algolia/source.ts` (legacy `client/algolia.mcp.ts`).
      **How:** `{ name: 'algolia', displayName: 'Algolia', order: 40, isEnabled, getTools, listForMenu: enabled ? { toolNames: ['all_tools'] } : null, getPrompt: () => algoliaPrompt }`. `getTools`: read `ctx.config.providers.algolia.url.reveal()`; `assertPublicHttpsUrl` again at use time (defence in depth); `getMcpTools({cacheKey: 'algolia:' + sha256(url).slice(0,16), url, ttlMs: 10*60_000})` (default redirect `error`); null -> `{}`.
      **Done when:** `algolia.source.spec.ts`: private URL -> `{}` + warn (host only); handshake null -> `{}`; menu entry `['all_tools']`; plus a registry-level test (H's `createToolSourceRegistry`) showing `disabledTools = { algolia: ['all_tools'] }` means `getTools` is never called.
      **Watch out:** never log the full URL.

## 7. Stripe source

- [ ] 7.1 Spike: can `@stripe/agent-toolkit@0.9.0` drop part of the shim? (time-boxed 90 min)
      **Why:** design finding 16.
      **Where:** scratch copy of `service/` (do not commit the experiment); legacy test `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/tests/wire/legacy-tool-schema.spec.ts`.
      **How:** `npm install --save-exact @stripe/agent-toolkit@0.9.0`; run the ported schema spec; for each of the 24 tools serialise `inputSchema` with `asSchema(...).jsonSchema` and attempt `getModel('main')` conversion via H's schema audit (`auditToolSchemas` if present) or simply check `$ref`-free `properties`.
      **Done when:** you write 5 lines in the PR description: which of the 3 shim fixes are still needed on 0.9.0. If any fix is needed keep the shim for it; keep the version pinned exactly either way.
      **Watch out:** peer dependency `ai ^5` vs the service's `ai` 7: install with `--legacy-peer-deps` only if npm refuses, and say so in the PR.

- [ ] 7.2 Port the Stripe source and the shim
      **Why:** spec "Stripe tools".
      **Where:** `tool-sources/stripe/{constants.ts,legacy-tool-schema.ts,source.ts}` from legacy `client/stripe.ai-sdk.ts`, `client/legacy-tool-schema.ts`, `constants.ts` (`STRIPE_UPDATE_TOOLS`, `STRIPE_READ_TOOLS`).
      **How:** `{ name: 'stripe', displayName: 'Stripe', order: 50, ... getPrompt: () => stripePrompt }`; build `actions: Record<resource, Record<action, true>>` for ALL 24 names by splitting `resource.action` (the registry removes session-disabled names afterwards); `new StripeAgentToolkit({secretKey, configuration:{actions, context: connectedAccountId ? {account} : undefined}})`; `adaptLegacyToolSet(toolkit.getTools())` (or the reduced version from 7.1). Memoise one toolkit per process (the configuration is immutable until a redeploy). Tool names in `getTools` keys must be the `resource.action` names H's menu lists - assert with a test.
      **Done when:** `stripe.source.spec.ts` (stubbed toolkit constructor): 24 actions requested; `STRIPE_CONNECTED_ACCOUNT_ID` passed as `account`; with H's registry and `disabledTools` for all `*.create/*.update` only the 13 read tools remain; every tool has `properties` (`legacy-tool-schema.spec.ts` ported and green).
      **Watch out:** never log `secretKey`; errors from Stripe may echo parts of requests - log class + message only.

## 8. Registry wiring and failure isolation

- [ ] 8.1 Safe failure logging helper (isolation itself is H's registry)
      **Why:** spec "Failure isolation and logging": consistent, secret-free log lines; no prompt tricks (the registry drops the prompt of a source that returns no tools).
      **Where:** `service/src/tool-sources/safe-log.ts`.
      **How:**
      ```ts
      export const logSourceFailure = (log: Logger, provider: string, e: unknown, t0: number) =>
        log.warn(`TOOLSOURCE_FAILED provider=${provider} class=${(e as Error)?.constructor?.name ?? 'Error'} ms=${Date.now() - t0}`);
      ```
      Sources use `try { ... } catch (e) { logSourceFailure(...); return {}; }` for expected network/credential failures and let programming errors propagate.
      **Done when:** `safe-log.spec.ts`: output never contains the error message text (use an error whose message contains `sk_live_x`); `grep -rn "console\." service/src/tool-sources` empty.
      **Watch out:** log `e.message` only if you are certain it holds no secret; default is class name only.

- [ ] 8.2 Register the four sources and the menu order
      **Why:** H's registry drives tools, prompts and (as G's `ToolMenuProvider`) the menu.
      **Where:** H's `service/src/tool-sources/index.ts`: `registerToolSource(knowledgeToolSource, contentstackToolSource, algoliaToolSource, stripeToolSource)`; `order` 20/30/40/50 (commercetools from change I is 10).
      **Done when:** `tests/tool-sources/registry.spec.ts` (uses H's `createToolSourceRegistry`): with two configured providers the menu groups appear in `order`; unconfigured providers return `null` from `listForMenu` and are absent; a throwing source does not affect the others.
      **Watch out:** group names are API contract values used by the frontend and by stored `disabledTools` keys: `commercetools-knowledge`, `contentstack`, `algolia`, `stripe`.

## Last. Verification

- [ ] V.1 Unit/wire tests: `cd service && npm run build && npx jest tests/mcp-providers tests/tool-sources` all green. Files: `schemas.spec.ts`, `ssrf.spec.ts`, `section.spec.ts`, `routes.spec.ts`, `knowledge.spec.ts`, `contentstack.client.spec.ts`, `contentstack.tools-*.spec.ts`, `contentstack.source.spec.ts`, `algolia.source.spec.ts`, `stripe.source.spec.ts`, `legacy-tool-schema.spec.ts`, `safe-log.spec.ts`, `registry.spec.ts`.
- [ ] V.2 Gates: `node scripts/spdx-check.mjs`; `grep -rn "console\.\|projectKey\|tenant" service/src/mcp-providers service/src/tool-sources` -> empty; `grep -rn "McpConfigStore\|mcp/configs\|mcp-configs" service/src` -> empty; `grep -rn "sk_live\|sk_test" service/src service/tests` shows only test fixtures; `commercetools connect validate` (the seven provider keys come from change B; J adds none).
- [ ] V.3 Chrome scenarios (agent runs, evidence under `plans/evidence/J/`; needs M3, M8, M10; provider test accounts are optional (M21: set the keys through Connect configuration) - use fake keys for the status cards and the Knowledge MCP for tools):
      - **E2E-J-01** Knowledge MCP: send "which commercetools API creates a cart discount?"; a `commercetools-documentation-search` tool part appears, no error frame; tools menu shows the `commercetools-knowledge` group with 6 tools; untick one and verify it is absent next turn.
      - **E2E-J-02** Providers status as the admin user (user A, user id in `ADMIN_USER_IDS`): with no provider keys configured the status cards show 'Not configured' for Contentstack, Algolia, Stripe (`GET /mcp/providers` in the network log returns three entries with `configured:false` and `missingKeys` naming the keys); after a configuration redeploy that sets fake `STRIPE_SECRET_KEY=sk_test_dummy` the Stripe card shows 'Configured'; the response and the page contain no value.
      - **E2E-J-03** Non-admin user (user B, user id not in `ADMIN_USER_IDS`): `GET /mcp/providers` returns 200 with the same names-only data; `POST /mcp/configs` and `PUT /mcp/providers` return 404 in the network log.
      - **E2E-J-04** Algolia: deploy with `ALGOLIA_MCP_URL=https://169.254.169.254/x` -> Algolia card 'Not configured' (invalid) and no group; redeploy with a valid https dummy host -> menu group `algolia` with `all_tools`; switch it off in the menu -> next turn has no Algolia tools.
      - **E2E-J-05** Stripe fake key `sk_test_dummy` (deployed as `STRIPE_SECRET_KEY`) accepted by validation; menu group lists 24 tools; chat turn using it fails inside the tool but the stream still completes (best-effort).
      - **E2E-J-06** Break the Knowledge MCP (set `MCP_TOOLS_TTL_MS` low and block the host in a test run, or use the unit test `knowledge.spec.ts`) -> turn completes without those tools.
- [ ] V.4 Definition of Done (`plans/04-workflow.md` section 4) ticked; `/opsx:verify j-third-party-tool-sources` clean.

## Docs to update (for change W)

- `docs/api.md`: `GET /service/mcp/providers` row (read-only, any verified member, names and booleans only, error codes); state explicitly that there is no configuration write API.
- README "Providers": the seven keys (`CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION`, `ALGOLIA_MCP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_CONNECTED_ACCOUNT_ID`), which are secured, the enablement rule (all required keys set and valid, else startup warning and disabled), how to set them (`--configuration KEY=VALUE` redeploy, change U runbook), Stripe restricted-key recommendation and the 2026-10-31 hosted-MCP key policy note, Algolia URL must be https and public, scope the Contentstack token.
- `docs/how-it-works.md`: tool sources, best-effort behaviour, menu groups and session negative list.
- Config reference: the seven provider keys (owned by B/C, validated by J), `MCP_TOOLS_TTL_MS`, `MCP_HANDSHAKE_TIMEOUT_MS` (owned by C/H).
- Security notes: prompt-injection via third-party content; use read-only presets.
