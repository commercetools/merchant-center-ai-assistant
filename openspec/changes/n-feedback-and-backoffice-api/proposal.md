## Why

Reviewers (admins of the Merchant Center project) need to see what users asked and how the assistant answered, and users need a way to flag a bad session with a full-fidelity transcript. The legacy router stores this in Firestore across all tenants, trusts an unverified e-mail for admin access (a query-string `userEmail` against a hard-coded allowlist), parses a 25 MB body before authenticating the caller, and sizes chunks for Firestore's 1 MiB document limit. In the single-project connector all of it lives in Custom Objects behind `FeedbackStore`, with admin decided by the service: the caller's verified Merchant Center user id must be listed in `ADMIN_USER_IDS` (`requireAdmin`, change D; no permission claim).

## What Changes

- **Change ID: N** (`n-feedback-and-backoffice-api`). **Needs:** D (verified user, `requireAdmin`), E (`FeedbackStore`, `SessionStore`, `MessageStore`), G (session types, envelope, REST contract). Unblocks: Q (feedback UI, backoffice UI).
- Port `POST /feedback/submit` (ownership with admin bypass, client-vs-server snapshot source, comment/system-prompt/data-URL truncation records), `GET /feedback/fetch` (admin list, projection without prompt), `GET /feedback/fetch/:feedbackId` (admin detail with reassembled transcript).
- **Re-derive snapshot chunking from verified Custom Object limits** (16 MB document, <= 2 MB recommended, 14 MB request body): the whole transcript is serialised once and split into **192 KiB** UTF-8-safe chunks, each stored as one Custom Object; total snapshot cap **8 MiB**; request body limit **10 MiB**; integrity hash on the parent.
- **413 policy:** body over limit or client snapshot over cap -> 413 with the standard envelope and a readable message; server-sourced snapshot over cap -> keep the newest messages that fit and record a truncation.
- Keep the **raised body-limit registration trick** (route-level parser registered on `app` before the global parser) but run it **after** session verification so unauthenticated callers cannot force a large parse.
- Port the **backoffice**: `GET /backoffice/is-admin`, `POST /backoffice/threads` (all users' sessions of the single project, paginated, filters by `userId` and by dates - the date filters were declared but never applied in legacy), `GET /backoffice/threads/:sessionId`. No cross-tenant listing and no `projectKey` filter.
- Add structured **audit log** lines for every admin read of another user's data (`audit.admin_action`, carrying `userId` only, never an e-mail) and for every submission.
- Add a display-only, sanitised **`userLabel`** (body field only) on feedback and shown on backoffice threads, always labelled unverified and never used for keys, filters, ownership, joins or authorisation; the backoffice is listed and filtered by `userId`.
- **BREAKING (vs legacy):** `authorEmail` filter becomes `authorUserId`; records carry `userId` instead of `userEmail`/`projectKey`; admin = user id in `ADMIN_USER_IDS` via `requireAdmin`; chunk documents/ids differ (no data migration).
- Dropped: `deleteFeedback` (no caller), the legacy hard-coded e-mail allowlist and `validateAdmin` (replaced by D's `requireAdmin` backed by the `ADMIN_USER_IDS` check), the `userEmail` query parameter, per-message chunk ids, `FEEDBACK_BODY_LIMIT` env var (constant now).

## Capabilities

### New Capabilities
- `feedback-submission`: submit endpoint, ownership, body limit, 413 policy, audit.
- `feedback-review`: admin list/detail endpoints and projections.
- `backoffice-threads`: admin thread browser and `is-admin`.
- `snapshot-chunking`: pure sizing/chunking/reassembly rules derived from Custom Object limits.

### Modified Capabilities
<!-- none -->

## Impact

- New code under `service/src/{routes,controllers,services,utils,types}`; one registration line in `app.ts` before the global JSON parser.
- No new env keys (admin determination uses D's `ADMIN_USER_IDS`; limits are constants: 10 MiB request body, 8 MiB snapshot, caps unchanged by Q27). Scopes: reuses `manage_key_value_documents` from E.
- Consumers: Q (feedback dialog, feedback list/detail, backoffice list/detail and its in-browser query).

## Out of scope

- Retention/deletion of feedback, threads and messages (Q13/Q25 decided 2026-10-09: kept forever; there is no retention or cleanup job).
- Feedback UI (Q) and `FeedbackStore` implementation (E).
- Server-side dedupe of double submits (legacy deliberately omitted it; the client in-flight guard in Q is the fix).
- Persisted audit trail (audit entries are structured log lines in v1).

## Legacy source

Read-only, under `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/`:
`src/controllers/feedback.controller.ts`, `src/routes/feedback.route.ts`, `src/routes/backoffice.route.ts`, `src/utils/feedback-snapshot.utils.ts`, `src/types/feedback.types.ts`, `src/middleware/admin.middleware.ts`, `src/app.ts` (lines 54-70), `src/utils/firestore.utils.ts` (feedback section ~1312-1520, backoffice section ~1175-1310), `FEATURES.md` ("Feedback capture and back-office").
