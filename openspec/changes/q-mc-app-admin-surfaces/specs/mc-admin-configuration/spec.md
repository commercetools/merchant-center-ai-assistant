## ADDED Requirements

### Requirement: Settings drawer content
The Settings drawer MUST contain, in order, the account card (the user's own name and e-mail as display text, Connected badge, connect/disconnect), the detail-level control (Off=`none`, Summary=`tools`, Detailed=`all`; admins only), connected sources (read-only MCP provider status cards), an Advanced section holding the system prompt (admins only), and an About section (every user) holding change P's read-only `YourUserId` line and, when `isAdmin` is false, the sentence "Ask an administrator to add your user ID to ADMIN_USER_IDS". It MUST NOT contain a data-warehouse control.

#### Scenario: Detail level persists
- **WHEN** an admin chooses Summary and saves
- **THEN** `PUT tool-call-logs` is sent with mode `tools` and a reload shows Summary selected

#### Scenario: No warehouse
- **WHEN** the drawer is opened
- **THEN** no text containing "Data Warehouse" or "warehouse" is present

### Requirement: System prompt
Only admins (bootstrap `isAdmin`) MUST be able to edit the project-wide extra system prompt (`GET/PUT system-prompt`) as free text; the control MUST show a saving state and an error on failure.

#### Scenario: Save and reload
- **WHEN** an admin saves the prompt `e2e-prompt` and reloads
- **THEN** the field shows `e2e-prompt`

### Requirement: MCP Providers are read-only status cards
The Settings drawer's MCP Providers section MUST render one read-only status card per provider returned by `GET mcp/providers` (Contentstack, Algolia, Stripe), each showing the provider name, a badge (`Enabled` when `enabled`, `Not configured` otherwise), the text 'Configured at deployment (Connect configuration)' and, when `missingKeys` is not empty, the missing key names. The section MUST NOT contain forms, text/password inputs, toggles or a Save button for any user, MUST NOT call any write endpoint under `mcp/`, and `commercetools` and `commercetools-knowledge` MUST NOT appear in it.

#### Scenario: Configured provider
- **WHEN** `GET mcp/providers` returns Stripe with `configured: true, enabled: true`
- **THEN** the Stripe card shows `Enabled` and 'Configured at deployment (Connect configuration)' and the Tools panel lists the `stripe` group

#### Scenario: Not configured provider
- **WHEN** Contentstack comes back with `configured: false, missingKeys: ["CONTENTSTACK_API_KEY", "CONTENTSTACK_MANAGEMENT_TOKEN"]`
- **THEN** its card shows `Not configured` and both key names, and no input is rendered

#### Scenario: No credential UI
- **WHEN** the drawer is opened by the admin user or the non-admin user
- **THEN** `document.querySelectorAll('input[type=password], input[type=url], button[type=submit]')` inside the provider section returns zero elements and no request other than `GET mcp/providers` goes to `mcp/*`

### Requirement: Non-admin view of admin-only sections
For non-admins, the status cards MUST render exactly as for admins (they are read-only and value-free), while the detail-level control, the system-prompt editor and the backoffice link MUST be absent.

#### Scenario: Non-admin user
- **WHEN** the non-admin user opens Settings
- **THEN** the provider cards and the account card are visible, the detail-level control, the system prompt editor and the backoffice link are absent, and the About section shows the user's own id and the sentence "Ask an administrator to add your user ID to ADMIN_USER_IDS"

#### Scenario: Forged label does not unlock settings
- **WHEN** the non-admin user sets `x-admin-email`, `userEmail` or `userLabel` to an administrator's e-mail or user id and calls `PUT system-prompt` or `PUT tool-call-logs`
- **THEN** the service answers 403 `ADMIN_REQUIRED` and the stored values are unchanged
