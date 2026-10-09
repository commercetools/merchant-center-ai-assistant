> Historical inbox (merged into `plans/owner-questions.md`). Items about `ADMIN_EMAILS`, the Identity admin sign-in, verified e-mail, BQ-ID1/OQ-ID* and M25 are SUPERSEDED by the 2026-10-09 decision `ADMIN_USER_IDS` only (see `plans/06-amendments-applied.md` rows 17-18). This folder is not published (change X).

> SUPERSEDED 2026-10-09 (historical inbox): the admin model is now `ADMIN_EMAILS` + a verified e-mail from the Identity admin sign-in; the `assistant-admin`-style permission group, its key override, claim parsing and permission-capture step no longer exist; test users are an admin user and a non-admin user instead of Teams. See `../owner-questions.md` and `../06-amendments-applied.md`. Entries below that mention the old mechanism are retained for history only.

# Manual steps needed by O, P, Q

| Local | Step | Needed by | Details |
|---|---|---|---|
| OM1 | Same as M6/M7: register the two Custom Applications and the Custom View (placeholder URL) and hand over `CUSTOM_APPLICATION_ID` x2, `CUSTOM_VIEW_ID`, entry-point paths | O (E2E-O-01..06), P, Q | Needed before any Chrome scenario can load the app |
| OM2 | Extend M10: create TWO Teams on the scratch project: "assistant-admins" (app permission group `assistant-admin` = Manage + app Manage) and "assistant-viewers" (app View only), and a way to switch Chrome between the two users (second Chrome profile or second login) | O 11.3, Q 11.2/11.9/11.10 | One-time |
| OM3 | M11 clarification: the identity MCP login popup may need an interactive consent click the first time; the owner does it once in the attached Chrome profile (E2E-Q-03) | Q | One-time |
| OM4 | A reachable service for local frontend runs: either the Connect sandbox deployment (change U) or a personal tunnel started by the developer (never committed). The MC API gateway cannot call `localhost` | O 10.2, P, Q | The service's `MC_AUDIENCE` must equal the URL the gateway forwards to |
| OM5 | Delete the `e2e-ai-assistant` Managed MCP server created by E2E-Q-01 when the Connections drawer cannot delete it (Merchant Center UI: Settings > Developer settings > MCP servers) | Q | Cleanup |
