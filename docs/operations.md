# Operations

How to observe, run and recover the connector. Deployment steps are in [deployment.md](./deployment.md); symptoms and fixes are in [troubleshooting.md](./troubleshooting.md).

## Health

- `GET /service/status` (alias `/service/health`) answers `{ "status": "UP", "service": "ai-assistant", "version": "...", "persistence": "custom-objects", "authConfigured": <bool>, "adminConfigured": <bool> }`.
  It is liveness only: it calls no dependency, needs no token and exposes no secret (`service/src/controllers/status.controller.ts`). `authConfigured: false` means `CONNECT_SERVICE_URL` is not available to the service and every authenticated request will be rejected.
- `GET /service/status/nimbus` checks the embedded Nimbus child: 200 for `ok` or `disabled`, 503 otherwise. Its result is cached for 30 seconds (5 seconds after a failure), so it is cheap to poll.
- A deployment can show `Deployed` while the lifecycle script reported a problem: read the `post-deploy:` lines (below).

## Logs and correlation ids

- The service logs JSON lines to standard output through the commercetools application logger (`service/src/utils/logger.utils.ts`). `LOG_LEVEL` is `error`, `warn`, `info` (default) or `debug`; `LOG_HTTP=true` adds one line per request without bodies or credentials (local runs only, see [configuration.md](./configuration.md#settings-that-are-not-in-connectyaml)).
- Send the header `X-Correlation-Id` to name a request (at most 128 characters); otherwise a UUID is generated. Every log line written while handling the request carries it as `correlationId`. The service does not echo it in the response.
- Never logged: tokens, secured configuration, the service-account key, message text, tool arguments or results, e-mail addresses. Persistence errors are logged with their class, not with container names or values.
- Lines worth knowing:

| Line | Meaning |
| --- | --- |
| `Invalid environment configuration: <keys>` | The service refused to start; fix the listed keys |
| `ADMIN_USER_IDS is empty: no administrator` | Nobody is an administrator |
| `MC session verification failed` (at most once per minute, with `reason` and `expectedAudience`) | Tokens are rejected; usually the service URL (`CONNECT_SERVICE_URL`) or the region is wrong |
| `providers enabled: ...` and a warning per partially configured provider | Which third-party sources are on |
| `audit.admin_action`, `audit.feedback_submitted` | Administrator actions and feedback submissions, with the user ID |
| `post-deploy: ...`, `pre-undeploy: ...` | Lifecycle checks; `post-deploy: FAILED <check>` is a real problem |
| `nimbus-mcp stderr ...` | Output of the embedded child process |

Request-level troubleshooting by correlation id: find one line of the failing request, copy its `correlationId`, and filter the deployment logs with it.

## Lifecycle scripts

After each deployment `postDeploy` verifies the service-account key, a Vertex AI call, a write-read-delete probe on Custom Objects, the Google Cloud readiness (dataset, bucket, with warnings only), the audience and the provider configuration. It registers nothing and continues
after a failed check so one log shows every problem (`service/src/connector/post-deploy.ts`). `preUndeploy` removes only its own probe object and logs where the data stays (`service/src/connector/pre-undeploy.ts`).

## Capacity, scaling and cold start

- The service is stateless; Connect may run several instances and a sandbox scales to zero. The first request after a quiet period is slower while an instance starts (a cold start); the duration depends on the platform and has not been measured for this connector. State and secrets survive because they are in Custom Objects.
- The embedded Nimbus child needs about 70 MB of memory when started (measured on a workstation, not in Connect) and a 96 MB heap cap; it is started on first use and stopped after 10 minutes without a call. Set `NIMBUS_MCP_ENABLED=false` if memory is tight.
- Custom Object requests have a 15 second timeout and up to 3 tries on transient errors. Large sessions are limited by what the platform returns (at most 10,000 messages readable per session) and by the object size limits in `service/src/persistence/limits.ts`.
- There is no queue: a chat turn runs inside one HTTP request, limited to 270 seconds.

## Known issues

- **Some Managed MCP tool schemas cannot be sent to Gemini unchanged.** Gemini's function-calling schema is
  smaller than JSON Schema, and one tool it cannot express makes the whole request fail, so every tool of
  that turn is lost and the assistant answers with a schema error although every server is healthy. Constructs
  seen in Managed MCP servers include references that are not direct children of the root definitions, recursive
  references, arrays without an item type, tuple-style `items` and reference cycles made only of required
  fields. The service rewrites the schemas of the merged tool set before each request and keeps the tool's own
  input validation (`service/src/schema/json-schema.ts`, `service/src/schema/normalize-tool-set.ts`). The rewrite
  is lossy only where a reference cannot be hoisted; the affected tool names are logged as warnings. If a
  tool misbehaves after an update of the Managed MCP server, check those warnings first. When a server
  publishes schemas that Gemini accepts, the rewrite does nothing.
- **Stripe tools use a pinned toolkit release.** See [configuration.md](./configuration.md#stripe-toolkit-version).
- **Cold start duration is not measured.** Sandbox and preview deployments scale to zero, so the first request after a
  quiet period is slower; this document gives no figure because none has been measured for this connector.

## Fail-open and fail-closed behaviour

"Closed" means the request is rejected; "open" means it continues without the dependency. Each row was checked against the code named in the last column.

| Dependency | When unavailable | Stance | Time limit | Code |
| --- | --- | --- | --- | --- |
| Merchant Center token verification (gateway keys) | Any token that cannot be verified, including an unreachable key set, answers 401 on authenticated routes; `/service/status` is unaffected | closed | set by the verification library, not by the service | `service/src/middleware/mc-session.middleware.ts` |
| `CONNECT_SERVICE_URL` | While empty every authenticated route answers 401 `Service is not configured for authentication` | closed | none | `service/src/middleware/mc-session.middleware.ts` |
| Project key | A token for another project answers 403 | closed | none | `service/src/auth/project-guard.ts` |
| `ADMIN_USER_IDS` | Empty or unset: nobody is an administrator, startup warning, `adminConfigured: false`; administrator routes answer 403 `ADMIN_REQUIRED` | closed | none | `service/src/auth/admin.ts` |
| commercetools Custom Objects | Session, message, settings, feedback and backoffice routes answer 503; a chat turn does not start (the session cannot be loaded); `/service/status` stays `UP` | closed | 15 s per request, up to 3 tries | `service/src/persistence/gateway/custom-object.gateway.ts`, `service/src/middleware/error.middleware.ts` |
| Vertex AI (Gemini) | The chat turn ends with an error chunk in the stream (or 500 before streaming); the session digest is skipped and suggestions fall back to the static set | closed for chat, open for digest and suggestions | whole turn 270 s | `service/src/chat/chat.controller.ts`, `service/src/services/suggestions.service.ts` |
| Identity Managed MCP server | A user without a valid connection, or with no permitted tool, gets a placeholder tool and a prompt that tells the model to ask them to connect; any other failure removes the source for that turn; chat continues | open (degraded) | 15 s per source | `service/src/identity-mcp/tool-source.ts` |
| Knowledge MCP, Contentstack, Algolia, Stripe | The failing source contributes no tools for that turn; a warning names it | open | 10 s handshake (`MCP_HANDSHAKE_TIMEOUT_MS`), 15 s per source, 30 s per Contentstack request | `service/src/tool-sources/registry.ts` |
| Embedded Nimbus MCP | Its tools are left out for the turn; a call that times out counts toward recycling the child after three timeouts; `/service/status/nimbus` answers 503 | open | 20 s per call, 15 s to spawn | `service/src/nimbus/process-manager.ts` |
| BigQuery | A failed offload returns the tool's own result unchanged; the query and table tools return an error to the model; with no Google key the source is off | open for offload, closed per query | 60 s per query job | `service/src/analytics/pipeline/pipeline.ts`, `service/src/analytics/tools/query.ts` |
| Cloud Storage | A generated image that cannot be stored is dropped from the stored message and logged (with the fix for a missing bucket role); reading an image answers 404 or 500 for that file only | open for chat, closed per image | none set | `service/src/storage/uploader.ts`, `service/src/storage/files-route.ts` |
| Five-minute Connect request limit | At the soft deadline running tools stop; at the hard deadline a notice is appended and stored and the stream ends normally | closed with a message | 240 s soft, 270 s hard | `service/src/chat/request-budget.ts` |

Merchant Center applications: `composed-apps` has no dependency on the service and keeps working when the service is down. `mc-app` and `mc-view-app` show an error with a retry action when the session bootstrap fails and offer no chat without it.
No API Extension or Subscription is registered, so carts, orders and checkout never depend on this connector.

## Poison messages and replay

Not applicable. The connector contains only a `service` application and Merchant Center frontends. It registers no Subscription, no API Extension and no scheduled job, receives no commercetools messages, and therefore has no message redelivery, dead-letter queue or replay behaviour.
`connect.yaml` declares no `event` or `job` application.

Recovery paths for the failures that can happen:

- A chat turn failed or was cut by the time limit: ask again or ask the assistant to continue. The messages that were produced are stored.
- A session is stuck or too long (`Session is too long`): delete the session in the app and start a new one.
- A user sees "not connected": reconnect the identity connection from the app (an administrator can remove and re-bind the Managed MCP server).
- A configuration or code problem: fix the configuration and redeploy, or redeploy the previous tag ([deployment.md](./deployment.md#updating-and-rolling-back)).
- Stored data is wrong or unwanted: delete the Custom Objects as described next.

## Data retention

Chat messages and feedback are kept until an operator deletes them. There is no automatic deletion, no expiry and no cleanup job. The size caps (100 kB request body, 10 MB feedback body, 8 MiB feedback snapshot) limit size, not age.
Only these things expire on their own: BigQuery tables of offloaded tool results (seven days), pending OAuth login attempts (ten minutes) and the in-process caches.

How an operator deletes data:

- A user, or an administrator through the app, deletes a session: this removes the session, its messages, its BigQuery tables and its generated images. Feedback records are not removed with the session.
- To delete directly, use the Merchant Center Custom Objects view or the Custom Objects API (`DELETE /{projectKey}/custom-objects/{container}/{key}`, scope `manage_key_value_documents`). The containers are listed in [architecture.md](./architecture.md#data-model):
  - one user's conversations: their sessions in `ai-assistant-sessions` and the matching `ai-assistant-messages-<sessionId>` containers;
  - one user's connection: the object with their user ID in `ai-assistant-identity-tokens` (or remove it with the "disconnect" action in the app);
  - feedback: the object in `ai-assistant-feedback` and every object of `ai-assistant-feedback-snap-<feedbackId>`;
  - cached suggestions: the user's object in `ai-assistant-suggestions`.
- Undeploying the connector does not delete any of this ([deployment.md](./deployment.md#updating-and-rolling-back)). To remove everything, delete the containers whose names start with `ai-assistant-` and the container `shared-composed-pages`, and the BigQuery dataset and the image bucket.

## Backup and restore

All durable state is in Custom Objects of your project, so project-level export of Custom Objects is the backup. Encrypted objects can only be read with the `ENCRYPTION_KEY` (and `ENCRYPTION_KEY_PREVIOUS`) that wrote them; keep those values safe.
The BigQuery tables and the image bucket are derived or replaceable data and are not part of a backup of the conversations (images referenced by stored messages would be lost).

## Rollback

Redeploy the previous tag: `node scripts/connect/connect.mjs update-code --tag <previous tag>` (stage the old tag, publish, redeploy with `--updateConnector`), see [the deployment runbook](./deployment-runbook.md#5-rollback). If needed delete the deployment with `delete --yes`; the Custom Objects stay. This procedure has been unit-tested with a fake CLI only and has not yet been rehearsed on a real deployment.

## Upgrading Nimbus

The Nimbus MCP package version is pinned and must equal the version of `@commercetools/nimbus` that the frontends resolve. To bump it, change `@commercetools/nimbus-mcp` in `service/package.json` and `@commercetools/nimbus*` in all three frontends,
regenerate the surface manifest (`npm run generate:nimbus-surface` in `mc-app` and `service`) and run the tests; `service/tests/nimbus/nimbus-pin.spec.ts` fails when the versions disagree.
