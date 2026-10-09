## ADDED Requirements

### Requirement: Deploy-time values come from `${env:...}` placeholders
`custom-application-config.mjs` MUST read `applicationId` (`CUSTOM_APPLICATION_ID`), `url` (`APPLICATION_URL`), `entryPointUriPath` (`ENTRY_POINT_URI_PATH`), `cloudIdentifier` (`CLOUD_IDENTIFIER`) and `additionalEnv.chatServiceEndpointUrl` (`CHAT_SERVICE_ENDPOINT_URL`) exclusively through `${env:NAME}` placeholders; `custom-view-config.mjs` MUST do the same with `CUSTOM_VIEW_ID` instead of the application id and entry point. No literal project ids, URLs or hosts MAY appear.

#### Scenario: Config compiles with env supplied
- **WHEN** `CUSTOM_APPLICATION_ID`, `APPLICATION_URL`, `ENTRY_POINT_URI_PATH`, `CLOUD_IDENTIFIER`, `CHAT_SERVICE_ENDPOINT_URL` are exported and `yarn compile-html` runs in `mc-app`
- **THEN** `public/index.html` is produced and `window.app.entryPointUriPath` equals the supplied path

#### Scenario: Missing variable fails loudly
- **WHEN** `CHAT_SERVICE_ENDPOINT_URL` is unset and `yarn build` runs
- **THEN** the build fails with a message naming the variable (or the app throws at boot with the same name)

### Requirement: Committed `.env.example` only
Each frontend MUST ship `.env.example` listing every variable with placeholder values and MUST ignore `.env` and `.env.local` in `.gitignore`.

#### Scenario: Example matches config
- **WHEN** the variables referenced by `${env:...}` in the config are compared with `.env.example`
- **THEN** every referenced variable except those Connect injects (`APPLICATION_URL` in production) is listed

### Requirement: Minimal Content Security Policy
CSP in each config MUST allow only `*.commercetools.app` and `*.gstatic.com` for `connect-src`, MUST NOT list ngrok, localhost or Cloud Run hosts, and MUST include `'unsafe-eval'` in `script-src` only for apps that execute generated page code (`mc-app`, `composed-apps`).

#### Scenario: No CSP violations in a normal session
- **WHEN** the chat is used in Chrome (E2E-O-04)
- **THEN** `list_console_messages` shows no `Content Security Policy` errors

### Requirement: Least-privilege OAuth scopes and neutral naming
The configs MUST set `name` to `AI Assistant` (`AI Assistant Pages` for composed-apps), MUST request only scopes the app uses, and the apps' normal `oAuthScopes` MUST carry `view_mcp_servers` (view) and `manage_mcp_servers` (manage) where the app lists Managed MCP servers. No `additionalOAuthScopes` and no extra permission group MAY be declared.

#### Scenario: Scope review
- **WHEN** the scope lists are diffed against design.md section "Scope decision"
- **THEN** every scope present has a documented consumer

#### Scenario: No permission group declared
- **WHEN** `mc-app/custom-application-config.mjs` and `mc-app/src/constants.ts` are inspected
- **THEN** neither declares `additionalOAuthScopes` or a permissions-group constant, and `oAuthScopes.view` contains `view_mcp_servers` while `oAuthScopes.manage` contains `manage_mcp_servers`
