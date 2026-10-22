> **UNSUPPORTED - commercetools Labs.** This code is freely available reference code,
> provided AS IS under the MIT license with **no support, no SLA and no roadmap commitment**.
> See [SUPPORT.md](../SUPPORT.md) and [LICENSE](../LICENSE).

# AI Assistant - Merchant Center Custom View (`mc-view-app`)

## What it is

A Merchant Center **Custom View** of type `CustomPanel` (size `SMALL`). It adds an "AI Assistant" panel
next to the Merchant Center pages that match its 65 locators (products, orders, customers, discounts,
categories, ...). The panel is a reduced chat: one conversation per host page, and the assistant
knows which page is open because every call to the chat service carries the query parameter
`customView=<base64 of the host page URL>`.

Every browser request goes through the Merchant Center gateway (`/proxy/forward-to`), which vouches
for the signed-in user and project. The panel never sends an e-mail address or any other identity.

It is deployed as a Connect application (`applicationType: merchant-center-custom-view`, see
`connect.yaml` in the repository root). It has no events, no jobs and no scheduled work, so there is
no poison-message or replay procedure.

## Prerequisites

- The chat service is deployed and reachable (see the [service README](../service/README.md)).
- The Custom View is registered in the Merchant Center with a placeholder URL first ([deployment guide](../docs/connect-deployment.md#order-of-operations));
  Connect then provides the deployed URL, which is written back to the registration.
- The project has an identity-mode Managed MCP binding, set up by an administrator in the AI Assistant
  application (`mc-app`). The panel only reads it.

## Configuration

| Variable | Used for | Where it comes from |
| --- | --- | --- |
| `CUSTOM_VIEW_ID` | id of the registered Custom View | Connect (`connect.yaml`) |
| `CLOUD_IDENTIFIER` | Merchant Center region (for example `gcp-us`) | Connect (`connect.yaml`) |
| `CHAT_SERVICE_ENDPOINT_URL` | base URL of the chat service, sent to the app as `additionalEnv` | Connect (`connect.yaml`) |
| `APPLICATION_URL` | public URL of this application | injected by Connect |
| `INITIAL_PROJECT_KEY` | dev only: project of the host page for `yarn start` | your `.env` |
| `HOST_URI_PATH` | dev only: host page path for `yarn start` | your `.env` |

`.env.example` lists them with placeholders. Never commit a `.env`.

## Locators

The view is registered for exactly 65 locators (see `custom-view-config.mjs`, in the same order as the
previous version), grouped by area:

- categories: 5 (list, external search, general, products, manage storefront order)
- customers: 17 (list; business unit add/addresses/associates/details; customer addresses and details; order detail)
- discounts: 8 (list; add discount; cart discount, discount code and product discount details; generate codes)
- operations: 2 (list, import log details)
- orders: 13 (list; order details tabs; returns; shipping and delivery; quotes)
- products: 14 (list; product details tabs; variant details, images, inventory, prices; add image and price)
- settings: 3 (settings, channel details, store details)
- standalone prices: 3 (list, add, details)

If `mc-scripts build` ever rejects a locator, remove it only after checking the Merchant Center
documentation and record it in the change's design risks.

## Scopes

There is **no permission group** and no additional OAuth scope. `oAuthScopes` contains:

| Scope | Why |
| --- | --- |
| `view_key_value_documents` | unused by the view (every call goes through the gateway), but the `view` list must stay non-empty, and changing scopes re-registers the Custom View |
| `manage_key_value_documents` | same, for `manage` |
| `view_mcp_servers` | parity with `mc-app`; the panel never lists Managed MCP servers |
| `manage_mcp_servers` | parity with `mc-app`; the panel never creates or binds a server |

The panel has no admin UI. Admin status is decided only by the service (`ADMIN_USER_IDS`); the bootstrap
`isAdmin` is stored but never read by the panel.

## Behaviour and failure modes

- **Bootstrap fails**: the panel shows an error and a Retry button, never a blank page. 401 means the
  Merchant Center session expired (button "Sign in again"); 403 means the project is not the one the
  service is configured for; anything else (service down, 5xx) is shown with its message. There is no
  chat without a successful bootstrap (fail closed).
- **No Managed MCP binding**: the panel explains that an administrator must set one up in the AI
  Assistant application, and shows no composer and no control that creates or changes a binding. Same
  for administrators and non-administrators.
- **Binding but user not connected**: a "Connect my account" gate starts the identity OAuth popup; a
  blocked or closed popup shows an error and the button stays usable.
- **Storage blocked**: the open session id is kept in `localStorage` guarded against exceptions; if
  storage throws, the panel opens a new session.
- **Your user ID**: the footer shows the signed-in user's own Merchant Center user id (read-only text,
  Copy button), because an operator needs it for `ADMIN_USER_IDS` before being an administrator.

## Local development

```
cd mc-view-app
yarn install
cp .env.example .env     # fill INITIAL_PROJECT_KEY, HOST_URI_PATH, CHAT_SERVICE_ENDPOINT_URL
yarn start
```

`HOST_URI_PATH` is the Merchant Center page the view is mounted on by `yarn start`, for example
`/<your-project-key>/products/<a-product-id>`. It must match one of the locators. Unset values fall
back to `unset-dev-only` placeholders so the production build in Connect (which does not provide them)
still compiles.

Quality gates: `yarn typecheck && yarn lint && yarn test && yarn build` (Node 22, Yarn 1, no workspace root).

## Derived from mc-app

The chat surface is copied from `mc-app/src/components/new-chat` at commit `a62e60e` and pruned.

Copied unchanged from `mc-app` and kept identical to it:
`utils/forward-to.ts`, `utils/material-icons.ts`, `types/chart.ts`, `hooks/use-service-image.ts`,
`components/your-user-id/index.tsx`, `components/new-chat/{types.ts,layout.ts,agent-avatar.tsx}`,
`parts/{json-block,text-part,file-part,export-part,reasoning-part,source-part}.tsx`,
`typing-indicator/{index.tsx,use-typewriter.ts,cute-text-phrases.ts,cute-text-animator.tsx}`.

Copied and adapted (each has a "Derived from" header; not guarded because they diverge):

| File | Change |
| --- | --- |
| `new-chat/index.tsx`, `chat-area.tsx` | no rail, drawers, tabs, header, feedback, annotation queue; transport uses `useFetch` (flag) |
| `new-chat/message.tsx`, `message-actions.tsx` | no rating |
| `new-chat/composer/index.tsx` | no tool menu / sources panel |
| `new-chat/empty-state/{index,greeting}.tsx` | no recent chats; greeting without e-mail fallback |
| `new-chat/user-avatar.tsx` | initials only (no Gravatar, the panel never reads the user's e-mail) |
| `new-chat/parts/index.tsx`, `subagent-part.tsx` | no annotations or composed-page (generated UI) parts |
| `hooks/use-chat-service-connector/*`, `hooks/use-mc-session`, `contexts/*` | flag-aware requests (`useFetch`), pruned to what the panel calls, `BootstrapError` |

Left out (reason): server tool menu and tools panel (no tool selection in the panel), feedback popup
(no feedback in the panel), view switcher and conversation header (single view), chats drawer and app
rail (one session per host page), composed pages, code preview and annotations (admin/page features of
`mc-app`), `use-current-user` (it reads the e-mail), `gravatar.ts` (same reason).

Maintenance: when one of the copied files changes in `mc-app`, copy it here. Review the adapted files against `mc-app` roughly quarterly.

## More

Root documentation: [README](../README.md), [configuration](../docs/configuration.md), [permissions](../docs/permissions.md), [operations](../docs/operations.md), [troubleshooting](../docs/troubleshooting.md), [CONTRIBUTING](../CONTRIBUTING.md).
