# Handover notes

State at hand-over: the code is built and tested locally; nothing has been deployed, no Chrome scenario has run and no change is archived (see `acceptance.md`, `readiness.md`, `open-items.md`). Read section 12 first.

## What was built

A single-project commercetools Connect connector, unsupported commercetools Labs project, version 0.1.0: one `service` application (Express, mount `/service`) and three Merchant Center applications (`mc-app` chat, `composed-apps` pages, `mc-view-app` Custom View). State is stored as commercetools Custom Objects (containers prefixed `ai-assistant-`, plus `shared-composed-pages`); Gemini runs on Vertex AI with one Base64 service-account key that also serves BigQuery and Cloud Storage; Nimbus MCP runs as an embedded child process; there are no GitHub Actions.

## Repository map

`connect.yaml` (four applications, scopes, configuration), `service/` (npm, Node 22, `src/` by domain, `tests/`), `mc-app/`, `composed-apps/`, `mc-view-app/` (yarn, one lockfile each), `scripts/` (repository checks, `scripts/connect/` deployment helper, `scripts/docs/`, `scripts/e2e/`, `scripts/release/`, `scripts/internal/` publication toolkit, never published), `docs/` (architecture, configuration, deployment, operations, security, troubleshooting, runbook), `e2e/` (Chrome playbooks), `plans/` and `openspec/` (design documentation), `FEATURES.md`, `CHANGELOG.md`.

## How to deploy, update and roll back

Follow `docs/deployment-runbook.md` (sections 3, 4, 5, 6). Commands: `node scripts/connect/connect.mjs stage`, `publish`, `deploy`, `finalize`; update with `update-code --tag vX.Y.Z`; roll back by running `update-code --tag <previous tag>` (stage the old tag, publish, redeploy with `--updateConnector`); remove with `delete --yes`. Data in Custom Objects stays after `delete`. Add `--dry-run` to see the commands. Two-phase deploy: the service fails closed until `MC_AUDIENCE` is set by `finalize`. Not yet verified on a real deployment: the ten platform facts U1-U10 (runbook section 11).

## Secrets inventory and rotation

| Name | Kind | Stored in | Rotate |
|---|---|---|---|
| `GCP_SA_KEY_BASE64` | secured | Connect configuration | New key, Base64 on one line, redeploy with the new value (`configure` refuses it by design; use a full `deploy`/redeploy). |
| `ENCRYPTION_KEY`, `ENCRYPTION_KEY_PREVIOUS` | secured | Connect configuration | Set the new key as `ENCRYPTION_KEY` and the old one as `ENCRYPTION_KEY_PREVIOUS`, redeploy, then `cd service && npm run build && npm run persistence:reencrypt -- --dry-run` and again without `--dry-run` (needs project credentials in `service/.env.local`; see `docs/configuration.md`). Without the old key stored identity tokens cannot be read: users must reconnect. |
| `CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `ALGOLIA_MCP_URL`, `STRIPE_SECRET_KEY` | secured | Connect configuration | `node scripts/connect/connect.mjs configure KEY=VALUE` (a configuration redeploy). |
| `CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION`, `STRIPE_CONNECTED_ACCOUNT_ID` | standard | Connect configuration | same command |
| Connect API client secret | local | `scripts/connect/.env.connect` (git-ignored) | Create a new API client in the commercetools project, update the file, delete the old client. |
| `ADMIN_USER_IDS` | standard (not a secret) | Connect configuration | see next section |

## Administrators

Administrator access is decided only by the user id in `ADMIN_USER_IDS` (comma-separated). An empty list means nobody is an administrator. To find a user's id: that user opens the chat application, Settings, About ("Your user ID"), or the footer of the Custom View. To add or remove an administrator: `node scripts/connect/connect.mjs configure ADMIN_USER_IDS=<id-a>,<id-b>` (a configuration redeploy). It takes effect when the instances restart. Whether the comma list survives the CLI as one value is open item U10; test it with two ids before relying on it. No Merchant Center permission group grants administration.

## Data retention

Messages, sessions and feedback are kept until an operator deletes the Custom Objects; there is no automatic deletion. Deleting a session does not delete its feedback and there is no API to delete a user's data. See `docs/operations.md` (Data retention, Backup and restore) and `docs/privacy.md`. A retention job is backlog item B-01 and not planned.

## Logs and troubleshooting

`node scripts/connect/connect.mjs logs [--application service] [--since 1h]`; JSON lines with a correlation id (`X-Correlation-Id` is accepted, not echoed). Startup lines starting `post-deploy:` report the lifecycle checks (service-account key, Vertex, Custom Object probe, providers, Google analytics bootstrap). Entry points: `docs/troubleshooting.md` (administrator access, authentication, Managed MCP, chat, Google Cloud, composed pages) and `docs/operations.md`.

## How to run the E2E suite

`e2e/README.md` (attach to a dedicated Chrome, environments, tiers) and `e2e/02-regression-order.md` (tiers 0-8). Needs: a scratch commercetools project, two Merchant Center users (admin A, non-admin B), a tunnel for local runs, a sandbox deployment for the deployed run. Evidence goes to the git-ignored `plans/evidence/<run-id>/`; build the report with `node scripts/e2e/report.mjs <run-folder>`; lint cards with `node scripts/e2e/extract-scenario-ids.mjs --lint --dangling --trace --tiers`.

## How to add a tool source, a locator or an agent

Tool source: `service/src/tool-sources/README.md` and `CONTRIBUTING.md` (register a `ToolSource` with `kind`, optional `description`, `isEnabled`, `getTools`, `getPrompt`; the agent key is the source name). Locator: the Custom View configuration file `mc-view-app/custom-view-config.mjs` (65 locators today; keep scopes equal to the registration). Agent: the registry in `service/src/agents/` (see `docs/how-it-works.md`). Every new key goes into `connect.yaml` and the checker tables in `scripts/check-connect-layout.mjs`, then `node scripts/docs/gen-config-table.mjs README.md docs/configuration.md` regenerates the tables.

## Known limitations

From the register (`open-items.md`): first write of a never-written Custom Object can lose a concurrent update; digest and suggestions may not run after the response closes on Connect (R-G1, unverified); session list capped at 500; export is CSV only; no hot reload of `ADMIN_USER_IDS`; Stripe menu has four names without tools; model ids are unverified on Vertex; `GEMINI_AGENT_MODEL_NAME` is reserved and unused; e-mail `userLabel` is stored in clear text; Gravatar request in the chat application (see `docs/privacy.md`); first frontend feature checks happened without a browser.

## Contacts

Not defined: the discussion channel and the private vulnerability contact are owner decision RQ10. Fill them into `SUPPORT.md` before publication.

## Reserved letter Y

The change letter `Y` is reserved for a post-v1 follow-up; letter `T` was withdrawn. Neither exists.

## Where internal evidence is archived

Not decided (RQ13). Default: a private archive of the development repository. `plans/evidence/` is git-ignored and unpublished; copy it out of the worktree after the real run (`tar czf <private location>/ai-assistant-release-evidence-v0.1.0.tgz plans/evidence`) and never to a public place. The tracked summaries of this run are in `plans/implementation/z-release/`.

## 12. What blocks v0.1.0

See `open-items.md` section 1 (Z-01 to Z-09) and the "blocks release" rows of sections 2 and 3: no sandbox deployment, no E2E run, `connect validate` not run, gate not CLEAR, nothing archived, owner decisions pending. The release procedure to follow once they are cleared is in `release-log.md`.
