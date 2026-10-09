## ADDED Requirements

### Requirement: Budget configuration
`readConfiguration()` SHALL provide `chat.requestBudgetMs` (env `CHAT_REQUEST_BUDGET_MS`, default 270000) and `chat.finalizeReserveMs` (env `CHAT_FINALIZE_RESERVE_MS`, default 30000). Startup MUST fail fast when `requestBudgetMs` is greater than 285000 (Connect times requests out after 5 minutes: https://docs.commercetools.com/connect/deployment-behavior-and-environments.md), when `finalizeReserveMs` is not between 5000 and `requestBudgetMs / 2`, or when either is not an integer.

#### Scenario: Too large
- **WHEN** `CHAT_REQUEST_BUDGET_MS=300000`
- **THEN** startup fails naming the key and the maximum

#### Scenario: Defaults
- **WHEN** neither key is set
- **THEN** the budget is 270000 ms with a 30000 ms reserve

### Requirement: RequestBudget object
`RequestBudget` SHALL be created at the first middleware of the stream route from the request start time and expose `remainingMs()`, `softDeadlineAt`, `hardDeadlineAt`, `softSignal` (aborts at `hardDeadline - reserve`), `hardSignal` (aborts at `hardDeadline` or when the client disconnects), and `phase()` returning `normal | wrapping-up | expired`. Time spent before streaming (history read, source resolution) MUST count.

#### Scenario: Phases
- **WHEN** 245 s of a 270 s budget with 30 s reserve have elapsed
- **THEN** `phase()` is `wrapping-up` and `softSignal.aborted` is true

#### Scenario: Pre-stream time counts
- **WHEN** source resolution takes 15 s
- **THEN** `remainingMs()` is at most `budget - 15000` when the model is first called

### Requirement: Wrap-up step
The agent SHALL be built with a `prepareStep` that, once `phase()` is not `normal`, returns `{ toolChoice: 'none', instructions: <base instructions + WRAP_UP_NOTICE> }` so the next step is a text-only summary of what has been learned and what remains, and with a `stopWhen` condition ending the loop when `remainingMs() < 5000`.

#### Scenario: Final answer after soft deadline
- **WHEN** the soft deadline passes between steps with the model wanting another tool call
- **THEN** the next step is invoked with `toolChoice: 'none'` and produces text

### Requirement: Tools are aborted at the soft deadline
Every tool in the final tool set SHALL be wrapped so that its `execute` receives `AbortSignal.any([sdkSignal, budget.softSignal])`; a tool aborted this way returns an error output `{ error: 'Stopped: time limit reached' }` rather than throwing through the stream. SDK timeouts `{ stepMs: 120000, toolMs: 90000, chunkMs: 60000 }` apply additionally and never exceed the remaining budget.

#### Scenario: Slow tool
- **WHEN** a tool is still running at the soft deadline
- **THEN** it observes an aborted signal and the loop continues to the wrap-up step

### Requirement: Hard abort and notice
The agent run SHALL receive `abortSignal: budget.hardSignal`. When the run ends because the hard signal fired for the time limit, the stream SHALL append a text part `_The time limit for a single reply was reached, so this answer may be incomplete. Ask me to continue._` and a persisted (non-transient) `data-turn-status` part `{ status: 'time-limit' }`, close open parts, and end normally so the client leaves the `streaming` status; the notice part is persisted with the message. A client disconnect aborts silently with no notice.

#### Scenario: Never-resolving model
- **WHEN** the model stream never yields and the budget is 3 s with a 1 s reserve
- **THEN** within 3.5 s the response ends with the notice text and `[DONE]`, and the stored assistant message contains the notice

#### Scenario: Client disconnect
- **WHEN** the client closes the socket
- **THEN** no notice is written and the turn ends within 100 ms

### Requirement: Keep-alive
While streaming, the endpoint SHALL emit a transient `data-keepalive` part every 20 s when no other chunk was written in that interval, stopping when the stream ends; transient parts are never stored.

#### Scenario: Silent tool call
- **WHEN** nothing is emitted for 25 s
- **THEN** at least one `data-keepalive` chunk with `transient: true` was sent and no message part was stored for it

### Requirement: Budget is observable
Each turn SHALL log one line at completion with `elapsedMs`, `phase` at end, `steps`, and whether the notice was added; a counter-like log key `chat.time_limit_reached` MUST appear when the hard abort fired.

#### Scenario: Log line
- **WHEN** a turn is finished normally
- **THEN** exactly one `chat turn finished` log entry with those fields exists
