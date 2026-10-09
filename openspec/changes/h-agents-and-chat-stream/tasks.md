## 0. Read first

- [x] 0.1 Read `proposal.md`, `design.md` (Explore findings 1-18, Decisions D-H1..D-H12) and all six `specs/*/spec.md` of this change. Read `plans/03-spec-dependency-map.md` ("Interface contracts") and change G's `specs/rest-api-contract/spec.md` (row 19).
- [x] 0.2 Skim the legacy code (read-only). Base path used below as `LEGACY` = `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service`. Read in this order: `LEGACY/src/controllers/ai.chat.controller.ts`, `LEGACY/src/functional-agent/singleton.ts`, `LEGACY/src/functional-agent/agents/index.ts`, `.../agents/types.ts`, `.../agents/subagent-tool.ts`, `LEGACY/src/functional-agent/custom-view.agent.ts`, `LEGACY/src/utils/message.utils.ts`, `LEGACY/src/utils/stream.utils.ts`, `LEGACY/tests/wire/ui-message-stream.spec.ts`.
- [ ] 0.3 Read the AI SDK pages: `ToolLoopAgent` (`prepareStep`, `stopWhen`, `abortSignal`, `timeout`), `createUIMessageStream`, `readUIMessageStream` (https://ai-sdk.dev/docs) and the installed type file `service/node_modules/ai/dist/index.d.ts` lines around `TimeoutConfiguration`, `PrepareStepResult`, `UIMessageStreamOnEndCallback`.
- [ ] 0.4 Read https://docs.commercetools.com/connect/deployment-behavior-and-environments.md (5-minute request timeout).

You should now be able to explain: why the orchestrator is "flat"; what a `ToolSource` must provide and what the registry does for it; the difference between the 20-message history window and the analyzer's 10; how the soft deadline, wrap-up step and hard abort fit in 270 s; and why `pipeUIMessageStreamToResponse` must be awaited.

## 1. Setup

- [x] 1.1 Verify prerequisites. **Where:** repo root. **How:** `git switch -c spec/h`; check that C, D, E, F and G are archived: `ls openspec/specs`; `grep -rn "export const getModel" service/src`; `grep -rn "class MessageService\|export const runTurnDigest" service/src`. **Done when:** all greps print a hit. **Watch out:** if F's `getModel` returns something other than `{ model, providerOptions }`, adapt the call sites (`getModel('main')`) in tasks 8.x and 11.1 and write the final shape in design.md OQ-H3.
- [x] 1.2 Baseline: `cd service && npm ci && npm run build && npm test` -> build OK, tests green.
- [x] 1.3 Create folders: `mkdir -p service/src/{tool-sources,chat,agents/prompts,schema,tools} service/tests/{wire,chat,contract}`. SPDX header (`// SPDX-License-Identifier: MIT`) on every new file.
- [x] 1.4 Check Node >= 22 (`node -v` prints `v22.x`) - `AbortSignal.any` is used.

## 2. Pure utilities (no I/O, port first so everything else can import them)

- [x] 2.1 Port `message.utils.ts`. **Why:** history sanitising, system-message stripping, `endWithUserMessage` (Explore 6). **Where:** create `service/src/utils/message.utils.ts`; copy `LEGACY/src/utils/message.utils.ts` verbatim. **How:** copy; keep exports `sanitizeMessages`, `stripSystemMessages`, `endWithUserMessage`, types. **Done when:** port `LEGACY/tests/wire/analyzer-messages.spec.ts` to `service/tests/wire/analyzer-messages.spec.ts` (fix the import path) and it passes. **Watch out:** G task 7.1 may already have created this file - keep one copy and skip creating it.
- [x] 2.2 Port token estimation. **Where:** `service/src/utils/token-estimate.utils.ts` from `LEGACY/src/utils/token-estimate.utils.ts`. **Done when:** new test `tests/wire/token-estimate.spec.ts`: `estimateTokens(0)=0`, `estimateTokens(5)=2`, `sizeOf` of string/object/circular/undefined (circular returns 15, never throws).
- [x] 2.3 Port usage metadata. **Where:** `service/src/utils/metadata.utils.ts` from `LEGACY/src/utils/metadata.ts`. **How:** copy and **delete every `console.log`** (lines 91-104 in legacy); `getAccumulatedUsage` has no side effects. **Done when:** `tests/wire/metadata.spec.ts`: top-level usage, nested `output.metadata.usage`, empty array. `grep -rn "console\." service/src/utils/metadata.utils.ts` prints nothing.
- [x] 2.4 Port stream utils. **Where:** `service/src/utils/stream.utils.ts` from `LEGACY/src/utils/stream.utils.ts`. **How:** keep only `sendSSEError` and `describeStreamError` (and `logger` import from C's logger); delete `formatSSE`, `sendSSEEvent`, `initSSEResponse`, `completeSSEStream`, `streamToSSE`. **Done when:** `tests/wire/stream-utils.spec.ts`: `sendSSEError` writes `data: {"type":"error","errorText":"x"}\n\n` then `data: [DONE]\n\n` and ends; `describeStreamError` returns the message and logs `statusCode`/`responseBody` truncated to 2000 chars.
- [x] 2.5 Port `tool-schema-debug.ts`. **Where:** `service/src/utils/tool-schema-debug.ts` from `LEGACY/src/functional-agent/utils/tool-schema-debug.ts`. **Done when:** test: a tool whose `inputSchema` getter throws is reported by name, others not.
- [x] 2.6 Split `file.utils.ts`. **Where:** create `service/src/utils/url-references.ts` containing only `UrlReference`, `extractUrlReferences` and its private helpers from `LEGACY/src/functional-agent/utils/file.utils.ts` (lines 47-155). **How:** do NOT copy `sharp`, GCS, `uploadOneFile`, `processGeneratedFiles`, `convertFilePartMessages` (L owns them; image `prepareTaskMessages` in task 7.4 imports a function type instead). **Done when:** test: nested subagent output file URLs are extracted, `data:` URLs ignored.

## 3. Schema normalisation (pure code with its tests)

- [x] 3.1 Port `json-schema.ts`. **Where:** `service/src/schema/json-schema.ts` from `LEGACY/src/utils/json-schema.utils.ts` (619 lines). **How:** copy verbatim; keep all comments (they document why); only fix the import paths. **Done when:** copy `LEGACY/tests/wire/mcp-tool-schema.spec.ts` to `service/tests/wire/mcp-tool-schema.spec.ts`, change the import to `../../src/schema/json-schema`, `npm test -- mcp-tool-schema` passes all tests. **Watch out:** `structuredClone` needs Node 17+.
- [x] 3.2 Port `legacy-tool-schema.ts`. **Where:** `service/src/schema/legacy-tool-schema.ts` from `LEGACY/src/client/legacy-tool-schema.ts`. **How:** copy; imports `ai`, `@ai-sdk/provider-utils`, `zod`. **Done when:** copy `LEGACY/tests/wire/legacy-tool-schema.spec.ts` to `service/tests/wire/legacy-tool-schema.spec.ts` **without** the test named "every real Stripe toolkit tool ends up with an argument schema" and without the `@stripe/agent-toolkit` import (that test moves to change J; add a line in `plans/questions-inbox/GHN-plan-amendments.md` if not yet there). Remaining tests pass.
- [x] 3.3 Central `normalizeToolSet`. **Where:** `service/src/schema/normalize-tool-set.ts`. **How:**
  ```ts
  export const normalizeToolSet = (tools: ToolSet, log = logger): ToolSet =>
    Object.fromEntries(Object.entries(tools).map(([name, tool]) => {
      try {
        const raw = asSchema((tool as any).inputSchema)?.jsonSchema;
        if (!raw || !needsGeminiNormalization(raw)) return [name, tool];
        const hoisted = hoistRefsForGemini(raw);
        const schema = hasUnresolvableRef(hoisted) ? normalizeJsonSchemaForGemini(raw) : hoisted;
        return [name, { ...tool, inputSchema: jsonSchema(schema, { validate: asSchema((tool as any).inputSchema).validate }) }];
      } catch (error) { log.warn(`schema normalisation skipped for tool ${name}`, error); return [name, tool]; }
    }));
  ```
  Model it on the legacy call site `LEGACY/src/cache/mcp-tools.cache.ts` lines 115-140 (read them first). **Done when:** `tests/wire/normalize-tool-set.spec.ts`: ref-heavy tool is rewritten and idempotent (second pass deep-equals), clean tool returned by identity, throwing schema tool kept and warned. **Watch out:** keep `validate` of the original schema so tool input validation is unchanged.

## 4. ToolSource registry (the contract for I, J, K, L, M)

- [x] 4.1 Types. **Where:** create `service/src/tool-sources/types.ts` with `ToolContext`, `ToolSource` (add optional `description?: string` and `kind: 'core' | 'integration'`), `MenuEntry`, `ImageUploader` exactly as in `specs/tool-source-registry/spec.md`. **Done when:** compiles; exported from `service/src/tool-sources/index.ts` barrel. **Watch out:** `ToolContext.stores` and `config` types come from E and C; do not redefine them.
- [x] 4.2 Registry core. **Where:** create `service/src/tool-sources/registry.ts`.
  **Why:** one place for timeout, isolation, ordering, disabled-tools, prompt gating. **How:**
  ```ts
  export const SOURCE_RESOLVE_TIMEOUT_MS = 15_000;
  const withTimeout = <T>(p: Promise<T>, ms: number, name: string): Promise<T> =>
    Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${name} timed out after ${ms} ms`)), ms).unref())]);
  export const createToolSourceRegistry = (timeoutMs = SOURCE_RESOLVE_TIMEOUT_MS) => {
    const sources = new Map<string, ToolSource>();
    const register = (...list: ToolSource[]) => list.forEach((s) => {
      if (sources.has(s.name)) throw new Error(`Duplicate ToolSource name: ${s.name}`);
      sources.set(s.name, s);
    });
    const ordered = () => [...sources.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    const resolve = async (ctx: ToolContext) => {
      const settled = await Promise.all(ordered().map(async (source) => {
        try {
          const tools = await withTimeout((async () => (await source.isEnabled(ctx)) ? source.getTools(ctx) : {})(), timeoutMs, source.name);
          return { source, tools: applyDisabled(source.name, tools, ctx.session.disabledTools) };
        } catch (error) { ctx.logger.warn(`ToolSource ${source.name} skipped`, error); return { source, tools: {} as ToolSet }; }
      }));
      // sequential merge in order => deterministic (Promise.all keeps array order)
      ...build { tools, fragments[], contributing[] } ...
    };
    return { register, resolve, listMenuGroups, listConnectedSourceNames };
  };
  ```
  `applyDisabled` removes names in `disabledTools[name]`, everything when the list includes `all_tools`. Collisions: later wins + `logger.warn`. Fragments: `\n\n# ${displayName}\n\n${source.getPrompt(ctx)}` only when `Object.keys(tools).length > 0`. **Done when:** `tests/wire/tool-source-registry.spec.ts` covers every scenario of `specs/tool-source-registry/spec.md` (duplicate registration, hang -> skipped after timeout using `timeoutMs=50`, throw, completion-order independence, disabled tool, `all_tools`, menu null, empty group, connected names). **Watch out:** `isEnabled` must be inside the same timeout as `getTools` or a hanging `isEnabled` blocks the turn.
- [x] 4.3 Menu and connected-source providers. **Where:** same file. **How:** `listMenuGroups(ctx)` = concurrent `listForMenu` with the same timeout/isolation, `{ mcp: name, toolNames }`; `listConnectedSourceNames(ctx)` = names where `kind==='integration'` and `isEnabled`. Export `installRegistryProviders(registry)` which calls G's `setToolMenuProvider({ listMenuGroups })` and `setConnectedSourcesProvider({ list })`. **Done when:** test using G's real `tools.controller` with a stub source: `GET /session/:id/tools` returns the stub group (supertest).
- [x] 4.4 `StubToolSource` for tests. **Where:** `service/tests/helpers/stub-tool-source.ts` (test-only helper): `new StubToolSource({ name, tools, prompt?, enabled?, delayMs?, throws? })`. **Done when:** used by 4.2 tests.
- [x] 4.5 Composition file. **Where:** `service/src/tool-sources/index.ts`: `export const registry = createToolSourceRegistry();` plus the commented registration lines from design D-H1; `installRegistryProviders(registry)` called once from `app.ts`. **Done when:** `npm run build` green.

## 5. Prompts

- [x] 5.1 `base.prompt.ts`. **Where:** `service/src/agents/prompts/base.prompt.ts` from `LEGACY/src/functional-agent/agents/prompts/base.prompt.ts`. **How:** replace `AgentContext` by `ToolContext` (fields used: `locale`, `temporaryTableMessages`, `projectSystemPrompt`). Keep `getBaseRules`, `getConfirmationSection`, `getReturnFormatSection`, `getTemporaryTablesSection`, `getContextSections`, `getProjectSystemPromptSection`. **Done when:** `tests/wire/base-prompt.spec.ts`: blank project prompt -> `''`, non-blank wrapped in `<developer_instructions>`.
- [x] 5.2 Port source-specific prompts. **Where:** `service/src/agents/prompts/{commercetools,contentstack,algolia,stripe,visualize,bigquery,export,image-generation}.prompt.ts` + `index.ts` from the same legacy folder. **How:** for each file: (1) type param becomes `ToolContext`; (2) **delete** the trailing `${getProjectSystemPromptSection(context.projectSystemPrompt)}` line (D-H4); (3) `commercetools.prompt.ts` imports `getDeveloperTipsSection` from `client/ct-knowledge.mcp` - replace by an optional parameter `developerTips?: string` (change J supplies it; default `''`). Do NOT port `commercetools-ui.prompt.ts`, `nimbus-scope.ts`, `nimbus-surface.generated.ts` (change M). **Done when:** `tests/wire/prompts.spec.ts` iterates all exported builders: each returns a non-empty string containing the locale and never contains `developer_instructions`.
- [x] 5.3 Orchestrator preamble. **Where:** `service/src/chat/preamble.ts`. **How:** start from `ORCHESTRATOR_INSTRUCTIONS` in `LEGACY/src/functional-agent/singleton.ts` (lines 30-94) and rewrite: intro + rules 1-8 (keep the wording about latest message priority, multi-domain, "Entity links are always RELATIVE"); replace the static `## Available Tools list` by a generated list `### <displayName>\n<description>` of contributing sources; remove "Always delegate to a tool" (Explore 2). Signature `buildPreamble(contributing: ToolSource[]): string`. **Done when:** test "does not mention sources that did not contribute" (spec scenario) passes with a stub.

## 6. Built-in tools and sources

- [x] 6.1 Entity URL mapping + link tool. **Where:** `service/src/tools/entity-url-mapping.ts` and `service/src/tools/entity-link.tool.ts` from `LEGACY/src/functional-agent/tools/entity-url-mapping.ts` and `entity-link.tool.ts`. **How:** copy; `createEntityLinkToolFactory(projectKey)` unchanged (project key now `ctx.user.projectKey`); the tool input is `{ links: [...] }` (an array of link requests, not one flat object). **Done when:** `tests/wire/entity-link.spec.ts`: order link starts with `/<projectKey>/orders/`, `product-variant` without `variantId` returns the legacy error JSON, unsupported type fails zod.
- [x] 6.2 Visualize tool. **Where:** `service/src/tools/visualize.tool.ts` from `LEGACY/src/functional-agent/tools/visualize.tool.ts` (352 lines). **Done when:** `tests/wire/visualize.spec.ts` executes the tool with a 2-column table and gets the spec back; invalid chart type rejected.
- [x] 6.3 Export tool. **Where:** `service/src/tools/export.tool.ts` from `LEGACY/src/functional-agent/tools/export.tool.ts`. **Done when:** `tests/wire/export.spec.ts`: CSV escaping (comma, quote, newline), empty data / empty headers / no matching header errors, base64 content decodes to the CSV.
- [x] 6.4 Three always-on sources. **Where:** `service/src/tool-sources/{entity-link,visualize,export}.source.ts`. **How:** each: `kind: 'core'`, `isEnabled: async () => true`, `getTools` returns the tool, `listForMenu: async () => null`, `getPrompt` from 5.2 (`entity-link` has an empty prompt; keep its guidance in the tool description). Orders: 100, 110, 120. **Done when:** registry test registers them and `resolve` returns the 3 tool names; register them in `tool-sources/index.ts`.

## 7. Agent keys, subagent tool, image generation

- [x] 7.1 Agent keys. **Where:** `service/src/agents/agent-keys.ts`: `AGENT_KEYS = ['commercetools','contentstack','algolia','stripe','commercetoolsUI','visualize','bigquery','export','imageGeneration'] as const`, `AgentKeySchema`, and a map key -> `{ name, description }` (copy `meta` of each legacy definition from `LEGACY/src/functional-agent/agents/definitions/*.agent.ts`). **Done when:** test: every key has a description; startup helper `logGatedAgentKeys(registry)` returns keys without a source.
- [x] 7.2 Subagent tool. **Where:** `service/src/agents/subagent-tool.ts` from `LEGACY/src/functional-agent/agents/subagent-tool.ts`. **How:** keep as is but type `AgentDefinition` locally (`{ meta, createAgent(ctx), prepareTaskMessages?, processMessage?, toModelOutput? }`) in this file. **Done when:** `tests/wire/subagent-tool.spec.ts` with `MockLanguageModelV3`: streams text, `toModelOutput` returns the last text, and the child receives the parent's aborted signal (spec scenario).
- [x] 7.3 `ImageUploader` hook. **Where:** `service/src/tool-sources/image-uploader.ts` with `setImageUploader`, `getImageUploader`. **Done when:** unit test of getter/setter.
- [x] 7.4 Image generation source. **Where:** `service/src/tool-sources/image-generation.source.ts`; port `LEGACY/src/functional-agent/agents/definitions/image-generation.agent.ts` (`createAgent`, `processMessage`, `prepareTaskMessages`). **How:** model `getModel('image').model`; `isEnabled = () => getImageUploader() !== undefined`; `getTools` returns `{ imageGeneration: createSubagentTool(def, ctx) }`; `processMessage` uses `getImageUploader().upload(bytes, mediaType, ctx.sessionId)` (convert the data URL with a local `dataUrlToUint8Array`); `prepareTaskMessages` uses `countTokens` from F and drops history when > 1e6 tokens; the file->base64 conversion of HTTP file parts is provided by L through an optional `ImageUploader.toModelMessages?` - when absent pass messages through. Keep the long comment about `providerOptions` (legacy lines 34-58) shortened to two lines. **Done when:** tests: disabled without uploader; with a fake uploader a `data:image/png;base64,...` last part is replaced by the returned URL.

## 8. Chat core

- [x] 8.1 Constants. **Where:** `service/src/chat/constants.ts`: `CHAT_HISTORY_MESSAGES = 20`, `ANALYZER_HISTORY_MESSAGES = 10`, `CHAT_MAX_STEPS = 50`, `STORABLE_TOOLS`, `SUBAGENT_TOOL_NAMES = ['imageGeneration']`, `ANNOTATIONS_PART_TYPE` re-export. **Done when:** compiles.
- [x] 8.2 Annotation part. **Where:** `service/src/chat/annotation-part.ts` from `LEGACY/src/functional-agent/annotation-part.ts`. **Done when:** `tests/wire/annotation-part.spec.ts`: valid payload -> text starting `## Annotations on the preview of "Title"`, components rendered as fenced `tsx`, `omittedComponents` note; non-annotation part -> `undefined`; malformed -> `undefined`.
- [x] 8.3 History loader. **Where:** `service/src/chat/history.ts`. **How:** `loadHistory({ messages: MessageService, sessionId, incoming })` -> `lastN(sessionId, CHAT_HISTORY_MESSAGES)`, append `incoming` when last id differs, `stripSystemMessages` (warn with the dropped count), when `getImageUploader()?.toModelMessages` exists apply it to the UI messages first (stored `/files/...` image parts become base64 data read through the Storage API; relative URLs must never reach the provider), then `convertToModelMessages(..., { convertDataPart: convertAnnotationDataPart })`, also return `storageMessages` (for `extractUrlReferences`). Port logic from `LEGACY/src/functional-agent/singleton.ts` lines 152-196. **Done when:** `tests/chat/history.spec.ts`: 45 stored -> 20 + new; race guard; system message dropped without throw; with a fake uploader a stored `{type:'file', url:'/files/<sid>/<f>.png'}` part reaches `convertToModelMessages` as a `data:` URL and the stored message is unchanged.
- [x] 8.4 Context builder. **Where:** `service/src/chat/context.ts`: `createToolContext({ req, session, budget })` collects `temporaryTableMessages` (`SessionService.getTemporaryTableMessages`), `projectSystemPrompt` (`SettingsService`), `urlReferences`, `locale` (`req.query.locale` default `en`). **Done when:** unit test with in-memory stores.
- [x] 8.5 Orchestrator. **Where:** `service/src/chat/orchestrator.ts`. **How:**
  ```ts
  export const buildOrchestrator = async (ctx: ToolContext, registry: ToolSourceRegistry) => {
    const { tools, fragments, contributing } = await registry.resolve(ctx);
    const instructions = [buildPreamble(contributing), getProjectSystemPromptSection(ctx.projectSystemPrompt), ...fragments].join('\n');
    const allTools = tools; // already merged, filtered and Gemini-normalised by registry.resolve (task 4.2 calls normalizeToolSet)
    const { model, providerOptions } = getModel('main');
    const agent = new ToolLoopAgent({ model, instructions, tools: withSoftAbort(allTools, ctx.budget), toolChoice: 'auto',
      temperature: 0.3, providerOptions, stopWhen: [stepCountIs(CHAT_MAX_STEPS), budgetExhausted(ctx.budget)],
      prepareStep: wrapUpPrepareStep(ctx.budget, instructions) });
    return { agent, allTools };
  };
  ```
  `normalizeToolSet` is applied exactly once, inside `registry.resolve` (extend task 4.2 accordingly). **Done when:** `tests/chat/orchestrator.spec.ts` with `MockLanguageModelV3` and two stub sources: project prompt appears once; gated stub absent; tool order. **Watch out:** `withSoftAbort`, `wrapUpPrepareStep`, `budgetExhausted` come from task 9.x - implement 9.1-9.3 first or stub them and switch.
- [x] 8.6 Custom-view orchestrator. **Where:** `service/src/chat/custom-view-orchestrator.ts` from `LEGACY/src/functional-agent/custom-view.agent.ts`. **How:** same shape as 8.5 but sources restricted to `['commercetools','commercetools-knowledge']` through `registry.resolve(ctx, { only })` (add the optional filter to the registry); instructions: custom-view prose (legacy lines 30-93) + base rules + return format + project prompt once; `decodeCustomView(value)` = try `Buffer.from(value,'base64').toString('utf8')` with warn + `''` on failure; remove both `console.*` calls. **Done when:** tests: decoded URL in instructions, malformed value does not throw.
- [x] 8.7 Stream composition. **Where:** `service/src/chat/stream.ts`. **How:** `createChatStream({ agent, messages, budget, onFinish, allTools })` returns `createUIMessageStream({ execute, onError, onFinish })`; `execute` iterates `(await agent.stream({ messages, abortSignal: budget.hardSignal, timeout: { stepMs: 120_000, toolMs: 90_000, chunkMs: 60_000 } })).toUIMessageStream({ onError, messageMetadata })` chunk by chunk with `writer.write`; `messageMetadata: ({part}) => part.type === 'finish-step' ? { usage: part.usage } : undefined`; `onError` = `(e) => { logUnserializableToolSchemas(allTools,'orchestrator'); return describeStreamError('orchestrator stream error', e); }`. Time-limit finalisation is added in 9.4. **Done when:** `tests/chat/stream.spec.ts` serves the stream via `pipeUIMessageStreamToResponse` over `http.createServer` (pattern from the ported `ui-message-stream.spec.ts`) with a mock model returning `hi`: chunks contain `text-delta`.

## 9. Request time budget

- [x] 9.1 Config. **Where:** C's `service/src/config/` (small additive edit) + `connect.yaml` standardConfiguration (B): add `CHAT_REQUEST_BUDGET_MS` (default `270000`) and `CHAT_FINALIZE_RESERVE_MS` (default `30000`) with the validation of `specs/request-time-budget/spec.md`. **Done when:** config unit tests: 300000 -> throws naming key and max 285000; defaults; reserve > budget/2 throws. **Watch out:** record the cross-change edit in the commit message; `commercetools connect validate` must stay green.
- [x] 9.2 `RequestBudget`. **Where:** `service/src/chat/request-budget.ts`.
  ```ts
  export class RequestBudget {
    readonly hardSignal: AbortSignal; readonly softSignal: AbortSignal;
    constructor(private readonly startedAt: number, private readonly budgetMs: number, private readonly reserveMs: number,
                private readonly clientGone: AbortSignal, private readonly now: () => number = Date.now) { /* timers (unref) for soft + hard */ }
    remainingMs() { return this.startedAt + this.budgetMs - this.now(); }
    phase(): 'normal' | 'wrapping-up' | 'expired' { /* now >= hard -> expired; now >= hard - reserve -> wrapping-up */ }
    timedOut() { return this.phaseAtAbort === 'expired' && !this.clientGone.aborted; }
    dispose() { /* clear timers */ }
  }
  ```
  `hardSignal = AbortSignal.any([hardCtl.signal, clientGone])`. **Done when:** `tests/chat/request-budget.spec.ts` with fake timers: phases at 0/245/270 s, `softSignal` aborts at 240 s for budget 270/reserve 30, `timedOut()` false after client abort, `dispose` clears timers (no open handles: `--detectOpenHandles`).
- [x] 9.3 Soft-abort tool wrapper and wrap-up step. **Where:** `service/src/chat/budget-tools.ts`: `withSoftAbort(tools, budget)`, `wrapUpPrepareStep(budget, instructions)`, `budgetExhausted(budget)`, `WRAP_UP_NOTICE`.
  `WRAP_UP_NOTICE = "\n\nTIME IS NEARLY UP. Do not call any more tools. Write the final answer now: summarise what you found, say clearly what could not be completed, and suggest the next step."`
  **Done when:** `tests/chat/budget-tools.spec.ts`: a tool that waits for its abort signal returns `{ error: 'Stopped: time limit reached' }` shortly after the soft signal; `prepareStep` returns `undefined` in `normal` and `{ toolChoice:'none', instructions }` otherwise; generator tools still yield. **Watch out:** a tool's own error must still propagate; only the abort is converted.
- [x] 9.4 Hard abort notice and keep-alive. **Where:** `service/src/chat/stream.ts` (extend 8.7). **How:** wrap the chunk loop in `try { ... } finally { if (budget.timedOut()) { writer.write({type:'text-start',id:'time-limit'}); writer.write({type:'text-delta',id:'time-limit',delta:NOTICE}); writer.write({type:'text-end',id:'time-limit'}); writer.write({type:'data-turn-status',data:{status:'time-limit'}}); } clearInterval(heartbeat); }`; heartbeat every 20 s: `writer.write({ type: 'data-keepalive', data: {}, transient: true })` when no chunk was written since the last tick. Treat an `AbortError` from the iterator as normal termination when `budget.timedOut()`. **Done when:** `tests/chat/time-limit.spec.ts`: model whose `doStream` never emits, budget 3 s / reserve 1 s (fake or real timers) -> response ends within 3.5 s containing the notice and `[DONE]`; client abort -> no notice; idle 25 s (fake timers) -> one `data-keepalive`. **Watch out:** `data-keepalive` must not reach storage (task 10.2 drops `transient` and unknown `data-*` parts).
- [x] 9.5 Turn log line. **Where:** `service/src/chat/stream.ts` `onFinish`. **How:** `logger.info('chat turn finished', { sessionId, elapsedMs, phase, steps, timeLimit })`; when `timeLimit` also `logger.warn('chat.time_limit_reached', { sessionId })`. **Done when:** test spies the logger.

## 10. Endpoint

- [x] 10.1 Request validation. **Where:** `service/src/chat/validate-request.ts`; logic from `LEGACY/src/controllers/ai.chat.controller.ts` lines 207-263. **How:** `validateChatRequest(req): { ok: true, message } | { ok: false, error }` with the "not parsed as JSON" detection (content-type check) and the system-role rejection. **Done when:** `tests/chat/validate-request.spec.ts` covers the three spec scenarios exactly (error texts include received keys / `Content-Type: application/json`).
- [x] 10.2 Storage filter. **Where:** `service/src/chat/storage-filter.ts`; port `processMessagesForStorage`, `isStorableToolPart`, `isSubagentToolPart`, `filterSubagentOutputParts` from `LEGACY/src/controllers/ai.chat.controller.ts` lines 21-185 with real types instead of `any` (`UIMessage`, `UIMessagePart`); drop parts with `transient: true` or type `data-keepalive`; keep `data-turn-status` (it is the persisted time-limit marker). **Done when:** `tests/chat/storage-filter.spec.ts`: text kept, empty text dropped, `data:` file dropped, web file kept, annotation kept, `tool-visualize_data` with `output-available` kept, one without output dropped, subagent nested parts reduced, message with no parts dropped, usage metadata preserved. Port at least 10 assertions.
- [x] 10.3 Controller. **Where:** `service/src/chat/chat.controller.ts`. **How:** order: validate -> `session = res.locals.session` (from G `loadSession`) -> create `RequestBudget` (start = `req.startedAt` set by the budget middleware) -> fire-and-forget `messages.appendMissing(sessionId,[incoming])` with `.catch(log)` -> build context -> pick orchestrator (`session.featureFlags?.customView` ? custom : default) -> `createChatStream` with `onFinish`:
  ```ts
  onFinish: ({ messages, isAborted }) => {
    const storable = processMessagesForStorage(messages);
    void messages$.appendMissing(sessionId, storable).catch((e) => logger.error('Error storing messages', e));
    runTurnDigest({ sessionId, userId: req.user.userId, locale, messages });  // G; never awaited
  }
  ```
  then `await pipeUIMessageStreamToResponse({ response: res, stream, status: 200, headers: { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache, no-transform', Connection:'keep-alive', 'X-Accel-Buffering':'no' } })` inside try/catch: before headers -> JSON `fail(res,500,...)`; after -> `if (!res.writableEnded) sendSSEError(res, message)`. `finally { budget.dispose() }`. **Done when:** `tests/chat/chat-endpoint.spec.ts` (supertest + in-memory stores + mock model + stub source): happy path stores user+assistant, digest called once and not awaited (deferred promise), provider error mid-stream yields one `error` chunk + `[DONE]`, no `Access-Control-*` header. **Watch out:** NEVER leave the pipe un-awaited (Explore 8).
- [x] 10.4 Client disconnect. **Where:** the route middleware in 10.5. **How:** `const gone = new AbortController(); res.on('close', () => { if (!res.writableEnded) gone.abort(); });` pass `gone.signal` to `RequestBudget`. **Done when:** test opens a request with `http.request`, destroys the socket after the first chunk, asserts the mock model's `abortSignal.aborted` within 100 ms and that `onFinish` persistence still ran.
- [x] 10.5 Route. **Where:** `service/src/routes/ai-chat.route.ts`: `router.post('/:sessionId/message/stream', verifyMcSession, loadSession, startBudget, sendAiChatMessage)`; mount at `/ai-chat` in `service.route.ts`. **Done when:** unskip row 19 in G's contract test (`tests/contract/routes.spec.ts`); non-owner gets 404.
- [x] 10.6 Wire contract test. **Where:** `service/tests/wire/ui-message-stream.spec.ts` ported from `LEGACY/tests/wire/ui-message-stream.spec.ts` (keep `CLIENT_ACCEPTED_CHUNK_TYPES`; update the comment to name `mc-app` + `mc-view-app`). Add a test that serves the real `createChatStream` output with a tool call and asserts every chunk type is accepted (this will catch `custom`/`reset-step`). **Done when:** all tests pass.

## 11. Analyzer, wiring, docs

- [x] 11.1 Analyzer. **Where:** `service/src/agents/analyzer.agent.ts` from `LEGACY/src/functional-agent/agents/analyzer.agent.ts`. **How:** `const { model, providerOptions } = getModel('lite')`; constants from 8.1; keep the unreconciled behaviours (Explore 12) and their comments. **Done when:** port `LEGACY/tests/wire/analyzer-size-gate.spec.ts` (5 tests) - it mocks the model module: rewrite the mock to F's module path - and all pass.
- [x] 11.2 App wiring. **Where:** `service/src/app.ts` / `routes/service.route.ts`: `installRegistryProviders(registry)`, mount `/ai-chat`, log `logGatedAgentKeys`. **Done when:** `npm run build && npm test` green; local run with `MC_AUTH_DISABLED=true`: `curl -N -XPOST localhost:8080/service/ai-chat/<id>/message/stream -H 'content-type: application/json' -d '{"id":"<id>","message":{"id":"m1","role":"user","parts":[{"type":"text","text":"hi"}]}}'` prints `data: {"type":"start"...` lines (needs F's smoke credentials or the mock model env `CHAT_MODEL_MOCK=1` defined only in tests - do not add such an env var to production code; use jest).
- [x] 11.3 Typecheck/lint hygiene. **How:** `npm run build`; `grep -rn "console\." service/src | wc -l` -> 0; `grep -rn ": any" service/src/chat service/src/tool-sources service/src/schema | wc -l` -> only inside `schema/` copies of legacy code; `node scripts/spdx-check.mjs` clean.
- [x] 11.4 Contract docs for I-M. **Where:** `openspec/changes/h-agents-and-chat-stream/design.md` already holds the contract; additionally add `service/src/tool-sources/README.md` (<= 60 lines): the interface, a 25-line "write a source" example using `StubToolSource` style, and the collision/ordering rules. **Done when:** README renders; linked from design Decisions D-H1 in the commit message.

## Last: Verification

- [x] Unit/wire tests (all under `service/tests/`): `wire/{analyzer-messages,analyzer-size-gate,token-estimate,metadata,stream-utils,mcp-tool-schema,legacy-tool-schema,normalize-tool-set,tool-source-registry,base-prompt,prompts,entity-link,visualize,export,subagent-tool,annotation-part,ui-message-stream}.spec.ts`, `chat/{history,orchestrator,stream,request-budget,budget-tools,time-limit,validate-request,storage-filter,chat-endpoint}.spec.ts`, `contract/routes.spec.ts` (row 19 active).
- [ ] `npm run build && npm test` green; `commercetools connect validate` green (config keys added in 9.1).
- [ ] Live smoke (needs M3/M5): run the service locally with the real model, send one message through `curl -N`, expect a complete stream and a stored assistant message (`GET /service/session/<id>/messages`).
- [ ] Chrome E2E (spec V implements; run against the app once P exists): **E2E-H-01** send message streams a reply and composer re-enables; **E2E-H-02** a visualisation/entity-link tool part renders (assert tool part present, no exact wording); **E2E-H-03** second message uses history (ask "repeat my first question"); **E2E-H-04** time budget: start the service with `CHAT_REQUEST_BUDGET_MS=40000 CHAT_FINALIZE_RESERVE_MS=10000`, send a deliberately long multi-tool task, assert the stream ends before 45 s, the notice text appears and the composer is enabled; on the sandbox also run one real ~4-minute turn to settle OQ-H2; **E2E-H-05** stop button aborts (network request cancelled, no console error); **E2E-H-06** custom-view session answers in entity context; **E2E-H-07** forced provider error renders a one-line error, not a Zod dump; **E2E-H-08** preview annotations reach the model. Evidence under `plans/evidence/H/`.
- [x] `openspec validate h-agents-and-chat-stream --strict` passes.

## Docs to update (for change W)

- `docs/api.md`: row 19 (SSE endpoint) with the chunk vocabulary and the `data-turn-status` / `data-keepalive` parts.
- Architecture/how-it-works: ToolSource registry diagram, orchestrator composition, request-time-budget timeline (copy the D-H5 diagram), history window (20) and analyzer window (10).
- Config reference: `CHAT_REQUEST_BUDGET_MS`, `CHAT_FINALIZE_RESERVE_MS` (+ platform 5-minute limit).
- "Writing a tool source" guide for contributors (from `service/src/tool-sources/README.md`).
- Remove from FEATURES.md: agent `createAgent` factories, Anthropic provider, CORS note; add: project system prompt injected once, time-limit notice behaviour.
