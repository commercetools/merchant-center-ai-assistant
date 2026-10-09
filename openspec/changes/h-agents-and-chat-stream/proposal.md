## Why

The assistant's core is the SSE chat endpoint: an orchestrator model that calls tools contributed by several independent sources (commercetools MCP, Knowledge MCP, Contentstack, Algolia, Stripe, BigQuery, Nimbus/composed pages, image generation, local tools). In the legacy router this is hard-wired to Firestore, to a tenant request object and to Gemini API keys, and it has no guard for Connect's 5-minute request limit. Changes I, J, K, L and M each add one tool source and must plug into one stable contract.

## What Changes

- **Change ID: H** (`h-agents-and-chat-stream`). **Needs:** D (verified user), E (stores), F (`getModel`), G (sessions, messages, digest). Unblocks: I, J, K, L, M, P.
- Define the **`ToolSource` registry** (`name`, `isEnabled(ctx)`, `getTools(ctx)`, `listForMenu(ctx)`, `getPrompt(ctx)`): concurrent resolution with per-source timeout and failure isolation, ordered merge, generic application of the session's `disabledTools`, prompt-fragment concatenation only for contributing sources, and the `ToolMenuProvider` that G's tools menu consumes.
- Port the **orchestrators**: default (`singleton`) and custom-view (`custom-view.agent`), rewritten to compose instructions from the registry and to inject the project system prompt exactly once; `stepCountIs(50)`, `toolChoice: 'auto'`, `temperature: 0.3`.
- Port the **SSE endpoint** `POST /service/ai-chat/:sessionId/message/stream`: request validation, history window of the last 20 stored messages (+ race guard), system-role rejection, storage filter, annotation data parts, usage metadata, in-band error frames, persistence and digest hand-off in `onFinish`.
- Add the **Connect request budget**: default 270 s, soft deadline reserve, `prepareStep` wrap-up, tool abort at the soft deadline, hard abort via AI SDK v7 `abortSignal`, client-disconnect abort, keep-alive parts, and a persisted notice part - designed concretely in design.md.
- Port **Gemini JSON-schema normalisation** (`json-schema.utils`, `legacy-tool-schema`) as pure code with its tests and apply it centrally to the merged tool set.
- Port the **query analyzer** (`analyzeQueryTask`) and size/token estimators used by change L's offload pipeline.
- Port built-in tools `create_entity_link`, `visualize_data`, `export_data`, the image-generation subagent tool (gated by an `ImageUploader` provided by L), and all prompts except the Nimbus/composed-page prompt (stays with M).
- Keep every agent that depends on another change **registered but gated** by its ToolSource; H is fully testable with `StubToolSource`.
- Drop: unused providers, the stale "delegate to tools" orchestrator prose, `createAgent` factories that nothing calls, CORS headers on the stream, the non-UI SSE helpers (`streamToSSE`, `completeSSEStream`, `streamResponse`), `console.log` usage code.
- **BREAKING (vs legacy):** project system prompt is injected once into the orchestrator (was duplicated into each agent prompt and absent from the custom-view orchestrator).

## Capabilities

### New Capabilities
- `tool-source-registry`: the contract and runtime that I-M plug into.
- `agent-orchestration`: orchestrator composition, prompts, agent gating, subagent tool.
- `chat-stream-endpoint`: the SSE endpoint, history window, storage filter, annotations, errors.
- `request-time-budget`: Connect 5-minute budget with graceful finalisation.
- `tool-schema-normalisation`: Gemini-safe tool schemas.
- `query-analyzer`: aggregation/offload decision helper.

### Modified Capabilities
<!-- none -->

## Impact

- New code under `service/src/{tool-sources,agents,chat,schema,utils,routes,controllers}`.
- New configuration (requires small additive edits to C's `AppConfig` and B's `connect.yaml`, recorded in `plans/questions-inbox/GHN-plan-amendments.md`): `CHAT_REQUEST_BUDGET_MS` (default `270000`, max `285000`), `CHAT_FINALIZE_RESERVE_MS` (default `30000`).
- Consumers: I (identity MCP source), J (knowledge, contentstack, algolia, stripe sources), K (nimbus source), L (bigquery + image upload sources), M (composed page source), P/S (stream client).

## Out of scope

- Session/message CRUD, digest, suggestions, tools-menu endpoints (G).
- Any concrete third-party tool source (I, J, K, L, M).
- Model/provider construction and token counting internals (F) - H only calls `getModel`.
- `create_composed_page` tool, `commercetools-ui.prompt.ts`, `nimbus-scope.ts` and its generated manifest (M).
- BigQuery / GCS code (L), tool-result offload pipeline (L; H ships the analyzer it calls).
- Any GECX widget stream or endpoint (Q7 DECIDED 2026-10-09: dropped; `POST /service/chat/stream` is the only chat entry point). Any admin gating of chat (chat is open to every signed-in member; administrators are users whose user id is in `ADMIN_USER_IDS`, change D).

## Legacy source

Read-only, under `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/`:
`src/routes/ai-chat.route.ts`, `src/controllers/ai.chat.controller.ts`,
`src/functional-agent/{singleton,custom-view.agent,annotation-part,turn-digest}.ts`,
`src/functional-agent/agents/{index,types,subagent-tool,analyzer.agent}.ts`, `agents/definitions/*`, `agents/prompts/*`,
`src/utils/{message,metadata,stream,json-schema,token-estimate}.utils.ts`, `src/functional-agent/utils/{file.utils,tool-schema-debug}.ts`,
`src/functional-agent/tools/{visualize,export,entity-link,entity-url-mapping}.tool.ts`, `src/client/legacy-tool-schema.ts`, `src/constants.ts`,
`tests/wire/{ui-message-stream,mcp-tool-schema,legacy-tool-schema,analyzer-messages,analyzer-size-gate}.spec.ts`, `FEATURES.md` ("The multi-agent router and agent registry").
