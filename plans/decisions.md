# Decisions

Every question raised while the project was planned has been decided. This file records the outcome, the reason and the changes (OpenSpec change letters) it affects. Identifiers (`Q2`, `Q16`, ...) are the ones cited in the change documents under `openspec/`.

| Id | Decision | Rationale | Affects |
|---|---|---|---|
| Q1 | Not used (identifier reserved, no decision recorded). | Numbering started at Q2. | - |
| Q2 | Keep the Contentstack agent (a headless CMS integration, 15 tools). "No cms" only ever referred to an unmaintained internal package. | Keeps every feature except multi-tenancy. | J, P, Q |
| Q3 | Embed the Nimbus MCP server in the service process (stdio child). No second Connect `service` application and no shared-secret hop. | Connect applications cannot discover each other's URLs; embedding removes a deployment step and a secret. Measured to fit 1 CPU / 512 MB. | K, B |
| Q4 | Third-party credentials are Connect deployment configuration: secrets (`CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `ALGOLIA_MCP_URL`, `STRIPE_SECRET_KEY`) in `securedConfiguration`; non-secrets (`CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION`, `STRIPE_CONNECTED_ACCOUNT_ID`) in `standardConfiguration`. No admin UI, no Custom Objects. A provider is enabled if and only if its required keys are set. | Simplest model; secrets never pass through the application UI. | B, C, E, J, Q, U, W |
| Q5 | Keep the identity-mode Managed MCP flow (per-user OAuth, refresh tokens stored encrypted). | It is the shipped design. | I |
| Q6 | Administrators are decided only by `ADMIN_USER_IDS`: comma-separated Merchant Center / Identity user ids in the service's `standardConfiguration`, compared with the user id of the verified forward-to JWT. An empty list means nobody is an administrator (fail closed, startup warning). Administrators read their own id from a read-only "Your user ID" line (mc-app Settings > About, view-app footer) and set it with a `configure` redeploy. No permission group, no e-mail model. A comma-separated value is expected to arrive as one configuration key (checked in the deployment rehearsal; the service also tolerates `;` and whitespace). | A user id from a signed token cannot be forged; the earlier implementation trusted a browser-supplied address. | C, D, G, I, N, O, P, Q, S, U, V, W |
| Q7 | Drop the GECX widget endpoint. | Unused widget leftover. | - |
| Q8 | Keep the admin backoffice (transcripts, feedback), admin-only, with `audit.admin_action` log lines (see Q26). | Keeps the feature. | N, Q |
| Q9 | Google Cloud: every setting has a default and is configurable in the connector's `service` configuration (`GCP_PROJECT_ID`, `GCP_VERTEX_LOCATION` default `us-central1`, `GCP_BIGQUERY_DATASET_ID` default `aiassistant`, `GCP_BIGQUERY_LOCATION`, `GCP_BUCKET_NAME` default `<project>-ai-assistant-images`, `GCP_BUCKET_LOCATION`, `IMAGE_URL_MODE` = `private` or `public`, default `private`). All Google services (Vertex Gemini including the image model, BigQuery, Cloud Storage) use the single service-account key `GCP_SA_KEY_BASE64` (secured configuration, Base64 of the whole JSON); no API keys. Private mode: bucket private, no signed URLs, images streamed by the service endpoint `GET /service/files/:sessionId/:fileName` (owner or administrator, `Cache-Control: private, no-store`). The service creates the dataset and bucket on first use if missing. Roles: `roles/aiplatform.user`, `roles/bigquery.jobUser`, `roles/bigquery.dataEditor`, and either a pre-created bucket with `roles/storage.objectAdmin` on it (recommended) or `roles/storage.admin` on the project. | One credential, least surprise, private by default. | F, L, B, C, U, W |
| Q10 | Naming: repository `commercetools/ai-assistant`; packages `@commercetools-labs/ai-assistant-{service,mc-app,composed-apps,mc-view-app}`; applications "AI Assistant" and "AI Assistant Pages"; entry-point paths `ai-assistant` and `ai-assistant-pages`; npm for the service, yarn for the frontends. | Follows the labs publication rules. | A, X |
| Q11 | Drop the Anthropic and OpenAI providers; Vertex Gemini only. | Smaller review surface. | F |
| Q12 | Tests run against a scratch commercetools project and two Merchant Center users: user A (user id in `ADMIN_USER_IDS`) and user B (not). GCP region `us-central1`. Needs prerequisites M3, M6 to M10. | Covers both authorization paths. | V, all |
| Q13 | Messages and feedback are kept indefinitely; there is no retention job (documented). Same as Q25. | Keeps behaviour; simplest. | E, N |
| Q14 | Sandbox plus a private connector, release `0.1.0` (also Q50). No certification or production publication for v1. | Scope of the first release. | U, Z |
| Q15 | The user interface is English only (translation files stay empty). | Matches the original behaviour. | O |
| Q16 | `plans/` and `openspec/` are published as design documentation after a scripted scrub. Removed from the public commit: agent configuration, the agent instructions file, the internal gate wrapper, internal tooling, the internal path manifest, the run-evidence folder, the question inboxes and the person-addressed working notes (replaced by this file, `plans/prerequisites.md` and `plans/design-history.md`). | The design documentation is valuable to adopters. | A, W, X, Z |
| Q17 | System prompt, tool-call-log mode and identity MCP binding are administrator-only (an administrator is a user id in `ADMIN_USER_IDS`). | Earlier behaviour allowed any project member. | G, I, Q |
| Q18 | System prompt capped at 20 000 characters; the apps keep broad `oAuthScopes` minus `*_api_clients`. | Hardening. | G, O, R |
| Q19 | Gravatar (hash of the e-mail sent to gravatar.com) is kept and disclosed in the README. | Keeps behaviour, transparent. | P |
| Q20 | Digest, suggestions and follow-ups are always on; an administrator gets an "Open backoffice" link. | Keeps behaviour. | G, Q |
| Q21 | Chat budget stays 270 s plus a 30 s reserve (Connect has a 5 minute request limit). | Design constraint. | H |
| Q22 | Keep the analyzer's prompt wording as it is. | No behaviour change. | H |
| Q23 | When the time limit is reached the user gets a text notice only, no "Continue" chip. | Simplest correct behaviour. | H, P |
| Q24 | The system prompt is injected once into the orchestrator. | Behaviour change, avoids duplication. | H |
| Q25 | Feedback and messages are kept indefinitely (see Q13). | See Q13. | N, Q |
| Q26 | The backoffice stays; administrators read all transcripts; `audit.admin_action` log lines record admin access. | Accountability. | N, Q |
| Q27 | Upload cap 10 MiB and snapshot cap 8 MiB stay. | Keeps limits. | N, Q |
| Q40 | `composed-apps` does not talk to the service. | Not needed. | R |
| Q41 | The composed-pages Custom Object container name `shared-composed-pages` is kept. | Compatibility. | M, R |
| Q42 | The scope set of the applications is the one listed in the change documents. | See changes O and R. | O, R |
| Q43 | No delete toggles and no 500-entry cap. | Simplification. | R, S |
| Q44 | Per-page conversations in the custom view. | Keeps behaviour. | S |
| Q45 | Keep the 65 custom-view locators. | Keeps behaviour. | S |
| Q46 | The second test user is a non-administrator, user B (see Q12). | Covers the negative path. | V |
| Q47 | The local tunnel tool is `cloudflared`. | Free, no account. | V |
| Q48 | The support contact is GitHub Discussions. | Labs repositories are unsupported. | W |
| Q49 | Keep the note about the scrubbed Gemini schema as a known issue. | Honest documentation. | W |
| Q50 | Release `0.1.0` as a private connector (see Q14). | See Q14. | U, Z |
| Q51 | The internal archive is a private tarball. | No public artefact before approval. | Z |
| Q52 | Documentation screenshots are redacted. | No project data in public images. | W |

Smaller design choices (BigQuery caps of 200 MB / 60 s / 500 rows, session tables expiring after 7 days, composed-page validation errors, Contentstack region key, Algolia SSRF guard, Nimbus pin) are recorded in the `design.md` of the change that owns them.
