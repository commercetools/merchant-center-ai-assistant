# Manual steps for the owner

Only things an agent cannot do. Each has an ID referenced from the specs. Do them **when the agent asks** (it will say which spec is blocked); none is needed before the specs are drafted.

| ID | Step | Needed by | Details |
|---|---|---|---|
| M1 | Create the GitHub repo `commercetools/ai-assistant` (public) — only at publication time | X | Needs org rights; do **not** create it private first (force-push does not remove history). Command in `labs-publish` Step 4 |
| M2 | Ensure the org custom property `commercetools-labs` exists (admin) | X | PATCH returns 422 if absent |
| M3 | Provide a **scratch commercetools project** and a dev API client (`manage_key_value_documents`, `manage_api_clients` not needed) → put in `service/.env.local` (git-ignored) | E and every spec with integration tests, V | Use the `presales:ct-project-bootstrap` guidance; region noted in Q12 |
| M4 | Run `! commercetools auth login` (Connect CLI) in this session or provide a Connect-capable API client | U, V | Interactive login |
| M5 | Provide a **Google service-account JSON** with the roles in Q9 (`aiplatform.user`, `bigquery.jobUser` + `bigquery.dataEditor`, and `storage.admin` on the project OR `storage.objectAdmin` on a pre-created bucket) → export `GCP_SA_KEY_BASE64=$(base64 < key.json \| tr -d '\n')` in `service/.env.local` | F, L, V | Never commit |
| M6 | **Register the Custom Applications in Merchant Center** (Settings → Developer settings → Custom Applications): `AI Assistant`, `AI Assistant Pages`, with a **placeholder URL** → give the agent the two `CUSTOM_APPLICATION_ID`s and entry-point paths | O, U, V | Connect skill: "register first, fix the URL last" |
| M7 | Register the **Custom View** `AI Assistant` (placeholder URL) → `CUSTOM_VIEW_ID` | S, U, V | |
| M8 | In Chrome (the profile the DevTools MCP attached to), **log in to Merchant Center once** and open the scratch project; keep the session alive | V | SSO/2FA cannot be automated |
| M9 | After the **first sandbox deploy** (agent runs it), paste the deployed URLs into the Custom Application/View registrations (step "update URL last") — the agent gives you the exact URLs; or grant the agent an MC-capable token if you prefer | U, V | Possible only in the MC UI |
| M10 | Provide the two Merchant Center users of the scratch project, A (user id in `ADMIN_USER_IDS`) and B (not) (see refined M10) | V | One-time |
| M11 | Create the **Managed MCP server** (identity mode) in the scratch project, or approve the agent doing it via the app's own setup page | I, V | Possible through the app UI (Chrome) once M8 done |
| M12 | Review and approve: LICENSE holder text, README banner wording, the scrubbed `plans/` and `openspec/` that are published (Q16, change X scrub report) | X | |
| M13 | Push the **release tag** that Connect stages from (`connectorstaged create` needs a git repo + tag URL) — only after repo is public | U (production-like), Z | |

---

# Refinements and new steps from spec authoring (merged 2026-10-08)

| ID | Step | Needed by |
|---|---|---|
| M3 (refined, CM1) | Scratch project + API client with only `view_key_value_documents` + `manage_key_value_documents`; fill `service/.env.local` (`CTP_PROJECT_KEY`, `CTP_REGION`, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_SCOPE`, `CTP_API_URL`, `CTP_AUTH_URL`); agent generates `ENCRYPTION_KEY` | E + all integration tests |
| M4 (refined) | Connect API client with `manage_connectors`, `manage_connectors_deployments`, `manage_api_clients`; `commercetools auth login --client-credentials …`; id/secret in untracked `scripts/connect/.env.connect` (also M16) | U, V |
| M5 (refined, CM2) | GCP: enable Vertex AI, BigQuery (billing), Cloud Storage; SA with `aiplatform.user`, `bigquery.dataEditor`+`jobUser` (project level: lets the service create the dataset) and EITHER `storage.admin` on the project (service creates the bucket `<project>-ai-assistant-images` on first use; convenient) OR (least privilege, recommended) you pre-create the bucket - optional step: `gcloud storage buckets create gs://<project>-ai-assistant-images --location=us-central1 --uniform-bucket-level-access --public-access-prevention` - and grant `storage.objectAdmin` on it only; the dataset `aiassistant` is created by the service (or optional `bq --location=us-central1 mk -d <project>:aiassistant`); **single-line** Base64 of whole JSON; delete local key file afterwards | F, L, V |
| M6/M7 (refined) | Register 2 Custom Apps + 1 Custom View with placeholder URL (`https://placeholder.invalid`); hand IDs + entry paths to `scripts/connect/.env.connect`; view `oAuthScopes` must equal `custom-view-config.mjs`; confirm the 65 locators are accepted (RM8) | B,O,S,U |
| M8 (refined, RM1/RM2) | Start dedicated Chrome: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="$HOME/.cache/ai-assistant-e2e-chrome"`, log in to MC once; configure DevTools MCP args `--browserUrl=http://127.0.0.1:9222 --redactNetworkHeaders --workspace=<repo>/plans/evidence` and **restart Claude Code** (the MCP also failed to connect in this session — fix/retry first) | V |
| M9 (refined, CM4) | After `finalize` the script prints 3 URLs: paste each into the MC registrations | U,V |
| M10 (refined, OM2/RM3; 2026-10-09) | Two Merchant Center users on the scratch project: **admin user A** whose Merchant Center user id is in `ADMIN_USER_IDS` and **non-admin user B** whose user id is not. Both are members of a Team with the apps' ordinary Manage permission (so they can open the apps); no custom permission group exists and no permission string is captured. Bootstrap: deploy, open mc-app as A, read the 'Your user ID' line (Settings > About), then `node scripts/connect/connect.mjs configure ADMIN_USER_IDS=<A's user id>` (or `.env.connect`; several ids are comma-separated), refresh, admin surfaces appear; repeat reading B's id only to confirm it is NOT listed. Each user needs a logged-in Chrome profile (M8: second profile and debugging port for B) | V, D, G, I, N, Q |
| M11 (refined, OM3/MS2) | Create identity-mode Managed MCP server (via the app UI); one interactive consent click in attached Chrome | I, V |
| M12 (refined) | Approval record: LICENSE holder, README banner, the scrub report and leak-scan result for published `plans/` and `openspec/`, removal of `.claude/`, `CLAUDE.md`, internal scripts; screenshot review (RM7) | X, W |
| M13 | Tag `v0.1.0` on the **public** repo then `connectorstaged create`; rehearsal tags `-rc1/-rc2` on staging repo | Z |
| **M14** | Docker Desktop running (`connect validate` builds with Buildpacks) | B,C,O,U,X |
| **M15** | Private **staging repo** + grant GitHub user `connect-mu` read access; give clone URL | U,V |
| **M16** | Connect client secret into agent env file (never chat/git) | U |
| **M17** (opt.) | Ask labs tooling maintainers to extend `policy.json` | X |
| **M18** (RM4) | `brew install cloudflared` (tunnel for local runs) | V |
| **M19** (RM5, opt.) | Second scratch project to test project-key mismatch | V,D |
| **M20** (RM9) | Create product `e2e-product` in scratch project; record its MC URL as `HOST_PAGE_URL` | S,V |
| **M21** (MS6, refined by Q4) | Optional provider credentials (Contentstack API key + management token, Algolia MCP URL, Stripe test restricted key): create the accounts/keys, then **set them through Connect configuration** (`scripts/connect/.env.connect` before `deploy`, or `node scripts/connect/connect.mjs configure KEY=VALUE`; keys `CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION`, `ALGOLIA_MCP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_CONNECTED_ACCOUNT_ID`); nothing is entered in the app UI | J, U, V |
| **M22** (MS7/HM2/NM1) | Allow sandbox measurements: ~4-minute chat turn (SSE limit), 10 MB feedback upload, Nimbus child cold-start/memory | H,N,K |
| **M24** (OM5) | Delete the `e2e-ai-assistant` MCP server in MC if the app cannot | Q |


Note: M25 (live e-mail-claim probe) was withdrawn on 2026-10-09 with the e-mail admin model; the id is not reused.
