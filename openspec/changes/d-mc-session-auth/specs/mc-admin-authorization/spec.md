## ADDED Requirements

### Requirement: Admin is an allow-listed Merchant Center user id
A user SHALL be admin (`RequestUser.isAdmin = true`) if and only if the `sub` of the verified gateway JWT (the Merchant Center user id) is contained in the allowlist `ADMIN_USER_IDS`. The comparison MUST be exact and case-sensitive (no wildcards, no substring matching) and MUST be computed synchronously by `verifyMcSession` from the verified token only. With `ADMIN_USER_IDS` unset or empty nobody is admin (fail closed): the service SHALL log one warning `ADMIN_USER_IDS is empty: no administrator` at boot and `GET /service/status` SHALL report `adminConfigured: false` (and `true` otherwise, never the ids).

#### Scenario: Listed user id
- **WHEN** `ADMIN_USER_IDS=u-admin-1,u-admin-2` and the verified `sub` is `u-admin-2`
- **THEN** `req.user.isAdmin` is true and the bootstrap returns `isAdmin: true`

#### Scenario: User id not listed
- **WHEN** `ADMIN_USER_IDS=u-admin-1` and the verified `sub` is `u-other`
- **THEN** `isAdmin` is false and an admin route responds 403 `ADMIN_REQUIRED`

#### Scenario: Look-alike ids
- **WHEN** `ADMIN_USER_IDS=u-admin-1` and the `sub` is `U-ADMIN-1`, `u-admin-1x` or `u-admin`
- **THEN** `isAdmin` is false

#### Scenario: Empty allowlist
- **WHEN** `ADMIN_USER_IDS` is unset or empty
- **THEN** `isAdmin` is false for every user, one boot warning is logged, and `/status` reports `adminConfigured: false`

### Requirement: Nothing from the request is trusted for admin
`isAdmin` MUST NOT depend on any request header, query parameter, body field, cookie or token claim other than the verified `sub` (including `userEmail`, `userLabel`, `x-admin-email`, `x-user-id`, any permissions claim). The service MUST NOT parse a permissions claim and MUST NOT read an e-mail from the gateway JWT. A browser-supplied e-mail is only an unverified, display-only `userLabel` (see change N).

#### Scenario: Forged e-mail, label and headers are ignored
- **WHEN** a non-admin user calls an admin route with `?userEmail=admin@example.com&userId=u-admin-1`, the header `x-admin-email: admin@example.com` and the body `{"userLabel":"admin@example.com","userId":"u-admin-1"}`
- **THEN** the response is 403 `ADMIN_REQUIRED` and nothing changes

#### Scenario: Permissions claim ignored
- **WHEN** the gateway JWT contains a permissions claim listing any permission
- **THEN** `req.user` has no `permissions` property and `isAdmin` is unchanged

### Requirement: requireAdmin middleware
`requireAdmin` SHALL run after `verifyMcSession` and respond 403 `{ "code": "ADMIN_REQUIRED", "message": "Access denied: administrator access required" }` when `req.user.isAdmin` is false; it MUST NOT consult any request parameter. Using it without `req.user` MUST respond 401. Each admin-only mutation SHALL log one `audit.admin_action` line containing the route, the `userId` and the outcome and never an e-mail address.

#### Scenario: Non-admin
- **WHEN** an authenticated user whose id is not listed calls an admin route
- **THEN** the response is 403 with code `ADMIN_REQUIRED`

#### Scenario: Admin
- **WHEN** an authenticated user whose id is listed calls the same route
- **THEN** the handler runs

#### Scenario: Audit line
- **WHEN** an admin completes an admin-only mutation
- **THEN** one `audit.admin_action` log record exists with `userId` and route and without any e-mail

### Requirement: ADMIN_USER_IDS configuration
`readConfiguration()` SHALL parse `ADMIN_USER_IDS` into `auth.adminUserIds: ReadonlySet<string>`: split on `,` (a `;` or whitespace around entries is tolerated), trim, drop empty entries, de-duplicate, keep case. It SHALL fail startup with a message naming the variable and the 1-based position (never the value) when an entry contains internal whitespace or control characters or is longer than 128 characters, or when more than 50 entries are present. The variable MUST be declared as optional `standardConfiguration` of the `service` application in `connect.yaml` (a comma-separated string is one configuration value; see change U). The set MUST NOT be logged; the log MAY state the entry count.

#### Scenario: Valid list
- **WHEN** `ADMIN_USER_IDS=" u1, u2 ;u1,, "`
- **THEN** `auth.adminUserIds` equals `{u1, u2}`

#### Scenario: Invalid entry
- **WHEN** `ADMIN_USER_IDS=u1,bad id`
- **THEN** startup fails with a message naming `ADMIN_USER_IDS` and position 2 and not containing `bad id`

#### Scenario: Too many entries
- **WHEN** 51 distinct ids are configured
- **THEN** startup fails naming `ADMIN_USER_IDS`
