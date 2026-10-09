# Features

An inventory of what the code does, derived from the source. Each bullet names the files that implement it. Last updated: release 0.1.0 (the version in `service/package.json`).
What is not implemented is listed in [docs/operations.md](./docs/operations.md) and in the notes of each document.

## Repository shape

- One Connect connector with four applications (`service`, `mc-app`, `composed-apps`, `mc-view-app`) in one `connect.yaml`, one folder each, no npm workspaces: `connect.yaml`, `scripts/check-connect-layout.mjs`.
- All frontends use the same `@commercetools-frontend/*` version, Node 22, Yarn 1; the service uses npm: `scripts/check-versions.mjs`, `service/package.json`.
- Files that must be identical in several frontends are guarded: `scripts/check-duplicates.mjs`.
- MIT license, SPDX header in every source file, "unsupported" notices, no CI configuration: `scripts/spdx-check.mjs`, `scripts/check-repo-rules.mjs`.
- Deployment helper with ten commands (stage, publish, preview, deploy, finalize, configure, update-code, status, logs, delete) and a dry-run mode: `scripts/connect/connect.mjs`.
- Documentation checks: generated configuration tables, links, REST routes against the docs, required statements: `scripts/docs/gen-config-table.mjs`, `scripts/docs/check-links.mjs`, `scripts/docs/check-api-doc.mjs`, `scripts/docs/check-docs-claims.mjs`.

## Authentication and permissions

- Merchant Center gateway token verification (Bearer only, audience `MC_AUDIENCE` plus path, issuer from the region), project guard, fail closed without `MC_AUDIENCE`: `service/src/middleware/mc-session.middleware.ts`, `service/src/auth/project-guard.ts`.
- Administrator allowlist `ADMIN_USER_IDS` (at most 50 verified user IDs, empty means nobody), decided per request; `isAdmin` and `userId` returned by `POST /service/auth/session`: `service/src/auth/admin.ts`, `service/src/controllers/mc-auth.controller.ts`.
- Administrator-only routes answer 403 `ADMIN_REQUIRED`, with audit lines: `service/src/middleware/require-admin.middleware.ts`, `service/src/middleware/require-admin-audited.middleware.ts`.
- Session ownership by user ID (another user's session is a 404): `service/src/middleware/load-session.middleware.ts`, `service/src/auth/ownership.ts`.
- No Merchant Center permission grants administrator rights; each app has only its default View and Manage pair: `mc-app/src/constants.ts`, `composed-apps/src/constants.ts`.
- Read-only "Your user ID" line (Settings, About; panel footer) and the "Administrator access required" notice: `mc-app/src/components/your-user-id/index.tsx`, `mc-app/src/components/admin-required-notice/index.tsx`, `mc-view-app/src/components/your-user-id/index.tsx`.
- Local development bypass `MC_AUTH_DISABLED`, refused in production: `service/src/config/sections/auth.ts`.

## Persistence

- All state as commercetools Custom Objects behind one gateway with optimistic concurrency, retries, size limits and an in-memory test double: `service/src/persistence/gateway/custom-object.gateway.ts`, `service/src/persistence/gateway/memory.gateway.ts`.
- Stores for settings, sessions, messages (one object each), identity tokens and login attempts, feedback chunks and suggestions: `service/src/persistence/stores/`.
- AES-256-GCM envelope encryption with key ids, a previous-key list and a re-encryption script: `service/src/crypto/envelope.ts`, `service/scripts/reencrypt.mjs`.
- Maintenance script that purges test containers: `service/scripts/purge-containers.mjs`.
- Messages and feedback are kept until an operator deletes them; no automatic deletion: `service/src/persistence/create-persistence.ts`.

## Chat service

- Streaming chat endpoint with request validation before the first byte, history window of 20 messages, one flat orchestrator and at most 50 steps: `service/src/chat/chat.controller.ts`, `service/src/chat/orchestrator.ts`.
- Time budget (270 s hard, 30 s reserve), soft abort of running tools, stored time-limit notice, 20 s keep-alive part: `service/src/chat/request-budget.ts`, `service/src/chat/budget-tools.ts`, `service/src/chat/stream.ts`.
- Session CRUD, last session, list (at most 500), messages with paging, feature-flag scoping for the Custom View: `service/src/routes/session.route.ts`, `service/src/services/session.service.ts`.
- Background session digest (title, description, icon, summary, follow-up prompts) and personalised suggestions with a static fallback: `service/src/agents/session-digest.agent.ts`, `service/src/agents/suggestions.agent.ts`, `service/src/services/suggestions.service.ts`.
- Per-session tools menu with a stored negative list: `service/src/controllers/tools.controller.ts`.
- Project system prompt and tool-call detail level, writable by administrators only: `service/src/controllers/settings.controller.ts`.
- Gemini on Vertex AI through four model tiers and one service-account key: `service/src/llm/models.ts`, `service/src/gcp/service-account.ts`.
- Annotation parts from the preview toolbar converted for the model: `service/src/chat/annotation-part.ts`.
- Standard error envelope with fixed texts for persistence errors: `service/src/middleware/error.middleware.ts`, `service/src/utils/api-response.ts`.
- Liveness route, Nimbus readiness route, JSON logs with a correlation id: `service/src/controllers/status.controller.ts`, `service/src/controllers/nimbus-status.controller.ts`, `service/src/utils/logger.utils.ts`.

## Agents and tool sources

- Pluggable tool sources with isolated failure, 15 s resolve timeout, ordered merge, collision logging and prompt gating: `service/src/tool-sources/registry.ts`, `service/src/tool-sources/README.md`.
- Built-in tools: entity links, chart visualisation, CSV export (the only format) with formula neutralisation and caps: `service/src/tools/entity-link.tool.ts`, `service/src/tools/visualize.tool.ts`, `service/src/tools/export.tool.ts`.
- commercetools Knowledge MCP (documentation and schema tools, API tips prompt): `service/src/tool-sources/knowledge/source.ts`.
- Contentstack (fifteen content type, entry and global field tools, seven regions): `service/src/tool-sources/contentstack/source.ts`.
- Algolia MCP (with a public-HTTPS URL check) and Stripe toolkit (menu names, cancel gating): `service/src/tool-sources/algolia/source.ts`, `service/src/tool-sources/stripe/source.ts`.
- Provider enablement rule and read-only status endpoint, no write API: `service/src/mcp-providers/schemas.ts`, `service/src/mcp-providers/routes.ts`.
- Embedded Nimbus design-system documentation tools as a managed child process with kill switch, recycling, idle shutdown and readiness: `service/src/nimbus/process-manager.ts`, `service/src/nimbus/tool-source.ts`.
- Result offloading to per-session BigQuery tables with an analyzer gate, a SELECT-only SQL guard, dry-run checks and caps: `service/src/analytics/pipeline/pipeline.ts`, `service/src/analytics/guard/sql-guard.ts`, `service/src/analytics/tools/query.ts`.
- Image generation into a private bucket with streamed, owner-checked reads and no signed URLs: `service/src/tool-sources/image-generation.source.ts`, `service/src/storage/gcs-objects.ts`, `service/src/storage/files-route.ts`.
- Composed pages: validated, transpiled generated React pages with read-only GraphQL data sources, schema version 5.0: `service/src/composed-pages/tool.ts`, `service/src/composed-pages/contract.ts`, `contract/composed-page.fixture.json`.
- Custom View orchestrator limited to the commercetools and Knowledge sources, with the host page URL as context: `service/src/chat/custom-view-orchestrator.ts`.

## Identity Managed MCP

- Admin-bound Managed MCP server in identity mode, with discovery probing: `service/src/identity-mcp/controller.ts`, `service/src/identity-mcp/discovery.ts`.
- Per-user OAuth with dynamic client registration and PKCE, single-use claimed state, encrypted tokens, compare-and-delete refresh handling and revocation on disconnect or unbind: `service/src/identity-mcp/auth-provider.ts`, `service/src/identity-mcp/revocation.ts`.
- Per-user tool cache and a "not connected" placeholder tool when no valid token exists: `service/src/identity-mcp/toolset.ts`, `service/src/identity-mcp/tool-source.ts`.
- Callback page with a strict content security policy: `service/src/identity-mcp/controller.ts`.

## Chat application (mc-app)

- Chat surface: conversation, composer with attachments and tools menu, empty state with suggestion cards and recent chats, typing indicator, follow-up chips, message actions: `mc-app/src/components/new-chat/index.tsx`, `mc-app/src/components/new-chat/composer/index.tsx`.
- Message parts: text, reasoning, tool steps, sources, files and private images, exports, charts, sub-agent output, annotations, generated UI: `mc-app/src/components/new-chat/parts/index.tsx`.
- Chats drawer with grouping and deletion, rail with a user menu: `mc-app/src/components/panels/chats-drawer/index.tsx`, `mc-app/src/components/shell/app-rail/index.tsx`.
- Feedback popup that sends a transcript snapshot: `mc-app/src/components/new-chat/feedback-popup.tsx`.
- Composed pages: preview, code preview, save dialog, list, view, in-browser Babel renderer: `mc-app/src/components/compose-preview/compose-preview.tsx`, `mc-app/src/utils/babel-renderer.tsx`.
- Preview annotations toolbar: `mc-app/src/components/preview-annotations/preview-annotations.tsx`.
- Administrator screens: Managed MCP setup and connect gate, Connections drawer, system prompt, tool-call detail level, provider status cards (read-only), backoffice with thread list, feedback list, session detail and a SQL query tab: `mc-app/src/components/managed-mcp/index.tsx`, `mc-app/src/components/backoffice/backoffice-tabs.tsx`, `mc-app/src/components/panels/settings-drawer/index.tsx`.
- Gravatar avatars (one request per user to gravatar.com): `mc-app/src/utils/gravatar.ts`.
- Generated-page content security policy with `unsafe-eval`: `mc-app/custom-application-config.mjs`.

## Pages application (composed-apps)

- Lists composed pages from the `shared-composed-pages` container (at most 500, oldest first) and renders one per route: `composed-apps/src/hooks/use-composed-pages-storage/use-composed-pages-storage.ts`, `composed-apps/src/components/composed-page-view/`.
- Pure Merchant Center GraphQL client with no service dependency, per-data-source error isolation and an error boundary: `composed-apps/src/contexts/data-sources-context.tsx`, `composed-apps/src/components/ui-error-boundary/`.
- Legacy page format notice: `composed-apps/src/components/page-renderer/index.tsx`.

## Custom View (mc-view-app)

- `CustomPanel` registered for 65 locators with a reduced chat, one session per host page, and the `customView` flag on every request: `mc-view-app/custom-view-config.mjs`, `mc-view-app/src/utils/feature-flags.ts`.
- Bootstrap errors with retry, a Managed MCP connect gate, no administrator surface, no e-mail handling: `mc-view-app/src/components/session-error.tsx`, `mc-view-app/src/components/identity-mcp-connect-gate.tsx`.

## Feedback and backoffice

- Feedback submission with a chunked transcript snapshot, SHA-256 integrity digest, truncation records and a 10 MB body parser registered only after authentication: `service/src/services/feedback.service.ts`, `service/src/utils/feedback-snapshot.ts`, `service/src/utils/feedback-body-parser.ts`.
- Administrator review of feedback and of every user's threads with filters, paging and audit lines: `service/src/services/backoffice.service.ts`, `service/src/routes/backoffice.route.ts`, `service/src/routes/feedback.route.ts`.
- Display-only, sanitised `userLabel`: `service/src/utils/user-label.ts`.

## Deployment

- Connect lifecycle scripts that verify the key, Vertex AI, Custom Objects, Google Cloud readiness, audience and providers, and keep data on undeploy: `service/src/connector/post-deploy.ts`, `service/src/connector/pre-undeploy.ts`.
- Two-phase deployment helper with masked output, region-derived cloud identifiers and a drift test against `connect.yaml`: `scripts/connect/lib/config.mjs`, `scripts/connect/lib/regions.mjs`.
- Step-by-step runbook: `docs/deployment-runbook.md`.

## Testing

- Service: Jest unit, wire and contract tests with an in-memory persistence double, a route-table contract test and a foundation gate that forbids browser-supplied identity: `service/tests/contract/routes.spec.ts`, `service/scripts/check-foundation.mjs`.
- Integration suites that skip without credentials: `service/jest.integration.config.cjs`.
- Frontends: type check, lint, Jest and build per folder: `mc-app/package.json`, `composed-apps/package.json`, `mc-view-app/package.json`.
- Repository and documentation rules with Node tests: `scripts/tests/`, `scripts/docs/`.
