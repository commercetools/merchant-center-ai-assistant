# Using the assistant

This guide is for people who use the AI Assistant inside the Merchant Center. It describes what the screens
do and what the assistant can and cannot do. For the technical side see [how-it-works.md](./how-it-works.md);
for deployment see [deployment.md](./connect-deployment.md). The labels below are the ones in the application source
(`mc-app/src/components/`); there are no screenshots, so a label can differ slightly after an update.

## Before you start

- Open the **AI Assistant** application from the Merchant Center menu. The first time, the application may
  ask you to connect your own account (see [Connecting your account](#connecting-your-account)).
- The assistant answers from the project that is open in the Merchant Center. It never reads another project.
- Everything the assistant does with commercetools data is done with your permissions, so it can only read or
  change what you may read or change yourself ([permissions.md](./permissions.md)).

## Asking a question

1. Type in the composer (placeholder "Ask about products, orders, pricing or promotions...") and send it
   with the **Send message** button or the Enter key.
2. The answer streams in. Tool steps are shown as a pill that you can open to see which tools ran. How much
   detail is shown for tool calls is set by an administrator (see [Settings](#settings)).
3. After a reply, up to three follow-up chips may appear. Selecting a chip sends its text as your next message.
4. The empty state of a new chat shows suggestion cards and your recent chats. Suggestions are personal and
   are refreshed in the background; when they cannot be produced a fixed set is shown.

If the connection is cut while a long answer is being written, the chat application shows "Reconnecting to the answer…" and picks it up again, or shows the finished answer once it is stored; you do not need to ask again.
If that does not work, an error says so, and the answer appears when you reload the chat after the assistant has finished.
Stop ends the reply in this case too. The panel on Merchant Center pages does not do this and shows an error instead.

A single reply has a time limit. When it is reached, the reply ends with a notice that it may be incomplete;
ask the assistant to continue in a new message. A long chat is read from its last 20 stored messages, so
repeat important details if a conversation is long.

Attach files with the paperclip button: text, CSV and log files and images are accepted
(`mc-app/src/components/new-chat/composer/attach-button.tsx`).

## Chats

- **Start a new chat** (rail tile) opens an empty chat. The previous chat stays in the list.
- **Chats** (rail item) lists your chats, grouped, with a search field ("Search your chats"). Other users
  never see your chats; an administrator can review threads for support purposes (see below).
- A chat gets its title, icon and summary automatically after the first replies.
- **Delete chat** removes the chat, its messages, its generated images and its temporary data tables.

## Choosing what the assistant can reach

The **Choose what the assistant can reach** button in the composer opens the tools menu. Tools are grouped by
source (commercetools, documentation, content, search, payments, design system and so on). Switch off the ones
that you do not want in this chat and select **Save**. The choice belongs to the chat; a new chat starts with
everything on. A source that is not configured for the deployment (for example Contentstack, Algolia or Stripe) contributes no
tools. Which ones are configured is visible in Settings.

## What the assistant can produce

| Result | How to get it | Notes |
|---|---|---|
| Links to Merchant Center pages | Ask for an order, product, customer and so on | Links open the entity in the same project |
| Charts | "Show a bar chart of ..." | Drawn in the chat from the data the assistant fetched |
| CSV export | "Export these orders as CSV" | CSV is the only format; at most 50,000 rows and 5 MB per export; cells that start with a formula character are neutralised |
| Images | "Generate an image of ..." | Stored privately and shown to you only |
| Large data analysis | Ask a question over a large result | The assistant may store the rows in a temporary table and query it with SQL (read only); tables expire after 7 days |
| Composed pages | "Build a page that shows ..." | See below |

## Composed pages

The assistant can build a small page (a React component plus read-only GraphQL data sources) from your
description.

1. The page appears in the chat with a switcher: **Assistant**, **Preview** and **Code**.
2. Use **Start feedback mode** on the preview to click an element and leave a comment; the comments are sent to
   the assistant with your next message so that it changes exactly that part.
3. **Save Page** stores the page with a name and an icon. Saved pages appear under **Pages** in the rail and in
   the separate **AI Assistant Pages** application, where they run for everyone who may open that application.
4. **Page settings** (on a saved page) offers **Delete page**.

A page has limits: at most 20 components, 10 data sources and 20,000 characters per component body. When
the assistant exceeds them it is told which field to fix and tries again. A page can only read data that the
person viewing it may read.

## Giving feedback

Use the thumbs under a reply to report a problem or a good answer. The popup has a free-text field ("What went
wrong") and sends your comment together with a snapshot of the conversation. Administrators can read it. Do not
include secrets in a chat that you send as feedback.

## Connecting your account

If the deployment uses identity mode Managed MCP, the commercetools tools act with your own permissions. You
see a **Connect my account** step the first time; a consent window opens, and when it closes the chat is ready.
**Disconnect my account** in Settings removes the stored connection. If an administrator has not set the server
up yet, you see a notice that tells you to ask one. The setup is described in
[how-it-works.md](./how-it-works.md#identity-mode-managed-mcp).

## Settings

- **About** shows your Merchant Center user ID. Give it to an administrator when you need access to the
  administrator screens.
- **Connected sources** lists Contentstack, Algolia and Stripe with the badge "Enabled" or "Not configured" and
  the note "Configured at deployment (Connect configuration)". These are set by whoever deploys the connector and cannot be changed in the application.
- Administrators additionally see **Advanced** (the project system prompt) and the tool-call detail level, the
  **Connections** drawer (Managed MCP binding) and the **backoffice** (all threads, feedback and a read-only SQL
  query tab). Others who open an administrator screen see "Administrator access required".

## Using the panel on Merchant Center pages

The **AI Assistant** side panel appears on many Merchant Center pages (the Custom View). It is a reduced chat that
knows which page is open, so you can ask "what is the status of this order?" without naming it. It has one chat
per page, no administrator screens and uses only the commercetools and documentation sources.

## Tips and limits

- Be specific about the object and the time range; ask for a count or a sample before asking for everything.
- Ask the assistant to say which tools it used if a result looks wrong; the tool-step pill shows them.
- The assistant can make mistakes. Check important numbers in the Merchant Center before acting on them.
- Changes to commercetools data are made with your permissions and take effect immediately; review them before
  you confirm a request that changes data.
- Problems and their causes are in [troubleshooting.md](./troubleshooting.md); known issues are in
  [operations.md](./operations.md#known-issues).
