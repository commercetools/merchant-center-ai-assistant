## Why

Change **R** delivers the second Merchant Center Custom Application, **AI Assistant Pages** (`composed-apps/`). It lists and renders "composed pages": UI that the assistant generated (schema v5.0, Babel-transpiled JSX stored as commercetools Custom Objects) on their own Merchant Center menu entry, with no chat surface. The legacy app is on `@commercetools-frontend/*` 25.1.0, has a session bootstrap against the multitenant router that nothing consumes any more, carries a BigQuery data-source remnant, ships committed build output and `.env` files, and lists dev-tunnel and Cloud Run hosts in its CSP. This change ports it onto the shared frontend foundation (change O) as a clean, single-tenant, Connect-deployable app.

- Change ID: **R** (`r-composed-apps-app`). Wave 7, size M.
- Needs: **O** (frontend foundation: aligned versions/scripts/configs, `forward-to` policy, permissions, duplicate-drift check, env contract) and **M** (composed-page schema v5.0 and storage contract). Both must be implemented and archived first.
- Unblocks: **V** (E2E-R-nn scenarios), **W** (per-app README), **U** (deployment of `composed-apps`).

## What Changes

- Create `composed-apps/` (folder name equals the `connect.yaml` `deployAs` name) as a `merchant-center-custom-application`, entry point `ai-assistant-pages` (configurable through `ENTRY_POINT_URI_PATH`).
- Port routes (`/` list, `/:pageKey` view), `composed-pages-list`, `composed-page-view`, `page-renderer`, `babel-renderer`, `ui-error-boundary`, `composed-page-chart`, storage hook and its four GraphQL documents, contexts, types.
- **Remove** the BigQuery data-source remnant. Data sources are GraphQL against commercetools only; an unsupported `target` produces a per-data-source error, never a blank page.
- **Remove** the `/auth/session` bootstrap, `AuthProvider`, `use-mc-session`, `use-chat-service-endpoint` and the `forward-to.ts` copy from this app (decision D2): the app consumes only Merchant Center GraphQL and Custom Objects, so it must render even when the AI service is down or not yet deployed.
- Bump to the foundation's pinned `@commercetools-frontend/*` 27.9.6; keep `@commercetools/nimbus` 3.x; Node 22; independent `yarn.lock`.
- Rewrite `custom-application-config.mjs`: every per-project value is a `${env:...}` placeholder, CSP reduced to what the renderer needs, `oAuthScopes` documented and justified.
- Remove starter leftovers: committed `public/` build output, `.env`, `helpers.ts`, `types.ts`, `test-utils` (replaced by real tests), `extract-intl` scripts, `console.*` calls.
- Add the first unit tests this app has ever had (pure data-source logic, schema helpers, page parsing) and per-app `README.md` required by Connect certification.
- Register the renderer-chain files with the duplicate-drift guard (`scripts/check-duplicates.mjs`, owned by O) because they are shared with `mc-app`.

## Capabilities

### New Capabilities
- `composed-apps-app`: behaviour of the AI Assistant Pages Custom Application: routing, listing, rendering, data sources, permissions, resilience, configuration contract, and absence of tenancy/BigQuery/chat-service coupling.

### Modified Capabilities
<!-- none: nothing exists in openspec/specs yet -->

## Impact

- New folder `composed-apps/` (about 40 source files, no generated GraphQL types committed beyond what `tsc` needs).
- `connect.yaml` entry `composed-apps` is defined by change B and finalised by U; R only states which configuration keys the app reads.
- `scripts/check-duplicates.mjs` (change O) gains a group of files shared with `mc-app`.
- Merchant Center registration (manual step M6) must exist before E2E scenarios run.

## Out of scope

- Creating, editing or deleting composed pages in this app (creation happens in the chat via the `create_composed_page` tool, change M; deletion stays in `mc-app`). The Custom Object storage hook keeps its mutation functions only if `mc-app` shares the file byte-for-byte (see design D4).
- The service-side tool, schema validation and page storage contract (change M).
- Backend routes, `connect.yaml` authoring, deployment scripts (B, U).
- Translating the UI (English only, owner question Q15).

## Legacy source

- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/composed-apps` (all files under `src/`, `custom-application-config.mjs`, `package.json`, `.env.example`)
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/FEATURES.md` (section "`composed-apps/` - the second Custom Application")
- Cross-reference copy in `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-app/src` for shared renderer files.
