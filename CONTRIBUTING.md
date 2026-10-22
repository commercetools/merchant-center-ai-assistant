# Contributing

## Unsupported notice

This repository is unsupported reference code. Contributions are accepted without a support
commitment: there is no promise that a pull request is reviewed, merged or answered, and nothing
you contribute creates an obligation for commercetools. See [SUPPORT.md](./SUPPORT.md).

## Prerequisites

- Node.js 22. The service (`service/`) and the deployment helper (`scripts/`) use npm; the three frontends (`mc-app/`, `composed-apps/`, `mc-view-app/`) use Yarn 1.
- Docker running locally (needed by `commercetools connect validate`).
- The commercetools Connect CLI for deployment work.

## Layout

One folder per Connect application, as siblings at the repository root, described by one
`connect.yaml`. There are no npm workspaces and no shared package; every folder installs its own
dependencies. The root [README](./README.md) explains the layout and [docs/architecture.md](./docs/architecture.md) the design.

## Rules

- Every source file carries the SPDX header.
- Package names are `ai-assistant-<suffix>` (for example `ai-assistant-service`) and every `package.json` is `private`.
- No `.github/workflows` and no other CI, container or infrastructure-as-code files: deployment is a set of Connect CLI commands ([docs/connect-deployment.md](./docs/connect-deployment.md)). That is by design.
- Never commit `.env*` files except `.env.example`, and keep secret-looking values empty there. Never put secrets, customer names, real project keys or internal host names in a commit, an issue or a document.
- Write documentation in neutral, factual language. Every statement should be true of the code; cite the path.
- No `console.*`, no `any` escapes and no `process.env` outside `service/src/config` (ESLint enforces them).

## Development setup

```
cd service && npm ci && cp .env.example .env.local     # see service/README.md for a local run without a project
cd scripts && npm ci                                   # dependencies of the deployment helper
cd mc-app && yarn install --frozen-lockfile            # same for composed-apps and mc-view-app
```

Per-folder commands:

| Folder | Commands |
| --- | --- |
| `service/` | `npm run typecheck && npm run lint && npm test && npm run build` |
| `mc-app/`, `composed-apps/`, `mc-view-app/` | `yarn typecheck && yarn lint && yarn test && yarn build` (the build needs the values of `.env.example` exported) |
| `scripts/` | `node --test tests/*.test.mjs` |

Raising the App Kit version means changing all three frontends together (`yarn versions:appkit` in each).
The Nimbus version is pinned in the service and must match the frontends ([docs/operations.md](./docs/operations.md#upgrading-nimbus)).

## Before opening a PR

- [ ] The commands of every folder you changed (table above) pass.
- [ ] When you changed a configuration key, a scope, a route or a document, the matching document says the same: the tables in `README.md` and `docs/configuration.md` come from `connect.yaml` and the `oAuthScopes` of the application config files, and `docs/api.md` lists the routes.
- [ ] Files that are copies across the frontends are still identical ([docs/architecture.md](./docs/architecture.md)).

## Adding a tool source

A tool source adds tools, a prompt fragment and a tools-menu group. The contract, what the registry already does and a worked example are in
[service/src/tool-sources/README.md](./service/src/tool-sources/README.md). The steps: create the source, register it in `service/src/tool-sources/index.ts`, test it with the stub helpers under `service/tests/helpers/`,
and update [docs/how-it-works.md](./docs/how-it-works.md), [FEATURES.md](./FEATURES.md) and, if it needs credentials, `connect.yaml` and [docs/configuration.md](./docs/configuration.md).
Third-party credentials are Connect configuration only; do not add a screen or an API that writes them.

## Checks against a deployed connector

The apps can only be exercised fully in a browser that is logged in to the Merchant Center against a deployed sandbox connector. Keep such checks idempotent, clean up the sessions and objects they create, and assert structure
rather than model wording.

## Commits and pull requests

- Small, logical commits with an imperative subject in the form `area: what changed` (for example `service: reject system-role messages`).
- One topic per pull request; explain what changed and why, and how you tested it.
- Do not rewrite shared history. Do not include generated build output, `.env` files or local tooling configuration.
- Contributions are licensed under the MIT license of this repository.
