## ADDED Requirements

### Requirement: Sessions are identified by the verified user, not a query parameter
Connector calls for sessions, messages, tools, digest, suggestions and feedback MUST NOT send `userEmail` (or any other user identity) as a request parameter; the service derives identity from the forward-to JWT.

#### Scenario: No identity in query strings
- **WHEN** the chat is used and `list_network_requests` is inspected for requests to `/proxy/forward-to`
- **THEN** no forwarded URL (`x-forward-to` header) contains `userEmail=`

#### Scenario: Display label is body-only and does not change ownership
- **WHEN** a session is created and feedback is submitted
- **THEN** any e-mail-shaped value is sent only as the JSON body field `userLabel` (never in a URL, header or `userEmail`), and the session remains owned by the `userId` of the signed-in user

### Requirement: Session restore order
On start the app MUST adopt the session id remembered in `localStorage['chat-session-id']` without validating it first; if none is stored it MUST request the user's last session (`GET session`), and if none exists it MUST create one (`POST session`).

#### Scenario: Reload keeps the conversation
- **WHEN** the user has an open conversation and reloads the page
- **THEN** the same session id and its messages are shown

#### Scenario: First visit
- **WHEN** storage is empty and the service has no sessions for the user
- **THEN** a session is created and the empty state is shown

### Requirement: Stale session recovery
When reading messages for the remembered id returns 404, the app MUST clear the stored id and fall back to the last session or a new one, at most once per bad id per page load, and MUST NOT loop.

#### Scenario: Bogus stored id
- **WHEN** `localStorage['chat-session-id']` is set to an unknown id and the page loads
- **THEN** the app shows a valid conversation (last or new) and no error banner

### Requirement: Chats drawer
The Chats drawer MUST list the user's sessions grouped by day with the active one highlighted, MUST filter by title and description from a search box, MUST offer New chat, and MUST delete a session only after a confirmation dialog.

#### Scenario: Delete the current session
- **WHEN** the user confirms deleting the open session
- **THEN** the session disappears from the list and the app switches to the next session or creates a new one

#### Scenario: Cancel delete
- **WHEN** the user cancels the confirmation
- **THEN** the session remains and no DELETE request is sent

### Requirement: Titles come from the digest
A new session MUST display the service-provided title; the app MUST refresh the session list after each finished turn so a digest-generated title appears without a reload.

#### Scenario: Title appears after first turn
- **WHEN** the first turn of a new chat finishes
- **THEN** within ten seconds the Chats drawer shows a title other than "New chat"
