> **UNSUPPORTED - commercetools Labs.** This code is freely available reference code,
> provided AS IS under the MIT license with **no support, no SLA and no roadmap commitment**.
> See [SUPPORT.md](../SUPPORT.md) and [LICENSE](../LICENSE).

# service

The Connect `service` application of the AI Assistant connector: an Express service mounted at `/service` that streams chat answers, stores conversations in
commercetools Custom Objects, hosts the tool sources and serves the feedback and backoffice APIs. The root [README](../README.md) describes the whole connector.

## What it is

- Type `service`, endpoint `/service` in `connect.yaml`; Node.js 22 and npm (`package-lock.json` only).
- Stateless: all durable state is in Custom Objects ([architecture](../docs/architecture.md#data-model)); in-process memory is only a cache.
- Authenticates every route except the status routes with the Merchant Center gateway token and decides administrator status from `ADMIN_USER_IDS` ([permissions](../docs/permissions.md)).
- Lifecycle scripts `connector:post-deploy` and `connector:pre-undeploy` verify a deployment and keep stored data on undeploy.
- Routes: [REST API reference](../docs/api.md). Mechanisms: [how it works](../docs/how-it-works.md).

## Configuration

The keys of the `service` application, their defaults and which are secured are in the generated tables of [docs/configuration.md](../docs/configuration.md#keys-of-connectyaml); the Google Cloud settings, models and provider keys have their own sections there.
Connect injects `CTP_API_URL`, `CTP_AUTH_URL`, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_PROJECT_KEY` and `CTP_SCOPE` from the API client it creates for `inheritAs`.
`readConfiguration()` (`src/config/index.ts`) reads everything once and exits with `Invalid environment configuration:` plus the key names when something is wrong. No module outside `src/config` reads `process.env` (ESLint enforces it).

## Required scopes

The generated API client has only `view_key_value_documents` and `manage_key_value_documents` (Custom Objects). The Google service account needs `roles/aiplatform.user`, `roles/bigquery.jobUser`, `roles/bigquery.dataEditor`
and either `roles/storage.admin` on the project or `roles/storage.objectAdmin` on a bucket you create ([README](../README.md#required-scopes)).

## Run locally

```
cd service
npm ci
cp .env.example .env.local
npm run start:dev          # tsx watch, reads .env.local with --env-file, no dotenv
curl -i http://127.0.0.1:8080/service/status
```

For a run without a commercetools project put these in `.env.local`: `NODE_ENV=development`, `PERSISTENCE_DRIVER=memory` (data is lost on restart; refused in production), `MC_AUTH_DISABLED=true`
(choose the user with the headers `x-dev-user-id` and `x-dev-admin: true`; refused in production), `CTP_PROJECT_KEY`, `CTP_REGION` (for example `us-central1.gcp`) and `ENCRYPTION_KEY` (`openssl rand -base64 32`).
Chat needs `GCP_SA_KEY_BASE64` (`base64 < key.json | tr -d '\n'`). With a real project set the `CTP_*` values of an API client that has the two Custom Object scopes.

## Test and check

```
npm run typecheck && npm run lint && npm run check:foundation
npm test                                         # Jest, no network, in-memory persistence
npm run build && node scripts/smoke-start.mjs    # starts the built output; prints "smoke OK"
npm run test:integration                         # needs credentials in .env.local; every suite skips without them
```

The Connect CLI builds the current directory, so run it from `service/`: `commercetools connect application build` and `commercetools connect application test`.
`commercetools connect validate` runs from the repository root and needs a running Docker daemon.

Other scripts: `npm run persistence:reencrypt` (after rotating `ENCRYPTION_KEY`, see [configuration](../docs/configuration.md#encryption-key)), `npm run persistence:purge` (test containers), `npm run smoke:nimbus`,
`npm run probe:identity`, `npm run generate:nimbus-surface` and `npm run check:nimbus-surface`.

## Fail-open and fail-closed behaviour

Authentication, `CONNECT_SERVICE_URL`, the project guard, `ADMIN_USER_IDS` and Custom Objects fail closed; Vertex AI fails closed for chat and open for digests and suggestions; the optional tool sources, the Nimbus child, BigQuery offloading
and image storage fail open for the chat turn. The table with time limits and code references is in [docs/operations.md](../docs/operations.md#fail-open-and-fail-closed-behaviour).

## Events and jobs

Not applicable: the service registers no Subscription, API Extension or scheduled job, so there is nothing to replay ([docs/operations.md](../docs/operations.md#poison-messages-and-replay)).

## Adding a tool source

Tool sources are plug-ins. The contract, what the registry does for you and an example are in [src/tool-sources/README.md](./src/tool-sources/README.md).

## More

[Troubleshooting](../docs/troubleshooting.md), [security](../docs/security.md), [deployment](../docs/deployment.md), [CONTRIBUTING](../CONTRIBUTING.md).
