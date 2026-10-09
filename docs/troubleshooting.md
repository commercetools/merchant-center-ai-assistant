# Troubleshooting

Each entry lists the symptom, the likely cause, the fix and where to look. Log lines are in the Connect deployment logs; see [operations.md](./operations.md#logs-and-correlation-ids) for how to follow one request by its correlation id.
Command-level problems of the deployment helper are in section 10 of [deployment-runbook.md](./deployment-runbook.md).

## Administrator access

| Symptom | Likely cause | Fix | Where to look |
| --- | --- | --- | --- |
| Nobody is admin because `ADMIN_USER_IDS` is empty: no administrator screens for anyone, administrator routes answer 403 `ADMIN_REQUIRED` | The key was never set, or was set to an empty value (fail closed) | Open the app, read "Your user ID" (Settings, About), run `node scripts/connect/connect.mjs configure ADMIN_USER_IDS=<id>`, wait for the restart, refresh ([permissions.md](./permissions.md#becoming-the-first-administrator)) | Log line `ADMIN_USER_IDS is empty: no administrator`; `GET /service/status` shows `adminConfigured: false` |
| I am not shown as administrator although the list is set | The ID on the "Your user ID" line is not exactly the configured value (case matters, no spaces), or the instances still run the old configuration, or the page was not refreshed, or the entry is in a different project's deployment | Compare the ID on the line with the configured value, redeploy with `configure`, wait for the restart, refresh the app | `GET /service/status` (`adminConfigured`); `POST /service/auth/session` response `isAdmin` and `userId` |
| The service exits at start naming `ADMIN_USER_IDS: entry N is not a valid user id` | An entry has a character outside letters, digits, `.`, `_`, `:`, `-` (for example an e-mail address), or is longer than 128 characters; or more than 50 entries | Use user IDs, not e-mail addresses; comma-separate them | Log line `Invalid environment configuration:` |
| The "Administrator access required" notice appears for an administrator | The bootstrap failed or was cached before the list changed | Refresh; check `isAdmin` in the bootstrap response | Network tab, `POST /service/auth/session` |

## Start and authentication

| Symptom | Likely cause | Fix | Where to look |
| --- | --- | --- | --- |
| The service exits at start with `Invalid environment configuration` | A required key is missing or malformed (`CTP_REGION`, `ENCRYPTION_KEY`, `GCP_SA_KEY_BASE64`, a number out of range, an unknown region) | Read the key list in the log line; values are never printed. Fix the Connect configuration and redeploy | Deployment log, first lines |
| Every request answers 401 | `MC_AUDIENCE` is unset (message `Service is not configured for authentication`), differs from the service origin, or has a path or a trailing slash; or `CTP_REGION` does not match the project's Merchant Center cloud | Set `MC_AUDIENCE` to the origin only (the `finalize` step does it); check the region | `MC session verification failed` with `expectedAudience`, `post-deploy: MC_AUDIENCE ...` |
| 401 `Merchant Center session is incomplete` | The token has no user ID or project key | Reload the Merchant Center to refresh the session | Service log |
| 403 `This assistant is not available for the requested project` | The user is in another project than the one the connector is installed in | Use the project the connector is deployed for | Log line with the 403 |
| The application shows "unavailable until your Merchant Center session is restored" | The bootstrap failed: expired session (401), wrong project (403) or the service is down | Use the retry action or sign in again; check `GET /service/status` | Network tab |
| Registering or opening an application fails with an invalid scope error (`invalid_scope`) | The scopes registered for the application differ from the `oAuthScopes` of its configuration file | Make the registered scopes equal to the generated list in [README.md](../README.md#required-scopes); changing scopes re-registers a Custom View | Merchant Center registration page |
| The user cannot open the application | The user's Team has no View permission of the application on the project | Add the View permission of that application to a Team ([permissions.md](./permissions.md#access-to-the-apps)) | Merchant Center, Teams |
| The panel (Custom View) is blank or missing | The page is not one of the 65 locators, the view is not registered with the deployed URL, or the OAuth scopes registered differ from `custom-view-config.mjs` | Check the registration URL and scopes; open a page such as a product or order | Custom View registration |
| The panel shows no chat and asks to connect | No Managed MCP server is bound (an administrator must bind one in the chat application), or this user has not connected | See the next section | Panel message |

## Managed MCP and tools

| Symptom | Likely cause | Fix | Where to look |
| --- | --- | --- | --- |
| "not connected to Managed MCP": the chat shows a gate or the assistant says the account is not connected | No server is bound, or the user has no valid token (never connected, token expired and refresh failed, the server was re-bound) | An administrator binds the server; the user chooses "Connect my account" | `GET /service/managed-mcp-identity/status`; `POST .../verify` answers 401 `IDENTITY_REAUTH_REQUIRED` |
| `PUT /service/managed-mcp-identity` answers 400 `did not advertise commercetools Identity` | The server was not created in identity mode, or its key is wrong | Create a Managed MCP server with the identity authentication mode and use its key | Response body, discovery verdict |
| The connect popup is blocked or closes without connecting | The browser blocked popups, or the authorization was denied or expired (attempts are valid for 10 minutes) | Allow popups for the Merchant Center and try again | The popup shows "The connection could not be completed" |
| `POST .../authorize` answers 503 | `MC_AUDIENCE` is unset or not an HTTPS origin, so the callback URL is unknown | Complete the second deployment step | Response message |
| `IDENTITY_NO_PERMITTED_TOOLS` (403) | The user's Merchant Center permissions allow none of the tools of the server | Ask for the permissions the server's tools need | `POST .../verify` |
| A provider shows "Not configured" in Settings | A required key is missing or invalid | Read `post-deploy: providers ...` and the start warning for the key names, then run `configure` | Settings, status cards; `GET /service/mcp/providers` |
| A tool group is missing from the tools menu | The source failed or timed out for this request, the provider is off, or the user switched it off | Check the logs for the source name; re-enable in the menu | Warning naming the source |

## Chat

| Symptom | Likely cause | Fix | Where to look |
| --- | --- | --- | --- |
| The stream is cut or the answer ends with "The time limit for a single reply was reached" | The time budget ended the turn (270 s by default; Connect cuts a request at 300 s) | Ask the assistant to continue; split big tasks; keep `CHAT_REQUEST_BUDGET_MS` at most 285,000 | `data-turn-status` in the stored message |
| The stream ends with an error right away | Vertex AI rejected the call: see the Google section below | Fix the credential, role or model | Service log (`orchestrator stream error`) |
| 413 when sending a message | The JSON body exceeded 100 kB (large pasted text, annotations or attached images) | Send smaller content | Response `entity.too.large` |
| 400 `Request body must include a message` or `Request body was not parsed as JSON` | The client sent no message or a wrong `Content-Type` | Send `Content-Type: application/json` once | Response body |
| 404 `Session not found` | The session belongs to another user, was deleted, or the ID is wrong | Start a new session | - |
| 503 `Storage temporarily unavailable, please retry` | Custom Objects were unreachable or rate-limited after the retries | Retry; check the commercetools status | Log with the persistence error class |
| 413 `Session is too long` or `Payload too large` | A session reached the readable limit (10,000 messages) or an object exceeded the size limit | Delete the session and start a new one | [operations.md](./operations.md#capacity-scaling-and-cold-start) |
| 409 `Conflict, please retry` | Two writes hit the same object at once | Retry | - |
| Session titles stay "New chat" and follow-up chips never appear | The background digest failed (model error) or the instance stopped before it finished | Check the Vertex errors; try again with the next message | Log of the digest agent |
| The first request after a quiet period is slow (cold start) | Sandbox and preview deployments scale to zero | Expected for these deployment types ([deployment.md](./deployment.md#deployment-types)) | - |
| Large results are returned in full or the model cannot query a table | BigQuery is not usable (no billing, missing role, dataset or location problem) | Read the `post-deploy: gcp analytics:` lines and fix the roles | Deployment log |
| An image does not appear | The bucket role is missing (the service logs the fix), the object was removed, or `IMAGE_URL_MODE` was changed after the image was stored | Grant the role or pre-create the bucket ([configuration.md](./configuration.md#google-cloud)) | Log `Generated image upload failed`; `GET /service/files/...` 404 or 500 |

## Google Cloud and Vertex AI

| Symptom | Likely cause | Fix | Where to look |
| --- | --- | --- | --- |
| Start fails with `GCP_SA_KEY_BASE64: not valid base64` or `... missing field "private_key"` | The value is wrapped, has quotes, or is not the complete key | Re-create it with `base64 < key.json \| tr -d '\n'` and set it once on the first deployment | `post-deploy: FAILED sa-key` |
| 403 from Vertex AI or `post-deploy: FAILED vertex` | The service account lacks `roles/aiplatform.user` or the Vertex AI API is not enabled in the project | Grant the role and enable the API | `post-deploy: warning: vertex: ...` |
| 404 model not found | A model id in `GEMINI_*_MODEL_NAME` does not exist in `GCP_VERTEX_LOCATION` | Choose a model that is available in that location or change the location | Stream error text |
| Start fails with `GOOGLE_VERTEX_API_KEY: must not be set` | An API-key based credential is not supported (it would switch Vertex AI to API-key mode); only the service-account key is | Remove the variable | Start log |

## Composed pages

| Symptom | Likely cause | Fix | Where to look |
| --- | --- | --- | --- |
| A page shows "Legacy Page Format" | The stored page uses an older schema version | Ask the assistant to build the page again | Pages application |
| A data source shows `Unsupported data source target` | The page's data source uses a target the pages application does not run (for example BigQuery) | Ask the assistant to rebuild the page with Merchant Center GraphQL sources | Data source error in the page |
| Only the first 500 pages are listed | The pages application loads at most 500 pages (oldest first) and says so | Delete pages you no longer need | Notice in the list |
| Generated page throws | The component code has an error | The error boundary shows the phase and the component; ask the assistant to fix it | Pages application |

## Running live checks

Checks against a deployed connector need a browser that is logged in to the Merchant Center. A redirect to the login page means that session expired: sign in again in that browser and repeat. The gateway cannot reach `localhost`,
so a locally running service is only reachable from the Merchant Center through a public HTTPS address; use a deployed sandbox instead. The instructions for the automated browser checks are not part of this tree.
