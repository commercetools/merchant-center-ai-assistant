> **UNSUPPORTED - commercetools Labs.** This code is freely available reference code,
> provided AS IS under the MIT license with **no support, no SLA and no roadmap commitment**.
> See [SUPPORT.md](../SUPPORT.md) and [LICENSE](../LICENSE).

# mc-app (AI Assistant)

The Merchant Center Custom Application named "AI Assistant": the chat surface, the administrator screens and the composed page preview of the connector. The root [README](../README.md) describes the whole connector.

## What it is

- Connect type `merchant-center-custom-application`, built with App Kit 27.9.6, React and the Nimbus design system.
- Routes below the application's entry point: the chat (root), `/composed/:pageKey` (a saved composed page), `/backoffice` and `/backoffice/:sessionId` (administrators only).
- Every call to the service goes through the Merchant Center gateway (`forwardToFetch`, `src/utils/forward-to.ts`); the browser never contacts the service directly and never sends an identity.
- Administrator status comes only from the `isAdmin` field of `POST /service/auth/session`; the screens for administrators are hidden otherwise, and the service enforces it ([permissions](../docs/permissions.md)).
- What it offers is listed under "Chat application" in [FEATURES.md](../FEATURES.md).

## Register it first

Register the Custom Application in the Merchant Center (Settings, Developer settings, Custom Applications) with a placeholder URL such as `https://placeholder.invalid`, note its application id and choose a unique entry point URI path.
Deploy, then update the registration with the URL that the deployment prints ([deployment guide](../docs/connect-deployment.md#order-of-operations)). The OAuth scopes you register must equal `oAuthScopes` in `custom-application-config.mjs`.

## Configuration

| Variable | Source | Meaning |
| --- | --- | --- |
| `CUSTOM_APPLICATION_ID` | Connect configuration | Id returned when you registered the application |
| `ENTRY_POINT_URI_PATH` | Connect configuration | URL segment of the application (unique per cloud region) |
| `CLOUD_IDENTIFIER` | Connect configuration | Merchant Center API cloud, for example `gcp-us` |
| `CHAT_SERVICE_ENDPOINT_URL` | Connect configuration | Service origin plus `/service`; set by the second deployment step |
| `APPLICATION_URL` | injected by Connect | Public URL of the deployed application |
| `INITIAL_PROJECT_KEY` | local `.env` | Project the development server opens (required for `yarn start`) |

Full tables with defaults: [docs/configuration.md](../docs/configuration.md). A production build fails with `Missing environment variable '<name>'` when one of the first five is unset.
The content security policy allows `unsafe-eval` for the generated-page renderer and `gravatar.com` images; see [security](../docs/security.md#generated-code) and [privacy](../docs/privacy.md).

## Required scopes and permissions

The application declares the OAuth scopes in `custom-application-config.mjs` (`view_key_value_documents` and `manage_key_value_documents` for composed pages, `view_mcp_servers` and `manage_mcp_servers` for the Managed MCP setup, and the commerce scopes that generated pages use).
The generated list with the reason for each scope is in the [root README](../README.md#required-scopes). The only Merchant Center permissions are the default View and Manage pair of the application; they control access to the application, not administrator rights.

## Run and test locally

```
cd mc-app
yarn install --frozen-lockfile
cp .env.example .env        # set INITIAL_PROJECT_KEY and, for a real chat, CHAT_SERVICE_ENDPOINT_URL of a deployed service
yarn start                  # needs a Merchant Center login
yarn typecheck && yarn lint && yarn test && yarn build
```

`yarn build` needs the variables of `.env.example` exported or in `.env`. The gateway only reaches public https URLs, so a local development server talks to a deployed sandbox service, or to a local service over `http` when that service runs with `MC_AUTH_DISABLED=true` ([development.md](../docs/development.md#run-a-frontend)).
`postinstall` generates the Nimbus type definitions and the Nimbus surface manifest (`yarn check:nimbus-surface` verifies that it is up to date; the service keeps a byte copy, checked by `npm run check:nimbus-surface` in `service/`).
Some files are copied into the other frontends and must stay identical; change every copy ([architecture.md](../docs/architecture.md#applications)).

## Fail-open and fail-closed behaviour

- Session bootstrap fails (expired session, wrong project, service down): a message with a retry action; no chat without a successful bootstrap (closed).
- No Managed MCP server is bound: administrators see the setup page, everyone else the "Administrator access required" notice.
- A user who has not connected their account sees the "Connect my account" gate; the rest of the application stays closed until connected.
- Operations and recovery: [docs/operations.md](../docs/operations.md#fail-open-and-fail-closed-behaviour).

## Events and jobs

Not applicable: the application has no events, jobs or lifecycle scripts.

## More

[Troubleshooting](../docs/troubleshooting.md), [how it works](../docs/how-it-works.md), [CONTRIBUTING](../CONTRIBUTING.md).
