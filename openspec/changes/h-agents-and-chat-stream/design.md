## Context

Change **H**, size XL. Needs D, E, F, G. Defines the `ToolSource` registry contract that I, J, K, L, M implement, and the single streaming endpoint of the product. Target runtime: Connect `service` application (1 CPU / 512 MB, serverless, request timeout 5 minutes, https://docs.commercetools.com/connect/deployment-behavior-and-environments.md), AI SDK `ai@7.0.92`, Node 22.

Assumed interfaces from other changes (names reconciled at apply time, see Open questions): `RequestUser` (D), `Persistence` with `SettingsStore` (E), `getModel('main'|'lite'|'image') -> { model, providerOptions }` and `countTokens` (F), `SessionService`, `MessageService.lastN/appendMissing`, `runTurnDigest`, `loadSession` middleware, `setToolMenuProvider`, `setConnectedSourcesProvider` (G).

## Explore findings

Paths relative to `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/`.

1. **The orchestrator is flat, not delegating.** `src/functional-agent/singleton.ts:199-211` merges every registered agent's tools into one `ToolLoopAgent`; `agents/index.ts:22-31,40-83` is the registry; only `imageGeneration` is still a subagent tool (`agents/index.ts:46`). The `createAgent` factories of all other definitions (`agents/definitions/*.agent.ts`) and `toModelOutput` of commercetools/commercetoolsUI are **dead code** in the active path (FEATURES.md "Active orchestrator"). `imageGeneration` is not in `agentRegistry`/`AGENT_KEYS` (`image-generation.agent.ts:14` uses `key: 'imageGeneration' as any`).
2. **Stale orchestrator prose.** `ORCHESTRATOR_INSTRUCTIONS` (`singleton.ts:30-94`) still says "delegates user requests to specialized tools ... Always delegate to a tool" and lists nine named tools, though the model sees concrete tools; per-agent prompts are appended to it (`agents/index.ts:78`). New preamble is generated from contributing sources (Decision D-H3).
3. **Project system prompt is injected N times.** Only prompt builders call `getProjectSystemPromptSection(context.projectSystemPrompt)` (commercetools, contentstack, algolia, stripe, visualize, export prompts; `agents/prompts/base.prompt.ts:94-104`); the orchestrator preamble does not; the custom-view orchestrator never injects it (`custom-view.agent.ts:30-93`). (D-H4.)
4. **Agent resolution is concurrent** with sequential merge in registry order (`agents/index.ts:50-70`), prompted by a measured 44.1 s turn start of which 41.7 s was Nimbus. Prompts are included only when `Object.keys(agentTools).length > 0` (`:76`). Preserved by the registry (spec "Deterministic merge") and bounded by a 15 s timeout (new).
5. **History:** `getLastMessages(..., numberOfMessages = 20)` desc then `.reverse()` (`singleton.ts:254-269`); race guard `:168-181` (fire-and-forget user message save at `controllers/ai.chat.controller.ts:268-276`). `MESSAGE_HISTORY_CUTOFF = 10` (`constants.ts:28`) is a *different* window used by the analyzer (`analyzer.agent.ts:128`) and must not be confused with the 20.
6. **ai v7 rejects system-role messages**: `utils/message.utils.ts:122-148` (cites `ai@7 dist/index.js:2615`); route rejects at `ai.chat.controller.ts:254-263`. `endWithUserMessage` (`message.utils.ts:167-173`) exists because Gemini rejects requests ending with a model turn.
7. **Storage filter** `processMessagesForStorage` (`ai.chat.controller.ts:83-185`) with helpers `isStorableToolPart`, `isSubagentToolPart`, `filterSubagentOutputParts`; `STORABLE_TOOLS` = visualize, export, composed page and `SUBAGENT_TOOL_NAMES` live in `constants.ts:126-146`. `onFinish` receives the **whole** conversation (history + new): `sendMessages` stores only ids not yet found (`chat.service.ts:455-470`).
8. **Stream plumbing:** `pipeUIMessageStreamToResponse` MUST be awaited (`ai.chat.controller.ts:314-333`, an unhandled rejection kills Node); error frame shape `{type:'error', errorText}` + `[DONE]` (`utils/stream.utils.ts:70-79`); `describeStreamError` (`:120-149`) because the SDK masks errors as "An error occurred."; `logUnserializableToolSchemas` (`functional-agent/utils/tool-schema-debug.ts`). CORS headers `Access-Control-Allow-Origin: *` are set on the stream (`ai.chat.controller.ts:327-330`) although app.ts disables CORS (`app.ts:48-52`) - dropped.
9. **Wire contract test** `tests/wire/ui-message-stream.spec.ts:20-45`: client-accepted chunk set; `ai@7` adds `custom`, `reasoning-file`, `reset-step`, `tool-approval-response`, which older clients reject. Kept; the accepted set must track the `ai` version of `mc-app`/`mc-view-app` (D7 pins one version - spec O).
10. **Annotation part**: `annotation-part.ts:29` `ANNOTATIONS_PART_TYPE = 'data-ct-annotations'`; mirrored contract with `mc-app/src/components/preview-annotations/annotation-payload.ts`; `convertAnnotationDataPart` is passed to `convertToModelMessages` (`singleton.ts:192`). Storage filter keeps it (`ai.chat.controller.ts:102-107,135-139`).
11. **JSON-schema code is pure**: `utils/json-schema.utils.ts` (619 lines) exports `needsGeminiNormalization`, `hoistRefsForGemini`, `hasUnresolvableRef`, `normalizeJsonSchemaForGemini`; today it is applied only inside `cache/mcp-tools.cache.ts:124-135` (MCP tool cache), i.e. Stripe/Contentstack/local tools are not covered; `client/legacy-tool-schema.ts` (218 lines) exports `normalizeToolSchema`, `sanitizeToolSchemaForProvider`, `resolveLegacyInputSchema`, `adaptLegacyToolSet`, used by Stripe only (`client/stripe.ai-sdk.ts:59`). Tests: `tests/wire/mcp-tool-schema.spec.ts` (427 lines, 3 describes), `tests/wire/legacy-tool-schema.spec.ts` (158 lines; the "every real Stripe toolkit tool" test needs `@stripe/agent-toolkit` and belongs to J).
12. **Analyzer** `analyzer.agent.ts`: used by `client/tool-result-pipeline.ts` (change L). Size gate `OFFLOAD_WITHOUT_ASKING_TOKENS = 1e5` (`:99`), `sizeOf`/`estimateTokens` (`utils/token-estimate.utils.ts:23-47`), lite model. Legacy comments record two unreconciled bugs: `systemPrompt(resultSizeTokens, ...)` never interpolates the size and `args` renders `[object Object]` (`analyzer.agent.ts:169-181`). Kept as-is on purpose (a behaviour change needs its own measurement); see OQ-H4.
13. **`metadata.ts`** has `console.log` calls inside `getAccumulatedUsage` (`utils/metadata.ts:91-104`) - violates the "no console.log" rule; ported without them.
14. **`file.utils.ts`** (328 lines) mixes pure URL extraction (`extractUrlReferences`, `:142-155`) with GCS upload and `sharp` resize (`fetchImageAsBase64`, `uploadOneFile`, `processGeneratedFiles`). Split: pure part -> H; upload/resize -> change L behind `ImageUploader` (Decision D-H8).
15. **`nimbus-scope.ts` + `nimbus-surface.generated.ts` + `commercetools-ui.prompt.ts`** (356+191+374 lines) are consumed only by `tools/composed-page.tool.ts:7` and the spec `tests/prompts/nimbus-scope.spec.ts` (imports `composedPageTool`) -> they belong to change M, not H (amendment recorded).
16. **AI SDK v7 facts** (installed `ai@7.0.92`, `node_modules/ai/dist/index.d.ts`): `TimeoutConfiguration` is `number | { totalMs, stepMs, firstChunkMs, chunkMs, toolMs, tools }` (`:597`); `RequestOptions` has `abortSignal` and `timeout` (`:640-660`); `PrepareStepResult` supports `toolChoice`, `activeTools`, `instructions`, `messages` (`:1715-1760`); the `onFinish`/`onEnd` event has `isAborted` and `outcome` (`:2491-2505`); data parts can be `transient` (`:2319`); `streamText` has `onAbort` (`:3645`). These make the budget design (D-H5) possible without patching the SDK.
17. **Platform facts:** Connect service application request times out after 5 minutes; sandbox deployments boot in ~15 s after scale-to-zero (https://docs.commercetools.com/connect/deployment-behavior-and-environments.md); `service` apps are limited to 1 CPU/512 MB (https://docs.commercetools.com/connect/best-practices.md). The legacy FEATURES.md (line ~82) records that through the MC gateway the SSE stream passes incrementally, a 69 s generation completed and a 10 MB body was accepted (measured 2026-09-22, Cloud Run era - re-measure on Connect in E2E-H-04 / E2E-N-02).
18. **No `prepareStep`, `abortSignal` or `timeout` is used by the legacy orchestrators** (`singleton.ts:203-211`), so a turn longer than 5 minutes is cut by the platform with a truncated stream and no assistant message persisted (`onFinish` never runs on a killed request).

## Glossary

- **UI message stream**: the AI SDK protocol (`createUIMessageStream`, SSE of JSON chunks, header `x-vercel-ai-ui-message-stream: v1`) consumed by `useChat` in the frontends.
- **ToolSource**: one provider of tools + prompt + menu entry; the plug-in point for I-M.
- **Orchestrator**: the top-level `ToolLoopAgent` for a turn.
- **Subagent tool**: a tool whose `execute` runs another agent and streams its progress (only `imageGeneration` today).
- **Step**: one model call (+ its tool executions) inside a `ToolLoopAgent` loop; `stopWhen: stepCountIs(50)` bounds them.
- **Soft/hard deadline**: budget points at `T0 + budget - reserve` and `T0 + budget`.
- **Wrap-up step**: the final model call with `toolChoice: 'none'` after the soft deadline.
- **Storable tool**: a tool whose terminal output is persisted (visualize, export, composed page).
- **Annotation part**: `data-ct-annotations`, annotations the user left on a composed page preview.
- **Gemini normalisation**: rewriting JSON Schemas Gemini rejects (non-root `$ref`s, item-less arrays, tuples, required ref cycles).
- **MCP / Managed MCP**: Model Context Protocol; commercetools hosts MCP servers whose tools are fetched at runtime.
- **SSE**: server-sent events, `data: <json>\n\n` frames over one HTTP response.

## Source map

| Legacy file (under `.../service/src/`) | New file (under `service/src/`) | Verdict |
|---|---|---|
| `routes/ai-chat.route.ts` | `routes/ai-chat.route.ts` | CHANGE (budget middleware, `loadSession` from G) |
| `controllers/ai.chat.controller.ts` | `chat/chat.controller.ts` + `chat/storage-filter.ts` | CHANGE (split; stores; no CORS headers; budget notice) |
| `functional-agent/singleton.ts` | `chat/orchestrator.ts` + `chat/history.ts` | CHANGE |
| `functional-agent/custom-view.agent.ts` | `chat/custom-view-orchestrator.ts` | CHANGE (no `console.*`, registry tools, system prompt) |
| `functional-agent/annotation-part.ts` | `chat/annotation-part.ts` | KEEP |
| `functional-agent/turn-digest.ts` | (G) `agents/turn-digest.ts` | G |
| `functional-agent/agents/index.ts`, `types.ts` | `tool-sources/registry.ts`, `tool-sources/types.ts`, `agents/agent-keys.ts` | CHANGE |
| `functional-agent/agents/subagent-tool.ts` | `agents/subagent-tool.ts` | KEEP |
| `functional-agent/agents/analyzer.agent.ts` | `agents/analyzer.agent.ts` | KEEP (model via F) |
| `agents/definitions/{commercetools,contentstack,algolia,stripe,bigquery,commercetools-ui}.agent.ts` | provided by I/J/L/M as `ToolSource`s | DROP here (meta/prompt kept in `agents/agent-keys.ts`) |
| `agents/definitions/{visualize,export}.agent.ts` | `tool-sources/visualize.source.ts`, `export.source.ts` | CHANGE |
| `agents/definitions/image-generation.agent.ts` | `tool-sources/image-generation.source.ts` | CHANGE (uploader injected, `getModel('image')`, `countTokens` from F) |
| `agents/prompts/{base,commercetools,contentstack,algolia,stripe,visualize,bigquery,export,image-generation,index}.prompt.ts` | `agents/prompts/*` | CHANGE (remove per-prompt project-prompt injection; `AgentContext` -> `ToolContext`; `getDeveloperTipsSection` injected by J) |
| `agents/prompts/{commercetools-ui.prompt,nimbus-scope,nimbus-surface.generated}.ts`, `tests/prompts/nimbus-scope.spec.ts` | (M) | M |
| `functional-agent/tools/{entity-link,entity-url-mapping,visualize,export}.tool.ts` | `tools/*.tool.ts` | KEEP (project key from verified user) |
| `functional-agent/tools/{query,table}.tool.ts`, `composed-page.tool.ts` | (L), (M) | not H |
| `functional-agent/utils/file.utils.ts` | `utils/url-references.ts` (pure) + (L) upload | SPLIT |
| `functional-agent/utils/tool-schema-debug.ts` | `utils/tool-schema-debug.ts` | KEEP |
| `functional-agent/providers/*` | (F) | F |
| `utils/message.utils.ts` | `utils/message.utils.ts` | KEEP |
| `utils/metadata.ts` | `utils/metadata.utils.ts` | CHANGE (no console) |
| `utils/stream.utils.ts` | `utils/stream.utils.ts` | CHANGE (keep `sendSSEError`, `describeStreamError`; drop other helpers) |
| `utils/json-schema.utils.ts` | `schema/json-schema.ts` | KEEP |
| `client/legacy-tool-schema.ts` | `schema/legacy-tool-schema.ts` | KEEP |
| `utils/token-estimate.utils.ts` | `utils/token-estimate.utils.ts` | KEEP |
| `constants.ts` (`MESSAGE_HISTORY_CUTOFF`, `STORABLE_TOOLS`, `SUBAGENT_TOOL_NAMES`) | `chat/constants.ts` | CHANGE |
| `tests/wire/{ui-message-stream,mcp-tool-schema,legacy-tool-schema,analyzer-messages,analyzer-size-gate}.spec.ts` | `tests/wire/` | KEEP (legacy-tool-schema minus the Stripe test, which moves to J) |
| `cache/mcp-tools.cache.ts` normalisation call | registry `normalizeToolSet` | CHANGE (central) |

## Decisions

**D-H1 ToolSource contract (the plug-in point).** See spec `tool-source-registry`. `name` = menu group = `disabledTools` key. *Alternatives:* keep `AgentDefinition` with `createAgent` (rejected: dead abstraction, 80% of definitions unused); one `getTools` map without prompt/menu (rejected: I-M would each re-implement prompt gating and menu). The interface is deliberately small so a source in I-M is one file plus one `register` line in `service/src/tool-sources/index.ts`:

```ts
export const registry = createToolSourceRegistry();
registry.register(entityLinkSource, visualizeSource, exportSource);   // H
// registry.register(createCommercetoolsIdentitySource(...));         // I
// registry.register(knowledgeSource, contentstackSource, algoliaSource, stripeSource); // J
// registry.register(nimbusSource); // K ; bigquerySource, imageUploader // L ; composedPageSource // M
```

**D-H2 Registry-level concerns.** Timeout (15 s), isolation, `disabledTools`, Gemini normalisation, prompt gating and menu are implemented once in the registry, so a source only answers "how do I get my tools". *Alternative:* each source filters by session (legacy) - rejected: five divergent implementations and the `all_tools` special case duplicated.

**D-H3 Preamble generated from sources.** `buildPreamble(ctx, contributing[])` lists `displayName` + optional one-line `description` per contributing source and keeps the legacy selection rules where still true. *Alternative:* keep the static nine-tool prose (rejected: tells the model about tools that do not exist - Finding 2).

**D-H4 Project system prompt injected once.** Wrapped as `<developer_instructions>` between preamble and fragments. `getProjectSystemPromptSection` stays in `base.prompt.ts`, called only by the orchestrators. Behavioural change on purpose (Finding 3), recorded in the proposal as BREAKING. *Alternative:* keep per-fragment injection (rejected: duplicates, absent on custom-view).

**D-H5 Time budget design with AI SDK v7 (concrete).**

```
T0 request start        soft = T0+budget-reserve              hard = T0+budget (270 s)         Connect kills at 300 s
|-- history + resolve --|-------- steps (tools abort at soft) --|-- wrap-up step --|-- notice --|
```

- `RequestBudget` (new `chat/request-budget.ts`) owns `hardController` and `softController`; `hardSignal = AbortSignal.any([hardController.signal, clientGone.signal])` where `clientGone` aborts on `res.on('close')` when `!res.writableEnded`. Timers are `setTimeout(...).unref()` and cleared in `dispose()`.
- `agent.stream({ messages, abortSignal: hardSignal, timeout: { stepMs: 120_000, toolMs: 90_000, chunkMs: 60_000 } })`. `totalMs` is NOT used: the hard signal is the single authority, so the notice logic knows who aborted.
- `prepareStep: () => budget.phase() === 'normal' ? undefined : { toolChoice: 'none', instructions: baseInstructions + WRAP_UP_NOTICE }`; `stopWhen: [stepCountIs(maxSteps), () => budget.remainingMs() < 5000]`.
- Tool wrapper `withSoftAbort(tools, budget)` replaces `execute` by `(input, opts) => orig(input, { ...opts, abortSignal: AbortSignal.any([opts.abortSignal, budget.softSignal]) })`, converting an `AbortError` into `{ error: 'Stopped: time limit reached' }` so the loop moves on to the wrap-up step instead of raising a tool error through the stream. Generator tools (subagent) are wrapped by re-yielding.
- Stream loop: instead of `writer.merge(...)` (fire and forget), `execute` iterates `result.toUIMessageStream({...})`, writes each chunk, and in `finally` appends the notice parts when `budget.phase() === 'expired' && !clientGone.signal.aborted`. `onFinish({ isAborted })` persists whatever exists.
- Keep-alive: `setInterval` 20 s writes `{ type: 'data-keepalive', data: {}, transient: true }` when idle.
- Defaults: budget 270 s (30 s margin to the platform's 300 s), reserve 30 s (a flash-class wrap-up step is typically under 10 s; the rest is provider-latency tail).
- Why not `timeout.totalMs`: it aborts the loop without a wrap-up window and gives no way to tell a time limit from a client abort in `onFinish`.
- Why not move long turns to a background job: Connect `job` applications cannot be invoked per request and the UI would need a polling protocol (scope creep, rejected).
*Alternatives for graceful finish:* (a) hard abort only (rejected: answers lost mid-sentence, no summary); (b) lower `MAX_STEPS` (rejected: not time-based).

**D-H6 Persist on abort.** `onFinish` runs for aborted turns (`isAborted: true`, d.ts `:2504`). The storage filter drops empty messages, so an aborted turn with no output stores nothing (the user message is already stored); the notice makes any aborted turn with output non-empty.

**D-H7 Central Gemini normalisation** in the registry (Finding 11) so Stripe/Contentstack/local tools get the same protection as MCP tools. *Alternative:* keep it in the MCP cache only (rejected: leaves the "one bad tool removes all tools" failure class open). Idempotent, so the MCP cache in I may also call it.

**D-H8 Image generation gating.** `imageGeneration` needs `getModel('image')` (F) and uploads (L). H defines `interface ImageUploader { upload(bytes: Uint8Array, mediaType: string, sessionId: string): Promise<string> }` and `setImageUploader()`; the source's `isEnabled` is `uploader !== undefined`. L registers its GCS uploader (whenever Google Cloud is configured; the bucket name has a default). In `private` mode (default) `upload` returns the service-relative path `/files/{sessionId}/{file}`, which is what gets stored in the file part; the optional `toModelMessages(messages)` converts such stored parts into base64 data and H's history loader MUST apply it to every model-bound message list (orchestrator, image agent) so a relative URL never reaches Gemini. Without an uploader the feature is absent rather than broken (tests use a fake).

**D-H9 History = 20, analyzer = 10.** Named constants `CHAT_HISTORY_MESSAGES` and `ANALYZER_HISTORY_MESSAGES`. Not configurable (YAGNI).

**D-H10 Storable tool names** stay hard-coded (`visualize_data`, `export_data`, `create_composed_page`) in `chat/constants.ts`; M must keep the composed-page tool name. The subagent names list shrinks to `['imageGeneration']` (no stored legacy data exists in a greenfield deployment).

**D-H11 No CORS / wildcard origin headers** on the stream (Finding 8).

**D-H12 Unhandled-rejection safety**: `await pipeUIMessageStreamToResponse` inside try/catch (Finding 8); a process-level `unhandledRejection` logger belongs to C.

## Risks / Trade-offs

- **R-H1 Platform may buffer or cut SSE earlier than expected** (proxy behaviour differs from Cloud Run). Mitigation: keep-alive parts, E2E-H-04 on a sandbox deployment with a ~4-minute turn.
- **R-H2 Soft-deadline interplay**: a model call that streams a very long answer past the hard deadline is cut mid-sentence; accepted, the notice explains it.
- **R-H3 `AbortSignal.any`** needs Node >= 20.3 (Connect supports 22/24; fine).
- **R-H4 Central normalisation changes schemas for sources that previously bypassed it** - guarded by idempotence and by the ported tests.
- **R-H5 Prompt fragments of gated agents stay in H** so I-M do not diverge; fragments are plain strings and import nothing from their sources.
- **R-H6 The analyzer quirks (Finding 12) cost tokens and may behave oddly**; frozen to avoid a silent behaviour change.
- **R-H7 Tool-name collisions across sources** (`query_aggregated_data` is used by BigQuery and the UI agent): later source wins, warning logged; L and M must coordinate (documented in the contract).
- **R-H8 Client `ai` version drift**: the accepted-chunk list must follow the oldest deployed client (D7 pins all three apps to one version).
- **R-H9 XL size**: the task list is split into 40+ small tasks with their own tests so partial progress is mergeable.

## Migration Plan

Greenfield. H lands with only built-in sources; each of I-M appends its registration line and brings its own tests. `plans/questions-inbox/GHN-plan-amendments.md` lists the two config keys B/C must carry and the prompt files M must own.

## Open questions

- **OQ-H1** Amendments to B/C for `CHAT_REQUEST_BUDGET_MS` / `CHAT_FINALIZE_RESERVE_MS` (not owner-only).
- **OQ-H2** Does the MC `forward-to` gateway or Connect's front proxy impose an idle/stream timeout below 5 minutes? Measure in E2E-H-04; the keep-alive interval (20 s) may need to shrink. (Agent measures on the sandbox.)
- **OQ-H3** `getModel('main')` return shape and whether Vertex honours `thinkingConfig` options identically (F). Tasks assume `{ model, providerOptions }`.
- **OQ-H4** Fix the analyzer's size/args interpolation bugs? Default: no. Mirrored as owner question HQ2.
- **OQ-H5** Auto-offer a "Continue" chip after a time-limit stop? Default: notice text only; P may add UI. Mirrored as HQ3.
- **OQ-H6** (Resolved 2026-10-09, Q21: DECIDED) Budget stays 270 s with a 30 s reserve; no 240 s variant. Mirrored as HQ1.

## Changelog

- 2026-10-09 (owner decision Q9): D-H8 clarified for private images: `ImageUploader.upload` returns a service-relative `/files/...` path (or the public bucket URL in `public` mode); `toModelMessages` is applied by the history loader to all model input; the storage filter keeps non-`data:` file parts including such relative paths.
- 2026-10-09 (owner decisions Q21, Q7, admin by user id): the chat budget stays 270 s with a 30 s reserve (OQ-H6 resolved); there is no GECX widget stream (no `/gecx/*`, no gecx-react) so the only chat entry point is `POST /service/chat/stream`; the project system prompt injected by D-H4 is written by an administrator listed in `ADMIN_USER_IDS` (settings write is `requireAdmin` in change G), and this change reads it without any admin check (every member's chat uses it).
