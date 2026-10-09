# Prerequisites

Steps that need a person with the right access (they cannot be automated). Identifiers (`M1`, `M12`, ...) are the ones cited in the change documents under `openspec/`.

| Id | Prerequisite | Provided by | Needed by | Details |
|---|---|---|---|---|
| M1 | Create the public GitHub repository `commercetools/ai-assistant` at publication time. | Organisation member with repository-creation rights | X | Never create it private first: a force-push does not remove commits that were once public. Run only after M12. |
| M2 | The organisation custom property `commercetools-labs` (true/false) exists. | Organisation admin | X | Marking the repository fails with an HTTP 422 if the property is missing. |
| M3 | A scratch commercetools project and a development API client (`view_key_value_documents`, `manage_key_value_documents`); values go into the git-ignored `service/.env.local`. | Test-account holder | E and every change with integration tests, V | Variables: `CTP_PROJECT_KEY`, `CTP_REGION`, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_SCOPE`, `CTP_API_URL`, `CTP_AUTH_URL`. |
| M4 | A Connect-capable API client (`manage_connectors`, `manage_connectors_deployments`, `manage_api_clients`) and `commercetools auth login`. | Test-account holder | U, V | Id and secret in the untracked `scripts/connect/.env.connect`. |
| M5 | A Google service-account key with the roles of Q9; Vertex AI, BigQuery (billing) and Cloud Storage enabled; single-line Base64 of the whole JSON in `GCP_SA_KEY_BASE64`. | Test-account holder | F, L, V | Never commit the key; delete the local key file afterwards. |
| M6 | Register the two Custom Applications "AI Assistant" and "AI Assistant Pages" in the Merchant Center with a placeholder URL. | Test-account holder | O, U, V | Hand over the application ids and entry-point paths; the URL is fixed last. |
| M7 | Register the Custom View "AI Assistant" with a placeholder URL. | Test-account holder | S, U, V | Its `oAuthScopes` must equal the custom-view configuration file. |
| M8 | Log in to the Merchant Center once in the browser profile used for end-to-end tests and keep the session alive. | Test-account holder | V | Single sign-on and 2FA cannot be automated. |
| M9 | After the first sandbox deploy, paste the deployed URLs into the application and view registrations. | Test-account holder | U, V | Only possible in the Merchant Center UI. |
| M10 | Two Merchant Center users on the scratch project: administrator A (user id in `ADMIN_USER_IDS`) and non-administrator B (not). Both belong to a team with the ordinary Manage permission. | Test-account holder | V, D, G, I, N, Q | Bootstrap: deploy, open mc-app as A, read the "Your user ID" line, run `configure ADMIN_USER_IDS=<id>`, refresh. |
| M11 | Create the identity-mode Managed MCP server in the scratch project (through the application's setup page) with one interactive consent. | Test-account holder | I, V | |
| M12 | Maintainer approval: LICENSE holder text, README banner, removal of internal paths, the scrubbed `plans/` and `openspec/` read-through and the leak-check result. | Maintainer | X | The publisher never ticks this step. |
| M13 | Push the release tag `v0.1.0` on the public repository, then `connectorstaged create`. | Maintainer | U, Z | Only after the repository is public. Rehearsal tags `-rc1` and `-rc2` go to a private staging repository. |
| M14 | Docker running (`connect validate` builds with buildpacks). | Developer | B, C, O, U, X | |
| M15 | A private staging repository and read access for the Connect staging user. | Maintainer | U, V | |
| M16 | The Connect client secret in an untracked environment file. | Test-account holder | U | Never in chat or git. |
| M17 | Optional: ask the labs tooling maintainers to add repository-specific names to the private policy. | Maintainer | X | |
| M18 | Install `cloudflared` for local tunnels. | Developer | V | |
| M19 | Optional: a second scratch project to test the project-key mismatch. | Test-account holder | V, D | |
| M20 | Create a product `e2e-product` in the scratch project and note its Merchant Center URL. | Test-account holder | S, V | |
| M21 | Optional provider credentials (Contentstack, Algolia, Stripe test key) set through Connect configuration (`configure KEY=VALUE`). | Test-account holder | J, U, V | Nothing is entered in the application UI. |
| M22 | Allow sandbox measurements: a roughly 4 minute chat turn, a 10 MB feedback upload, Nimbus cold start and memory. | Test-account holder | H, N, K | |
| M24 | Delete the end-to-end MCP server in the Merchant Center if the application cannot. | Test-account holder | Q | |
| M25 | Withdrawn together with the earlier e-mail administrator model; the id is not reused. | - | - | |
