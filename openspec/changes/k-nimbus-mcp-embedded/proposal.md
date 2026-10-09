## Why

The commercetoolsUI agent builds Merchant Center pages with the **Nimbus** design system and relies on the **Nimbus MCP** (`@commercetools/nimbus-mcp`: component docs, props, tokens, icons, UI-Kit migration) to look up real component APIs instead of hallucinating them. The package speaks **stdio only** and cannot be imported in-process, so the multitenant router runs a separate Cloud Run "gateway" service (HTTP in, one stdio child out, shared-secret header, Dockerfile, health/readiness). A Connect connector cannot discover a sibling service's URL and every extra `service` application means another deploy step, another secret and a manual URL hop. Decision **D3** (default for owner question **Q3**) is to **embed** the child process in the main service.

## What Changes

- **Change ID: K** (`k-nimbus-mcp-embedded`). **Needs:** H (`ToolSource` registry, custom-view source selection). Unblocks: V (E2E-K-*), and gives M's page generation its documentation tools.
- New module `service/src/nimbus/`: an **in-process stdio child manager** for `@commercetools/nimbus-mcp` (pinned **exactly**): one long-lived child serving all requests, spawn lazily, **respawn on close**, **recycle after 3 consecutive call timeouts**, child **stderr piped into structured logs** (never inherited), **readiness check for the 7 expected tools**, idle shutdown, clean shutdown with the service, no orphan on parent death.
- Replace the HTTP hop by an AI SDK `MCPClient` over a small **transport adapter** around the MCP SDK `StdioClientTransport` (chosen over `@ai-sdk/mcp`'s own experimental stdio transport because only the former exposes child stderr; both were run against the real package).
- Port the Nimbus **tool source** (`nimbus`): tools served as-is except `get_component` is replaced by the batched `get_components` (port of `nimbus.batch.ts`); not session-switchable, no menu group; registered as an H `ToolSource` next to change M's page-generation source and **excluded from the custom-view orchestrator**.
- Add a cheap **readiness endpoint** `GET /service/status/nimbus` for the post-deploy smoke check (change U) and Chrome scenarios.
- Specify the **fallback design** if the owner answers Q3 "separate service": same `NimbusBackend` interface, an HTTP gateway backend, a second `service` application with a shared secret, two-phase deploy.
- **Evaluation recorded** (measured 2026-10-08): child cold start ~0.15 s, resident ~71-78 MB, service libraries ~137-160 MB -> ~235 MB idle of the 512 MB Connect limit; memory/cold-start risk assessed and mitigated (idle shutdown, `--max-old-space-size` cap, optional kill switch `NIMBUS_MCP_ENABLED`).
- Dropped: HTTP server, `NIMBUS_MCP_URL`, `NIMBUS_MCP_KEY`, `x-nimbus-gateway-key`, Dockerfile, Cloud Run deploy docs, `smoke.mjs` as a standalone script (replaced by `npm run smoke:nimbus` against the embedded manager).

## Capabilities

### New Capabilities
- `nimbus-process-manager`: lifecycle, resilience, logging and readiness of the embedded `nimbus-mcp` stdio child.
- `nimbus-tool-source`: the `nimbus` ToolSource (tool set, batching, agent scoping, degradation) and the readiness endpoint.

### Modified Capabilities
<!-- none -->

## Impact

- New code `service/src/nimbus/{resolve,process-manager,transport,backend,tool-source,batch,readiness,constants}.ts`, tests `service/tests/nimbus/`, script `service/scripts/smoke-nimbus.mjs`.
- New dependencies in `service/package.json` (exact): `@commercetools/nimbus-mcp` (legacy pin `3.5.1`; npm latest on 2026-10-08 is `3.6.0` - choose the version the three frontends and `nimbus-surface.generated.ts` use), `@modelcontextprotocol/sdk`.
- **No** `connect.yaml` change in the default design (no new env, no new scope). Optional standard config `NIMBUS_MCP_ENABLED` (default `true`) is proposed to changes B/C.
- Runtime constraint: Connect `service` apps are limited to **1 CPU / 512 MB** and 5-minute requests (https://docs.commercetools.com/connect/best-practices.md, https://docs.commercetools.com/connect/deployment-behavior-and-environments.md).

## Out of scope

- The agent registry/definitions and prompts (H), the Nimbus scope prompt and generated surface manifest (M), the frontend renderer (R/P).
- A Nimbus upgrade workflow beyond "bump all pins together and run the check".
- Any other stdio MCP servers.

## Legacy source

Read-only, under `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/`:
`nimbus-mcp-gateway/{src/{index,upstream,proxy,auth,env,log}.ts,scripts/smoke.mjs,Dockerfile,README.md,package.json}`, `service/src/client/{nimbus.mcp,nimbus.batch}.ts`, `service/src/cache/mcp-tools.cache.ts` (`getMcpTools`), `service/src/constants.ts` (`NIMBUS_MCP`, `NIMBUS_MCP_TOOLS`), `service/src/functional-agent/agents/definitions/commercetools-ui.agent.ts`, `service/src/functional-agent/agents/prompts/{nimbus-scope,commercetools-ui.prompt}.ts`, `service/tests/wire/nimbus-batch.spec.ts`.
