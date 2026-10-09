## ADDED Requirements

### Requirement: Route guard
`/backoffice` and `/backoffice/:sessionId` MUST render only when `useIsAssistantAdmin()` (bootstrap `isAdmin`) is true, otherwise the "Administrator access required" notice; the alaSQL-containing code MUST be lazy-loaded. The route MUST NOT call `backoffice/is-admin` or send any e-mail.

#### Scenario: Non-admin
- **WHEN** the non-admin user opens `/backoffice`
- **THEN** the denial text is shown and no `backoffice/threads` request is sent

### Requirement: Thread list
The thread list MUST show a paginated table (user, session id, last activity) from `POST backoffice/threads` with limit/offset, MUST support a filter by verified `userId`, MUST show the optional `userLabel` only as plain text tagged "(unverified)" (no HTML, no mailto link, never used to filter or join), MUST NOT show a project-key column or filter, and each row MUST open the session detail (`GET backoffice/threads/<sessionId>`).

#### Scenario: Pagination
- **WHEN** the user goes to page 2
- **THEN** the request carries `offset = perPage` and rows change

#### Scenario: Display label is untrusted text
- **WHEN** a thread carries `userLabel` equal to `<b>x</b>admin@example.com`
- **THEN** the cell shows that text literally with an "(unverified)" tag, as a text node, not a link and not HTML

### Requirement: Query threads
The query tab MUST load one page of threads into an in-browser alaSQL table named `threads` and execute the user's SQL locally, showing errors inline; no SQL MUST be sent to the service.

#### Scenario: Local query
- **WHEN** the user runs `SELECT COUNT(*) AS n FROM threads`
- **THEN** a result row is shown and no request other than the page load is made

#### Scenario: Syntax error
- **WHEN** the SQL is invalid
- **THEN** the error message is shown and the app stays usable

### Requirement: Feedback review
The feedback tab MUST list feedback metadata only (no transcript in the table), and the detail view MUST show the captured snapshot using a dedicated renderer that does not execute generated UI code, does not depend on the reviewer's tool-call-log setting, and caps each JSON block at 240px height.

#### Scenario: Open feedback
- **WHEN** an admin opens a feedback entry
- **THEN** the transcript, including reasoning and tool parts, is visible regardless of the admin's own detail level

#### Scenario: Feedback review is admin-only
- **WHEN** the non-admin user opens the Feedback tab URL or the service refuses `GET feedback/fetch` with 403 `ADMIN_REQUIRED`
- **THEN** the "Administrator access required" notice is shown and no feedback data is rendered

### Requirement: Entry point
Admins MUST find the backoffice through a link in Settings > Advanced.

#### Scenario: Admin link
- **WHEN** an admin opens Settings > Advanced
- **THEN** a link navigates to `<app>/backoffice`; for non-admins the link is absent

#### Scenario: Forged label grants nothing
- **WHEN** the non-admin user sends `x-admin-email`, `userEmail` or `userLabel` set to an administrator's e-mail or user id to `backoffice/*` or `feedback/fetch`
- **THEN** the service still answers 403 `ADMIN_REQUIRED` and the UI shows the notice
