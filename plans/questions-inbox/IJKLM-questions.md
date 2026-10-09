> Historical inbox (merged into `plans/owner-questions.md`). Items about `ADMIN_EMAILS`, the Identity admin sign-in, verified e-mail, BQ-ID1/OQ-ID* and M25 are SUPERSEDED by the 2026-10-09 decision `ADMIN_USER_IDS` only (see `plans/06-amendments-applied.md` rows 17-18). This folder is not published (change X).

# Owner questions from changes I, J, K, L, M

Local ids IQ1.. ; "Refined Q-id" is the id to assign when merging into `plans/owner-questions.md` (existing ids: use them, otherwise "new").

| Local | Refined Q-id | Question | Default used | Affects |
|---|---|---|---|---|
| IQ1 | Q5/Q6 | Identity-mode Managed MCP binding (PUT/DELETE) is admin-only; unbinding sweeps all stored user tokens and best-effort revokes them at auth2. Confirm. | Yes, admin-only and sweep | I (identity-mcp-binding, identity-mcp-oauth), D, E |
| IQ2 | new | Does auth2 honour the `mcp:{project}:{server}` scope for a refresh and does it rotate refresh tokens with a grace period (needed for the refresh race handling)? Needs a real identity-mode server to confirm. | Assume rotation without grace; compare-and-delete on invalidation | I (identity-mcp-oauth) |
| IQ3 | new | Callback URL in local dev: auth2 may refuse an http redirect; confirm an https tunnel or localhost allowance. | Document tunnel; production callback is `origin(MC_AUDIENCE)/service/managed-mcp-identity/callback` | I, B |
| IQ4 | Q4/Q2 | Contentstack region: legacy hardcoded the NA host. Add an optional `region` field (7 documented hosts). | Yes, default `na` | J (mcp-provider-configs, third-party-tool-sources), Q |
| IQ5 | Q21 | **MOOT (DECIDED 2026-10-09, Q4: provider credentials are Connect `securedConfiguration`/`standardConfiguration`).** Provider allow-list is `contentstack`, `algolia`, `stripe` only; secrets write-only in API responses; `""` keeps a stored secret. | Yes | J, Q, E |
| IQ6 | new | Algolia MCP URL: restrict to https hosts, block private/link-local addresses and user-info (SSRF guard). | Yes | J |
| IQ7 | new | Stripe: upgrade `@stripe/agent-toolkit` 0.9.0 (emits `inputSchema`) after a spike, or keep and wrap. Note Stripe hosted-MCP key policy change on 2026-10-31. | Spike first (task in J), keep wrapper if it fails | J |
| IQ8 | Q3 | Nimbus MCP: embedded child process in the service (default) versus a separate Connect service (fallback design in K Appendix A). | Embedded; measured to fit 1 CPU / 512 MB | K |
| IQ9 | new | Nimbus MCP version: npm latest 3.6.0, legacy pinned 3.5.1. Pin must equal the version in the surface manifest and the mc-app. | Pin to the mc-app's Nimbus version, default 3.5.1 | K, M, O |
| IQ10 | Q9 | BigQuery needs billing enabled on the GCP project (streaming inserts unavailable in free tier). Accept load-job fallback in free tier with a documented limit? | Yes, with fallback | L, F |
| IQ12 | new | Caps for BigQuery guard: 200 MB max bytes billed, 60 s job timeout, 500 rows, 256 KB payload; CSV export 50,000 rows / 5 MB. Accept? | Yes | L |
| IQ13 | new | Session tables expire after 7 days even if the session is not deleted. | Yes | L |
| IQ14 | Q18 | Composed pages container key: keep `shared-composed-pages` (default, zero migration) or rename now while greenfield. | Keep | M, P, R |
| IQ15 | new | Composed page validation deny-list violations are hard errors returned to the model (default) versus warnings. | Hard errors | M |
| IQ16 | new | Is `createdBy` (user id) in the stored composed page value acceptable as personal data in Custom Objects? | Keep, disclosed | M, R |
