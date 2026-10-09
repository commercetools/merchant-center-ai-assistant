# Owner questions

Status 2026-10-09: all questions are decided or carry a default; no blocking question is open. (This file is internal and not published; change X writes neutral `plans/decisions.md`, `plans/prerequisites.md` and `plans/design-history.md` for publication.)

Answers change the plan. Each has a **default** the agent will use if you do not answer, so nothing blocks. Maintained while authoring specs; the agent will ask these (in this order) after all specs are drafted.

| # | Question | Default used in the plan | Affects |
|---|---|---|---|
| Q2 | **DECIDED 2026-10-09: keep Contentstack.** (It is a headless CMS agent, 15 tools; "no cms" meant only the old `cms` package.) | Keep Contentstack | J, P/Q |
| Q3 | **DECIDED 2026-10-09: embed Nimbus MCP in the service** (no second Connect `service` app, no shared-secret hop). | Embed | K, B |
| Q4 | **DECIDED 2026-10-09: `securedConfiguration`.** Third-party credentials (Contentstack/Algolia/Stripe) are Connect deployment configuration: secrets in `securedConfiguration` (`CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `ALGOLIA_MCP_URL`, `STRIPE_SECRET_KEY`), non-secrets in `standardConfiguration` (`CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION`, `STRIPE_CONNECTED_ACCOUNT_ID`). No admin UI, no Custom Objects; a provider is enabled iff its required keys are set. | securedConfiguration | B, C, E, J, Q, U, W |
| Q5 | **DECIDED 2026-10-09: keep identity-mode MCP** (per-user OAuth, refresh tokens stored encrypted). | Keep identity mode | I |
| Q6 | **DECIDED 2026-10-09 (final, supersedes the earlier e-mail model): admin = `ADMIN_USER_IDS` only.** Comma-separated Merchant Center / Identity user ids in the connector's `standardConfiguration` (`service`); verified by the signed forward-to JWT's user id (change D). No `ADMIN_EMAILS`, no Identity admin sign-in, no `assistant-admin` permission group. Empty list = nobody is admin (fail closed, documented, startup warning). Admins learn their own id from a read-only 'Your user ID' line (mc-app Settings > About, view-app footer) and set it with a `configure` redeploy. Whether `--configuration` accepts a comma-separated value as one key: Connect docs describe configuration values as plain strings that act as environment variables and the CLI format `{key}={value}`; comma splitting is not documented, so it should arrive as one key - rehearsal check in change U (the service also tolerates `;`/whitespace separators). | `ADMIN_USER_IDS` | C, D, G, I, N, O, P, Q, S, U, V, W |
| Q7 | **DECIDED 2026-10-09: drop the GECX widget endpoint** (`/gecx/config/:tenant`, `gecx-react`). | Drop | - |
| Q8 | **DECIDED 2026-10-09: keep the admin backoffice** (admin-only = `ADMIN_USER_IDS`) with `audit.admin_action` log lines (see Q26). | Keep | N, Q |
| Q9 | **DECIDED 2026-10-09 (owner):** (1) every Google Cloud setting has a sensible default AND is configurable through the connector's `connect.yaml` `service` configuration (standard unless secret): `GCP_PROJECT_ID` (default: `project_id` of the SA key), `GCP_VERTEX_LOCATION` (default `us-central1`; replaces the old `GCP_LOCATION`), `GCP_BIGQUERY_DATASET_ID` (default `aiassistant`), `GCP_BIGQUERY_LOCATION` (default `us-central1`), `GCP_BUCKET_NAME` (default `<gcp project id>-ai-assistant-images`), `GCP_BUCKET_LOCATION` (default `us-central1`), `IMAGE_URL_MODE` = `private` \| `public` (default `private`); no separate BigQuery project key. (2) ALL Google services (Vertex Gemini incl. the image model, BigQuery, Cloud Storage) authenticate with the ONE service-account key `GCP_SA_KEY_BASE64` (securedConfiguration, Base64 of the whole JSON); no other credential, no API keys. (3) Private mode: bucket private, objects never public, NO signed URLs; images are read by the frontend only through the backend's authenticated streaming endpoint `GET /service/files/:sessionId/:fileName` (owner or admin, `Cache-Control: private, no-store`); stored message parts reference the relative path `/files/<sessionId>/<file>`; the Merchant Center frontends load them with `forwardToFetch` into blob URLs. Public mode: bucket-level `allUsers` objectViewer on a uniform-access bucket, stored URL is the public bucket URL. (4) The service creates the BigQuery dataset and the bucket on first use if missing and the SA may (postDeploy `checkGcpAnalytics()` reports/creates idempotently). IAM: `roles/aiplatform.user`, `roles/bigquery.jobUser` + `roles/bigquery.dataEditor` (project level, includes dataset create), and for the bucket either (recommended, least privilege) a pre-created bucket + `roles/storage.objectAdmin` on it, or (convenience) `roles/storage.admin` on the project so the service creates it. | Private images, defaults as listed | F, L, B, C, U, W |
| Q10 | **DECIDED 2026-10-09 (as proposed; also AQ1): naming.** GitHub repo `commercetools/ai-assistant`; packages `@commercetools-labs/ai-assistant-{service,mc-app,composed-apps,mc-view-app}`; apps 'AI Assistant' and 'AI Assistant Pages'; entry-point paths `ai-assistant` and `ai-assistant-pages`; npm for the service, yarn for the frontends. | As stated | A, X |
| Q11 | **DECIDED 2026-10-09: drop the Anthropic/OpenAI providers** (Vertex Gemini only). | Drop | F |
| Q12 | **DECIDED 2026-10-09 (owner provides): a scratch commercetools project and TWO Merchant Center users** - user A whose user id is in `ADMIN_USER_IDS` and user B whose user id is not (also Q46). Region `us-central1` GCP per `ct-region-gotchas`. Needs manual steps M3, M6-M10. | Scratch project + users A/B | V, all |
| Q13 | **DECIDED 2026-10-09: messages and feedback are kept forever, no retention job** (documented in the docs; same as Q25). | Yes | E, N |
| Q14 | **DECIDED 2026-10-09: sandbox + private connector, release `0.1.0`** (also Q50, UQ1). No certification/production publication for v1. | Sandbox + private connector | U, Z |
| Q15 | **Languages**: UI strings are hardcoded English (i18n files empty). Keep English-only? | Yes | O |
| Q16 | **DECIDED 2026-10-09 (also AQ2/XQ1): keep `plans/` and `openspec/` in the published repository as design documentation, scrubbed.** Still removed from the public commit: `.claude/`, `CLAUDE.md`, `scripts/labs-gate.sh`, `scripts/internal/`, `scripts/internal-paths.json` and anything else internal. The planning and spec files themselves must pass the labs gate: change X specifies a SCRUB step (absolute local paths, private-repo references, `commercetools-demo`, project ids, tunnel/`.run.app` examples, person-addressed owner/manual-step wording, `plans/evidence/` and `plans/questions-inbox/` removed or neutralised) and a leak scan that must find zero hits; archived changes under `openspec/changes/archive/` are published after the same scrub. | Keep, scrubbed | A, W, X, Z |

---

# Additional questions raised while authoring the specs (merged 2026-10-08)

Source inbox files are kept in `questions-inbox/` (historical; full tables, local ids in brackets; they are not published, see change X). Each has a default; **only the "blocking-ish" ones need a real answer.**

## Most important (answer these first)

| # | Question | Default | Spec |
|---|---|---|---|
| Q9+ | DECIDED 2026-10-09 (see Q9) [CQ6, IQ11 moot and removed]. Still open: IQ10 BigQuery billing enabled on the project (load-job fallback exists) | billing required, fallback in sandbox | F, L |
| Q12+ | DECIDED 2026-10-09 (see Q12): scratch project + admin user A + non-admin user B (by user id); dedicated Chrome profile(s) for DevTools MCP (M8, M10) | as stated | V, all |
| Q3 | DECIDED 2026-10-09: Nimbus embedded in the service [IQ8] (measured to fit 1 CPU/512 MB) | Embed | K |
| Q2 | DECIDED 2026-10-09: Contentstack kept | Keep | J |
| Q4 | DECIDED 2026-10-09: third-party credentials are Connect `securedConfiguration`/`standardConfiguration` (no UI, no Custom Objects). The write-only/masking questions [CQ3, IQ5, OQ5] are moot and removed | securedConfiguration | B,C,J,Q,U |

## Behaviour changes to approve (all default = yes)

| # | Question | Spec |
|---|---|---|
| Q17 | DECIDED 2026-10-09: system prompt, tool-call-log mode and identity MCP binding are **admin-only**, where admin means a user id in `ADMIN_USER_IDS` (legacy: any project member) [GQ1] | G,I,Q |
| Q18 | System prompt capped at 20 000 chars [GQ2]; keep broad `oAuthScopes` of the apps minus `*_api_clients` [OQ2/RQ4] | G,O,R |
| Q19 | Gravatar (hash of e-mail sent to gravatar.com) kept, disclosed in README [OQ3] | P |
| Q20 | Digest/suggestions/follow-ups always on; add admin "Open backoffice" link [GQ4, OQ4] | G,Q |
| Q21 | DECIDED 2026-10-09: chat budget stays 270 s + 30 s reserve [HQ1] | H |
| Q22 | Keep the analyzer's prompt quirks as-is [HQ2] | H |
| Q23 | Time-limit: text notice only, no "Continue" chip [HQ3] | H,P |
| Q24 | System prompt injected once into orchestrator (behaviour change) [HQ4] | H |
| Q25–27 | DECIDED 2026-10-09: feedback and messages kept forever (no retention job), backoffice kept with `audit.admin_action` log lines, admins read all transcripts; upload cap 10 MiB / snapshot 8 MiB stay [NQ1–3] | N,Q |
| CQ5 | DECIDED 2026-10-09: backoffice and feedback may show a browser-supplied e-mail only as a display-only, unverified, sanitised (max 120 chars, text-only) `userLabel`; never for authorization, keys, filters or ownership; verified identity is `userId`. (CQ2, the permission-claim fallback, is moot and removed.) | D,N,Q |
| CQ7 | Keep model split (`agent` tier gemini-2.5-flash vs 3.x main) [BQ1: model ids to be verified in F] | F,H |
| CQ1 | Stay on `platform-sdk ^8`/`ts-client ^4` (npm has 9/5) | C |
| CQ8 | Request-body ceiling on Connect unknown; measured on first sandbox deploy | C,N |
| IQ2/IQ3 | Needs a real identity-mode MCP server to confirm refresh-token rotation and https callback in local dev | I |
| IQ4,6,7,9,12,13,15,16 | Contentstack region key (`CONTENTSTACK_REGION`); Algolia SSRF guard (at config validation); Stripe toolkit upgrade spike; Nimbus pin 3.5.1 vs 3.6.0; BigQuery caps (200 MB/60 s/500 rows) ; session tables expire after 7 days; composed-page validation hard errors; `createdBy` user id stored | J,K,L,M |
| Q40–Q52 | composed-apps without service (Q40); composed-pages container name `shared-composed-pages` kept (Q41); scope set (Q42); no delete toggles/500 cap (Q43); per-page custom-view conversations (Q44); keep 65 locators (Q45); second test user = non-admin user B, DECIDED (Q46); tunnel tool `cloudflared` (Q47); SUPPORT contact = GitHub Discussions (Q48); keep scrubbed Gemini-schema known-issues note (Q49); release `0.1.0` private connector (Q50); private tarball for internal archive (Q51); redacted screenshots in docs (Q52) | R,S,V,W,Z |
| AQ/BQ/UQ/XQ | AQ1 package names, BQ2 npm/yarn, BQ3 entry paths: DECIDED (Q10); AQ2/XQ1 public commit contents: DECIDED (Q16); sandbox-only Connect (UQ1): DECIDED (Q14); private staging repo (UQ3); commit author/message (XQ2); ask labs maintainers to extend policy.json (XQ3) | A,B,U,X |
| OQ7 | Does Connect build MC apps with yarn or npm? (verified in U rehearsal). Also in the U rehearsal: a comma-separated `ADMIN_USER_IDS=a,b` given to `--configuration` arrives as ONE key (Q6) | O,U |

