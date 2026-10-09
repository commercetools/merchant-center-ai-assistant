> Historical inbox (merged into `plans/owner-questions.md`). Items about `ADMIN_EMAILS`, the Identity admin sign-in, verified e-mail, BQ-ID1/OQ-ID* and M25 are SUPERSEDED by the 2026-10-09 decision `ADMIN_USER_IDS` only (see `plans/06-amendments-applied.md` rows 17-18). This folder is not published (change X).

# New or refined manual steps from changes A, B, U, X

Proposed ids continue after M13. "Refines" marks an existing step that needs extra detail.

| ID | Step | Needed by | Details |
|---|---|---|---|
| M4 (refine) | Connect CLI login **and** a client for the read-only REST helper | U, V | One API client in the target project with scopes `manage_connectors`, `manage_connectors_deployments` and `manage_api_clients` (the last one lets Connect generate the API client from `inheritAs`; docs: connect/hosts-and-authorization). Log the CLI in with `commercetools auth login --client-credentials ...` and put the same id/secret (secret never committed) in `scripts/connect/.env.connect` as `CONNECT_CLIENT_ID` / `CONNECT_CLIENT_SECRET`. |
| M5 (refine) | Google service-account key must be Base64 of the **whole JSON on one line** | F, U, V | `base64 < key.json \| tr -d '\n'`; roles per Q9. The `postDeploy` script rejects anything else. |
| M6/M7 (refine) | Registration values | B, U, O, S | Register with a placeholder URL (for example `https://placeholder.invalid`); record the three ids and the entry-point paths into `scripts/connect/.env.connect` (`MC_APP_CUSTOM_APPLICATION_ID`, `COMPOSED_APPS_CUSTOM_APPLICATION_ID`, `MC_VIEW_CUSTOM_VIEW_ID`, and the two entry paths). The Custom View `oAuthScopes` entered in the Merchant Center must equal `custom-view-config.mjs`. |
| M9 (refine) | After `finalize` the script prints three URLs; paste each into the matching registration | U, V | Possible only in the Merchant Center UI. |
| M12 (refine) | Owner approval record also covers removal of `.claude/`, `CLAUDE.md` and the file list in `plans/evidence/x/approval.md` | X | The agent never ticks it. |
| M13 (refine) | Tag `v0.1.0` on the **public** repo, then `connectorstaged create` with the public URL | Z | Rehearsals before publication use M15. |
| M14 (new) | Docker Desktop (daemon) must be running on any machine that runs `commercetools connect validate` | B, C, O, U, X | The CLI builds with Buildpacks; without the daemon it fails with "Cannot connect to the Docker daemon" (observed 2026-10-08). |
| M15 (new) | Create a **private** staging repository for rehearsals and grant the GitHub user `connect-mu` read access | U, V | Connect clones the connector by URL and tag; the public repo does not exist until X. This private repo is separate from the public one (the public one is created public from the start). Give the agent the clone URL. |
| M16 (new) | Put the Connect API client secret into the agent's environment (untracked file) | U | Same client as M4; never in chat or git. |
| M17 (new, optional) | Ask the labs tooling maintainers to extend `policy.json` (XQ3) | X | Not blocking. |
