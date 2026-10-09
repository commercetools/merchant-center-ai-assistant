# Change P (p-mc-app-chat-surface): implementation notes

## Summary

Branch `worktree-agent-a00987ace7be028a3` (reset to `develop`). Tasks 0.x-19.x and 21.1, 21.2, 21.5 are ticked. Not done: 20.x (Chrome E2E), 21.3 (only because `commercetools connect validate` needs Docker; the script gates are green), 21.4.

Built in `mc-app/src/` (all files have the SPDX header, no `console.*`, no `userEmail`/`workspace`/client tools):
- Connector: `hooks/use-chat-service-connector/{request.ts,use-chat-service-connector.ts,use-chat-connector.ts,index.ts,types.ts}`, `hooks/admin-types.ts` (types moved for Q), `hooks/use-suggestions.ts`, `hooks/use-next-prompts.ts`, `hooks/use-service-image.ts`.
- Contexts: `session.tsx`, `tool-call-logs-config.tsx`, `tabbed-header-context.tsx`, `compose-preview-context.tsx`, `composed-page-context.tsx`, `composed-pages-context.tsx`, `data-sources-context.tsx`, `index.tsx` (providers wired).
- Shell, chats drawer, conversation, composer, empty state, all message parts incl. visualization, tool menu, motion, composed pages (renderer, preview, code, panel, view), annotations, `components/your-user-id` (mounted in a new rail user menu), `routes.tsx` (chat + `/composed/:pageKey`).
- Tests (jest): `request.spec.ts` (URL building, no identity, 404 -> ForwardToError), `use-service-image.spec.tsx` (load, revoke on unmount, retry, non-image), `your-user-id.spec.tsx`.

Commands run (all exit 0) in `mc-app`: `yarn typecheck`, `yarn lint`, `yarn test` (19 passed, 4 suites), `yarn build` (with `.env.example` values exported; "Compiled successfully"). Root: `check-duplicates`, `check-versions`, `check-frontend-leftovers`, `spdx-check`, `check-repo-rules`, `check-connect-layout` all OK; `openspec validate p-mc-app-chat-surface --strict` valid.

## Questions (for the owner)

1. Gravatar (Q-P3): kept as default (hashed e-mail sent to gravatar.com, CSP unchanged). Confirm.
2. First visit issues two `GET session/all` (the mount read plus the refresh after `POST session`). Acceptable, or should creation upsert the new session locally?
3. Tool menu: groups are no longer disabled when a provider is "not configured" (the MCP config context is gone, owner decision Q4). Does the service (G/J) only list usable providers? If not, Q should feed `McpProviderStatus` back into `parts`/`server-tools/group.tsx`.
4. `GET tool-call-logs` defaults to `all` on the service when unset, while the app shows `none` until loaded (Q-P2). OK?

## Missed features / gaps found in the spec

- 3.1 says `useServiceRequest()` returns `request` and 12.1b says "add `requestBlob` next to `request`". I exported two hooks, `useServiceRequest()` (function) and `useServiceBlobRequest()`, plus plain builders `createServiceRequest(endpoint)` / `createServiceBlobRequest(endpoint)` for tests. Q should use `useServiceRequest()` as written.
- `server-tools/group.tsx`, `server-tools/tools-panel.tsx` and `panels/composed-page-panel/index.tsx` import `contexts/mcp-config` (Q's/dropped). Not mentioned anywhere in tasks. Removed the dependency (see Deviations).
- The rail has no user avatar in legacy (`UserAvatar` is only used in messages), but 6.7 and E2E-P-16 expect a user menu in the rail: I added a Popover trigger at the bottom of the rail.
- 12.1b says anything but `/files/` or `https://` renders nothing; that would break the user's own attached images, which `useChat` turns into `data:` URLs. I also allow `data:image/*` and `blob:`.
- 12.1b says `requestBlob(path, signal)` plus abort; sharing one in-flight promise between callers cannot honour per-caller abort (StrictMode double effect would fail the second caller). The shared request has no signal; callers ignore a late result after unmount/abort.
- 1.2 pins `@ai-sdk/react` `^4.0.95`: Yarn resolved 4.0.140, which nests `ai@7.0.137` next to the top-level `ai@7.0.92` and breaks `UIMessage` types. Pinned exactly `4.0.95` (the legacy lock).
- 4.2 "exactly one GET session/all": true when a stored session exists; on first visit creating a session refetches the list (second call).
- 13.1 "do not wait for isAuthenticated" conflicts with keeping the guard; I kept the `isAuthenticated` guard (every service call needs the bootstrap to have succeeded, otherwise a failed login spams failing requests). G contributes no `toolCallLogs` bootstrap field, so the context always fetches.
- 3.4 contract check (list of deviations vs G): `GET session` answers 404 when none (connector throws, session context starts a new session); `GET tools` is used (service also keeps a POST alias); DELETE answers `{success, message}`; the connector sends `userLabel` only in bodies. No change needed in G.
- `hooks/use-current-user.ts` (O) still says the e-mail fallback `anonymous` is what the router checks ownership against; stale now. The session context and feedback omit `userLabel` when it is `anonymous`.
- The `Function` constructor in `babel-renderer.tsx` needs an eslint-disable (`no-new-func`); intended (CSP `unsafe-eval`).

## TODOs (not done / unverifiable here)

- E2E scenarios not run (no Merchant Center login, deployed service or Chrome): E2E-P-01 .. E2E-P-16 (tasks 20.1-20.16, 21.4). `plans/evidence/P/` is empty.
- 21.3 `commercetools connect validate` (Docker unavailable).
- Unverified without a browser: Popover user menu behaviour, Agentation toolbar, the Babel renderer, streaming retry banner, CSP: I added `blob:` to `img-src` in `mc-app/custom-application-config.mjs` (O file) for private images; check in E2E-P-15, and check whether `data:` is allowed by the App Kit default for the user's own attached images.
- No unit tests for `session.tsx` (stale-session recovery, delete-current picking from the refreshed list) or `useNextPrompts`; they are covered only by E2E-P-05, -08, -13.
- Docs for W are listed in `tasks.md` section 22; nothing written.
- The README for motion was copied unchanged to `mc-app/src/motion/README.md`.
- `eslint --fix` (prettier) reformatted ported files; diffs against legacy are noisy.

## Deviations from the spec (with reason)

1. Stayed on the worktree branch instead of `spec/p-mc-app-chat-surface`.
2. `@ai-sdk/react` pinned exactly to `4.0.95` (see above); `@types/babel__standalone` added as a devDependency.
3. `GroupedSessionTools.mcp` is `string` (the legacy `MCPProvider` union was deleted with the MCP config types).
4. Tool menu groups are always enabled; `composed-page-panel` no longer preloads MCP config.
5. `NestedPart` local type in `subagent-part.tsx` and `GraphqlResponse` in `use-graphql` replace the legacy `any`.
6. `tool-call-logs-config` default mode `none` (was `all`); `isLoading` stays true until the first answer.
7. `DEFAULT_SESSION_TITLE` is `New chat`; the optional `sessionTitle` prop still overrides it.
8. Delete-failure in the composed page settings and render errors now show notifications instead of console output; feedback rating and clipboard failures are silent by design (button stays unrated).
9. Task 3.2 `getSessionTools` uses `GET` (legacy used `POST`).
10. Commits are grouped by area rather than one per file; early commits (shell, parts) did not typecheck on their own, as tasks 8.2/8.3 allow, and the final tree is green.
