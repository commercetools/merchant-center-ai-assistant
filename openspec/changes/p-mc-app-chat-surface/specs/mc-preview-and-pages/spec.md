## ADDED Requirements

### Requirement: Preview and Code tabs
The Preview tab MUST render the latest composed schema through the Babel renderer inside an error boundary, and the Code tab MUST show its source; a render error MUST show a diagnostic with an action that queues a fix prompt into the composer.

#### Scenario: Render error
- **WHEN** generated code throws on render
- **THEN** the boundary shows the error phase and component name instead of a blank app

### Requirement: Renderer scope
The renderer MUST inject only `react`, `react-router-dom` v5 helpers and the `commercetools` Nimbus surface (with icons namespaced as `Icons` and `Chart`/`ComposedPageChart`), and MUST classify errors as `decode | transpile | execute | render | data-fetch`.

#### Scenario: Namespaced icons
- **WHEN** generated code uses `<Icons.Add />`
- **THEN** the icon renders without colliding with Nimbus components

### Requirement: Annotations
When Preview is active the toolbar MUST allow annotating elements with Agentation, scoped to the preview subtree; sending annotations MUST create a user message with text plus one `data-ct-annotations` part, which the transcript shows as a plain list with a collapsed "Details sent to the assistant" disclosure.

#### Scenario: Send annotation
- **WHEN** the user annotates a button with the comment "make it primary" and presses Send
- **THEN** a user message with the note appears and the stream starts

### Requirement: Saved pages
The Pages drawer MUST list composed pages (custom objects in container `shared-composed-pages`) and link each to `<app>/composed/<pageKey>`, which MUST render the page with data sources and polling; deleting from the page settings MUST ask for confirmation and navigate back.

#### Scenario: Open saved page
- **WHEN** the user clicks a page row
- **THEN** the route changes to `/composed/<pageKey>` and the page renders

### Requirement: Stored BigQuery sources degrade
A stored data source with target `BIG_QUERY` MUST NOT throw: it renders an inline notice that the source is no longer supported.

#### Scenario: Legacy page
- **WHEN** a page contains a `BIG_QUERY` data source
- **THEN** that component shows the notice and other components render normally
