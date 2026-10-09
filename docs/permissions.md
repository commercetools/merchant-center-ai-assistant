# Permissions and administrator access

Two separate questions are answered here: who may open the applications, and who is an administrator of the assistant. They are decided by different mechanisms.

## Access to the apps

Each Custom Application has only the default View and Manage permission pair that the Merchant Center derives from its entry point URI path (`mc-app/src/constants.ts`, `composed-apps/src/constants.ts`).
A user sees the menu entry "AI Assistant" or "AI Assistant Pages" when a Team that they belong to has the View permission of that application on the project.
These permissions control access to the application and to the Merchant Center GraphQL proxy the application uses. They do not make anybody an administrator of the assistant, and the service does not read them.
The Custom View declares no permission of its own, only OAuth scopes (`mc-view-app/custom-view-config.mjs`).

What a user can read or change through a generated page or the Managed MCP tools is limited by that user's own Merchant Center permissions and the OAuth scopes registered for the application
([README.md](../README.md#required-scopes) lists them with the reason for each). The service itself uses one API client with only the Custom Object scopes.

## Administrator access

An administrator is a user whose Merchant Center user ID is listed in the Connect configuration `ADMIN_USER_IDS`.

- The value is optional, standard (not secret) configuration: a comma-separated list of user IDs, at most 50 entries. Each entry may contain letters, digits and `.`, `_`, `:`, `-`, up to 128 characters. An entry that is not valid, for example a pasted e-mail address, makes the service refuse to start with a message such as
  `ADMIN_USER_IDS: entry 2 is not a valid user id` (the entry itself is not printed).
- The service compares the user ID inside the signed gateway token with the list, exactly and case-sensitively, on every request (`service/src/auth/admin.ts`). The result is `isAdmin` in `POST /service/auth/session` and in the request user.
- An empty or unset list means nobody is an administrator. The service fails closed: it logs `ADMIN_USER_IDS is empty: no administrator` at start, `GET /service/status` shows `adminConfigured: false`, and administrator routes answer 403 with the code `ADMIN_REQUIRED`.
- No Merchant Center permission is used to grant administrator rights, and no e-mail address is involved: the gateway token carries a user ID and no e-mail.

What an administrator can do: bind or remove the Managed MCP server, change the system prompt and the tool-call detail level, open the backoffice (all conversations and feedback of the project), and read generated images of any session.
Every administrator call logs `audit.admin_action` with the user ID, the route and the outcome; an e-mail address is never logged.

## Finding your user ID

Every signed-in user sees the line "Your user ID" with a Copy button: in the chat application under Settings, About (and in the user menu), and in the footer of the Custom View panel.
It is read-only text from the session bootstrap, shown to everyone because an operator needs it before they are an administrator.

## Becoming the first administrator

1. Deploy the connector without `ADMIN_USER_IDS` and finish the second deployment step ([deployment.md](./deployment.md)).
2. Open the chat application and read your user ID (Settings, About).
3. Set it: `node scripts/connect/connect.mjs configure ADMIN_USER_IDS=<your id>`. For several administrators pass one argument with commas, for example `ADMIN_USER_IDS=user-id-a,user-id-b`.
4. Wait until the instances have restarted and refresh the application. The administrator screens appear.

To add or remove an administrator, run the same command with the new full list and redeploy; the change takes effect when the instances restart (an instance that is already running keeps the old list until then).
Whether a comma-separated value stays one string through the Connect CLI is listed as an open platform check in [deployment-runbook.md](./deployment-runbook.md#11-verified-behaviour).

## What a non-administrator sees

- The Connections item in the rail, the Advanced section of Settings (system prompt, backoffice link) and the tool-call detail control are not shown.
- Opening an administrator page, such as the backoffice, shows the notice "Administrator access required" with their own user ID and the hint to ask an administrator to add it.
- If no Managed MCP server is bound yet, they see the same notice instead of the chat, because only an administrator can bind one.
- Administrator routes answer 403 `ADMIN_REQUIRED`.
- Chat, their own sessions and connecting their own commercetools account keep working. The provider status cards (which third-party tool sources are configured) are visible to every member, and show only names and yes or no.

Hiding screens is cosmetic. The service decides on every request; a user who calls an administrator route directly gets the same 403.

## What is not trusted

The service never uses an e-mail address, label, user ID or admin flag that comes from the browser, in a header, a body or a query parameter (for example a query parameter `userEmail` or a body field `isAdmin` has no effect).
Ownership of sessions, feedback and images, the audit lines and every filter use the user ID from the verified token only. `service/scripts/check-foundation.mjs` fails the build when a source file reads such a value.

## Display label

The chat application sends the signed-in user's e-mail address as `userLabel` when it creates a session or submits feedback, so that an administrator can recognise whose conversation they are reading.
The service sanitises it (control characters and angle brackets removed, at most 120 characters) and stores it with the session or feedback record. It is display text only: it is never compared, used as a key, used in a filter or written to a log,
and the backoffice shows it as plain text marked "(unverified)" next to the verified user ID (`mc-app/src/components/backoffice/user-display.tsx`). The Custom View never sends it.

## Local development

`MC_AUTH_DISABLED=true` switches off token verification for local runs and lets you choose the user with the request headers `x-dev-user-id` and `x-dev-admin: true`. The service refuses this setting when `NODE_ENV` is `production` (also when it is unset)
and logs a warning at start whenever it is on.
