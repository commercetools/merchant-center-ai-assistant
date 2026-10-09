<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
Freely available, AS IS and UNSUPPORTED. See LICENSE.
-->

<!-- Connect CLI @commercetools/cli 0.0.17: `commercetools connect application build|test|start` take NO
     flags and no application name. They operate on the current working directory, which must contain
     package.json. Run them from this folder (service/), not from the repository root. -->

# Service: developer notes

Temporary file (spec W supersedes it).

## Run locally

```bash
cd service
npm ci
cp .env.example .env.local     # fill CTP_* (or PERSISTENCE_DRIVER=memory and NODE_ENV=development)
npm run start:dev              # tsx watch --env-file=.env.local, no dotenv
curl -i http://127.0.0.1:8080/service/status
```

## Checks

```bash
npm run typecheck && npm run lint && npm run check:foundation
npm test
npm run build && node scripts/smoke-start.mjs     # starts the built output; prints "smoke OK"
```

## Connect CLI (run from service/)

```bash
commercetools connect application build
commercetools connect application test
commercetools connect validate          # needs a running Docker daemon; run from the repository root
```

## Persistence (change E)

All durable state lives in commercetools Custom Objects (containers prefixed `ai-assistant-`), behind the stores in `src/persistence/`. Nothing outside `src/persistence/gateway/custom-object.gateway.ts` calls the Custom Objects API.

- `ENCRYPTION_KEY` is required in every environment: `openssl rand -base64 32`. After a rotation set the old key in `ENCRYPTION_KEY_PREVIOUS` and run `npm run build && npm run persistence:reencrypt -- --dry-run`, then again without `--dry-run`.
- Local development without a project: `PERSISTENCE_DRIVER=memory` (refused when `NODE_ENV=production`; data is lost on restart).
- Live tests: put `CTP_PROJECT_KEY`, `CTP_REGION`, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_SCOPE`, `CTP_API_URL`, `CTP_AUTH_URL` and `ENCRYPTION_KEY` of a scratch project in `.env.local`, then run `npm run test:integration` (every suite is skipped without them). `PERF=1 npm run test:integration -- perf.sessions` runs the session-list benchmark.
- Clean up test containers: `npm run build && npm run persistence:purge -- --prefix ai-assistant-it-<run id>`.
