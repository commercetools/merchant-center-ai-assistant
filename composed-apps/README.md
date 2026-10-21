> **UNSUPPORTED - commercetools Labs.** This repository is freely available reference code,
> provided AS IS under the MIT license with **no support, no SLA and no roadmap commitment**.
> See [SUPPORT.md](../SUPPORT.md) and [LICENSE](../LICENSE).

# composed-apps (AI Assistant Pages)

## What it is

A Merchant Center Custom Application named "AI Assistant Pages". It lists the pages the AI
Assistant created with `create_composed_page` and renders them. A composed page is a Custom
Object in the container `shared-composed-pages` whose value holds `name`, `icon`, `isPublished`
and a schema (version 5.0) with JSX components and GraphQL data sources. The browser transpiles
the JSX with Babel and executes it.

The app is a pure Merchant Center GraphQL client. It never calls the AI service, does not need
`CHAT_SERVICE_ENDPOINT_URL` and renders whether or not the service is deployed. Connect passes it the shared key like every application, and it ignores it.

## Prerequisites

Register a Custom Application in the Merchant Center (see the [deployment guide](../docs/connect-deployment.md#order-of-operations)) and note its application
id. Its entry point URI path must differ from the chat application's.

## Configuration

| Key | Where it comes from | Meaning |
| --- | --- | --- |
| `CUSTOM_APPLICATION_ID` | Connect configuration | Id returned when registering the application |
| `ENTRY_POINT_URI_PATH` | Connect configuration | URL segment of the app (`ai-assistant-pages` locally) |
| `CLOUD_IDENTIFIER` | Connect configuration | Merchant Center API cloud, for example `gcp-us` |
| `APPLICATION_URL` | injected by Connect | Public URL of the deployed app |
| `INITIAL_PROJECT_KEY` | local `.env` only | Project used by `yarn start` |

## Required scopes

The app reads composed pages with `view_key_value_documents` and never writes them. The other
scopes exist because a stored page runs its own GraphQL with the signed-in user's token.

| Scopes | Justification |
| --- | --- |
| `view_key_value_documents` | Reads the composed page Custom Objects |
| `view_stores`, `view_tax_categories`, `view_products`, `view_product_selections`, `view_categories`, `view_standalone_prices`, `view_cart_discounts`, `view_discount_codes`, `view_customers`, `view_customer_groups`, `view_business_units`, `view_orders`, `view_payment_methods`, `view_shopping_lists`, `view_shipping_methods`, `view_quote_requests`, `view_staged_quotes`, `view_quotes` | GraphQL queries of generated pages |
| `manage_stores`, `manage_tax_categories`, `manage_products`, `manage_product_selections`, `manage_categories`, `manage_standalone_prices`, `manage_cart_discounts`, `manage_customers`, `manage_customer_groups`, `manage_business_units`, `manage_orders`, `manage_payment_methods`, `manage_shopping_lists`, `manage_shipping_methods`, `manage_quote_requests`, `manage_staged_quotes`, `manage_quotes` | GraphQL mutations that a generated page may declare as UI actions (the assistant prompt allows them) |

There is no `manage_discount_codes` (a page cannot edit discount codes) and no MCP scope. What a
page may read or change is bounded by the user's own Merchant Center permissions.

## Permissions

Only the application's default View/Manage pair. The app has no admin-only surface: it reads
no administrator flag and never calls the service. Who may open it is decided by the Merchant
Center View permission; a user without it does not see the menu entry.

## Security model

Generated page code runs in the app's own origin with the user's session. The renderer uses
`new Function`, so the content security policy needs `'unsafe-eval'` (and `'unsafe-inline'`) in
`script-src`; connections, fonts, styles and images are limited to `*.commercetools.app` and
`*.gstatic.com`. Only people who may create pages through the assistant can put code in pages.
This is the reason the renderer is not a shared package: Merchant Center apps only compile
their own `src` folder, so the renderer files are copies of the ones in `mc-app`, checked for
drift by `node scripts/check-duplicates.mjs` (group `composed-renderer`).

## Failure behaviour

- AI service down or not deployed: no effect, the app does not use it.
- A GraphQL request of a data source fails or uses an unsupported `target`: only that data
  source shows an error; the other data sources and components still render.
- A component throws: the error boundary shows the phase and component; the Merchant Center
  chrome keeps working.
- More than 500 pages: the first 500 (oldest first) are listed and a notice says so.

## Local development

```
cp .env.example .env     # set INITIAL_PROJECT_KEY
yarn install
yarn start               # http://localhost:3001
yarn typecheck && yarn lint && yarn test && yarn build
```

`yarn build` needs the `.env.example` values exported or an `.env` file (both git-ignored
apart from `.env.example`).

## Events and jobs

Not applicable: the app has no events, jobs or lifecycle scripts, so there is nothing to
replay.

## More

Root documentation: [README](../README.md), [configuration](../docs/configuration.md), [permissions](../docs/permissions.md), [operations](../docs/operations.md), [troubleshooting](../docs/troubleshooting.md), [CONTRIBUTING](../CONTRIBUTING.md).
