# Playbook U: Connect deployment

Owning change: `u-connect-deployment-no-gha`. U defined `E2E-U-01` to `E2E-U-03` in its `tasks.md`
(V.3, deployed app loads in Merchant Center, the forwarded request succeeds, no console errors);
those ids win. The V design's two-phase, idempotent redeploy and undeploy cards are `E2E-U-04` to
`E2E-U-06` here. All cards need a published connector deployed as `sandbox` (a staged connector
cannot go to sandbox) and the commands of `scripts/connect/connect.mjs` (`stage`, `publish`, `deploy`,
`finalize`, `configure`, `update-code`, `status`, `logs`, `delete`; see `docs/deployment-runbook.md`).
Manual steps: M4 (Connect login), M6 and M9 (application registration with the printed URLs), M14 and
M15 (Docker and the private staging repository), M16.

### E2E-U-01 - The deployed `mc-app` loads inside Merchant Center
- Spec: u-connect-deployment-no-gha / deployed frontends
- Tags: smoke, needs:M8, needs:deployment
- Env: sandbox
- Budget: 300
- Pre: `finalize` finished and the three application URLs are registered (M9); `E2E_ENV=sandbox` in `e2e/.env.e2e`.
- Steps:
  1. SHELL: `node scripts/connect/connect.mjs status`
  2. MACRO OPEN-APP $APP_URL
  3. MACRO EVIDENCE name=final
  4. MACRO OPEN-APP $PAGES_URL
  5. MACRO OPEN-APP $VIEW_URL
- Assert:
  A1 [SHELL] the deployment status is `Deployed` and the printed application URLs equal `$APP_URL`, `$PAGES_URL` and `$VIEW_URL` hosts.
  A2 [DOM] `mc-app` shows its ready state, `composed-apps` its list (or the foundation text until change R is deployed) and `mc-view-app` its panel on the host page.
  A3 [CONSOLE] no error-level message in any of the three.
- Cleanup: none.
- Evidence: status.txt, snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-U-02 - The forwarded request from the deployed UI succeeds
- Spec: u-connect-deployment-no-gha / frontends reach the deployed service through the gateway
- Tags: smoke, needs:M8, needs:deployment
- Env: sandbox
- Budget: 180
- Pre: `E2E-U-01`.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
  3. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: <reqid of the bootstrap>}
  4. SHELL: `curl -s "$SERVICE_URL/service/status"`
- Assert:
  A1 [NET] `POST .../proxy/forward-to` for `/service/auth/session` answered 200 and its `x-forward-to` host equals the deployed service host.
  A2 [SHELL] `/service/status` answers 200 and `authConfigured` is true (the audience was set by `finalize`).
  A3 [NET] before `finalize` the same bootstrap would be rejected (fails closed); recorded from the first deployment's smoke output, not repeated.
- Cleanup: none.
- Evidence: network.json, status.txt
- Status: NOT RUN

### E2E-U-03 - No console errors on the deployed apps
- Spec: u-connect-deployment-no-gha / deployed frontends
- Tags: regression, needs:M8, needs:deployment
- Env: sandbox
- Budget: 240
- Pre: `E2E-U-01`.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__list_console_messages {pageId: $P, types: ["error", "warn"]}
  3. MACRO OPEN-APP $PAGES_URL
  4. mcp__chrome-devtools__list_console_messages {pageId: $P, types: ["error", "warn"]}
  5. MACRO OPEN-APP $VIEW_URL
  6. mcp__chrome-devtools__list_console_messages {pageId: $P, types: ["error", "warn"]}
- Assert:
  A1 [CONSOLE] zero error-level messages from application code and no Content Security Policy message for any app.
- Cleanup: none.
- Evidence: console-mc-app.txt, console-composed-apps.txt, console-mc-view-app.txt
- Status: NOT RUN

### E2E-U-04 - Two-phase deployment order
- Spec: u-connect-deployment-no-gha / deploy then finalize
- Tags: slow, destructive, needs:deployment
- Env: sandbox
- Budget: 1800
- Pre: `E2E_ALLOW_DESTRUCTIVE=1`; a throwaway deployment key (never the one used by the other cards); M4, M14, M15 done.
- Steps:
  1. SHELL: `node scripts/connect/connect.mjs deploy`
  2. SHELL: `node scripts/connect/connect.mjs status`
  3. SHELL: `curl -s -o /dev/null -w "%{http_code}" "<service URL printed by status>/service/status"`
  4. SHELL: `curl -si -X POST "<service URL>/service/auth/session"`
  5. SHELL: `node scripts/connect/connect.mjs finalize`
  6. SHELL: `curl -s "<service URL>/service/status"`
- Assert:
  A1 [SHELL] after phase 1 the service is healthy (200) but `authConfigured` is false and Merchant Center requests are rejected (fails closed).
  A2 [SHELL] `finalize` ends with status `Deployed`, the status check passes and the three application URLs are printed; `authConfigured` is now true.
  A3 [SHELL] no secret appears in any printed line (the commands mask them).
- Cleanup: `node scripts/connect/connect.mjs delete --yes` for the throwaway deployment (see `E2E-U-06`).
- Evidence: deploy-output.txt (masked), status-before.txt, status-after.txt
- Status: NOT RUN

### E2E-U-05 - Redeploy is idempotent
- Spec: u-connect-deployment-no-gha / postDeploy idempotence
- Tags: slow, destructive, needs:deployment
- Env: sandbox
- Budget: 1200
- Pre: `E2E_ALLOW_DESTRUCTIVE=1`; a finalized deployment.
- Steps:
  1. SHELL: `node scripts/connect/connect.mjs configure STRIPE_SECRET_KEY=sk_test_e2edummykey --dry-run`
  2. SHELL: `node scripts/connect/connect.mjs configure STRIPE_SECRET_KEY=sk_test_e2edummykey`
  3. SHELL: `node scripts/connect/connect.mjs logs`
  4. SHELL: `node scripts/connect/connect.mjs configure STRIPE_SECRET_KEY=sk_test_e2edummykey`
  5. SHELL: `node scripts/connect/connect.mjs logs`
  6. SHELL: `node scripts/e2e/co.mjs list --prefix ai-assistant-`
- Assert:
  A1 [SHELL] both redeploys reach `Deployed`; the `post-deploy:` log lines show the "exists" paths (probe object and containers are found, not recreated) and no failure.
  A2 [CO] no duplicate or orphan objects appear in the `ai-assistant-` containers after the second run; existing sessions and settings are untouched.
  A3 [SHELL] the dummy key never appears in the printed logs.
- Cleanup: restore the previous provider configuration (`configure STRIPE_SECRET_KEY=` empty).
- Evidence: post-deploy-1.txt, post-deploy-2.txt (masked)
- Status: NOT RUN

### E2E-U-06 - Undeploy leaves the data
- Spec: u-connect-deployment-no-gha / preUndeploy
- Tags: slow, destructive, needs:deployment
- Env: sandbox
- Budget: 900
- Pre: `E2E_ALLOW_DESTRUCTIVE=1`; the throwaway deployment of `E2E-U-04`, never the shared one.
- Steps:
  1. SHELL: `node scripts/e2e/co.mjs list --prefix ai-assistant- > before.txt`
  2. SHELL: `node scripts/connect/connect.mjs delete --yes`
  3. SHELL: `node scripts/connect/connect.mjs status`
  4. SHELL: `node scripts/e2e/co.mjs list --prefix ai-assistant- > after.txt; diff before.txt after.txt`
- Assert:
  A1 [SHELL] the deployment is gone and the `pre-undeploy:` log line says the data was retained in the containers.
  A2 [CO] only the probe object of the lifecycle scripts differs between before and after; sessions, messages, settings, tokens and feedback are still there.
- Cleanup: a deliberate purge is a manual, irreversible operator action (`cd service && npm run persistence:purge`) and is not part of this card.
- Evidence: undeploy-output.txt, diff.txt
- Status: NOT RUN

## Coverage

- Deployed frontends: `E2E-U-01` to `E2E-U-03`; two-phase order: `E2E-U-04`; idempotent lifecycle scripts: `E2E-U-05`; undeploy: `E2E-U-06`; cold start and restart persistence on the deployment: `E2E-V-09`, `E2E-V-04`; comma-separated `ADMIN_USER_IDS` on the deployment: `E2E-V-13`.
- Not covered: connector staging and publishing (`stage`, `publish`, `update-code`) beyond what `E2E-U-04` exercises, `commercetools connect validate` (run by `E2E-V-08`, needs Docker), rollback.
