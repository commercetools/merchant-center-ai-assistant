# Privacy

What personal data the connector processes, where it goes and how long it stays. You, as the operator of an installation, are responsible for how this fits your own obligations; this page only states what the code does.

## What is stored, and where

All of it is stored as commercetools Custom Objects in the project the connector is installed in, unless stated otherwise ([architecture.md](./architecture.md#data-model)).

| Data | Where | Notes |
| --- | --- | --- |
| Merchant Center user ID | Sessions, feedback, identity tokens, suggestions, audit log lines | The verified user ID from the gateway token. A stable identifier of a person |
| E-mail address as display label (`userLabel`) | Session and feedback records | Sent by `mc-app` when a session or feedback is created; sanitised, unverified, used only to show whose conversation an administrator reads; never used for authorization or logged |
| Conversation | `ai-assistant-messages-<sessionId>` | Everything the user typed and everything the assistant answered, including tool results (which can contain customer, order and product data the user's tools returned), in clear text |
| Feedback and transcript snapshot | `ai-assistant-feedback`, `ai-assistant-feedback-snap-<id>` | The comment, the transcript at that moment (up to 8 MiB), the project system prompt and the session settings |
| Composed pages | `shared-composed-pages` | The saved page definition and the e-mail address of the user who saved it (`createdBy`) |
| Managed MCP tokens | `ai-assistant-identity-tokens` | Per-user access and refresh tokens, encrypted with `ENCRYPTION_KEY`; the stored OAuth client secret is encrypted too |
| Host page URL of the Custom View | Session feature flag `customView` | The base64 of the Merchant Center page URL, which holds the project key and the ids of the open entities |
| Offloaded tool results | BigQuery dataset `GCP_BIGQUERY_DATASET_ID` | Rows of large tool results, per session, expire after seven days |
| Generated images | Cloud Storage bucket `GCP_BUCKET_NAME` | Private; deleted with the session |
| Logs | Connect logs | User IDs in audit lines and a few diagnostic lines; no e-mail address, token, secret or message text |

## What leaves the installation

- **Google Cloud**: every prompt, the conversation history window, tool results and attached images are sent to Gemini models on Vertex AI in `GCP_VERTEX_LOCATION`. Large tool results are written to BigQuery, and generated images to Cloud Storage, in your Google Cloud project.
  How Google handles data sent to Vertex AI is governed by your agreement with Google Cloud; check the data-processing and data-residency terms of your location before enabling the assistant for personal data.
- **commercetools Managed MCP server and Knowledge MCP**: tool calls and their arguments go to the commercetools MCP endpoints with the user's own access token (Managed MCP) or, for the public Knowledge MCP endpoint (documentation search), without credentials.
- **Contentstack, Algolia, Stripe** (only when you configure them): tool calls, arguments and the data in them go to those services with your credentials.
- **Gravatar** (`mc-app` only): the browser of each user requests an avatar from `gravatar.com` using a hash of the user's e-mail address, so Gravatar learns that this address uses the assistant. The Content Security Policy of `mc-app` allows this; the Custom View and the pages application make no such request.
  To stop it, remove `gravatar.com` from `img-src` in `mc-app/custom-application-config.mjs` and the avatar code in `mc-app/src/utils/gravatar.ts` and rebuild.

The browser never sends the user's e-mail address to the service for identification; it sends it only as the display label described above.

## Who can read it

Users read their own sessions. Administrators (`ADMIN_USER_IDS`) can read every session and feedback of the project through the backoffice, with an audit line per call. Anyone with the Custom Object scopes in the project can read the stored objects directly ([security.md](./security.md#stored-data-and-identity-tokens)).

## Retention

Chat messages and feedback are kept until an operator deletes them. There is no automatic deletion, expiry or cleanup job. Only the BigQuery tables (seven days) and pending login attempts (ten minutes) expire.
Undeploying the connector does not delete data. [operations.md](./operations.md#data-retention) lists what to delete to remove one user's data (their sessions and the matching message containers, their connection, their feedback and suggestions) or all data.

## Choices that reduce what is collected

- Remove the Gravatar request as described above.
- Do not enable the third-party providers you do not need; a provider without keys is off.
- Switch tools off per session in the tools menu; a tool that is off is never called and returns no data.
- Delete sessions regularly; deleting a session removes its messages, tables and images.
