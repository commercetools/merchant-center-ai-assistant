## ADDED Requirements

### Requirement: Part dispatch
The transcript MUST render text (Markdown with streaming flag), reasoning (collapsed disclosure), tool calls, files (images: see "Private images"; other file parts with web URLs only), sources (`source-url`, `source-document`), `data-*` parts (raw JSON block, except `data-ct-annotations` which has its own renderer) and ignore `step-start`.

#### Scenario: Unknown data part
- **WHEN** a message contains a `data-foo` part
- **THEN** a JSON block with the payload is shown and no exception occurs

### Requirement: Private images load through the service
A `file` part with an image media type whose URL starts with `/files/` (a path relative to the service endpoint `CHAT_SERVICE_ENDPOINT_URL`, owner decision Q9) MUST NOT be rendered as a plain `<img src>` (a browser request cannot carry the forward-to JWT). The `useServiceImage(url)` hook MUST request `${chatServiceEndpointUrl}${url}` with `forwardToFetch` (no query string), read the response with `res.blob()`, expose `{ status: 'loading' | 'ready' | 'error', objectUrl?, retry }` and the file part MUST render: a fixed-size skeleton (no layout shift: the part reserves a 4:3 box) while loading; an `<img>` whose `src` is the `blob:` URL when ready; a placeholder with the text "Image unavailable" and a Retry button when the request fails (HTTP 404/401/5xx, network error, or a non-`image/*` content type). The hook MUST abort the request on unmount or when `url` changes, MUST call `URL.revokeObjectURL` for every object URL it created when it unmounts or the `url` changes (and MUST NOT revoke a URL still shown), MUST NOT retry automatically, and MUST de-duplicate concurrent requests for the same `url` within one render tree (two parts, one request). Parts whose URL is an absolute `https://` URL (public mode) MUST render as a normal `<img src>` with `referrerPolicy="no-referrer"`; any other URL scheme MUST NOT be rendered as an image. The `<img>` MUST carry `alt` text from the part's `filename` or "Generated image".

#### Scenario: Private image displays
- **WHEN** an assistant message holds a file part `{ type: 'file', mediaType: 'image/png', url: '/files/<sid>/<f>.png' }`
- **THEN** one `GET <endpoint>/files/<sid>/<f>.png` is made through `forwardToFetch`, a skeleton shows first, and the final `<img>` has a `blob:` `src` and `naturalWidth > 0`

#### Scenario: Image request fails
- **WHEN** the files request answers 404
- **THEN** the placeholder "Image unavailable" with a Retry button is shown, no exception is thrown and the rest of the transcript renders; clicking Retry sends exactly one new request

#### Scenario: Object URLs are released
- **WHEN** the message list unmounts (session switch) after two images were shown
- **THEN** `URL.revokeObjectURL` was called once per created object URL

#### Scenario: Same image twice
- **WHEN** two parts reference the same `/files/...` path
- **THEN** only one network request is made

#### Scenario: Unsafe scheme
- **WHEN** a file part url is `javascript:alert(1)` or `data:text/html,...`
- **THEN** no image is rendered and no request is made

### Requirement: Tool-call-log gating
Reasoning parts MUST render only when the tool-call-logs mode is `thinking` or `all`; tool-call details MUST render only when it is `tools` or `all`; chart and export outputs MUST always render.

#### Scenario: Mode none
- **WHEN** the mode is `none`
- **THEN** no reasoning or tool detail is shown but a chart output still renders

### Requirement: Tool steps summary
All tool calls of one assistant message MUST be flattened out of the subagent tree into one disclosure ("Checked N sources") whose rows use humanised names.

#### Scenario: Three tools
- **WHEN** an assistant message contains three tool calls across a subagent
- **THEN** one pill reads "Checked 3 sources" and expands to three rows

### Requirement: Subagent rendering
Tools named in `SUBAGENT_TOOLS` (`commercetools`, `contentstack`, `algolia`, `stripe`, `commercetoolsUI`, `visualize`, `bigquery`, `export`, `imageGeneration`) MUST render their nested `UIMessage` parts inline.

#### Scenario: Nested text
- **WHEN** a `commercetools` tool output contains nested text parts
- **THEN** they are rendered inside the tool block

### Requirement: Visualizations
`visualize_data` outputs MUST render with Google Charts for the 16 supported kinds, treating `DonutChart` as a `PieChart` with `pieHole`, and MUST show a readable message for an unsupported or malformed spec instead of throwing.

#### Scenario: Bad spec
- **WHEN** the output has an unknown chart type
- **THEN** a fallback message is shown and the rest of the transcript still renders

### Requirement: Export download card
`export_data` outputs MUST render a card that downloads the base64 content as a Blob, or explains why nothing was generated.

#### Scenario: Download
- **WHEN** the user clicks Download on an export card
- **THEN** the browser saves a file with the provided name and mime type

### Requirement: Generative UI button
A tool output with a `ui://` URI and a v5.0 page schema MUST render a "UI Preview generated" button that pushes the schema into Preview/Code; v4.0 outputs MUST be rejected with a visible notice.

#### Scenario: v5 output
- **WHEN** such an output arrives
- **THEN** the button is shown and clicking it shows the Preview tab
