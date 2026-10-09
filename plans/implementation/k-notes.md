# Change K (k-nimbus-mcp-embedded): implementation notes

## Summary

Branch `worktree-agent-a7d34b118071368aa` (reset to `develop` first: A-H, N, O, P, S, U). All of `tasks.md` is done and ticked except 8.2 (sandbox, needs the owner), 9.1/9.2 (fallback, only if Q3 = separate service), V.3 (Chrome E2E), V.4 (DoD sign-off / `/opsx:verify`).

Built in `service/`:
- `src/nimbus/`: `constants`, `resolve` (walks `node_modules`, returns `{error}` instead of throwing), `transport` (`NimbusTransport`: MCP SDK `StdioClientTransport` with `stderr:'pipe'` behind the AI SDK `MCPTransport` interface), `client` (`connectNimbus`: spawn + handshake + `createMCPClient` + `tools()`, stderr to the logger line by line), `process-manager` (`NimbusProcessManager`: shared lazy start, identity-guarded respawn on close, recycle after 3 consecutive timeouts, idle shutdown, `close()`), `readiness` (cached verdict, 30 s / 5 s on failure), `backend` (`NimbusBackend` + `DisabledNimbusBackend` + `UnavailableNimbusBackend`), `batch` (port of `get_components`), `tool-source` (`createNimbusToolSource`), `index` (`getNimbusBackend`, `nimbusSource`, test hook).
- `src/lifecycle.ts` (`onShutdown` / `runShutdownHooks`; did not exist), `src/index.ts` now runs the hooks on SIGTERM and SIGINT before closing the server.
- `GET /service/status/nimbus` (`controllers/nimbus-status.controller.ts`, mounted in `routes/status.route.ts`): 200 for `ok`/`disabled`, 503 for `degraded`/`error`. `/service/status` never touches the child (tested).
- Config: new section `nimbus` (`NIMBUS_MCP_ENABLED`, default true) + `connect.yaml`, `scripts/check-connect-layout.mjs`, its test fixture and `service/.env.example` edited consistently (one additive line each, placed right after `CHAT_FINALIZE_RESERVE_MS`).
- Shared wiring: two lines in `tool-sources/index.ts` (import + `registerToolSource(nimbusSource)`), placed after the built-in registration, not in the shared comment block.
- `scripts/smoke-nimbus.mjs` + `npm run smoke:nimbus` (remote via `SERVICE_URL`, local via the built manager).
- Tests `tests/nimbus/` (11 files, 53 tests) with a controllable fake child `fixtures/fake-nimbus.mjs`, plus the real-child `integration.spec.ts`.

Pin: `@commercetools/nimbus-mcp` **3.6.0** (exact) and `@modelcontextprotocol/sdk` **1.32.1** (exact), both in `dependencies`. 3.6.0 is what `mc-app` actually resolves: `mc-app/package.json` has `@commercetools/nimbus ^3.5.1` (a caret range, not an exact pin; `mc-app` has no `nimbus-mcp` dependency) and O's generated `nimbus-surface.generated.ts` says `NIMBUS_VERSION = '3.6.0'`. `npm view` confirms 3.6.0 is npm latest. `nimbus-pin.spec.ts` compares the pin with that manifest (M's path first, O's `mc-app` copy as fallback) and passes.

Commands run (all in this worktree, all green unless stated):
- `cd scripts && npm ci` ok. `cd service && npm ci && npm run build && npm test && npm run lint` -> build ok; 119 suites / 1019 tests pass (develop baseline 108 / 965 per H's notes; 53 are new); lint 0 errors (21 warnings, all in old legacy-port tests with `any`). `npm run check:foundation` ok. `npm run build && npm run smoke:nimbus` -> `OK - nimbus-mcp 3.6.0 (7 tools)`.
- Root: `node scripts/check-connect-layout.mjs` -> ok (4 applications); `node --test scripts/tests/*.test.mjs` -> 112 pass; `node scripts/spdx-check.mjs` -> ok; `node scripts/check-repo-rules.mjs` -> ok; `grep -rn "console\.\|NIMBUS_MCP_KEY\|x-nimbus-gateway-key" service/src` -> empty; `openspec validate k-nimbus-mcp-embedded --strict` -> valid.
- Task 8.1, "Connect-like" run: copied `package.json`, lockfile and `build/` to a scratch dir, `npm ci --omit=dev`, started `node build/index.js` (`NODE_ENV=development` with the memory driver, as `smoke-start.mjs` does): `GET /service/status/nimbus` -> 200 `{"status":"ok","nimbusMcp":"3.6.0","tools":7,...}` in 0.20 s on the very first (cold) request; exactly one child visible; SIGTERM of the service -> no child left; SIGKILL of the service -> no orphan (stdin EOF).

### Measured footprint (macOS arm64, Node 22.21.1, real package 3.6.0; NOT the Connect image)

| What | Value |
|---|---|
| Child spawn + MCP initialize | 137 ms (probe script), 0.20 s end to end for the first `/status/nimbus` request incl. `tools/list` |
| Child RSS after `tools/list` | 70.5 MB |
| After one `get_component(Button, props)` | 71.5 MB, call took 6 ms |
| After a `search_docs` | 74.9 MB |
| Service RSS (production deps only, memory driver, no Express traffic besides the status call) | ~105 MB, with the child running: ~180 MB together |
| Child heap cap | `--max-old-space-size=96`, the integration test asserts RSS < 150 MB |

The design's earlier estimate (parent ~137-160 MB) is for the legacy service with all libraries loaded; the real service here is lighter because tool sources of I/J/L are not in yet. Linux container numbers must still be re-measured in the sandbox (task 8.2).

## Questions (for the owner)

1. Q3/IQ1 stays open until the sandbox smoke (8.2): can a Connect `service` spawn `process.execPath` as a child and stay under 512 MB? Needs `SERVICE_URL=<deployed> npm run smoke:nimbus` after the first sandbox deploy. If it fails, set `NIMBUS_MCP_ENABLED=false` (the page prompt carries built-in Nimbus guidance) and do section 9.
2. Is a caret `@commercetools/nimbus ^3.5.1` in the three frontends acceptable? The design says "pin all together and run the check": the lockfile resolves 3.6.0 today, but a future `yarn upgrade` could move the frontends past the exact `nimbus-mcp` pin and only `nimbus-pin.spec.ts` (which reads M's/O's generated manifest, not the frontend's package.json) would notice after regeneration. Pin the frontends exactly (change O)?
3. Order 61 for the source is a guess ("M's source is 60" is not verifiable: M has not landed). Confirm when M exists.

## Missed features / gaps found in the spec

- **No `NIMBUS_VERSION` manifest in `service/` yet.** Task 7.1 expects M's `service/src/agents/prompts/nimbus-surface.generated.ts`; it does not exist on `develop`. The test falls back to O's `mc-app/src/utils/nimbus-surface.generated.ts` and uses `test.todo` only if neither exists. M should keep the same `NIMBUS_VERSION = '...'` line format (the test reads the file as text; it cannot import `mc-app` TypeScript from the service's Jest).
- **Task 1.1 asks to "read the exact pin from `mc-app/package.json`"**: there is no exact pin there (caret on `@commercetools/nimbus`, no `nimbus-mcp`). I took the version the lockfile and the generated manifest agree on.
- **Spec/design say `listTools()`/`callTool()` on the backend (DK-1), tasks say `tools()`/`readiness()`/`close()`.** I followed the tasks (the AI SDK tool objects carry the call path, so a `callTool` on the interface would be unused).
- **Task 2.3/2.4 describe the manager with the MCP SDK `Client` and a separate `callTool`; task 3.3 then adds an AI SDK `MCPClient`.** Two clients over one child is redundant. I used only the AI SDK `MCPClient` (over the adapter), and implemented timeout and recycle in the delegating `execute`. The counter counts only timeouts raised by our own `AbortSignal.timeout`, not message text (`/timed out|timeout/i` would also match unrelated errors), and not a caller abort (tested).
- **`ToolExecutionOptions` needs `context`** in `ai@7.0.136`: any test or code that calls `tool.execute` directly must pass `{ toolCallId, messages, context }`.
- **`isEnabled` and the kill switch**: the spec says `isEnabled` is true "unless the kill switch is off"; reading the process-global `readConfiguration()` inside the source defeated H's tests that build a context with their own config. The source reads `ctx.config.nimbus.enabled`.
- **Existing H/G tests assume the process-wide registry holds only built-ins.** With K registered they resolve the real `nimbus` source, which would spawn a real child. I edited three existing tests minimally: `tests/wire/builtin-sources.spec.ts` and `tests/chat/orchestrator.spec.ts` build their context with `NIMBUS_MCP_ENABLED=false`; `tests/contract/routes.spec.ts` allows the new route `GET /service/status/nimbus` (G's published table has no row for it; G's spec should get one) and `tests/unit/config.core.spec.ts` lists the new `nimbus` section. I, J, L will hit the same two "built-ins only" tests; they should add their sources the same way.
- **Spec "registered next to M's source"**: H's `tool-sources/index.ts` registers statically at import (before `readConfiguration()` is guaranteed), so the source resolves the backend lazily (`getNimbusBackend()` on first `getTools`/status call) and nothing is created or spawned at import time.
- `plans/evidence/K/` is not written (no deployed service, no Chrome).
- The AI SDK's `createMCPClient` for a custom transport does not set `supportsProtocolVersionDiscovery`, so it uses the legacy initialize flow (works with the 2025 spec of nimbus-mcp). Nothing to do; noted because a future SDK default could change it.

## TODOs (skipped or unverifiable here)

- **8.2 Sandbox smoke and footprint on Connect** (needs the deployed service, change U, owner): `SERVICE_URL=... npm run smoke:nimbus`, read deployment logs for `nimbus-mcp stderr` lines and OOM/restarts, write `plans/evidence/K/footprint.md`. Unknowns that only the sandbox can answer: child processes allowed, `process.execPath` is `node` in the buildpack image (OQ-K5), RSS of service + child under load, scale-to-zero cold start.
- **9.1 / 9.2** fallback gateway: not built (default design chosen; no owner answer).
- **V.3 E2E-K-01..04** (Chrome): not run. Covered locally instead by unit tests (tool set, custom-view exclusion, kill switch) and the production-style run above. E2E-K-02/03 need the chat UI and a model (M, P, credentials).
- V.4: `/opsx:verify` not run; DoD items needing Docker (`commercetools connect validate`) not run (no Docker). `commercetools connect application build/test` not run by me.
- Load behaviour under concurrent chat streams (CPU contention of the child with the service on 1 CPU) is unmeasured.
- Docs for W are listed in `tasks.md` "Docs to update"; none written.
- Shared lines others will also edit (merge conflicts expected, all trivial): `connect.yaml`, `scripts/check-connect-layout.mjs`, `scripts/tests/check-connect-layout.test.mjs`, `service/.env.example` (each: one key after `CHAT_FINALIZE_RESERVE_MS`), `config/sections/index.ts` (import + one line after `chat`), `tool-sources/index.ts` (import + register call), `service/package.json`/lockfile, `tests/unit/config.core.spec.ts`, `tests/contract/routes.spec.ts`.

## Deviations from the spec (with reason)

- Branch: stayed on the harness worktree branch, not `spec/k`.
- Version 3.6.0 instead of the legacy 3.5.1 (see Summary).
- One MCP client (AI SDK `MCPClient`) instead of an MCP SDK `Client` plus an `MCPClient` (see gaps). `client.ts` holds the spawn/handshake function instead of a class; `index.ts` and `lifecycle.ts` added to the file list.
- Idle shutdown is tested with a real 300 ms timer (`idleShutdownMs` option) instead of `jest.useFakeTimers`, because fake timers would also freeze the child-process streams of a real spawned fixture. The timer is `unref()`ed.
- "Secrets not inherited" is tested by asking the fixture child for its environment variable names (a real child, not a spy on the transport constructor), which proves the end result in ESM Jest where constructor spying is awkward.
- Readiness: unavailable package reports `{status:'error', reason}` (the spec's `unavailable` wording has no matching status value); disabled reports `{status:'disabled'}` with HTTP 200.
- SIGINT also runs the shutdown hooks (spec says SIGTERM/SIGINT; before, only SIGTERM was handled).
- `ToolSource.isEnabled` takes the context (see gaps); the `description` field is set so the orchestrator preamble can list the source; `kind` left unset (not an "integration"/connected source).
- Child environment: only the MCP SDK defaults (`PATH`, `HOME`, `USER`, ...) plus `NODE_OPTIONS=--max-old-space-size=96`; tests add `FAKE_NIMBUS_PID_FILE` through an `extraEnv` option that production code never sets.
