> Historical inbox (merged into `plans/owner-questions.md`). Items about `ADMIN_EMAILS`, the Identity admin sign-in, verified e-mail, BQ-ID1/OQ-ID* and M25 are SUPERSEDED by the 2026-10-09 decision `ADMIN_USER_IDS` only (see `plans/06-amendments-applied.md` rows 17-18). This folder is not published (change X).

# Plan amendments from changes I, J, K, L, M

- **PA-I1 (E/plan 05):** `TokenStore` needs version-aware read and delete (`getTokensWithVersion`, `deleteTokens(userId, version)`) and `deleteAllTokens()` for unbind; the settings record for `identityMcp` must carry the DCR client (id, optional secret, redirect URI) and be updated by compare-and-swap. Plan 05 table wording for the identity client should say so.
- **PA-J2 (E/C) SUPERSEDED 2026-10-09 (Q4: no `McpConfigStore`; `ALGOLIA_MCP_URL` is a secured Connect key):** classify the Algolia MCP URL as public (non-secret) in `McpConfigStore`; add optional config key `MCP_TOOLS_TTL_MS` (default 60000) to B/C.
- **PA-K1 (B/C/U):** add optional key `NIMBUS_MCP_ENABLED` (default true); drop `NIMBUS_MCP_URL` and `NIMBUS_MCP_KEY` unless the fallback (K Appendix A) is chosen; C owns route `GET /service/status/nimbus`.
- **PA-L1 (G/H/N): OBSOLETE (owner decision Q9, 2026-10-09).** No signed URLs and no `resolveStoredFileUrls`; images are served by `GET /service/files/:sessionId/:fileName` (new row 28 in G's route table). Remaining part: H's history loader calls `ImageUploader.toModelMessages` when building model input (done in H task 8.3).
- **PA-L2 (B/C):** new optional key `IMAGE_URL_MODE` = `private` (default) | `public` (applied in B/C/F; `signed` no longer exists). Also `GCP_LOCATION` renamed `GCP_VERTEX_LOCATION`, new `GCP_BUCKET_LOCATION`.
- **PA-L3 (H/L):** H owns `tools/export.tool.ts`; L edits it for CSV formula neutralisation, filename sanitising and caps. H's tasks should leave that file open to L.
- **PA-L4 (U):** postDeploy self-check calls L's `checkGcpAnalytics()`.
- **PA-M1 (P/R/O):** replace the client `hasReturnStatement` regex with the contract check (`isUsableTranspiledCode`); today server `transpiledCode` for hooks components is rejected and re-transpiled in the browser. Types and fixture come from M (`contract/composed-page.fixture.json`).
- **PA-M2 (P/R):** the container key `shared-composed-pages` must be imported from the shared contract definition, not duplicated in `constants.ts` (mc-app and composed-apps).
- **PA-M3 (K/O):** the Nimbus version appears in three places (mc-app dependency, K's `@commercetools/nimbus-mcp` pin, M's surface manifest); plan 02 should name the mc-app dependency as the source of truth and K/M tests as the checks.
- **PA-M4 (plan 02):** composed-apps `CHAT_SERVICE_ENDPOINT_URL` is noted by R; M does not need it.
