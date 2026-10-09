## 0. Read first

About 1 hour. You must be able to answer the questions at the bottom before editing files.

- [x] 0.1 Read the change documents and the plan
  - `openspec/changes/b-connect-skeleton/{proposal.md,design.md,specs/connect-skeleton/spec.md}` - read "Platform facts" PF1-PF12 twice.
  - `plans/02-target-architecture.md` sections 1-2 (layout and config keys), `plans/00-overview.md` decisions D3, D4, D7, D8, D9.
  - Official guidance (installed skill `commercetools-connect`): `references/project-structure.md`, `references/merchant-center-customizations.md` Pattern 5, `references/merchant-center-cli.md`, `references/lifecycle-scripts.md`.
  - Docs: <https://docs.commercetools.com/connect/development.md>, <https://docs.commercetools.com/connect/modify-connector.md>, <https://docs.commercetools.com/merchant-center-customizations/deployment/commercetools-connect.md>.
  - Legacy files to open (read-only): `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/connect.yaml`, `mc-app/custom-application-config.mjs`, `mc-app/src/constants.ts`, `mc-view-app/custom-view-config.mjs`, `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/{package.json,tsconfig.json,src/index.ts,src/app.ts,.env.example}`.
  - You should now be able to explain: (1) why `MC_AUDIENCE` is not filled in at first deploy, (2) which `CTP_*` variables Connect injects and why `connect.yaml` must not declare them, (3) why an MC app has no `endpoint`, (4) why `CHAT_SERVICE_ENDPOINT_URL` defaults to an `.invalid` URL, (5) why `inheritAs` is per connector.

## 1. Setup

- [ ] 1.1 Branch, tools, Docker
  - Run: `cd /Users/behnam/code/commercetools-labs/ai-assistant && git switch -c spec/b` (change A must be merged first; if not, `git merge spec/a`).
  - Run: `node -v && commercetools --version && docker info --format '{{.ServerVersion}}'`
  - Expected: `v22.x`, `@commercetools/cli/0.0.17` (or newer), a Docker server version number. If the last command prints `Cannot connect to the Docker daemon`, start Docker Desktop and wait until it answers (this is manual step **M14** in `plans/questions-inbox/ABUX-manual-steps.md`; the owner installs/starts Docker once).
- [ ] 1.2 Create a throw-away reference scaffold (outside the repo)
  - Run: `mkdir -p "$TMPDIR/ref" && cd "$TMPDIR/ref" && npx -y @commercetools-frontend/create-mc-app@latest app1 --template starter-typescript --skip-install --yes --initial-project-key x --cloud-identifier gcp-us --entry-point-uri-path ai-assistant </dev/null && ls app1`
  - Expected: folders `src`, `schemas`, `@types-extensions`, files `custom-application-config.mjs`, `package.json`, `AGENTS.md`, `CLAUDE.md`, `.env`. You only LOOK at this; nothing from `AGENTS.md`, `CLAUDE.md`, `.env`, `schemas/`, `src/types/generated/`, `src/components/channel-details/` is ever copied into the repo.

## 2. Root `connect.yaml`

- [x] 2.1 Write `connect.yaml` with the comment header and the service entry
  **Why:** it is the install contract; everything else hangs off it.
  **Where:** `connect.yaml` (create at repo root).
  **How:**
  1. Start with a comment block (spec requirement) containing PF1, PF2, PF4: injected `CTP_*`, `CONNECT_SERVICE_URL` only in lifecycle scripts so `MC_AUDIENCE` / `CHAT_SERVICE_ENDPOINT_URL` are set by redeploy (change U), `APPLICATION_URL` injected for MC apps.
  2. Add the service entry:
  ```yaml
  deployAs:
    - name: service
      applicationType: service
      endpoint: /service
      scripts:
        postDeploy: npm ci && npm run build && npm run connector:post-deploy
        preUndeploy: npm ci && npm run build && npm run connector:pre-undeploy
      configuration:
        standardConfiguration:
          - key: CLOUD_IDENTIFIER
            description: Merchant Center API cloud identifier of the target project (for example gcp-us); used to pick the JWKS issuer when the gateway header is absent
            default: 'gcp-us'
          - key: MC_AUDIENCE
            description: Public origin of this service (https://host, no path). Unknown until the first deployment; set it with a redeploy (see the deployment runbook). While empty the service rejects all Merchant Center traffic
            required: false
          - key: GCP_PROJECT_ID
            description: Google Cloud project that hosts Vertex AI, BigQuery and the image bucket. Optional; when empty the project_id inside the service-account key is used
            required: false
          - key: GCP_VERTEX_LOCATION
            description: Vertex AI location (Gemini text and image models)
            default: 'us-central1'
          - key: GEMINI_MODEL_NAME
            description: Main Gemini model id
            default: 'gemini-3.8-flash'
          - key: GEMINI_LITE_MODEL_NAME
            description: Cheap Gemini model id used for session digests and prompt suggestions
            default: 'gemini-3.5-flash-lite'
          - key: GCP_BIGQUERY_DATASET_ID
            description: BigQuery dataset for offloaded tool results (created on first use when the service account may create datasets)
            default: 'aiassistant'
          - key: GCP_BIGQUERY_LOCATION
            description: BigQuery location of the dataset (immutable once the dataset exists)
            default: 'us-central1'
          - key: GCP_BUCKET_NAME
            description: Cloud Storage bucket for generated images. Optional; when empty the name is <gcp project id>-ai-assistant-images
            required: false
          - key: GCP_BUCKET_LOCATION
            description: Location used when the bucket has to be created (us-central1, or a multi-region such as US)
            default: 'us-central1'
          - key: IMAGE_URL_MODE
            description: private (default) = bucket stays private and images are streamed through the service; public = objects are publicly readable and stored with the public bucket URL
            default: 'private'
          - key: MCP_TOOLS_TTL_MS
            description: In-process cache lifetime of fetched MCP tool sets in milliseconds
            default: '1800000'
          - key: LOG_LEVEL
            description: Logger level (error, warn, info, debug)
            default: 'info'
          - key: ADMIN_USER_IDS
            description: Optional comma-separated list of Merchant Center user ids (at most 50) of administrators. A user is an administrator only when the user id in the signed Merchant Center gateway token is in this list. Empty means nobody is an administrator
            required: false
          - key: CONTENTSTACK_BRANCH
            description: Optional Contentstack branch name sent with every Content Management API call
            required: false
          - key: CONTENTSTACK_REGION
            description: Contentstack region of the stack (na, eu, au, azure-na, azure-eu, gcp-na, gcp-eu)
            default: 'na'
          - key: STRIPE_CONNECTED_ACCOUNT_ID
            description: Optional Stripe connected account id (acct_...) the Stripe tools act on behalf of
            required: false
        securedConfiguration:
          - key: GCP_SA_KEY_BASE64
            description: Base64 of the complete Google service-account JSON key (single line, no wrapping)
            required: true
          - key: ENCRYPTION_KEY
            description: Base64 of a 32-byte AES-256-GCM key that protects stored identity tokens; changing it makes stored tokens unreadable (see change E for rotation)
            required: true
          - key: CONTENTSTACK_API_KEY
            description: Optional Contentstack stack API key. Contentstack is enabled only when this and CONTENTSTACK_MANAGEMENT_TOKEN are both set
            required: false
          - key: CONTENTSTACK_MANAGEMENT_TOKEN
            description: Optional Contentstack Management Token (scope it to what the assistant may change)
            required: false
          - key: ALGOLIA_MCP_URL
            description: Optional https URL of the Algolia MCP server. Secured because it may embed a key; Algolia is enabled when it is set
            required: false
          - key: STRIPE_SECRET_KEY
            description: Optional Stripe secret or restricted key (sk_/rk_). Prefer a restricted key limited to the tools you want the assistant to use
            required: false
  ```
  **Done when:** `node -e "const y=require('fs').readFileSync('connect.yaml','utf8');console.log(y.includes('CONNECT_SERVICE_URL'))"` prints `true` (file will be completed in 2.2).
  **Watch out:** never declare `CTP_PROJECT_KEY`, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_SCOPE`, `CTP_API_URL`, `CTP_AUTH_URL`, `CTP_REGION` (PF1). Quote numeric defaults as strings. The model ids are copied from the legacy `.env.example` and are unverified (open question BQ1).
- [x] 2.2 Add the three Merchant Center entries and `inheritAs`
  **Where:** `connect.yaml` (append).
  **How:**
  ```yaml
    - name: mc-app
      applicationType: merchant-center-custom-application
      configuration:
        standardConfiguration:
          - key: CUSTOM_APPLICATION_ID
            description: The Custom Application ID returned when registering the application in the Merchant Center
            required: true
          - key: ENTRY_POINT_URI_PATH
            description: Entry point URI path of the Custom Application (unique per cloud region)
            required: true
          - key: CLOUD_IDENTIFIER
            description: Merchant Center API cloud identifier (for example gcp-us)
            default: 'gcp-us'
          - key: CHAT_SERVICE_ENDPOINT_URL
            description: Full URL of the service including /service; set on redeploy after the first deployment
            required: false
            default: 'https://not-configured.invalid/service'
    - name: composed-apps   # same four keys as mc-app
    - name: mc-view-app
      applicationType: merchant-center-custom-view
      configuration:
        standardConfiguration:
          - key: CUSTOM_VIEW_ID
          - key: CLOUD_IDENTIFIER
          - key: CHAT_SERVICE_ENDPOINT_URL
  inheritAs:
    apiClient:
      scopes:
        - view_key_value_documents
        - manage_key_value_documents
  ```
  (Write all keys out fully with descriptions; the abbreviations above are only for this task text. `composed-apps` has its own `CUSTOM_APPLICATION_ID` and `ENTRY_POINT_URI_PATH` values.)
  **Done when:** `commercetools connect validate --skip tests` is not yet runnable (folders missing); instead `node -e "console.log(require('yaml').parse(require('fs').readFileSync('connect.yaml','utf8')).deployAs.map(d=>d.name))"` after task 6.1 prints `['service','mc-app','composed-apps','mc-view-app']`.
  **Watch out:** no `endpoint`, `securedConfiguration` or `APPLICATION_URL` on MC entries (PF4/PF5). The view has no `ENTRY_POINT_URI_PATH`.

## 3. Service stub

- [x] 3.1 Create `service/package.json`, `tsconfig.json`, `.nvmrc`, `.gitignore`
  **Why:** lets Connect build and the tests run.
  **Where:** `service/package.json`, `service/tsconfig.json`, `service/.nvmrc` (`22`), `service/.gitignore` (`node_modules`, `build`, `.env`, `.env.local`). Reference: `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/package.json` and `tsconfig.json`.
  **How:** `package.json`:
  ```json
  {
    "name": "ai-assistant-service",
    "version": "0.1.0",
    "private": true,
    "engines": { "node": "22.x" },
    "scripts": {
      "build": "rimraf ./build && tsc -p tsconfig.build.json",
      "start": "node build/index.js",
      "start:dev": "ts-node-dev src/index.ts",
      "typecheck": "tsc --noEmit",
      "test": "jest",
      "connector:post-deploy": "node build/connector/post-deploy.js",
      "connector:pre-undeploy": "node build/connector/pre-undeploy.js"
    },
    "dependencies": { "express": "^4.18.2" },
    "devDependencies": {
      "@types/express": "^4.17.14", "@types/jest": "^29.5.14", "@types/node": "^22.10.0",
      "@types/supertest": "^6.0.2", "jest": "^29.7.0", "rimraf": "^5.0.1", "supertest": "^7.0.0",
      "ts-jest": "^29.1.1", "ts-node-dev": "^2.0.0", "typescript": "^5.4.0"
    }
  }
  ```
  `tsconfig.json`: `"extends": "@tsconfig/recommended/tsconfig.json"` is NOT needed; use `{ "compilerOptions": { "target": "ES2022", "module": "commonjs", "strict": true, "esModuleInterop": true, "outDir": "build", "rootDir": "src", "skipLibCheck": true }, "include": ["src"] }` and `tsconfig.build.json` excluding nothing extra. Add `jest.config.cjs`: `{ preset: 'ts-jest', testEnvironment: 'node', testMatch: ['**/tests/**/*.spec.ts'] }`.
  **Done when:** `cd service && npm install && npm run typecheck` exits 0 (no sources yet is OK only after 3.2; run both).
  **Watch out:** commit `package-lock.json` (`npm ci` in `connect.yaml` needs it). `@commercetools/platform-sdk@^8` and `@commercetools/ts-client@^4` are added by change C, not here (no unused deps). Do not add `dotenv`.
- [x] 3.2 Add the Express stub and its test
  **Where:** `service/src/index.ts`, `service/src/app.ts`, `service/src/routes/service.route.ts`, `service/tests/status.spec.ts` (all with SPDX header).
  **How:**
  ```ts
  // routes/service.route.ts
  import { Router } from 'express';
  export const serviceRouter = Router();
  serviceRouter.get('/status', (_req, res) => { res.status(200).json({ status: 'ok' }); });
  // app.ts
  import express from 'express';
  import { serviceRouter } from './routes/service.route';
  const app = express();
  app.use(express.json());
  app.use('/service', serviceRouter); // MUST equal connect.yaml endpoint
  export default app;
  // index.ts
  import app from './app';
  const PORT = Number(process.env.PORT) || 8080;
  app.listen(PORT, () => { process.stdout.write(`service listening on ${PORT}\n`); });
  ```
  Test `tests/status.spec.ts`: `describe('status route')`, `it('returns ok under /service')` expecting 200 and `{status:'ok'}` for `/service/status`, and `it('is not mounted at the root')` expecting 404 for `/status`.
  **Done when:** `cd service && npm test` prints `Tests: 2 passed`.
  **Watch out:** `process.stdout.write`, never `console.log` (Definition of Done). Keep `app` separate from `listen` so supertest never opens a port.
- [x] 3.3 Add lifecycle stubs and `.env.example`
  **Where:** `service/src/connector/post-deploy.ts`, `service/src/connector/pre-undeploy.ts`, `service/.env.example`.
  **How:** each connector file: `process.stdout.write('post-deploy: nothing to do (change U adds the checks)\n');` (resp. pre-undeploy). `.env.example` (policy from change A: secrets empty):
  ```
  PORT=8080
  CLOUD_IDENTIFIER=gcp-us
  MC_AUDIENCE=
  GCP_PROJECT_ID=
  GCP_VERTEX_LOCATION=us-central1
  GCP_BIGQUERY_DATASET_ID=aiassistant
  GCP_BIGQUERY_LOCATION=us-central1
  GCP_BUCKET_NAME=
  GCP_BUCKET_LOCATION=us-central1
  IMAGE_URL_MODE=private
  GCP_SA_KEY_BASE64=
  ENCRYPTION_KEY=
  LOG_LEVEL=info
  ADMIN_USER_IDS=
  CONTENTSTACK_API_KEY=
  CONTENTSTACK_MANAGEMENT_TOKEN=
  CONTENTSTACK_BRANCH=
  CONTENTSTACK_REGION=na
  ALGOLIA_MCP_URL=
  STRIPE_SECRET_KEY=
  STRIPE_CONNECTED_ACCOUNT_ID=
  ```
  **Done when:** `cd service && npm run build && npm run connector:post-deploy && npm run connector:pre-undeploy; echo $?` ends with `0` and prints the two lines; `node ../scripts/check-repo-rules.mjs` passes.
  **Watch out:** `.env.example` values must follow the policy (`GCP_PROJECT_ID=` and `GCP_BUCKET_NAME=` empty, never a real id). Do not copy the legacy `.env.example` (it contains Firestore and Anthropic/OpenAI keys that are DROPPED).

## 4. Merchant Center stubs

- [x] 4.1 Create `mc-app/` from the legacy shell
  **Why:** gives Connect a buildable Custom Application.
  **Where:** `mc-app/` (create). Copy from `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-app/`: `.nvmrc`, `.prettierrc`, `.prettierignore`, `.eslintrc.js`, `intl-formatter.js`, `jest.test.config.js`, `jest.d.ts`, `tsconfig.json`, `@types-extensions/`, `custom-application-config.mjs`, `src/constants.ts`, `src/index.tsx`, `src/components/entry-point/`. Do NOT copy `src/components` other than `entry-point`, `src/hooks`, `src/contexts`, `scripts/`, `public/`, `.env`, `yarn.lock`, `node_modules/`.
  **How:**
  1. `package.json`: name `ai-assistant-mc-app`, `private: true`, `engines.node: 22.x`, scripts `build`, `start`, `compile-html`, `typecheck`, `lint`, `test` from the legacy file (drop `postinstall`, `nimbus:typegen`, `generate:nimbus-surface`, `check:nimbus-surface`, `extract-intl`); dependencies = only what the stub imports, every `@commercetools-frontend/*` pinned `27.9.6` exactly (no caret), `react`/`react-dom` `19.0.0`, `typescript` `5.9.2`. Start from the legacy list and delete packages until `yarn typecheck` and `yarn build` still pass.
  2. `custom-application-config.mjs`: `name: 'AI Assistant'`, `entryPointUriPath: '${env:ENTRY_POINT_URI_PATH}'`, `cloudIdentifier: '${env:CLOUD_IDENTIFIER}'`, `env.production: { applicationId: '${env:CUSTOM_APPLICATION_ID}', url: '${env:APPLICATION_URL}' }`, `env.development.initialProjectKey: '${env:INITIAL_PROJECT_KEY}'`, `additionalEnv.chatServiceEndpointUrl: '${env:CHAT_SERVICE_ENDPOINT_URL}'`, `oAuthScopes: { view: ['view_key_value_documents', 'view_mcp_servers'], manage: ['manage_key_value_documents', 'manage_mcp_servers'] }` (no `additionalOAuthScopes`, no custom permission), `mainMenuLink: { defaultLabel: 'AI Assistant', labelAllLocales: [], permissions: [PERMISSIONS.View] }`, and `headers.csp` with only `connect-src: ['*.commercetools.app']`.
  3. `src/components/entry-point/entry-point.tsx` renders the app-kit `ApplicationShell` with one route that shows the text `AI Assistant (stub)`; reuse the legacy file and delete routes you do not need.
  4. `.env.example` (no secrets): `ENABLE_NEW_JSX_TRANSFORM=true`, `FAST_REFRESH=true`, `APPLICATION_URL=http://localhost:3001`, `INITIAL_PROJECT_KEY=`, `CUSTOM_APPLICATION_ID=`, `ENTRY_POINT_URI_PATH=ai-assistant`, `CLOUD_IDENTIFIER=gcp-us`, `CHAT_SERVICE_ENDPOINT_URL=http://localhost:8080/service`.
  5. `.gitignore`: `node_modules`, `public`, `dist`, `.env`, `.env.local`, `!.env.example`.
  **Done when:** `cd mc-app && yarn install && yarn typecheck && set -a && . ./.env.example && set +a && yarn build; echo $?` ends with `0` and `ls public/index.html` exists.
  **Watch out:** the config file only substitutes `${env:...}` inside its own exported strings (legacy `constants.ts` comment); keep the `entryPointUriPath` derivation from the legacy `constants.ts`. `yarn build` needs the variables exported (the `.env.example` placeholders are enough for a build). Remove every `ngrok`, `run.app`, `localhost:8080` string from CSP. Commit `yarn.lock`.
- [x] 4.2 Create `composed-apps/`
  **Where:** `composed-apps/` (same file set as 4.1, from `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/composed-apps/`).
  **How:** same recipe; `name: 'AI Assistant Pages'`; package name `ai-assistant-composed-apps`; **bump all `@commercetools-frontend/*` from `25.1.0` to `27.9.6`** and fix any type errors in the stub (there should be none because the stub is tiny); default `ENTRY_POINT_URI_PATH=ai-assistant-pages` in `.env.example`.
  **Done when:** same commands as 4.1 in `composed-apps/` exit 0.
  **Watch out:** the same `oAuthScopes` as mc-app (including `view_mcp_servers` / `manage_mcp_servers`); the legacy `src/constants.ts` exports `PERMISSIONS` only and the stub keeps it that way: no custom-permission export, no `additionalOAuthScopes`.
- [x] 4.3 Create `mc-view-app/`
  **Where:** `mc-view-app/` (from `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-view-app/`).
  **How:** package `ai-assistant-mc-view-app`; `custom-view-config.mjs`: `name: 'AI Assistant'`, `cloudIdentifier: '${env:CLOUD_IDENTIFIER}'`, `env.production: { customViewId: '${env:CUSTOM_VIEW_ID}', url: '${env:APPLICATION_URL}' }`, `env.development: { initialProjectKey: '${env:INITIAL_PROJECT_KEY}', hostUriPath: '/${env:INITIAL_PROJECT_KEY}/products' }` (NOT the legacy store/product ids), `additionalEnv.chatServiceEndpointUrl`, `oAuthScopes` `view: ['view_key_value_documents', 'view_mcp_servers']` and `manage: ['manage_key_value_documents', 'manage_mcp_servers']`, `type: 'CustomPanel'`, `typeSettings.size: 'SMALL'`, `locators: ['products.product_details.general']` for the stub (change S restores the 65 locators from legacy), same minimal CSP. Declare no custom permission and no `additionalOAuthScopes`. `.env.example` has `CUSTOM_VIEW_ID=` and no entry-point path.
  **Done when:** `cd mc-view-app && yarn install && yarn typecheck && set -a && . ./.env.example && set +a && yarn build; echo $?` ends with `0`.
  **Watch out:** the legacy `.env` of this folder is tracked-by-accident risk; never copy it. The hostUriPath default in legacy contains a real product id: drop it.

## 5. Layout checker

- [x] 5.1 Create `scripts/package.json` and `scripts/check-connect-layout.mjs`
  **Why:** enforces the spec rules that `connect validate` does not (config keys, pins, forbidden keys).
  **Where:** `scripts/package.json` (name `ai-assistant-scripts`, private, dependency `yaml` `^2`), `scripts/package-lock.json`, `scripts/check-connect-layout.mjs` (headered).
  **How:** parse `connect.yaml` with `yaml`; export pure functions `checkApplications(doc)`, `checkConfigKeys(doc)`, `checkScopes(doc)`, `checkVersionPins(packageJsons)`; CLI part loads files from the repo root. Rules: exact four names/types/order; names equal root folders with a `package.json`; no other root folder except `scripts` holds a `package.json`; no root `package.json`; MC entries have no `endpoint`/`securedConfiguration`; service keys per spec (required flags, defaults, secured placement; the four provider secrets `CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `ALGOLIA_MCP_URL`, `STRIPE_SECRET_KEY` must be under `securedConfiguration` with `required: false`, and `CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION`, `STRIPE_CONNECTED_ACCOUNT_ID` under `standardConfiguration`); forbidden injected keys (`CTP_*`); `inheritAs.apiClient.scopes` equals the allowed list and never contains `manage_project`; `ADMIN_USER_IDS` is under `service` `standardConfiguration` with `required: false` and absent elsewhere; each MC config file lists `view_mcp_servers` in `view` and `manage_mcp_servers` in `manage` and contains no `additionalOAuthScopes`; all `@commercetools-frontend/*` versions in the three MC apps are identical and exact (no `^`/`~`); no `workspaces` field anywhere; `.env` not tracked.
  **Done when:** `npm ci --prefix scripts && node scripts/check-connect-layout.mjs` exits 0 and prints `connect layout ok (4 applications)`.
  **Watch out:** treat versions as exact strings; `27.9.6` equals `27.9.6` but not `^27.9.6`.
- [x] 5.2 Unit tests for the layout checker
  **Where:** `scripts/tests/check-connect-layout.test.mjs`.
  **How:** `node:test` cases named: `layout: accepts the canonical document`, `layout: rejects missing application`, `layout: rejects endpoint on mc-app`, `keys: rejects CTP_CLIENT_ID in service`, `keys: secured placement of GCP_SA_KEY_BASE64` (the same test asserts every other GCP_* key and IMAGE_URL_MODE is standard and optional/defaulted, and that the legacy name GCP_LOCATION is rejected), `keys: provider secrets only under securedConfiguration`, `keys: provider non-secrets only under standardConfiguration`, `keys: ADMIN_USER_IDS optional and standard only`, `mcscopes: requires view/manage mcp scopes and rejects additionalOAuthScopes`, `scopes: rejects manage_project`, `pins: rejects drift 25.1.0 vs 27.9.6`, `pins: rejects caret`.
  **Done when:** `node --test scripts/tests/` reports all tests passing (A's 14 plus these 12 = `pass 26`).
  **Watch out:** build fixture objects in code; do not read `connect.yaml` in unit tests.

## 6. Prove it with the platform tooling

- [ ] 6.1 Run `commercetools connect validate`
  **Why:** the spec's acceptance gate.
  **How:** `cd /Users/behnam/code/commercetools-labs/ai-assistant && commercetools connect validate 2>&1 | tee "$TMPDIR/validate.txt"`. Allow 10-20 minutes the first time (Buildpacks download). If it fails, read the message, fix the cause (usual suspects: missing `package-lock.json`, an application folder without a `build` script, `engines`), and re-run. Never use `--skip` for the final run.
  **Done when:** exit code 0 and no "invalid" line in `$TMPDIR/validate.txt`; attach the last 15 lines to the PR.
  **Watch out:** needs the Docker daemon (PF9). If validate leaves a `.connect/` folder with logs, `.gitignore` already ignores `.connect/*.log`; commit a `.connect/project.toml` only if validate complains without it (design E7).
- [ ] 6.2 Run the repo-wide checks and `ossify` dry run
  **How:** `node scripts/spdx-check.mjs && node scripts/check-repo-rules.mjs && node scripts/check-connect-layout.mjs && scripts/labs-gate.sh ossify | grep -E "renamed|ai-assistant|FOREIGN|THIRD"`.
  **Done when:** all exit 0; the ossify report lists four `package.json  ->  @commercetools-labs/ai-assistant-...` lines (service, mc-app, composed-apps, mc-view-app) plus `scripts/package.json` and no FOREIGN/THIRD-PARTY section.
  **Watch out:** if ossify wants to header files under `mc-*/src` that you copied, run `node scripts/spdx-check.mjs` first - missing headers on legacy files are expected right after copying; add the three-line banner by hand (or run the private ossify `--apply` on a scratch copy and copy back) so the checker is green before the PR.

## Last: Verification

- [ ] V.1 Commands and expected results
  - `cd service && npm ci && npm run build && npm test` -> `Tests: 2 passed`
  - `cd mc-app && yarn typecheck && yarn build`, same for `composed-apps`, `mc-view-app` -> exit 0 each
  - `node --test scripts/tests/` -> `pass 26`
  - `node scripts/check-connect-layout.mjs`, `node scripts/spdx-check.mjs`, `node scripts/check-repo-rules.mjs` -> exit 0
  - `commercetools connect validate` -> exit 0
  - `openspec validate b-connect-skeleton --strict` -> valid
- [x] V.2 Unit tests added by this change (names)
  - service: `status route returns ok under /service`, `status route is not mounted at the root`
  - scripts: the 10 layout tests in 5.2
- [ ] V.3 Chrome scenarios: none in this change (stub UIs). One smoke check only: `yarn start` in `mc-app` serves `http://localhost:3001` (needs M-level login, so it is skipped; real scenarios `E2E-O-*` start in change O).
- [ ] V.4 Definition of Done from plans/04-workflow.md section 4: no `console.log`, SPDX headers, no tenant words, `connect validate` green, docs delta below recorded.

## Docs to update (for change W)

- Configuration reference table (including the seven provider keys and which are secured): every `connect.yaml` key (standard/secured, default, required, who reads it) - copy from the spec; mention PF1 and that `CTP_*` come from Connect.
- README "Install" section: register the Custom Applications/View first (manual steps M6/M7), choose a unique `ENTRY_POINT_URI_PATH`, then deploy (change U), then set `MC_AUDIENCE` and `CHAT_SERVICE_ENDPOINT_URL`.
- Platform facts PF1-PF8 in the architecture document.
- Scope table: why each scope in `inheritAs.apiClient.scopes` exists (E adds its rows).
- CONTRIBUTING: Docker must be running for `commercetools connect validate`; service uses npm, frontends yarn.
