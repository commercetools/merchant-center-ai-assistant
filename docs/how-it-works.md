# How it works

The mechanisms of the connector, each with the files that implement it. For the shape of the system see
[architecture.md](./architecture.md); for the request and response formats see [api.md](./api.md).

## A chat turn end to end

`POST /service/ai-chat/:sessionId/message/stream` (`service/src/routes/ai-chat.route.ts`) runs these steps in order:

1. `startBudget` starts the clock of the request (`service/src/chat/budget.middleware.ts`), so time spent before streaming counts.
2. `verifyMcSession` checks the gateway token and `loadSession` loads the session; a session of another user answers 404.
3. The request is validated before any header is sent (`service/src/chat/validate-request.ts`): the body must hold a `message` with `role` `user` (or `assistant`
   for an automatic continuation after a tool result), a non-empty string `id` and a `parts` array. A message with the role `system` is rejected.
4. The incoming message is saved without waiting for the write, so the first token is not delayed (`service/src/chat/chat.controller.ts`).
5. The last 20 stored messages form the model input (`service/src/chat/history.ts`); stored image references are converted for the model.
6. The tool context is built (`service/src/chat/context.ts`) and the tool-source registry resolves the tools of every enabled source (below).
7. A single `ToolLoopAgent` runs with the main Gemini model, temperature 0.3 and at most 50 steps (`service/src/chat/orchestrator.ts`). Its instructions
   are the generated preamble, the project system prompt (added once, wrapped in `<developer_instructions>`, left out when blank) and the prompt fragment of each contributing source.
   A session created by the Custom View uses a smaller orchestrator with only the commercetools and Knowledge sources (`service/src/chat/custom-view-orchestrator.ts`).
8. The result streams as a UI message stream over server-sent events (`service/src/chat/stream.ts`). When the stream finishes, the new messages are stored (ids that already exist are skipped),
   and `runTurnDigest` starts in the background (`service/src/agents/turn-digest.ts`); it is not awaited, so it delays neither the answer nor the composer.

Tool results that must be shown again after a reload (charts, exports, composed pages) keep their output in the stored message; others are stripped (`service/src/chat/storage-filter.ts`).

## Sessions, digest and suggestions

A session is created by the app with `POST /service/session` and owned by the verified user ID (`service/src/services/session.service.ts`). After each turn a second, cheap model call
(the "lite" tier) writes a title, a description, an icon, a summary and up to a few follow-up prompts into the session (`service/src/agents/session-digest.agent.ts`). The app polls
`GET /service/session/:id/digest?since=<timestamp>` and shows the changes (`service/src/services/session-digest.view.ts`).

`GET /service/suggestions` returns four prompt cards. They are personalised from the summaries of the user's recent sessions and cached per user (`service/src/services/suggestions.service.ts`);
without history, with a failing model or a failing store the answer is a static set, never an error (`DEFAULT_SUGGESTIONS`).

## Tool sources and agents

Everything the model can do is provided by a tool source (`service/src/tool-sources/types.ts`). The registry (`service/src/tool-sources/registry.ts`) asks every source in parallel,
gives each 15 seconds, skips a source that throws or hangs, merges the results in source order, removes the tools the session switched off, normalises the schemas once for Gemini and wraps
every tool so it stops at the soft deadline of the time budget. The orchestrator is flat: it calls the merged tools directly and does not delegate to sub-agents (image generation is the one sub-agent,
`service/src/agents/subagent-tool.ts`).

| Source | Tools | Enabled when |
| --- | --- | --- |
| `commercetools` | the tools of the user's Managed MCP server | a server is bound (`service/src/identity-mcp/tool-source.ts`) |
| `commercetools-knowledge` | documentation and API schema tools of the Knowledge MCP | always (`service/src/tool-sources/knowledge/source.ts`) |
| `contentstack` | content type, entry and global field tools | Contentstack API key and management token are set (`service/src/tool-sources/contentstack/source.ts`) |
| `algolia` | the tools of the Algolia MCP server | `ALGOLIA_MCP_URL` is set (`service/src/tool-sources/algolia/source.ts`) |
| `stripe` | Stripe toolkit tools, renamed to a stable menu name | `STRIPE_SECRET_KEY` is set (`service/src/tool-sources/stripe/source.ts`) |
| `commercetoolsUI` | `create_composed_page` | always (`service/src/composed-pages/tool-source.ts`) |
| `nimbus` | design-system documentation tools | `NIMBUS_MCP_ENABLED` is not `false` (`service/src/nimbus/tool-source.ts`) |
| `bigquery` | `query_aggregated_data`, `get_table_info` | a Google key is configured (`service/src/analytics/tools/bigquery.source.ts`) |
| `entity-link`, `visualize`, `export` | `create_entity_link`, `visualize_data`, `export_data` | always (`service/src/tool-sources/entity-link.source.ts`) |
| `imageGeneration` | image generation | the image uploader is installed (`service/src/tool-sources/image-generation.source.ts`) |

The tools menu in the app is built from the same registry (`GET /service/session/:id/tools`); a user can switch a tool, a group or a whole source off for a session and the choice is stored in the session.
Third-party sources are best-effort: a source with missing or invalid keys is disabled at start (`service/src/mcp-providers/schemas.ts`), and a source that fails during a turn contributes nothing to that turn.
Content returned by third-party tools is untrusted input to the model (see [security.md](./security.md)). Writing a new source is described in `service/src/tool-sources/README.md` and in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Identity-mode Managed MCP

The `commercetools` source gives each user the tools of a commercetools Managed MCP server in identity mode, so a call runs with that user's own permissions.

1. An administrator binds a server with `PUT /service/managed-mcp-identity`. The service probes the server's OAuth metadata and stores the binding in the settings object (`service/src/identity-mcp/discovery.ts`).
2. Each user connects once. `POST /service/managed-mcp-identity/authorize` registers an OAuth client dynamically if there is none, creates a PKCE attempt (the verifier is encrypted, the key is the hash of the state) and returns the authorization URL.
3. The app opens it in a popup. The authorization server redirects to `GET /service/managed-mcp-identity/callback`, which has no gateway token and authenticates through the single-use state it claims first
   (`service/src/identity-mcp/controller.ts`). The callback URL is `MC_AUDIENCE` plus `/service/managed-mcp-identity/callback`, which is why `MC_AUDIENCE` must be an HTTPS origin.
4. Tokens are stored encrypted per user. A refresh that loses a race with another instance is resolved by compare-and-delete on the stored revision (`service/src/identity-mcp/auth-provider.ts`).
5. If the user has no valid token the source offers a placeholder tool and a prompt fragment that tell the model to ask the user to connect (`NOT_CONNECTED_TOOL`); the app shows a "Connect my account" gate (`mc-app/src/components/managed-mcp/identity-connect-gate.tsx`).

Unbinding revokes and deletes every user's tokens first, then removes the binding.

## Composed pages

A composed page is a React component that the assistant generates, together with the GraphQL data sources it reads.

1. The model calls `create_composed_page` (`service/src/composed-pages/tool.ts`). The service validates the input with a schema, checks the component body with a parser (no imports, no top-level function of the component name, a top-level `return`),
   checks that data-source queries are read-only GraphQL, transpiles the JSX with Babel and returns the schema and a URI. It stores nothing.
2. The chat app renders a preview from the tool result (`mc-app/src/components/compose-preview/compose-preview.tsx`). When the user saves it in the dialog (name and icon), the app writes the page as a Custom Object in
   `shared-composed-pages` with the user's own token (`mc-app/src/hooks/use-composed-pages-storage/use-composed-pages-storage.ts`); the record carries the saving user's e-mail address as `createdBy`.
3. `mc-app` and `composed-apps` render pages in the browser (`mc-app/src/utils/babel-renderer.tsx`, `composed-apps/src/utils/babel-renderer.tsx`). The shared format and the container key are pinned by `contract/composed-page.fixture.json`,
   and the service and mc-app tests both read that fixture.
4. Data sources run as GraphQL requests through the Merchant Center proxy with the signed-in user's token, so a page can only read or change what that user may.

Generated code runs in the application's origin, which is why its content security policy allows `unsafe-eval` (see [security.md](./security.md)).

## Preview annotations

In the chat app a user can annotate a composed page preview (`mc-app/src/components/preview-annotations/preview-annotations.tsx`). The annotations are sent with the next message as a `data-ct-annotations` part
(`mc-app/src/components/preview-annotations/annotation-payload.ts`); the service converts the part into text for the model (`service/src/chat/annotation-part.ts`).

## The Custom View and entity context

The panel (`mc-view-app/`) is registered for 65 locators of Merchant Center pages. Every request carries `customView=<base64 of the host page URL>` (`mc-view-app/src/utils/feature-flags.ts`).
The service stores the value as the session's feature flag `customView`, lists only sessions with the same flag, and gives the custom-view orchestrator the decoded URL, so the model knows which product, order or customer is open.
The URL is capped at 2,000 characters and is never used for authorization. The panel has no administrator surface and never reads the user's e-mail address.

## Persistence and concurrency

Updates to an existing Custom Object send its version and retry on a conflict with a fresh read (`service/src/persistence/gateway/cas.ts`). Creating an object that does not yet exist is an upsert, so two instances that create the
very same object at the same instant can overwrite each other; this only affects the first write of the settings object. Message objects are keyed by the message id, so a retried append is idempotent.
Lists are read with the platform's query and limited to 500 results per page. Larger values are rejected before the request. See `service/src/persistence/limits.ts`.

## Large tool results and images

Large results of commercetools tools are not given to the model whole. An analyzer step (it sees the last 10 messages of the conversation) decides whether a result needs aggregation; if so the rows are written to a per-session BigQuery table (at most 20,000 rows, expiring after 7 days)
and the model receives the table reference and the column names instead (`service/src/analytics/pipeline/pipeline.ts`). The model then queries the table with `query_aggregated_data`, which accepts only `SELECT` over the session's own tables, checks a dry run first and
limits rows (500) and billed bytes (200 MB) (`service/src/analytics/guard/sql-guard.ts`). Deleting a session drops its tables and its images through cleanup hooks (`service/src/analytics/cleanup/bigquery-hook.ts`, `service/src/storage/cleanup-hook.ts`).

Generated images are stored in a private bucket as `images/<sessionId>/<name>`; the message holds the relative path `/files/<sessionId>/<name>`, and the app loads it through `GET /service/files/:sessionId/:fileName` with the user's token into a blob URL
(`service/src/storage/files-route.ts`, `mc-app/src/hooks/use-service-image.ts`). With `IMAGE_URL_MODE=public` the stored value is the public bucket URL instead.

## Time budget

The chat stream has a soft and a hard deadline derived from `CHAT_REQUEST_BUDGET_MS` (270 s) and `CHAT_FINALIZE_RESERVE_MS` (30 s) (`service/src/chat/request-budget.ts`). The timeline and its reason are in [architecture.md](./architecture.md#request-time-budget).
The app shows the stored notice and the user can ask the assistant to continue in a new message.

## Embedded Nimbus MCP

The Nimbus documentation tools come from the `@commercetools/nimbus-mcp` package, which only speaks stdio. The service starts it as a child process on first use, shares one child among requests, recycles it after three consecutive call timeouts,
stops it after 10 minutes without use and on SIGTERM (`service/src/nimbus/process-manager.ts`, `service/src/lifecycle.ts`). The child gets a minimal environment (no secrets) and a 96 MB heap cap.
`GET /service/status/nimbus` reports whether it answers (`service/src/controllers/nimbus-status.controller.ts`). The version is pinned and must match the version the frontends use (`service/tests/nimbus/nimbus-pin.spec.ts`).
