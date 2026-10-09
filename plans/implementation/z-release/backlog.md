# Post-v1 backlog

Sizes: S about half a day, M one to two days, L three to five days. Items from the open-items register with target "backlog" are included (last section). The reserved change letter `Y` stays unused until one of these becomes a change.

| Id | Item | Rationale | Size | Condition |
|---|---|---|---|---|
| B-01 | Optional message and feedback retention job (`RETENTION_DAYS`, a Connect `job` application, cascade delete of long sessions and orphan feedback chunks) | Messages and feedback are kept forever by owner decision Q13/Q25. | M | NOT PLANNED. Build only if the owner reverses the keep-forever decision. |
| B-02 | Identity token exchange via jwt-bearer for the Managed MCP | Impossible today: the authorization server does not advertise `jwt-bearer`. Would remove the per-user consent step. | S (watch) | Only if the server starts advertising it. |
| B-03 | Public marketplace certification (`connectorstaged certify`) | v1 is a private connector (Q14). The checklist is already applied, so the review would look at the same things. | M | Owner answers "production". |
| B-04 | Lighthouse and accessibility pass for the three UIs | Not covered by the E2E cards. | M | |
| B-05 | Load and soak tests of the SSE stream, Custom Object limits and the embedded Nimbus child | Only a functional 4-minute turn is planned (M22). | M | |
| B-06 | Shared frontend package, or Connect support for `shared/` in Merchant Center applications | Today 27 groups of files are duplicated and guarded by `check-duplicates.mjs`. | L | Only if the platform allows non-transpiled shared sources. |
| B-07 | Additional locators for the Custom View | 65 kept; more pages could host the panel. | S | |
| B-08 | Internationalisation | English only (owner question Q15). | M | |
| B-09 | Metrics and alerting for the service | Only logs exist. | M | |
| B-10 | Cascade-delete job for very long sessions and an orphan feedback chunk sweeper | Deleting a session does not delete its feedback (W gaps). | S-M | Related to B-01. |
| B-11 | Move third-party credentials to a store with a UI (alternative to Connect `securedConfiguration`) | Decision Q4 chose Connect configuration; rotation needs a redeploy. | S | If operators ask. |
| B-12 | Admin audit trail stored in Custom Objects | Today `audit.admin_action` log lines only (N, NQ1). | M | |
| B-13 | Multi-project installation guidance | One installation serves one project. | S | Documentation only. |
| B-14 | The reserved change letter `Y` for a follow-up specification | Plan 03 reserves it. | - | |
| B-15 | Hot reload or a restart-free path for `ADMIN_USER_IDS` and a plain `redeploy` command in `connect.mjs` | A running instance keeps the old list until it restarts. | S | |
| B-16 | Stable test hooks (`data-testid`, composer Stop button, instance id in `/service/status`) | Makes the Chrome cards robust (V questions 2 to 5). | S | |
| B-17 | Prompt cleanup pass for ported sub-agent prompts and a routing-hints field on tool sources | Stale legacy wording; routing quality may drop (H gaps). | S-M | After the first real comparison run. |
| B-18 | Stripe: move from toolkit 0.7.12 to the hosted MCP, or trim the 24-name menu to the 21 real tools | J questions 1 and 2. | M | After 2026-10-31 policy change. |
| B-19 | Dependency hygiene: ESLint 8 and typescript-eslint 5 end of life, `npm audit`, duplicate `google-auth-library` | C, F notes. | M | |
| B-20 | Optional `/files` in blobs: frontend image fetch through `forwardToFetch`; drift check for the two copies of `isUsableTranspiledCode` | Cleanup notes. | S | |
| B-21 | Hardening: completion handshake for the MCP connect flow (login-CSRF), `http://localhost` callback for local development, typed stream notice to show a Reconnect button | OQ-I3, OQ-I4, OQ-I7. | M | |
| B-22 | Schedule a Connect `job` to sweep stale auth states | Opportunistic sweep today (Q-E4). | S | |
| B-23 | `docs`: "Using the assistant" guide with screenshots, "adding a store" developer guide | W ledger. | S | |

## Items from the register with target "backlog"

Q-C3 (SDK major bump), W-Q7 (ENCRYPTION_KEY rotation helper), N-Q1 (backoffice by `updatedAt`), Q-E4 (auth-state sweep job, see B-22), OQ-I3/I4/I7 (B-21), OQ-H4 (analyzer quirks), J-Q1 (B-18), RQ5 (delete/publish toggle in the Pages app), ai-dups (B-19).
