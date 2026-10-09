> Historical inbox (merged into `plans/owner-questions.md`). Items about `ADMIN_EMAILS`, the Identity admin sign-in, verified e-mail, BQ-ID1/OQ-ID* and M25 are SUPERSEDED by the 2026-10-09 decision `ADMIN_USER_IDS` only (see `plans/06-amendments-applied.md` rows 17-18). This folder is not published (change X).

> SUPERSEDED 2026-10-09 (historical inbox): the admin model is now `ADMIN_EMAILS` + a verified e-mail from the Identity admin sign-in; the `assistant-admin`-style permission group, its key override, claim parsing and permission-capture step no longer exist; test users are an admin user and a non-admin user instead of Teams. See `../owner-questions.md` and `../06-amendments-applied.md`. Entries below that mention the old mechanism are retained for history only.

# Manual steps from changes I, J, K, L, M

Human actions the implementer cannot automate. Ids are local; the coordinator renumbers.

| Local | Step | Needed by |
|---|---|---|
| MS1 | (M3) Scratch commercetools project plus API client for the connector. | all E2E |
| MS2 | (M11) Create a Managed MCP server in **identity mode** on the scratch project (Merchant Center > Managed MCP, or API), note the server key and project key; grant two test users different permissions (one with product read only). | I, E2E-I-* |
| MS3 | Two Merchant Center test users with different permission sets (see OQ10). | I, V |
| MS4 | (M5) GCP project: enable billing, BigQuery API and Cloud Storage API, create dataset (location per `GCP_BIGQUERY_LOCATION`), create bucket (uniform bucket-level access), create service account with `roles/bigquery.dataEditor` on the dataset, `roles/bigquery.jobUser` on the project, `roles/storage.objectAdmin` on the bucket; export key as `GCP_SA_KEY_BASE64`. | L, F |
| MS5 | Optional: bucket lifecycle rule deleting `images/` objects older than 30 days. | L |
| MS6 | (M8/M10) Provider test accounts: Contentstack stack with a management token, Algolia application with MCP enabled, Stripe test-mode restricted key. | J, E2E-J-* |
| MS7 | Sandbox smoke run of the Nimbus child process on Connect (cold start, memory) before release. | K, U |
| MS8 | Decide and record Q-ids above (IQ1, IQ8, IQ14 are the blocking ones). | I, K, M |
