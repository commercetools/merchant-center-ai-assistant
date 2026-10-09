> Historical inbox (merged into `plans/owner-questions.md`). Items about `ADMIN_EMAILS`, the Identity admin sign-in, verified e-mail, BQ-ID1/OQ-ID* and M25 are SUPERSEDED by the 2026-10-09 decision `ADMIN_USER_IDS` only (see `plans/06-amendments-applied.md` rows 17-18). This folder is not published (change X).

> SUPERSEDED 2026-10-09 (historical inbox): the admin model is now `ADMIN_EMAILS` + a verified e-mail from the Identity admin sign-in; the `assistant-admin`-style permission group, its key override, claim parsing and permission-capture step no longer exist; test users are an admin user and a non-admin user instead of Teams. See `../owner-questions.md` and `../06-amendments-applied.md`. Entries below that mention the old mechanism are retained for history only.

# Manual steps surfaced by changes G, H, N

| Local | Step | Needed by | Details |
|---|---|---|---|
| GM1 | Provide the scratch commercetools project and dev API client (existing M3) with `manage_key_value_documents`; additionally run the probe in N task 3.2 and G task 3.3 (agent does it, no owner action beyond M3) | G, N | Verifies Custom Object `createdAt` predicates and the nested `value(featureFlags(...))` predicate |
| HM1 | Provide Vertex credentials (existing M5) before running H's live smoke and E2E-H-01..08 | H | The wire/unit tests need no credentials (mock model) |
| HM2 | Allow one real ~4-minute chat turn on a **sandbox deployment** (costs a few model calls) to measure whether Connect or the MC gateway closes long SSE streams early (E2E-H-04, OQ-H2) | H, V | Agent runs it after the first sandbox deploy (M9) |
| NM1 | After the first sandbox deploy, the agent uploads a ~10 MB feedback body through the MC gateway to confirm the limit (E2E-N-02); needs M8 (logged-in Chrome) | N, V | Fallback: lower `FEEDBACK_BODY_LIMIT` / `MAX_SNAPSHOT_BYTES` constants |
| NM2 | Assign yourself `assistant-admin` in a Team (existing M10) and a second non-admin test user (or a second Team without the permission) to test 403 paths of G, N | G, N, V | Needs two MC users or two teams on the scratch project |
