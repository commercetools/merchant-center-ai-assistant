## ADDED Requirements

### Requirement: Streaming transport through the gateway
The conversation MUST use the AI SDK `useChat` with `DefaultChatTransport` whose `fetch` is `forwardToFetch`, posting `{ message: <last message>, id }` to `<endpoint>ai-chat/<sessionId>/message/stream?locale=<dataLocale>` and no other query parameters.

#### Scenario: Stream completes
- **WHEN** the user sends "Hello"
- **THEN** one POST to `/proxy/forward-to` with a streaming 200 response is made, the assistant message grows incrementally and the composer re-enables

### Requirement: Automatic retry then error banner
When a turn finishes with `finishReason === 'error'` the app MUST call `regenerate()` up to 2 times with a delay of `800ms * attempt` and only then show the critical error banner.

#### Scenario: Persistent failure
- **WHEN** the stream endpoint returns an error three times
- **THEN** exactly three stream requests are made and the error banner is shown

### Requirement: Composer behaviour
The composer MUST be one mounted instance across the empty state and the transcript, MUST send on Enter and Cmd/Ctrl+Enter, MUST insert a newline on Shift+Enter, MUST auto-grow, MUST accept `.txt`, `.csv`, `.log` and `image/*` attachments shown as removable chips, and MUST expose Attach and Tools controls.

#### Scenario: Typed text survives the empty-to-chat move
- **WHEN** the user types text, attaches a file, and sends the first message
- **THEN** the composer glides to the bottom without losing focus and the chips are cleared after send

#### Scenario: Reject other file types
- **WHEN** the user chooses a `.exe` file
- **THEN** the file is not added

### Requirement: Personalised empty state
For a conversation with no messages the app MUST show a greeting by first name, up to four suggestion cards from `GET suggestions` (falling back to built-in defaults on failure) and up to four recent chats.

#### Scenario: Suggestion card sends
- **WHEN** the user clicks a suggestion card
- **THEN** its prompt is sent as a message

### Requirement: Follow-up chips
After a finished turn the app MUST poll `GET session/<id>/digest?since=<turnFinishedAt>` at 900, 1800, 2500 and 3000 ms and render up to three next-prompt chips when the digest is not pending; opening an existing session MUST read the stored digest once (`since=0`); switching session MUST clear chips.

#### Scenario: Chip click
- **WHEN** the user clicks a follow-up chip
- **THEN** its text is sent as a message and the chips disappear

### Requirement: Feedback on replies
Message actions MUST offer copy, thumbs up, thumbs down and retry under the last reply; rating opens the feedback popup with the sentiment pre-filled; submitting MUST POST a snapshot taken from the latest messages at submit time to `feedback/submit` and keep the popup open with the typed comment when the request fails.

#### Scenario: Failed submit keeps the comment
- **WHEN** `feedback/submit` returns 500
- **THEN** the popup stays open with the comment intact and shows an error

### Requirement: Assistant / Preview / Code switcher
The conversation header MUST show the Assistant/Preview/Code switcher only after the assistant emitted preview data, and `ChatArea` MUST stay mounted while Preview or Code is shown.

#### Scenario: Mid-stream peek
- **WHEN** the user switches to Preview while an answer streams and returns to Assistant
- **THEN** the answer finished streaming and is complete

### Requirement: Shell navigation exclusivity
The rail drawers (Chats, Pages and those added by Q) MUST be mutually exclusive: opening one closes the others.

#### Scenario: Open two drawers
- **WHEN** the Chats drawer is open and the user clicks Pages
- **THEN** only the Pages drawer is open
