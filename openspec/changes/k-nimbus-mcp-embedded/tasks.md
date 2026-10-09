## 0. Read first

- [x] 0.1 Read the context (30 min, no code)
      **Why:** the gateway's comments hold every hard-won rule about the child process.
      **Where:** this change's `proposal.md`, `design.md` ("Explore findings" 1-14, "Decisions", "Appendix A"), `specs/*/spec.md`; legacy `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/nimbus-mcp-gateway/src/upstream.ts` (whole), `.../src/index.ts` lines 1-80, `.../README.md` sections "Why this exists" and "How it works"; `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/client/nimbus.mcp.ts` and `nimbus.batch.ts`; docs https://docs.commercetools.com/connect/best-practices.md (service limits).
      **Done when:** you can explain (1) why `require.resolve` cannot find the package, (2) what `onclose` does and does not detect, (3) why 3 timeouts recycle, (4) why `/status` must not touch the child, (5) why stderr must be piped.
      **Watch out:** ignore HTTP, auth header and Dockerfile parts.

- [x] 0.2 Confirm dependencies
      **Why:** K plugs into H.
      **Where:** `service/src/`.
      **How:** find H's `ToolSource` type and `registerToolSource` (`service/src/tool-sources/`), the custom-view source selection, M's page-generation source order; C's logger and status router; C's shutdown hook (`SIGTERM` handling).
      **Done when:** `grep -rn "registerToolSource\|customView\|SIGTERM" service/src | head` shows all three.
      **Watch out:** if the shutdown hook does not exist, task 2.5 creates a tiny `onShutdown(fn)` registry in `service/src/lifecycle.ts` and tells C's owner.

## 1. Setup

- [x] 1.1 Create the skeleton and add dependencies
      **Why:** fixed layout, exact pins.
      **Where:** create `service/src/nimbus/{constants.ts,resolve.ts,process-manager.ts,transport.ts,backend.ts,client.ts,batch.ts,tool-source.ts,readiness.ts}`, `service/tests/nimbus/{fixtures/,}`, `service/scripts/smoke-nimbus.mjs`; SPDX headers.
      **How:** decide the Nimbus version (OQ-K2): read the exact pin from `mc-app/package.json` (change O) or default to `3.5.1`; then `cd service && npm install --save-exact @commercetools/nimbus-mcp@<ver> @modelcontextprotocol/sdk@<latest 1.x>`.
      **Done when:** `node -e "console.log(require('fs').existsSync('node_modules/@commercetools/nimbus-mcp/dist/index.js'))"` prints `true`; `npm run build` exits 0.
      **Watch out:** both go under `dependencies` (not dev): Connect installs production dependencies for the runtime.

- [x] 1.2 Constants
      **Why:** one place for every number.
      **Where:** `nimbus/constants.ts`.
      **How:**
      ```ts
      export const NIMBUS_EXPECTED_TOOLS = ['list_components','get_component','get_docs_page','search_docs','get_tokens','search_icons','migrate_from_uikit'] as const;
      export const CALL_TIMEOUT_MS = 20_000;
      export const RECYCLE_AFTER_TIMEOUTS = 3;
      export const FIRST_HANDSHAKE_DEADLINE_MS = 3_000;
      export const SPAWN_TIMEOUT_MS = 15_000;
      export const IDLE_SHUTDOWN_MS = 10 * 60_000;
      export const READINESS_CACHE_MS = 30_000;
      export const CHILD_NODE_OPTIONS = '--max-old-space-size=96';
      export const NIMBUS_MCP = 'nimbus';
      ```
      **Done when:** file compiles; values match the specs.
      **Watch out:** no env reads here (rule: only `readConfiguration()` reads env).

## 2. Process manager

- [x] 2.1 Resolve the package on disk
      **Why:** spec "One shared child" (package missing).
      **Where:** `nimbus/resolve.ts` from legacy `upstream.ts` lines 14-48.
      **How:** `resolveNimbusMcp(startDir = __dirname): { entry, version } | { error }` walking up for `node_modules/@commercetools/nimbus-mcp/package.json`; entry `dist/index.js` must exist; return an error object instead of throwing.
      **Done when:** `resolve.spec.ts`: finds the installed package and returns the version string equal to `service/package.json`'s pin; with a temp dir without the package returns `{ error }`. `npx jest tests/nimbus/resolve.spec.ts` green.
      **Watch out:** do not `require.resolve` - it throws `ERR_PACKAGE_PATH_NOT_EXPORTED`.

- [x] 2.2 Test fixture: a fake nimbus child
      **Why:** every resilience test needs a controllable child.
      **Where:** `service/tests/nimbus/fixtures/fake-nimbus.mjs`.
      **How:** MCP SDK `Server` + `StdioServerTransport` exposing the 7 tool names; behaviours selected by tool name: `search_docs` with `{query:'hang'}` never answers, `{query:'die'}` calls `process.exit(1)`, `{query:'noise'}` writes a line to stderr and answers; `FAKE_NIMBUS_MISSING=get_tokens` env removes a tool.
      **Done when:** `node tests/nimbus/fixtures/fake-nimbus.mjs < /dev/null` exits 0 immediately (stdin EOF) without output.
      **Watch out:** the fixture must not import service code.

- [x] 2.3 Manager core: lazy start, shared start, generation guard
      **Why:** the heart of the module.
      **Where:** `nimbus/process-manager.ts` (legacy `spawn`, `getUpstream`).
      **How:**
      ```ts
      export class NimbusProcessManager implements NimbusBackend {
        constructor(private opts: { entry: string; version: string; log: Logger; command?: string; extraEnv?: Record<string,string> }) {}
        private gen = 0; private current: Upstream | null = null; private starting: Promise<Upstream> | null = null;
        async getUpstream(): Promise<Upstream> { if (this.current) return this.current;
          this.starting ??= this.spawn().then(u => (this.current = u)).finally(() => (this.starting = null));
          return this.starting; }
      }
      ```
      `spawn()`: `new StdioClientTransport({ command: process.execPath, args: [entry], stderr: 'pipe', env: { ...getDefaultEnvironment(), NODE_OPTIONS: CHILD_NODE_OPTIONS } })`, MCP `Client`, `client.onclose = () => { if (gen !== this.gen) return; void client.close().catch(()=>{}); this.current = null; this.timeouts = 0 }`, `await client.connect(transport)` with `SPAWN_TIMEOUT_MS`.
      **Done when:** `process-manager.spec.ts` (points `entry` at the fixture): 8 concurrent `getUpstream()` -> one `ps`-visible child (assert via `transport.pid` counter in the fake: the fixture appends `process.pid` to a temp file); after `process.kill(pid,'SIGKILL')` the next call works and the temp file has 2 pids.
      **Watch out:** `onclose` fires when stdio closes, not when the process exits - always call `client.close()`.

- [x] 2.4 Call timeout and recycle after 3 consecutive timeouts
      **Why:** wedged-child recovery.
      **Where:** same file, `callTool`, `recycle(why)`.
      **How:** `client.callTool({name, arguments}, undefined, { timeout: CALL_TIMEOUT_MS })`; on error whose message matches `/timed out|timeout/i` increment `timeouts`; at 3 call `recycle('3 consecutive timeouts')`; success resets to 0. Tests may override the timeout through the constructor (`callTimeoutMs`).
      **Done when:** tests: three `search_docs{query:'hang'}` calls with `callTimeoutMs: 200` -> `recycle` log and the next call succeeds on a new pid; timeout, timeout, success, timeout -> no recycle.
      **Watch out:** `recycle` must `await client.close()` so the hung child is killed.

- [x] 2.5 Stderr logging, environment, idle shutdown, shutdown hook
      **Why:** spec requirements for logs, secrets, lifecycle.
      **Where:** same file + `service/src/lifecycle.ts` (only if missing).
      **How:** `readline.createInterface({ input: transport.stderr })` -> `log.warn('nimbus-mcp stderr', { source: 'nimbus-mcp', line })`; idle timer `setTimeout(() => this.close('idle'), IDLE_SHUTDOWN_MS).unref()` reset on every `callTool/listTools`; `close()` public and registered with the service shutdown hook.
      **Done when:** tests: `search_docs{query:'noise'}` produces exactly one warn log with `source:'nimbus-mcp'`; a spy on `StdioClientTransport` constructor args shows `env` without `ENCRYPTION_KEY` when `process.env.ENCRYPTION_KEY='x'`; with fake timers (`jest.useFakeTimers`) 10 min idle -> `close` called.
      **Watch out:** `unref()` the timers or Jest hangs.

- [x] 2.6 Readiness
      **Why:** spec "Readiness checks the expected tools".
      **Where:** `nimbus/readiness.ts`.
      **How:** `readiness(backend, version)` -> `listTools` names vs `NIMBUS_EXPECTED_TOOLS`; return `{status:'ok'|'degraded'|'error'|'disabled', nimbusMcp, tools?, toolNames?, missing?}`; cache 30 s (both ok and failures, 5 s for failures); warn on extra tools.
      **Done when:** `readiness.spec.ts` with fixture + `FAKE_NIMBUS_MISSING`: ok -> 7; missing -> degraded with `missing:['get_tokens']`; unreachable -> error.
      **Watch out:** never throw.

## 3. MCP client adapter

- [x] 3.1 Define `NimbusBackend`
      **Why:** DK-1 (fallback stays cheap).
      **Where:** `nimbus/backend.ts`.
      **How:** `interface NimbusBackend { tools(): Promise<Record<string, Tool>>; readiness(): Promise<Readiness>; close(): Promise<void> }` where `tools()` returns the AI SDK tools of the CURRENT generation.
      **Done when:** compiles; `NimbusProcessManager` implements it (stub methods fine until 3.3).
      **Watch out:** keep the interface free of stdio concepts.

- [x] 3.2 Transport adapter (time-box 2 h)
      **Why:** DK-2: hand the MCP SDK stdio transport to `createMCPClient` while keeping stderr.
      **Where:** `nimbus/transport.ts`.
      **How:** a class `NimbusTransport implements MCPTransport` (type from `@ai-sdk/mcp`) wrapping `StdioClientTransport`: forward `start/send/close`, property accessors for `onclose/onerror/onmessage`, expose `.stderr` and `.pid`; one `as unknown as MCPTransport` cast, commented with the reason (two `JSONRPCMessage` types). Verified manually in design finding 9 (plain object also works at runtime).
      **Done when:** `transport.spec.ts` with the fixture: `createMCPClient({ transport })` -> `client.tools()` returns 7 tools; each tool has `execute` and `toModelOutput`; a stderr line reaches the logger spy. **If you cannot make it type-check in 2 h**, switch to `Experimental_StdioMCPTransport` from `@ai-sdk/mcp/mcp-stdio` with `stderr: 'inherit'`, note it in the PR and set a TODO issue - the rest of the design is unchanged.
      **Watch out:** the manager's `onclose` hook must still fire (the MCPClient assigns `transport.onclose`; your adapter must call both its own hook and the client's).

- [x] 3.3 One `MCPClient` per generation and delegating tools
      **Why:** spec "Tools survive a respawn".
      **Where:** `nimbus/client.ts` + manager.
      **How:** after connect, `const client = await createMCPClient({ transport })`; `const served = await client.tools()` cached as `generation.tools`; `tools()` returns `Object.fromEntries(names.map(n => [n, { ...served[n], execute: (a, o) => manager.live().then(g => g.tools[n].execute(a, o)) }]))`; on respawn the new generation replaces `generation`; per-call timeout + recycle logic of 2.4 applies by wrapping `execute` with `AbortSignal.timeout(CALL_TIMEOUT_MS)` merged into `o.abortSignal`.
      **Done when:** test: get tools, kill the child, call a tool from the OLD tool object -> succeeds on the new child; timeouts through `execute` increment the counter and recycle at 3.
      **Watch out:** do not share `served` tool objects with `batch.ts` outputs by mutation (copy).

## 4. Tool source

- [x] 4.1 Port `get_components` batching
      **Why:** latency (~5.4 s per model step).
      **Where:** `nimbus/batch.ts` from legacy `client/nimbus.batch.ts` (205 lines) - copy, fix imports/logger.
      **How:** keep `MAX_LOOKUPS = 24`, `CONCURRENCY = 6`, `GET_COMPONENTS_TOOL`, `withBatchedComponentLookup`.
      **Done when:** port legacy `tests/wire/nimbus-batch.spec.ts` to `tests/nimbus/batch.spec.ts`; `npx jest tests/nimbus/batch.spec.ts` green (replace, unmutated cached set, over-cap error, one bad name keeps the others, absent `get_component` degrades).
      **Watch out:** do not mutate the tool record cached by the generation.

- [x] 4.2 The `nimbus` ToolSource (H contract)
      **Why:** spec `nimbus-tool-source`. The registry (change H) already applies the 15 s per-source timeout, isolation and prompt gating - this source only answers "how do I get my tools".
      **Where:** `nimbus/tool-source.ts`; registration in H's `service/src/tool-sources/index.ts`.
      **How:**
      ```ts
      export const nimbusToolSource = (backend: NimbusBackend, cfg: { enabled: boolean }): ToolSource => ({
        name: NIMBUS_MCP, displayName: 'Nimbus design system', order: 61,      // M's commercetools-ui source is 60 - confirm in M
        isEnabled: async () => cfg.enabled,
        getTools: async () => { const t = await withDeadline(backend.tools(), FIRST_HANDSHAKE_DEADLINE_MS);
                                 if (!t) return {}; warnOnDrift(Object.keys(t)); return withBatchedComponentLookup(t) as ToolSet; },
        listForMenu: async () => null,        // no menu group
        getPrompt: () => '',                  // guidance lives in M's page prompt
      });
      ```
      `withDeadline` returns `null` on timeout but lets the promise finish (log `NIMBUS_HANDSHAKE_DEADLINE`).
      **Done when:** `tool-source.spec.ts`: 7-name tool set minus `get_component` plus `get_components`; slow backend (4 s) -> `{}` first, tools on second call; disabled -> `isEnabled` false and backend never called; `listForMenu` null; `getPrompt` empty.
      **Watch out:** an exception from `backend.tools()` must become `{}` plus a log (do not rely only on the registry: a failing child would otherwise produce a warning per turn without context).

- [x] 4.3 Register the source and exclude it from the custom-view orchestrator
      **Why:** spec "Custom-view turn".
      **Where:** H's `tool-sources/index.ts` (one line) and a test in `tests/nimbus/registry.spec.ts`.
      **How:** `registerToolSource(nimbusToolSource(manager, { enabled: cfg.nimbusMcpEnabled }))`; H's custom-view orchestrator already selects sources by name (`commercetools`, `commercetools-knowledge`) - do not edit it, only assert it.
      **Done when:** registry test: standard resolution contains `get_components`; custom-view selection (H's helper) does not and `manager.getUpstream` is never called.
      **Watch out:** if M's source order differs from 60, use `M.order + 1` so Nimbus tools follow page tools in the merge.

## 5. Readiness route and smoke script

- [x] 5.1 `GET /service/status/nimbus`
      **Why:** DK-7; used by change U's post-deploy check and Chrome.
      **Where:** `service/src/routes/status.ts` (C) - add the handler; mount unauthenticated next to `/status`.
      **How:** call `readiness()`; map `ok -> 200`, `disabled -> 200`, `degraded/error -> 503`.
      **Done when:** supertest: 200 body `{status:'ok', nimbusMcp:'<version>', tools:7}`; 503 for degraded; `curl -s localhost:8080/service/status/nimbus | jq .status` prints `"ok"`.
      **Watch out:** `/service/status` itself must not call the child (add an assertion test).

- [x] 5.2 Smoke script
      **Why:** replaces legacy `scripts/smoke.mjs`.
      **Where:** `service/scripts/smoke-nimbus.mjs`, `package.json` script `"smoke:nimbus": "node scripts/smoke-nimbus.mjs"`.
      **How:** `SERVICE_URL=https://... node scripts/smoke-nimbus.mjs` GETs `/service/status/nimbus`, asserts 7 tools; local mode (no URL) starts the manager in-process and asserts the same; exit non-zero on mismatch (port the EXPECTED list handling from `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/nimbus-mcp-gateway/scripts/smoke.mjs`).
      **Done when:** `npm run build && npm run smoke:nimbus` prints `OK - nimbus-mcp <version>` (expected output) and exits 0.
      **Watch out:** no secrets, no auth header.

## 6. Integration against the real package

- [x] 6.1 Real-child test
      **Why:** the fixture cannot catch protocol changes.
      **Where:** `service/tests/nimbus/integration.spec.ts`.
      **How:** manager with the resolved real entry: `listTools` = 7; `get_components({names:['Button','Card'],sections:['props']})` returns two results; `kill -9` the child then call again; measure `process.memoryUsage()` of the child via `ps -o rss= -p <pid>` and assert < 150 MB (`describe.skip` on Windows).
      **Done when:** `npx jest tests/nimbus/integration.spec.ts` green in under 10 s.
      **Watch out:** mark with `@integration` so CI-less local runs can skip; it needs no network.

## 7. Version pin

- [x] 7.1 Pin consistency test
      **Why:** DK-8.
      **Where:** `service/tests/nimbus/nimbus-pin.spec.ts`.
      **How:** read `service/package.json` `dependencies['@commercetools/nimbus-mcp']` (must be an exact semver, no `^`/`~`) and the `NIMBUS_VERSION` constant from the surface manifest (path decided by change M, default `service/src/agents/prompts/nimbus-surface.generated.ts`; import it); assert equal; if the manifest file does not exist yet, `test.todo` with a comment referencing change M.
      **Done when:** `npx jest tests/nimbus/nimbus-pin.spec.ts` green (or `todo` before M lands).
      **Watch out:** the message must print both versions.

## 8. Deployment verification

- [x] 8.1 Local "Connect-like" run
      **Why:** catch obvious production-only problems early.
      **Where:** repo root.
      **How:** `cd service && npm ci --omit=dev && npm run build && NODE_ENV=production node build/index.js` (adapt to C's start script); then `curl -s localhost:8080/service/status/nimbus`; watch `ps aux | grep nimbus-mcp`.
      **Done when:** status ok with only production dependencies installed; one child process visible; after Ctrl-C no child remains (`pgrep -f nimbus-mcp` empty).
      **Watch out:** if `@commercetools/nimbus-mcp` ended up in devDependencies this fails - fix `package.json`.

- [ ] 8.2 Sandbox smoke and footprint measurement (blocks the Q3 decision)
      **Why:** design finding 13 is unverified: can a Connect service spawn a child, and how much memory is left?
      **Where:** Connect sandbox deployment by change U's script (needs M3, M4); evidence in `plans/evidence/K/`.
      **How:** after the first sandbox deploy run `SERVICE_URL=<deployed service url> npm run smoke:nimbus`; then fire a chat turn via Chrome (E2E-K-02) and read the deployment logs (`commercetools connect deployment logs`) for `nimbus-mcp stderr` lines and for any OOM/restart; record: cold-start ms of `/status/nimbus` after scale-to-zero, child RSS if logged, restarts. Write 10 lines into `plans/evidence/K/footprint.md`.
      **Done when:** smoke OK on the deployed service **or** a written failure analysis recommending appendix A; the owner is told the result.
      **Watch out:** sandbox scales to zero (~15 s boot) - retry once after 20 s before concluding failure.

## 9. Fallback - ONLY IF Q3 = separate service or 8.2 fails

- [ ] 9.1 `HttpGatewayBackend`
      **Why:** Appendix A.
      **Where:** `service/src/nimbus/http-backend.ts`.
      **How:** implements `NimbusBackend` with `createMCPClient({ transport: { type: 'http', url: cfg.nimbusMcpUrl, headers: { 'x-nimbus-gateway-key': cfg.nimbusGatewayKey }, redirect: 'follow' } })`; select it in the factory when `NIMBUS_MCP_URL` is set.
      **Done when:** unit test with a stub HTTP server: tools listed, header sent, wrong key -> `{}`.
      **Watch out:** the key is `securedConfiguration`; never log it.

- [ ] 9.2 `nimbus-gateway/` application
      **Why:** the second Connect app.
      **Where:** new folder `nimbus-gateway/` (own `package.json` `@commercetools-labs/ai-assistant-nimbus-gateway`), port `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/nimbus-mcp-gateway/src/{index,upstream,proxy,auth,log}.ts`, reuse `NimbusProcessManager` by copying `process-manager.ts` (no workspace sharing allowed); `connect.yaml` entry per Appendix A; update changes B (connect.yaml), U (three-phase deploy), manual steps.
      **Done when:** `commercetools connect validate` passes; `npm run smoke:nimbus` against the deployed gateway prints OK.
      **Watch out:** fail closed when the key is empty in production; the gateway stays unauthenticated for `/healthz` only.

## Last. Verification

- [x] V.1 Tests: `cd service && npm run build && npx jest tests/nimbus` green. Files: `resolve.spec.ts`, `process-manager.spec.ts`, `readiness.spec.ts`, `transport.spec.ts`, `client.spec.ts`, `batch.spec.ts`, `tool-source.spec.ts`, `status-route.spec.ts`, `integration.spec.ts`, `nimbus-pin.spec.ts`.
- [x] V.2 Gates: `node scripts/spdx-check.mjs`; `grep -rn "console\.\|NIMBUS_MCP_KEY\|x-nimbus-gateway-key" service/src` empty (except appendix code if section 9 ran); `commercetools connect validate` unchanged; `pgrep -f nimbus-mcp` empty after tests.
- [ ] V.3 Chrome scenarios (evidence in `plans/evidence/K/`):
      - **E2E-K-01** `GET /service/status/nimbus` (via browser tab on the deployed or local service) shows `status: "ok"` and 7 tools; repeat after 20 s idle.
      - **E2E-K-02** in the chat ask "build me a small page with a data table of orders" (commercetoolsUI agent): a `get_components` (or `list_components`) tool part appears before `create_composed_page`; the stream completes with no error frame; console has no errors.
      - **E2E-K-03** ask a non-UI question ("how many orders yesterday"): no Nimbus tool part appears (the tools exist in the set but the model has no reason to call them); open a custom-view session (the right-hand panel in `mc-view-app`, when change S exists) and check via the debug tool-schema log that Nimbus tools are absent.
      - **E2E-K-04** (local, with kill switch) `NIMBUS_MCP_ENABLED=false`: E2E-K-02 still completes using only `create_composed_page`.
- [ ] V.4 Definition of Done (`plans/04-workflow.md` section 4); `/opsx:verify k-nimbus-mcp-embedded` clean.

## Docs to update (for change W)

- `docs/how-it-works.md`: why the Nimbus MCP is a child process (stdio-only, no `require` export), lifecycle rules, idle shutdown, readiness route.
- README: memory footprint note (~75 MB child), the kill switch, how to bump Nimbus (bump `@commercetools/nimbus-mcp`, `@commercetools/nimbus*` in all three frontends, regenerate the surface manifest, run `nimbus-pin.spec.ts`).
- Config reference: `NIMBUS_MCP_ENABLED` (standard, optional, default true); removed: `NIMBUS_MCP_URL`, `NIMBUS_MCP_KEY`, `NIMBUS_MCP_TIMEOUT_MS`.
- `docs/api.md`: `GET /service/status/nimbus` (unauthenticated, 200/503).
- Change U runbook: post-deploy smoke `npm run smoke:nimbus`; if section 9 ran, the three-phase deploy and the extra secret.
