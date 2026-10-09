# Change J (j-third-party-tool-sources): implementation notes

## Summary

Branch `worktree-agent-a4ce0d55e579d5823` (reset to `develop` first). Tasks 0.1-8.2, V.1, V.2 done and ticked; V.3 (Chrome E2E-J-01..06) and V.4 (`/opsx:verify`) not done.

Built in `service/src/`:
- `mcp-providers/`: `types` (provider/key tables, regions), `schemas` (zod per provider, `validateProvider`, `evaluateProvider` = the single enablement rule, key names only in output), `ssrf` (`assertPublicHttpsUrl`, IPv4/IPv6/mapped/decimal/hex forms), `status` (`getProviderStatuses`), `controller`, `routes` (only `GET /providers`, mounted at `/service/mcp` behind `verifyMcSession`, no `requireAdmin`).
- `config/sections/providers.ts` now calls `evaluateProvider` (no network, never throws); `connector/checks/providers.ts` (post-deploy report, U) uses the same function, so invalid values are reported as `not configured (invalid: KEY)`; `index.ts` logs `providers enabled: ...`.
- `tool-sources/`: `knowledge/` (name `commercetools-knowledge`, order 20, tips memo), `contentstack/` (client with 7 regions, 15 tools split into 4 files, ported by script from the legacy class), `algolia/` (order 40, `all_tools` menu), `stripe/` (order 50), `mcp-tools.ts` (getMcpTools/getMcpPrompt, see gaps), `safe-log.ts`, `third-party.ts` (the list). Shared wiring edits are 2 lines in `tool-sources/index.ts` and 2 lines in `routes/service.route.ts`.
- Each source has a one-line `description` (H's preamble prints it).

Commands (all in this worktree): `cd service && npm ci && npm run build && npm test && npm run lint` -> build ok; 118 suites / 1124 tests pass (baseline 112 / 1031); lint 0 errors (24 warnings: 21 baseline, 3 `!` assertions in my tests); `npm run check:foundation` ok. Root: `node scripts/check-connect-layout.mjs` ok, `spdx-check.mjs` ok, `check-repo-rules.mjs` ok. `grep console./tenant` over my dirs empty. No `connect.yaml`/checker/fixture edit was needed (B already declares the seven keys).

## Questions (for the owner)

1. Stripe: 0.9.0 is a different product (spike result below). Keep 0.7.12 (peer `ai ^4`) long term, or move to Stripe's hosted MCP with its OAuth/agent-key policy (change after 2026-10-31)?
2. The legacy menu lists 24 Stripe names but toolkit 0.7.12 provides only 21 tools; four names do nothing (`subscriptions.create`, `invoiceItems.read`, `paymentLinks.read`, `refunds.read`). Trim the menu to the real ones, or keep 24 as the spec says?
3. OQ-J2: syntactic SSRF guard only (as built) or an Algolia host allow-list?

## Missed features / gaps found in the spec

- Spike 7.1 result: `@stripe/agent-toolkit@0.9.0` is NOT a drop-in. Design finding 16 was wrong: 0.9.0 is a thin client of the hosted `https://mcp.stripe.com` (Bearer key, async `initialize()`, remote tools, no `actions` filter), the thing DJ-9 puts out of scope. Kept exact `0.7.12`; all three shim fixes remain needed (the real-toolkit test proves every tool gets an object schema through `adaptLegacyToolSet`). Install needs `service/.npmrc` `legacy-peer-deps=true` (peers `ai ^4`, `openai`, `agents`, langchain conflict with ai 7); `npm ci` works with it. Connect's build reads that file; unverified there.
- H did not ship `getMcpTools`/`getMcpPrompt` (task 0.2 says stop). I wrote a small port in `tool-sources/mcp-tools.ts` (cache, handshake deadline, late fill, null on failure; class-only logs, injectable client factory). I/K/L may want to share it; Gemini normalisation is left to the registry.
- Toolkit 0.7.12 keys its tools by function (`create_customer`), not `customers.create`; with legacy keys the menu switches would remove nothing. I rename every key to the menu name via a pinned map (`STRIPE_TOOL_NAME_BY_KEY`), drop unknown keys with a warning, and make `cancel_subscription` (shipped with `subscriptions.update`, mutating) a tool `subscriptions.cancel` that the source drops when `subscriptions.update` is switched off. The model therefore sees `customers.create` style names (dots are valid for Gemini function names; not tested live).
- H's registry applied `all_tools` after calling `getTools` (handshake still happened). Changed `registry.ts` to skip a source before any I/O (small edit in H's file, spec scenario of J).
- The legacy Contentstack code never produced `API Error: 422 -` (it threw the body, hitting the `error_message` branch). Added `toApiError` so the text matches the spec; legacy debug logs of payloads/responses removed.
- Spec says `ctx.config.mcp.toolsTtlMs`; actual is `ctx.config.cache.mcpToolsTtlMs` / `mcpHandshakeTimeoutMs`.
- C's providers section defined `configured` as "any key set"; J's spec says "every required key set". Changed (C's test updated).
- `configured: true, enabled: false` now means "all required set but a value is invalid"; `missingKeys` then lists the invalid keys (including invalid optional ones such as the region).
- Developer tips: the Knowledge source returns the `<commercetools_api_tips>` fragment itself; `getCommercetoolsPrompt(ctx, developerTips)` (H) must be called by I with `''` or the tips appear twice.
- Knowledge `listForMenu` is not `null` when the endpoint is down (fallback names), so the group always shows (spec).
- Stripe prompt does not distinguish mutating calls (legacy gap, H notes).

## TODOs (skipped or unverifiable here)

- V.3 Chrome scenarios E2E-J-01..06 and `/opsx:verify`: no deployed service/credentials. Live checks not done: real Knowledge MCP handshake (a test run once hit the network by accident before I added the offline guard in `tests/setup.ts`; it returned the six tools), Algolia, Contentstack (EU region), Stripe test key against Stripe, Gemini accepting dotted tool names.
- `commercetools connect validate` (Docker) not run; no connect.yaml change.
- Docs for W are listed in tasks.md; only code written. README must say: restricted Stripe key, scoped Contentstack token, `legacy-peer-deps`.
- Test names differ from the V.1 list: Contentstack tool tests are in `contentstack.tools.spec.ts`, source/algolia/stripe/registry in `third-party-sources.spec.ts`; `section.spec.ts` covers the providers section; `legacy-tool-schema.spec.ts` already existed from H.
- `request()` helper of task 5.1 not built (tools call `client.fetch` directly; avoids dead code).

## Deviations from the spec (with reason)

- Branch: harness worktree branch, not `spec/j`.
- Stripe toolkit pinned 0.7.12, not upgraded (spike failed, above).
- Tool-result envelope of Contentstack kept as legacy `{content:[{type:'text',text}], isError}`, not a bare string; the text itself starts with `API Error: 422 -`.
- Per-request 30 s timeout added to Contentstack calls; Algolia/Knowledge handshake uses `MCP_HANDSHAKE_TIMEOUT_MS`; Knowledge menu uses a 3 s handshake cap.
- Edited other changes' files minimally: `tool-sources/registry.ts` (all_tools), `tests/wire/builtin-sources.spec.ts` (menu assertion ignores J's groups), `tests/setup.ts` (offline MCP guard), C/U tests for the stricter provider rules.
