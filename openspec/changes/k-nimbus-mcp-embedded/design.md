## Context

Change **K** implements decision **D3** (embed the Nimbus MCP gateway in `service/`). Needs: H. "R/" = `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/`. Planning date 2026-10-08. The owner may still answer Q3 = "separate service"; the design keeps that path cheap (decision DK-1, appendix A).

## Goals / Non-Goals

**Goals:** keep the behaviours of the gateway that matter (one child, respawn, timeout recycle, stderr logs, 7-tool readiness) as a small module; make them testable without a network; prove the footprint fits Connect (1 CPU, 512 MB).
**Non-Goals:** an HTTP server, auth header, container image, generic stdio-MCP framework.

## Explore findings

### Why a child process at all
1. **[code]** `@commercetools/nimbus-mcp` (3.5.1) ships `bin: nimbus-mcp -> ./dist/index.js`, `"type":"module"`, `exports: { ".": { "import": "./dist/index.js" } }`, `files: [dist, data]`, deps `@modelcontextprotocol/sdk ^1.27.1`, `zod ^4.4.3`; `dist/index.js` instantiates `StdioServerTransport` and its `createServer()` is not exported (R/nimbus-mcp-gateway/README.md "Why this exists"; R/nimbus-mcp-gateway/node_modules/@commercetools/nimbus-mcp/package.json). `require()` and `require.resolve()` of the package and of its `package.json` both throw `ERR_PACKAGE_PATH_NOT_EXPORTED` from CommonJS, which is why the gateway walks `node_modules` (R/nimbus-mcp-gateway/src/upstream.ts 14-48). The target service is built like the legacy one (TypeScript to CommonJS, es2016 target per the legacy wire-test comment), so the same walk is needed.
2. **[npm probe 2026-10-08]** `npm view @commercetools/nimbus-mcp`: latest `3.6.0`, unpacked size 10.7 MB (legacy pin 3.5.1; unpacked tree measured 11 MB incl. `data/`).

### The gateway behaviours to keep
3. **[code]** One child serves all sessions: the MCP `Client` multiplexes JSON-RPC ids (README "One child per container"; 8 concurrent calls verified there). Respawn: `client.onclose` -> `client.close()` (the only thing that reaps the process) -> `current = null` (upstream.ts 78-91). Wedged child never closes stdio, so 3 consecutive timeouts recycle it (`TIMEOUT_RECYCLE_THRESHOLD = 3`, `UPSTREAM_TIMEOUT_MS` 20 s, lines 59-66, 128-150). Child stderr `pipe`d and re-emitted at warn through `readline` (lines 70-100). Readiness lists tools and compares with 7 expected names (index.ts 22-35, 47-80). Stateless HTTP and cookie affinity points in the README disappear with the HTTP layer.
4. **[code]** The router consumed it over HTTP with a 3 s handshake deadline because a cold gateway once cost a turn **41.7 s** (R/service/src/client/nimbus.mcp.ts 20-35; spawn + Cloud Run cold start). Embedded, there is no Cloud Run hop, so the cold path is only the spawn measured below.
5. **[code]** `nimbus.mcp.ts`: tools global (not per project), TTL 30 min, no session switches ("Nimbus has no entry in the tools menu"), drift warning vs `NIMBUS_MCP_TOOLS`, `get_component` replaced by `get_components` (`nimbus.batch.ts`: `MAX_LOOKUPS=24`, `CONCURRENCY=6`, de-dupe, per-item errors; motivation: a model step costs ~5.4 s so batching saves wall time). Tested by `R/service/tests/wire/nimbus-batch.spec.ts`.
6. **[code + H finding 1]** Only `commercetoolsUI` calls `createNimbusAgent()` (R/service/src/functional-agent/agents/definitions/commercetools-ui.agent.ts 36, 60). Its `createAgent` (`toolChoice: 'required'`, `stopWhen: hasToolCall(create_composed_page)`) is **dead code in the active path**: the orchestrator is flat and merges every agent's `getTools()` into one `ToolLoopAgent` (change H, Explore finding 1), so Nimbus tools are in the tool set of every standard turn (parity) and are absent only from the custom-view orchestrator, which selects exactly the sources `commercetools` and `commercetools-knowledge` (H spec `agent-orchestration`, "Custom-view orchestrator"). A missing Nimbus tool set must not break page generation (the prompt carries Nimbus guidance).
7. **[code]** Version coupling: `nimbus-surface.generated.ts` records `NIMBUS_VERSION = '3.5.1'`, the three frontends depend on `@commercetools/nimbus ^3.5.1`, the gateway pins `3.5.1`. The prompt lists components from the manifest, so MCP docs and manifest must be the same release (change M owns the manifest).

### Stdio transport options (verified by running both against the real package, 2026-10-08, Node 22.21.1)
8. **[code+run]** `@ai-sdk/mcp@2.0.44` (`node_modules/@ai-sdk/mcp/package.json` `exports["./mcp-stdio"]`, `dist/mcp-stdio/index.d.ts` 118-141) exports `Experimental_StdioMCPTransport` with config `{ command, args?, env?, stderr?: IOType | Stream | number, cwd? }`. It spawns with `stdio: ["pipe","pipe", config.stderr ?? "inherit"]` and a **filtered environment** (`HOME, LOGNAME, PATH, SHELL, TERM, USER` on POSIX; custom `env` is merged) - useful: no secret inheritance (`dist/mcp-stdio/index.js` 330-370). A `Stream` for stderr must be a handle with an fd, so there is **no way to turn the child's stderr into structured log lines** with it - only `inherit`/`ignore`. `createMCPClient({ transport })` over it: 7 tools, ready in 129 ms, a `get_component` call in 5 ms.
9. **[run]** `createMCPClient({ transport })` also accepts any object implementing `MCPTransport` (`MCPClientConfig.transport: MCPTransportConfig | MCPTransport`, `dist/index.d.ts` 666-668). The MCP SDK `StdioClientTransport({ stderr: 'pipe' })` passed directly (untyped) works: 7 tools, ready in 102 ms, call 3 ms, tool objects carry `toModelOutput`. Static typing needs a cast/adapter because the two packages carry different `JSONRPCMessage` types.
10. **[run]** After `kill -9` of the parent the child exits by itself (stdin EOF): verified, no orphan.

### Footprint against Connect limits
11. **[doc]** Connect service application: "uses a maximum of 1 CPU and 512 MB memory, and processing timeouts are in place"; "Avoid using service applications for workflows with intensive computational demands" https://docs.commercetools.com/connect/best-practices.md ; request timeout 5 minutes; sandbox scales to zero and needs ~15 s to boot https://docs.commercetools.com/connect/deployment-behavior-and-environments.md ; Node 22 or 24, buildpack not configurable https://docs.commercetools.com/connect/supported-runtimes.md.
12. **[measured, macOS, Node 22.21.1, legacy node_modules]** Child: connect (spawn + initialize) **147 ms**, `tools/list` 4 ms, first `get_component` (props) **132 ms**, RSS **71 MB** after list, 72 MB after one component call, **78 MB** after a `search_docs`. Parent process RSS after loading the legacy service's libraries sequentially: base 40 MB, + express 59, + @babel/core 68, + bigquery 74, + storage 80, + sharp 90, + ai 111, + @ai-sdk/mcp 120, + @ai-sdk/google 125, + stripe toolkit 137 MB (heap used 46 MB). Add Vertex/auth libraries (~+20 MB est.) -> ~160 MB. **Idle total ~235 MB; ~275 MB headroom** for concurrent SSE streams, BigQuery result sets, base64 images and Babel (`@babel/core` first transform measured 369 ms, RSS 92 MB with Babel loaded). Linux container numbers must be re-measured in the sandbox (task 8.2).
13. **[unverified]** Nothing in the Connect docs forbids child processes; the buildpack image is not documented. Must be proven by a sandbox deployment (task 8.2, scenario E2E-K-01). If spawn is blocked or the image lacks `node` on `process.execPath`, Q3 falls to appendix A.

### Other
14. **[doc/run]** `@modelcontextprotocol/sdk` latest `1.32.1` (legacy gateway `^1.30.0`, nimbus-mcp wants `^1.27.1`); `ai` latest `7.0.134`, `@ai-sdk/mcp` `2.0.71` (legacy ranges `ai 7.0.92`, `^2.0.44`). Exact versions are chosen by H for the AI SDK and by this change for the MCP SDK.

## Glossary

- **MCP stdio transport**: newline-delimited JSON-RPC over a child process' stdin/stdout.
- **Child / upstream**: the `nimbus-mcp` process; **generation**: a counter identifying one spawn so late callbacks of a dead child are ignored.
- **Recycle**: close the child on purpose; the next call respawns it.
- **Readiness**: "the child handshook and serves the 7 expected tools" (vs liveness: the service process is up).
- **Nimbus**: commercetools design system (`@commercetools/nimbus`), the component library of generated pages.
- **Surface manifest**: `nimbus-surface.generated.ts`, list of Nimbus exports by kind, owned by change M.
- **ToolSource**: registry entry from change H (`name`, `displayName`, `order`, `isEnabled`, `getTools`, `listForMenu` -> `{toolNames}|null`, `getPrompt`); the registry owns the 15 s timeout, isolation, session switches and prompt gating.
- **Connect `service` application**: serverless HTTP app with 1 CPU / 512 MB, scale-to-zero in sandbox.
- **Kill switch**: `NIMBUS_MCP_ENABLED=false`.

## Source map

| Legacy file | New file (service/src/nimbus/...) | Verdict |
|---|---|---|
| `R/nimbus-mcp-gateway/src/upstream.ts` (resolve, spawn, `getUpstream`, `recycleUpstream`, `callTool`) | `resolve.ts`, `process-manager.ts` | CHANGE: class with generation guard, idle shutdown, stderr via logger, no module-level state |
| `R/nimbus-mcp-gateway/src/index.ts` (`EXPECTED_TOOLS`, `/readyz`) | `readiness.ts` + route in `service/src/routes/status.ts` (C) | CHANGE: route `GET /service/status/nimbus`, 30 s cache |
| `R/nimbus-mcp-gateway/src/proxy.ts`, `auth.ts`, `env.ts`, `log.ts` | - | DROP (HTTP layer, shared secret, dotenv, own logger) |
| `R/nimbus-mcp-gateway/Dockerfile`, `README.md` "Deployment" | - | DROP (README rationale kept in `docs/how-it-works.md` by W) |
| `R/nimbus-mcp-gateway/scripts/smoke.mjs` | `service/scripts/smoke-nimbus.mjs` | CHANGE: calls the embedded manager / status route |
| `R/service/src/client/nimbus.mcp.ts` | `tool-source.ts`, `backend.ts` | CHANGE: H `ToolSource` (`name: 'nimbus'`, `order` right after M's `commercetools-ui` source) over `NimbusBackend`; no URL/key; 3 s first-handshake deadline kept |
| `R/service/src/client/nimbus.batch.ts` | `batch.ts` | KEEP |
| `R/service/src/constants.ts` `NIMBUS_MCP`, `NIMBUS_MCP_TOOLS` | `constants.ts` | KEEP |
| `R/service/src/functional-agent/agents/prompts/nimbus-scope.ts`, `nimbus-surface.generated.ts`, `commercetools-ui.prompt.ts` | owned by change M (prompt side) / H | not touched; K only checks the version pin |
| `R/service/tests/wire/nimbus-batch.spec.ts` | `service/tests/nimbus/batch.spec.ts` | KEEP |
| env `NIMBUS_MCP_URL`, `NIMBUS_MCP_KEY`, `NIMBUS_MCP_TIMEOUT_MS` | - | DROP (timeouts become constants) |

## Decisions

**DK-1. `NimbusBackend` interface with one implementation now.** `interface NimbusBackend { listTools(): Promise<Tool[]>; callTool(name, args, signal): Promise<CallToolResult>; readiness(): Promise<Readiness>; close(): Promise<void> }`, implemented by `ProcessManager`. Alternatives: call the manager directly from the tool source - rejected: the Q3 fallback (appendix A) then needs a rewrite of the source; an HTTP backend is ~60 lines behind the interface.

**DK-2. Use the MCP SDK `StdioClientTransport` wrapped in a small `MCPTransport` adapter, create ONE `MCPClient` per child generation.** Why: stderr must be a readable stream (finding 8); AI SDK tools keep their `toModelOutput` (finding 9). Alternatives: (a) `Experimental_StdioMCPTransport` with `stderr: 'inherit'` - works and is 10 lines, but child output reaches Connect logs as unstructured text and cannot be correlated; **kept as the documented fallback** if the adapter typing proves painful (task 3.2 time-box); (b) hand-built tools from `listTools` - rejected: must re-implement MCP-result-to-model conversion and schema handling that the SDK already owns.

**DK-3. Tools resolve the live generation at call time** (`execute` delegates to `manager.currentTools()[name]`). Alternative: hand out the generation's own tool objects - rejected: they hold a closed client after a respawn and an in-flight turn would fail (spec "Tools survive a respawn").

**DK-4. Lazy spawn + 3 s first-handshake deadline (inside the registry's 15 s per-source timeout) + background completion.** Alternative: eager spawn at boot like the gateway - rejected: scale-to-zero sandboxes would hold 75 MB for instances that never see a UI request, and boot time is already ~15 s. The first standard turn that resolves tools starts the child (cheap, ~150 ms; the 3 s deadline protects the turn).

**DK-5. Idle shutdown after 10 minutes.** Alternative: keep forever - rejected: frees ~75 MB on warm production instances for a feature only used when building pages; cost of a respawn is ~150 ms.

**DK-6. Cap the child heap and sanitise its environment.** `NODE_OPTIONS=--max-old-space-size=96` (child RSS is 71 MB at rest, mostly baseline); env = MCP SDK `getDefaultEnvironment()` + `NODE_OPTIONS`. Alternative: inherit `process.env` (legacy gateway had nothing secret to leak; the service has `ENCRYPTION_KEY`, SA key) - rejected.

**DK-7. Readiness as a service route, not part of `/status`.** `/service/status` (C) must stay cheap and never touch the child (legacy `/healthz` rule: a wedged child is recycled on demand and must not make the platform kill a healthy instance). `/service/status/nimbus` is unauthenticated like `/status`, returns versions and tool names only, and is cached 30 s so it cannot be used to hammer the child.

**DK-8. Pin `@commercetools/nimbus-mcp` exactly and test it against the manifest version** (finding 7). Alternative: caret range - rejected: the prompt's component list would silently drift from the docs the model reads.

**DK-9. Kill switch `NIMBUS_MCP_ENABLED` (standard config, default true).** Alternative: none - rejected: if the Connect image forbids child processes the owner needs a one-line workaround other than redeploying code.

## Risks / Trade-offs

- **[Child processes may not work on Connect]** -> sandbox smoke (task 8.2, E2E-K-01) before anything else in Wave 6 depends on it; kill switch; appendix A.
- **[Memory: ~75 MB child + ~160 MB parent]** -> idle shutdown, heap cap, measure on Linux in sandbox, document; if `service` RSS > 400 MB under the E2E load, escalate to appendix A.
- **[Cold start on scale-to-zero]** -> lazy + 3 s deadline: first page-building turn after a cold start may lack docs tools (prompt carries Nimbus guidance); second turn has them.
- **[Concurrency 1 CPU]** the child is single-threaded and shares the CPU with the service; lookups are 3-130 ms, `get_components` fan-out is capped at 24 lookups / concurrency 6.
- **[Orphaned child]** verified none on parent SIGKILL (finding 10); SIGTERM handler closes the manager.
- **[Upstream drift]** new tools or a renamed tool -> readiness `degraded`/warn, `get_components` degrades to the served set (legacy behaviour).
- **[Adapter typing]** two `JSONRPCMessage` types -> one documented cast; covered by the integration test with the real child.
- **[`@ai-sdk/mcp` stdio is experimental]** -> not used in the default design.

## Migration Plan

Nothing to migrate. Order: resolve + manager (unit tests with a fake child) -> adapter + integration test with the real package -> tool source + batch -> readiness route + script -> sandbox smoke. Rollback: set `NIMBUS_MCP_ENABLED=false`.

## Open questions

- **OQ-K1 (owner IQ1 = Q3)** Embed (default) or separate `service`? The sandbox smoke result decides if the default is viable; record it in `plans/evidence/K/`.
- **OQ-K2** Which Nimbus version: 3.5.1 (legacy) or 3.6.0 (npm latest)? Must match frontends (O) and the surface manifest (M). Default: whatever O pins exactly; K follows.
- **OQ-K3** (resolved by H's design) there is no per-agent scoping: the `nimbus` source is registered once and takes part in every standard turn; the custom-view orchestrator excludes it by selecting only `commercetools` + `commercetools-knowledge`. Residual: Nimbus tool schemas add ~7 tool definitions to every standard turn (legacy parity); if token cost matters later, gate `isEnabled` on a cheap intent signal.
- **OQ-K4** Does change C expose a way to add `GET /service/status/nimbus` under the unauthenticated status router? Default: K adds it next to `/status`.
- **OQ-K5** Which spawn command is safe in the Connect image: `process.execPath` (assumed) - confirm in the sandbox.

## Appendix A - Fallback if Q3 = "separate service"

Shape: a second `deployAs` entry `nimbus-gateway` (`applicationType: service`, `endpoint: /nimbus-gateway`, folder `nimbus-gateway/`, own `package.json`), port of the legacy gateway (`src/{index,upstream,proxy,auth,log}.ts`) reduced to: Express, `/healthz`, `/readyz`, `POST /mcp` (stateless `StreamableHTTPServerTransport`, `enableJsonResponse`), `requireKey` with `x-nimbus-gateway-key` compared by `crypto.timingSafeEqual`, fail closed when `NODE_ENV=production` and the key is empty. `connect.yaml`: gateway gets `securedConfiguration: NIMBUS_GATEWAY_KEY`; the main `service` gets `standardConfiguration: NIMBUS_MCP_URL` and `securedConfiguration: NIMBUS_GATEWAY_KEY` (the same value; the operator enters it twice). Because a Connect application cannot discover the sibling's URL, deployment becomes **three-phase**: deploy (gateway) -> read its URL from the deployment -> set `NIMBUS_MCP_URL` on the service (redeploy) -> frontends (decision D8 extended; change U's runbook and manual step list gain this hop). The service side adds `HttpGatewayBackend implements NimbusBackend` (`createMCPClient({ transport: { type: 'http', url, headers: { 'x-nimbus-gateway-key': key }, redirect: 'follow' } })`, `protocolVersionDiscovery` default), selected by `NIMBUS_MCP_URL` being set. Everything else (batching, tool source, readiness route proxying `/readyz`) is unchanged. Cost: one more app (1 CPU/512 MB), one more secret, one more manual step, but the service keeps its full 512 MB. Tasks for it are in `tasks.md` section 9 and are executed only if the owner answers Q3 that way or the sandbox smoke fails.
