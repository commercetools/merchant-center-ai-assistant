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
