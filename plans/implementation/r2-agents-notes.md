# R2 agents follow-up: implementation notes

Branch `worktree-agent-a8b002af6fca37338`, reset to `develop` first. One commit per TA id.

## Done

- **TA-16** (MF-06, MF-07). Prompt cleanup: `getBaseRules(locale, delegated = false)`; only the image generation agent (the one real sub-agent) keeps "return the error to the calling agent"; every other fragment now says to retry and then tell the user. `getReturnFormatSection` no longer says "returned to the main agent". `bigquery`/`export` prompts no longer say "switch to the ... agent" (they name `visualize_data`/`export_data`). New optional `ToolSource.routingHints` (legacy keyword table and "fetch the data first" prerequisites, from the legacy orchestrator instructions) set on all 11 non-trivial sources and printed under the description in the preamble. Tests: `tests/tool-sources/descriptions.spec.ts` (every registered source has a one-line description and hints; the preamble mentions each source; legacy keywords present), `tests/wire/prompts.spec.ts` (no stale wording).
- **TA-19** (MF-23). The image tool's `toModelOutput` now returns text plus `data:` images; `loadHistory` passes `imageGenerationHistoryTools` to `convertToModelMessages`, so converted images of earlier generations reach the model as images. Only the newest `HISTORY_IMAGES_FOR_MODEL` (2) generated images are sent (older are stripped BEFORE the uploader downloads them) to bound cost per turn. Non-`data:` URLs are never sent. Tests in `tests/chat/history.spec.ts`.
- **TA-20** (MF-10). Documented, not changed: the spec shows no client-side tool (P design D-P5 removed `sendAutomaticallyWhen`), so an assistant message is never auto-continued. Code comment in `chat.controller.ts` and a test pinning that `appendMissing` never overwrites a stored id.
- **TA-15** (MF-14). `runTurnDigestBeforeClose(params, capMs)` (digest runs, wait capped at 3 s, work is not cancelled at the cap, never rejects). `createChatStream`'s `onFinish` may now return a promise that the stream close awaits. Switch: `CHAT_DIGEST_BEFORE_CLOSE` (`config.chat.digestBeforeClose`, default false); skipped when the time budget already ran out. Tests: turn-digest, chat endpoint, config.
- **TA-21** (partial). `describeMcpFailure`/`statusOf` moved to `tool-sources/mcp-failure.ts`; default is class + status only (used by `mcp-tools.ts`), `includeMessage: true` for the Managed MCP Server (the identity wrapper keeps its old output). Rebind cleanup: `PUT managed-mcp-identity` now deletes and best-effort revokes the previous binding's token records (as `DELETE` does) before writing the new binding. Tests added.
- **TA-22** (MF-03). Menu keeps 24 names; `MenuEntry.unavailableToolNames` -> `MenuGroup` -> response tool rows get `available: false` for `subscriptions.create`, `invoiceItems.read`, `paymentLinks.read`, `refunds.read` (derived from the key map, so a toolkit upgrade updates it). Install decision documented in `stripe/source.ts`: there is no `service/.npmrc`; the `ai`/`zod` peer conflicts are resolved by `package.json` `overrides`.
- **TA-12** (partial). `SessionStore.listAll({ sortBy })` and `POST /service/backoffice/threads?sort=lastModifiedAt` (gateway already supported the sort). Default stays `createdAt`. `P-var-types` not done (needs live probe).

## Skipped and why

- TA-21 bind-time fallback (Q-impl-01) and tightening `NO_PERMITTED` after TB-06: need a live identity-mode server / owner decision.
- TA-12 `P-var-types` (numbers/booleans as input variables): needs a live probe.
- TA-22 Algolia allow-list (Q-impl-40): owner decision (default stays syntactic guard).
- Routing quality E2E comparison with the legacy (TA-16 last clause): needs a live model.

## Deviations and new gaps

- Q-impl-09 default is "rebind does not delete tokens"; the work package asked for rebind cleanup, so it was implemented. Revert the 14 lines in `identity-mcp/controller.ts` if the owner prefers the default.
- `CHAT_DIGEST_BEFORE_CLOSE` is read by the config but NOT declared in `connect.yaml`, the layout checker or `.env.example` (those belong to the config/hygiene work package), so it cannot be set on Connect yet. Add it there (non-secret, default `false`).
- The new `available: false` row field and `?sort=lastModifiedAt` are additive and not yet in the route contract / OpenAPI rows or the frontend (the UI should grey out `available: false` switches).
- With `HISTORY_IMAGES_FOR_MODEL = 2` every turn re-downloads and re-sends up to two earlier images; if cost matters, lower it. The orchestrator model (not only the image agent) sees them.
- `prettier --write src` reformats about 90 unrelated files in this repo (not formatted with the repo's own config); only touched files were checked.
