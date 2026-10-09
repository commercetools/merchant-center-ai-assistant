# Security

This document describes the security model of the connector as implemented. Report a suspected vulnerability as described in [SUPPORT.md](../SUPPORT.md); the project is unsupported and gives no response commitment.

## Secrets

- Secrets are Connect `securedConfiguration` only: `GCP_SA_KEY_BASE64`, `ENCRYPTION_KEY`, `ENCRYPTION_KEY_PREVIOUS` and the third-party credentials `CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `ALGOLIA_MCP_URL` (it may embed a key) and `STRIPE_SECRET_KEY`.
  They never reach the browser, are never stored in Custom Objects and are never returned by an API. `GET /service/mcp/providers` returns provider names, two booleans and the names of missing keys, nothing else.
- The service reads configuration once and wraps secret values in a type that prints as redacted (`service/src/config/secret.ts`). The Base64 key and the decoded private key never appear in a log or a response; invalid keys are reported with a fixed reason.
- Repository rules keep secrets out of the tree: `.env` files other than `.env.example` are ignored, `.env.example` values for secret-looking keys must be empty, and `node scripts/check-repo-rules.mjs` enforces both.
- The deployment helper passes secured values to the Connect CLI as command-line arguments, so they are visible in the local process list while the command runs. Run it on a personal workstation. It masks secured values in everything it prints (`scripts/connect/connect.mjs`).
- Use least-privilege third-party credentials: a Stripe restricted key, a Contentstack management token scoped to what the assistant may change. There is no separate confirmation step for mutating Stripe calls, so a key that can write lets the assistant write.

## Authentication and trust

- Every route except the status routes and the OAuth callback requires the signed token that the Merchant Center gateway adds. The token is verified against the configured audience (`MC_AUDIENCE` plus the request path) and the issuer of the configured cloud; the project key must equal the deployment's project, otherwise 403.
  Until `MC_AUDIENCE` is set every authenticated route answers 401 (`service/src/middleware/mc-session.middleware.ts`).
- The service trusts only the user ID and project key of the verified token. It never trusts an e-mail address, label, user ID or admin flag that the browser sends (header, body or query), and none is used for authorization, keys or filters. See [permissions.md](./permissions.md#what-is-not-trusted).
- The service has no CORS handling: traffic is server-to-server from the gateway.
- The OAuth callback of the Managed MCP identity flow carries no gateway token. It authenticates through a single-use `state` that is claimed first (a replay loses before any code exchange), and it answers a page with a strict content security policy.
  Known limit: the callback does not bind the login to the browser that started it.

## Administrator gating

Administrator status comes from the `ADMIN_USER_IDS` allowlist, decided by the service on every request from the verified user ID. Hiding screens in the apps is cosmetic. An empty list means nobody is an administrator.
Administrator calls are audited with the user ID, route and outcome. The backoffice exposes the transcripts and feedback of every user of the project to administrators; list only people you trust. See [permissions.md](./permissions.md).

## Stored data and identity tokens

- Per-user Managed MCP tokens, the PKCE verifier and the registered OAuth client secret are stored as AES-256-GCM envelopes with the user or state as associated data (`service/src/crypto/envelope.ts`). The key is `ENCRYPTION_KEY`; rotation is described in [configuration.md](./configuration.md#encryption-key).
- Sessions, messages, feedback and settings are stored in clear text as Custom Objects. Any project member or API client with `view_key_value_documents` can read them, so treat that scope as access to the conversations.
- Messages and feedback are kept until an operator deletes them ([operations.md](./operations.md#data-retention)).
- The service API client has only `view_key_value_documents` and `manage_key_value_documents`.

## Generated images

- With the default `IMAGE_URL_MODE=private` the bucket and its objects are never public, there are no signed URLs and no per-object access list. A created bucket enforces public access prevention and uniform bucket-level access.
- Images are readable only through `GET /service/files/:sessionId/:fileName` of the session owner or an administrator. Every other case, including an unauthenticated request, answers 404 from the service; a direct bucket URL answers 403 from Google Cloud.
  The response sets `Content-Type` from the validated extension, `nosniff`, a `default-src 'none'; sandbox` policy and `Cache-Control: private, no-store`.
- `public` mode makes every generated image world-readable through its bucket URL and is not recommended. The service never changes an existing bucket; only a bucket it creates itself gets the public binding.
- `roles/storage.admin`, which lets the service create the bucket, is broader than the runtime needs. Where policy requires least privilege, create the bucket yourself and grant `roles/storage.objectAdmin` on it only.
- Only `png`, `jpg`, `webp` and `gif` of at most 10 MB are stored, and the model can only read images that belong to the current session.

## Generated code

The model creates React components that the Merchant Center applications run in the browser (`new Function`). This executes in the application's origin with the user's session, which is why the content security policy of `mc-app` and `composed-apps` allows `unsafe-eval`
and why the Custom View, which runs no generated code, does not. Mitigations: the service validates and rejects imports and exports, requires a plain component body and read-only GraphQL data sources (`service/src/composed-pages/validate.ts`),
a page can only reach what the signed-in user's own token allows, and pages are rendered inside an error boundary. Only people who may use the assistant can put code into a page. Treat the right to save a page as the right to run code in that user's session.

## Third-party content and prompt injection

Text returned by tools (documentation, entries, products, orders, search results) can contain instructions aimed at the model. The service cannot tell them apart from data. Reduce the risk by using read-only credentials,
switching tools off in the tools menu, and keeping the system prompt short. The Algolia URL must be a public HTTPS address and may not point to a private network (`service/src/mcp-providers/ssrf.ts`); this is a syntactic check, not a host allow-list.

## SQL over offloaded results

The model can run SQL only against the tables of its own session: statements must be `SELECT`, a dry run must show that only those tables are touched, results are capped at 500 rows and 200 MB billed, and tables expire after seven days.
The dataset is shared by all sessions of the project, so isolation between users relies on this guard and on the session-bound table list (`service/src/analytics/guard/sql-guard.ts`). CSV exports neutralise cells that start with a formula character
(`service/src/tools/export.tool.ts`).

## Embedded process

The Nimbus MCP runs as a child process with a minimal environment (it does not inherit the service's secrets) and a 96 MB heap limit, and it is stopped on shutdown (`service/src/nimbus/transport.ts`). `NIMBUS_MCP_ENABLED=false` switches it off.

## Privacy and retention

What personal data the connector holds is described in [privacy.md](./privacy.md).
