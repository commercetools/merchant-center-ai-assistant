# Development

How to run, test and change the connector on your machine. Setup that lives outside this repository (Google Cloud, keys, accounts) is in [setup.md](./setup.md); deployment is in [connect-deployment.md](./connect-deployment.md).

## Repository layout

| Path | Contents |
| --- | --- |
| `connect.yaml` | The Connect contract: four applications, their configuration keys and defaults, the API client scopes |
| `service/` | The service (TypeScript, Express, npm) |
| `mc-app/`, `composed-apps/`, `mc-view-app/` | The Merchant Center applications (TypeScript, React, Yarn 1, one install per folder) |
| `service/contract/` | Shared test fixture of the composed page format |
| `docs/` | Documentation |
| `scripts/` | The deployment helper (`scripts/connect`) and its tests |

There are no npm workspaces and no shared package: each folder installs its own dependencies, as Connect requires. A few small files are copied between the Merchant Center applications and must stay identical; change a copy in every app ([architecture.md](./architecture.md#applications)).

## Run the service

The service runs on your machine with in-memory persistence and the Merchant Center token check switched off. This mode is refused when `NODE_ENV=production` and never reaches Connect.

```
cd service
npm ci
cp .env.example .env.local
npm run start:dev          # tsx watch, reads .env.local with --env-file, no dotenv
```

Set these in `.env.local`:

| Key | Value | Why |
| --- | --- | --- |
| `NODE_ENV` | `development` | Allows the settings below |
| `PERSISTENCE_DRIVER` | `memory` | No commercetools project needed. Data is lost on restart |
| `MC_AUTH_DISABLED` | `true` | Skips the Merchant Center token check and allows CORS from `localhost` for the frontends |
| `CONNECT_SERVICE_URL` | `http://localhost:8080/service` | Local only; Connect provides it when deployed. The service takes the audience and the Managed MCP callback URL from its origin |
| `CTP_PROJECT_KEY`, `CTP_REGION` | your project key, for example `us-central1.gcp` | The project the service acts on |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` | Protects stored tokens |
| `GCP_SA_KEY_BASE64` | see [setup.md](./setup.md#3-service-account-and-key) | Chat answers. Without it everything but chat works |
| `GCP_VERTEX_LOCATION` | `global` if Vertex reports a model as not found | See [setup.md](./setup.md#2-gemini-on-vertex-ai) |

Check it:

```
curl http://127.0.0.1:8080/service/status
curl -H 'x-dev-user-id: user-id-a' -H 'x-dev-admin: true' http://127.0.0.1:8080/service/session/all
```

In bypass mode the user is whatever `x-dev-user-id` says, or `dev-user` when a request carries no such header, which is the case for a browser. A browser request is an administrator only when `dev-user` is listed in `ADMIN_USER_IDS`, so set `ADMIN_USER_IDS=dev-user` to see the administrator screens, or set `MCP_BINDING_OPEN_TO_ALL=true` to let everyone manage the Managed MCP binding.

The service restarts empty with the memory driver. A frontend that remembers a session id then gets a 404 once and creates a new session.

## Run a frontend

The three Merchant Center applications run with their own dev server and need a registered Custom Application (or Custom View), a Merchant Center login and a service to talk to.

```
cd mc-app
yarn install --frozen-lockfile
cp .env.example .env        # set INITIAL_PROJECT_KEY and CHAT_SERVICE_ENDPOINT_URL
yarn start                  # needs a Merchant Center login
```

- **Against your local service:** set `CHAT_SERVICE_ENDPOINT_URL=http://localhost:8080/service`. Under `yarn start`, an `http://` service URL is called directly and the Merchant Center gateway is skipped (`src/utils/forward-to.ts`), because the gateway only reaches public https URLs. This works only with `MC_AUTH_DISABLED=true` on the service.
- **Against a deployed service:** set the https URL of the sandbox service. Every request then goes through the gateway with a signed token, as in production.
- **Ports:** the three apps all default to port 3001, and a Custom Application has one registered development URL, so run one at a time.
- **`composed-apps`** reads composed pages straight from commercetools and never calls the service. **`mc-view-app`** also needs `HOST_URI_PATH` in its `.env`.

### Connect a Managed MCP server locally

Commerce tools come from a Managed MCP server in identity mode. To try the connect flow locally:

1. Set `CONNECT_SERVICE_URL=http://localhost:8080/service` and restart the service. The OAuth callback is `http://localhost:8080/service/managed-mcp-identity/callback`, so it must point at the service, not at the frontend's port.
2. Make yourself able to bind a server: `ADMIN_USER_IDS=dev-user` or `MCP_BINDING_OPEN_TO_ALL=true`.
3. In the app, bind the server and use "Connect my account". The identity provider must accept the `http` redirect URI; if it does not, run the service behind an https URL instead.

## Test and check

```
cd service
npm run typecheck && npm run lint
npm test                                         # Jest, no network, in-memory persistence
npm run build
npm run test:integration                         # needs credentials in .env.local; every suite skips without them
```

```
cd mc-app        # and composed-apps, mc-view-app
yarn typecheck && yarn lint && yarn test && yarn build    # the build needs the variables of .env.example
```

```
cd scripts && npm ci && node --test tests/*.test.mjs      # the deployment helper
```

The Connect CLI builds the current directory, so run `commercetools connect application build` and `application test` from `service/`; `commercetools connect validate` runs from the repository root and needs a running Docker daemon.

## Changing a configuration key

A key lives in several places that must agree. For a new optional setting:

1. `service/src/config/sections/*.ts` reads it once, validates it and holds the default. No other module reads `process.env`.
2. `connect.yaml` declares it with a `description` and, when the default is a fixed value, a `default`. When the default is derived or empty, say so in the description.
3. `service/.env.example` lists it with a short comment.
4. Update the configuration table in [README.md](../README.md#configuration) and in [configuration.md](./configuration.md), and add a note there when the key needs one.
5. Add a case to the matching test in `service/tests/unit`.

Keys shared by every application (`CLOUD_IDENTIFIER`, `CHAT_SERVICE_ENDPOINT_URL`) go under `inheritAs.configuration` instead, and the deployment helper passes them without an application prefix.

## Adding to the service

- A new tool source: [service/src/tool-sources/README.md](../service/src/tool-sources/README.md) and [adding-a-store.md](./adding-a-store.md).
- A new route: add it to [api.md](./api.md).

See also [CONTRIBUTING.md](../CONTRIBUTING.md). Contributions carry no support commitment.
