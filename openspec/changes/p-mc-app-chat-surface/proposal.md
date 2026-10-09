## Why

The chat surface is the product: a streaming conversation inside the Merchant Center with sessions, tool
switchboard, rich message parts, charts, follow-ups, feedback and a live preview of pages the assistant builds.
It exists in the multitenant `mc-app` but is entangled with tenancy (`userEmail` as identity on ~20 calls, a
bootstrap "workspace" prefetch, team headers in older revisions) and with starter leftovers. We need it ported
into the open-source, single-project `mc-app/` so the assistant is usable end to end, in many small, reviewable tasks.

## What Changes

- **Change ID P** (`p-mc-app-chat-surface`). **Needs: O, G, H** (frontend foundation; session/message/tool/digest/suggestion REST; chat stream endpoint). Wave 6. Size XL.
- Port the whole chat shell and conversation: `components/new-chat/*`, `components/shell/*`, `components/panels/chats-drawer`,
  `components/interactive-tab-content`, `contexts/session.tsx`, `hooks/use-chat-service-connector`, `use-next-prompts`, `use-suggestions`,
  `motion/`, `utils/{session-storage,feedback-payload,gravatar,relative-time}`.
- Port the message-part renderers (text, reasoning, tool-steps, subagent, file, source, export, visualization with 16 Google chart kinds, generative-UI button, annotations part) and the tool-call-logs gating.
- Port the per-session tool switchboard (`new-chat/server-tools`) with explicit Save and discard-on-dismiss.
- Port the Preview/Code views and the annotation (Agentation) feature, the composed-pages drawer and `/composed/:pageKey` route
  with their renderer chain (`babel-renderer`, `page-renderer`, `data-sources`, `composed-page-chart`, `ui-error-boundary`).
- **Remove tenancy and identity-by-email**: connector calls stop sending `?userEmail=`; the bootstrap `workspace` seeding is dropped; no team headers; sessions are owned by the verified `userId` on the service.
- Drop dead code: `CLIENT_TOOLS` stub and `hasClientSideToolCallsPending`, `console.*`, the BigQuery composed-page data-source target (legacy guard kept as a no-op notice).
- Add the small read-only "Your user ID" line (`YourUserId` component with a Copy button, fed by the bootstrap `userId`) in the rail's user menu so a new operator can learn the value to put into `ADMIN_USER_IDS`; change Q mounts it in Settings > About.
- Define Chrome scenarios `E2E-P-01 .. E2E-P-16`.

## Capabilities

### New Capabilities
- `mc-chat-sessions`: session lifecycle, restore, list, delete, stale-id recovery, single-project identity.
- `mc-chat-conversation`: streaming chat, composer, retry policy, empty state, follow-ups, feedback, view switcher, shell navigation.
- `mc-chat-message-rendering`: part renderers, tool steps, visualizations, tool-call-log gating, subagent rendering.
- `mc-chat-tool-menu`: per-session tool switchboard.
- `mc-preview-and-pages`: Preview/Code tabs, annotations, saved composed pages drawer and route.
- `mc-user-id-display`: read-only "Your user ID" line with copy, shown to every user.

### Modified Capabilities
<!-- none -->

## Impact

- `mc-app/src/**` (large). Reads: change G/H REST contract (sessions, messages, tools, digest, suggestions, feedback/submit, tool-call-logs, stream).
- Cross-change contract: the annotation data part `data-ct-annotations` must be accepted and stored by the service (G/H) - see design.md and `plans/questions-inbox/OPQ-plan-amendments.md`.
- Hands extension points to Q: rail items "Connections" and "Settings" and their drawers, provider slots, and gate states in `ConnectProvider`.
- Unblocks Q, S (the view reuses reduced copies of these files), V.

## Out of scope

- Managed MCP binding page, identity connect gate, settings drawer contents, MCP provider status cards, system prompt, backoffice, feedback list/detail (Q).
- The separate `composed-apps` app and `mc-view-app` (R, S) - they copy from the files P produces.
- Service behaviour (G, H, M). `create_composed_page` tool and page storage contract live in M; P renders what M defines.
- Client-side (human-in-the-loop) tools: none exist in the service.
- New product features, i18n, unit tests (legacy has none).

## Legacy source

- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-app/src/components/{new-chat,shell,panels,interactive-tab-content,code-preview,compose-preview,preview-annotations,composed-page-view,composed-page-chart,page-renderer,ui-error-boundary}`
- `.../mc-app/src/{contexts,hooks,motion,types,utils}` (files named in design.md Source map)
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/FEATURES.md` (behaviours to keep; partly stale - code wins)
- Annotation feature: legacy commits `4089468` and `e5626a0` (`git -C /Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app show <sha> --stat`).
