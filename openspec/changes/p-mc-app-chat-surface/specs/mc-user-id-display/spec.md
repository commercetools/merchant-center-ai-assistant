## ADDED Requirements

### Requirement: Own user id is shown read-only
The app MUST provide a shared `YourUserId` component that renders a small, always-visible, read-only line "Your user ID: <value>" with a "Copy" button, where `<value>` is the `userId` returned by the bootstrap (`useAuth().userId`). The line MUST be shown to every signed-in user, administrator or not, MUST be plain text (no input, no editable field, no link), MUST NOT show an e-mail or any other identifier, and MUST be mounted in the rail's user menu (the popover of the user avatar) and, by change Q, in Settings > About. While the bootstrap has no `userId` the component MUST render nothing.

#### Scenario: Shown to a non-administrator
- **WHEN** a user whose bootstrap says `isAdmin: false` opens the user menu
- **THEN** the line "Your user ID" with the bootstrap `userId` is visible and contains no input element

#### Scenario: Shown to an administrator
- **WHEN** a user whose bootstrap says `isAdmin: true` opens the user menu
- **THEN** the same line is visible with their own `userId`

#### Scenario: Copy
- **WHEN** the user presses "Copy"
- **THEN** the `userId` is written to the clipboard, the button shows "Copied" for about two seconds, and no network request is sent

#### Scenario: Becoming an administrator
- **WHEN** an operator copies the id, adds it to `ADMIN_USER_IDS` in the deployment configuration, redeploys with `configure`, and refreshes the page
- **THEN** the bootstrap returns `isAdmin: true` and the admin surfaces of change Q appear
