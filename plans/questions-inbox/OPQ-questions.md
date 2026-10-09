> Historical inbox (merged into `plans/owner-questions.md`). Items about `ADMIN_EMAILS`, the Identity admin sign-in, verified e-mail, BQ-ID1/OQ-ID* and M25 are SUPERSEDED by the 2026-10-09 decision `ADMIN_USER_IDS` only (see `plans/06-amendments-applied.md` rows 17-18). This folder is not published (change X).

> SUPERSEDED 2026-10-09 (historical inbox): the admin model is now `ADMIN_EMAILS` + a verified e-mail from the Identity admin sign-in; the `assistant-admin`-style permission group, its key override, claim parsing and permission-capture step no longer exist; test users are an admin user and a non-admin user instead of Teams. See `../owner-questions.md` and `../06-amendments-applied.md`. Entries below that mention the old mechanism are retained for history only.

# Owner questions from changes O, P, Q (frontends)

Local ids OQ1.. ; "Refined Q-id" is the id to assign when merging into `plans/owner-questions.md`.

| Local | Refined Q-id | Question | Default used | Affects |
|---|---|---|---|---|
| OQ1 | Q17 | Admin permission key names differ per surface: a Custom Application issues `Manage<EntryPointPascalCase>AssistantAdmin` (e.g. `ManageAiAssistantAssistantAdmin` for entry path `ai-assistant`), a Custom View issues `ManageAssistantAdmin` (docs: oauth-scopes-and-user-permissions). The JWT claim values look like `can<Permission>`. Confirm the service (D) should accept both and derive the app-specific key from `ENTRY_POINT_URI_PATH` config. | Accept both; verified empirically in E2E-O-03 and recorded | D, O, S, N |
| OQ2 | Q18 | Keep the broad `oAuthScopes` of mc-app/composed-apps (about 21 view / 31 manage, needed by arbitrary generated-page GraphQL incl. `mutation` actions) or trim to a fixed minimum? | Keep legacy list minus `*_api_clients` | O, M, R |
| OQ3 | Q19 | Gravatar: the avatar sends a SHA-256 hash of the user's e-mail to gravatar.com. Keep for the open-source version? | Keep, disclosed in README privacy note | P |
| OQ4 | Q20 | Add a small admin-only "Open backoffice" link in Settings > Advanced (the legacy UI has no navigation to `/backoffice`, only the URL)? | Yes | Q, N |
| OQ5 | Q21 | **MOOT (DECIDED 2026-10-09, Q4: provider credentials are Connect `securedConfiguration`/`standardConfiguration`).** Provider credentials (Contentstack/Algolia/Stripe) must be write-only in the browser (service returns masked/omitted secrets). Acceptable? (tied to Q4) | Yes | Q, J |
| OQ6 | Q22 | Should non-admins be able to see the system prompt (legacy: ungated)? | Hidden for non-admins | Q, G |
| OQ7 | Q23 | Does Connect build Merchant Center apps with yarn (uses committed `yarn.lock`) or npm? Docs say yarn; skill says npm install in each folder. | yarn.lock committed, scripts work with both | O, U |
| OQ8 | Q24 | Custom View `connect.yaml` keys: skill says `CUSTOM_VIEW_ID` + `CLOUD_IDENTIFIER` only; docs example also shows `ENTRY_POINT_URI_PATH`. | Skill version | B, O, S, U |
| OQ9 | Q25 | First-paint optimisation: keep the legacy bootstrap "workspace" prefetch (session + messages + list + digest in `/auth/session`)? | Dropped for simplicity; revisit after measuring (E2E-P-01) | D, G, P |
| OQ10 | Q26 | Test accounts: two Merchant Center users on the scratch project, one in a Team with `assistant-admin` Manage, one view-only (for E2E-O-03, E2E-Q-02/09/10). | Needed once | O, Q, V |
