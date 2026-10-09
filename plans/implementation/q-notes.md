# Change Q (q-mc-app-admin-surfaces): implementation notes

## Summary

Branch `worktree-agent-a187c822ea6e39aca` (reset to `develop` first; M is being built elsewhere, R later). Tasks 0.1, 0.2, 0.4, 1.1, 1.2, 2.x-10.1, 12.1-12.3 and 12.5 are ticked. Not done: 0.3 (online docs not read), 1.3, 4.2, all of section 11 (Chrome E2E-Q-01..16), 12.4, section 13 (docs for W).

Built in `mc-app/src/` (all new files have the SPDX header, no `console.*`, no `any`, no `userEmail`):
- Hooks: `hooks/use-managed-mcp/{index,types,use-identity-mcp-config,use-identity-status}.ts`, `hooks/use-admin-connector.ts`, `hooks/admin-types.ts` (reshaped to the implemented N/J contracts: `userId`, optional display-only `userLabel`, `McpProviderStatus`).
- Utils: `utils/mc-api-error.ts` (copy), `utils/admin-error.ts` (`isAdminRequiredError`, `describeAdminError`, `ServiceRequestError`).
- Gates: `contexts/connect.tsx` now renders `ManagedMcpPage` (admin) or `AdminRequiredNotice` (non-admin) when no server is bound, `IdentityConnectGate` when this user is not connected, children otherwise; `useIdentityStatus` uses the bootstrap `identityUserConnected` (the service sends it) and only falls back to `GET managed-mcp-identity/status`.
- Components: `managed-mcp/*` (page guarded by `useIsAssistantAdmin`, create-or-reuse form, connect gate, Connections drawer, reduced permission notice for a Merchant Center `insufficient_scope`), `admin-required-notice`, `admin-guard`, `configure-mcp/{form-parts,provider-status-card}`, `configuration/*`, `panels/settings-drawer/*` (+ new `about-section`), `backoffice/*` (`user-display` new).
- Contexts: `mcp-providers.tsx` (read-only), `system-prompt-config.tsx`; wired in `contexts/index.tsx`. Rail: Connections (admin only) and Settings (everyone) in `shell/app-rail`; `new-chat/index.tsx` mounts both drawers; `routes.tsx` has the two lazy backoffice routes behind `AdminGuard`.
- `alasql` was not in `package.json` (O dropped it); added `alasql@^4.17.2` (resolved 4.20.0).
- Tests (jest, 23 new tests, 42 total): `admin-required-notice.spec.tsx`, `routes-admin-guard.spec.tsx`, `settings-admin.spec.tsx` (About section, status card read-only), `use-admin-connector.spec.tsx` (paths, bodies, no e-mail, 403 passthrough), `admin-error.spec.ts`.

Commands run (all exit 0) in `mc-app`: `yarn install --frozen-lockfile`, `yarn typecheck`, `yarn lint`, `yarn test` (9 suites, 42 passed), `yarn build` (with the `.env.example` values; "Compiled successfully"; chunks `backoffice` and `backoffice-session-detail` exist, alasql sits in its own async chunk `4474...js` that only the backoffice pulls in). Root: `check-duplicates`, `check-versions`, `check-frontend-leftovers`, `spdx-check`, `check-repo-rules`, `check-connect-layout` all OK; `openspec validate q-mc-app-admin-surfaces --strict` valid.

## Questions (for the owner)

1. P's question 3 is still open: the tool menu enables every group. Q only shows the provider status cards; it does not feed `McpProviderStatus` back into the tool menu. Does the service (G/J) already list only enabled providers in `GET tools`? If not, wire `useMcpProviders()` into `server-tools/group.tsx` (and load it outside the drawer).
2. Q-Q3 (backoffice link in Settings > Advanced): built as specified. Note that the link and all admin-only parts are hidden behind the Advanced accordion; accept?
3. Backoffice order: N's list is newest `createdAt` first (see n-notes), the UI shows it as received. OK?
4. A user who is not connected to the identity MCP (gate) also cannot reach `/backoffice` (the gate wraps every route, as in the legacy app). An admin who cannot connect their own account is therefore locked out of review. Should the gate exempt `/backoffice`?
5. `GET system-prompt` is open to every member on the service (only the PUT is admin). The UI hides the section from non-admins, but the text is readable through the API. Intended?

## Missed features / gaps found in the spec

- **Task 6.1 vs 6.4**: 6.1 says `form-parts.tsx` keeps `StatusCard` only (drop `SaveActions`, `ConfigError`), but the system prompt form (6.4, admin) needs a Save row and an error banner. I kept `SaveActions` and `ConfigError` (and made `StatusCard` generic: label, badge text, children). `ToggleCard`, `SectionTitle` and the Switch are gone.
- **Task 8.6** names `extractToolPartProps` "from P's `tool-steps`"; it lives in `components/new-chat/types.ts` and the legacy import is unchanged (kept).
- **Spec says** `getBackofficeThreads(filters, limit, offset)` etc.; implemented routes agree. Differences found when reading `service/src/routes/*` and controllers (followed the service):
  - Success envelope of N's routes carries `pagination` at the top level next to `data` (`{success, data, pagination}`), as the legacy; types follow that.
  - Thread rows have `userId`, `userLabel?`, `title?`, `createdAt`, `updatedAt`, `messages`, `truncated`; feedback rows have `userId`, `userLabel?`; feedback detail adds `snapshotIntact` and `sessionUserId` (no `sessionTools`; the legacy `GroupedSessionTools` field is dropped, `disabledTools` is typed instead).
  - Error envelope is `{success:false, error, code, message}`; `code: 'ADMIN_REQUIRED'` is present for the 403 of `requireAdmin` and `requireAdminAudited`, so `isAdminRequiredError` checks status 403 plus that code.
  - `GET managed-mcp-identity` answers 404 with `code: IDENTITY_MCP_NOT_CONFIGURED` in the error envelope; the legacy "404 = not bound" pass-through still works (envelope without `data`).
  - Bootstrap contributor of I returns `identityMcpConfigured`, `identityUserConnected`, and also `managedMcpConfigured` (unused by O/Q).
  - `GET backoffice/is-admin` still exists on the service; Q never calls it (task 8.8).
- Task 8.3 says "flatten `messages` to a JSON string column". Done (plus a `messageCount` column), but this changes what an admin can query compared with the legacy table, which held the message objects (`SELECT messages->...` no longer works, use `LIKE`). Documented in the component comment.
- Task 8.7 expects `AdminGuard` in `routes.tsx`; I extracted it to `components/admin-guard/index.tsx` (task 8.9 allows this) and added a `Suspense` fallback there.
- Task 6.6 says the detail-level control "writes `PUT tool-call-logs`" as in legacy; the legacy `handleSelect` called `setMode(mode); void saveConfig();` in one handler. `saveConfig` is a closure over the previous render (`hasChanges` false), so it would save nothing. Fixed in `DetailLevelControl` (save from an effect after the state update, revert and show the error on failure). P's `tool-call-logs-config.tsx` is untouched; the same bug would hit any other caller that does set-then-save in one handler.
- The spec's task 3.3 says "drop the unused `assistant-updated-dialog` import"; the page did not import it (only the old permission notice did), so nothing to drop beyond not porting the file.
- Task 4.1 text puts `ManagedMcpPage` in the gate for admins only; a non-admin who reaches an unbound project sees only the notice (with the user-id line), no way to leave it other than the user menu. That matches D-Q3.
- Task 2.3 mentions P's `request.ts` for the 404 envelope special case; it throws `ForwardToError` for 404, so the identity hook keeps its own `request` (which now throws `ServiceRequestError` with `status`/`code`).
- The generic text in `AdminRequiredNotice` (context `generic`) has no first sentence; the spec text "Only administrators can do this. Ask an administrator ..." is always shown.
- E2E-Q-14/-08 refer to "`STRIPE_SECRET_KEY`"; J's key names are in `service/src/mcp-providers/types.ts` (not checked here, the card only shows what the service sends).

## TODOs (not done: need Merchant Center login, a deployed service, two users, Chrome)

- **E2E not run**: E2E-Q-01, -02, -03, -04, -05, -06, -07, -08, -09, -10, -11, -12, -13, -14, -15, -16 (tasks 11.1-11.16, 12.4). `plans/evidence/Q/` not created (task 1.3, M10 not available).
- Task 4.2 (chat must not render while `identityMcpConfigured=false`) is covered by code (`ConnectProvider` returns before the children) but was not checked in a browser (E2E-Q-01).
- Task 0.3 (platform docs online) not read; the design's findings and the implemented routes were used.
- Unverified in a browser: the Settings drawer layout, the About section inside the drawer scroll area, the `Link href` to `/<project>/<entryPoint>/backoffice` (relies on Nimbus `router.navigate` from O; if the Merchant Center prefix differs the link would do a full page load), popup OAuth origin check (`new URL(chatServiceEndpointUrl).origin` against the service origin), DataTable rendering of `UserDisplay` (truncate inside a `Text as="span"`), `alasql` `INSERT INTO threads SELECT * FROM ?` with the real data (unit test not written; alasql is not executed in jest).
- No unit tests for `ConnectProvider` gate order, `useIdentityStatus`, `DetailLevelControl` save-from-effect, `thread-list` filters or the query tab (they need heavy provider mocks); they are covered only by the E2E scenarios above.
- Docs for W (section 13) not written.
- `commercetools connect validate` not applicable (no `connect.yaml` change).
- Pre-existing leftovers found in P's files while running the leftover grep (not mine): `contexts/data-sources-context.tsx` comment mentions "data-warehouse"; `components/new-chat/parts/tool-steps/humanize-tool.ts` has a `bigquery` label "Queried the analytics warehouse" (a real BigQuery tool name, probably fine); `hooks/use-current-user.ts` comment mentions `?userEmail=`.

## Deviations from the spec (with reason)

1. Stayed on the worktree branch instead of `spec/q-mc-app-admin-surfaces` (task 1.1), as the other changes did.
2. `form-parts.tsx` keeps `ConfigError` and `SaveActions` (system prompt form needs them); see gaps.
3. `AdminGuard` is its own component file; `AboutSection` is its own file (`settings-drawer/about-section.tsx`) so it can be unit-tested without the drawer's provider tree.
4. `DetailLevelControl` saves from an effect (fixes the stale-closure save), renders nothing for non-admins, and shows the save error.
5. `alasql` resolved to 4.20.0 (range `^4.17.2` as in the legacy package.json).
6. alasql table loaded with `INSERT INTO threads SELECT * FROM ?` instead of assigning `alasql.tables[...].data` (needs no `any`), with `messages` as JSON string and an extra `messageCount` column.
7. `GET` feedback list takes `authorUserId` only; date filters (`createdAtBefore/After`) exist on the service but the UI has no date inputs (the spec lists none).
8. The thread list and feedback list got a user-id text filter; changing it resets the page to 1.
9. Backoffice list/detail show service errors (including "Administrator access required") inline instead of logging them (no `console.*`).
10. `ManagedMcpPermissionNotice` lost its `variant` prop and the admin/organization lookups; its title is "Your Merchant Center user is not allowed to manage MCP servers in this project" followed by "Ask a project owner to grant it." plus the scope list.
11. `ManageMcpPanel` is mounted for everyone but only reachable from the admin-only Connections rail item; it was not given its own admin guard (it never opens otherwise).
12. Commits are grouped by area (3 commits), not one per file; the first two commits typecheck, the last contains tests and the backoffice.
