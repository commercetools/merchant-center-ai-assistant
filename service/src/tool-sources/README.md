<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
Freely available, AS IS and UNSUPPORTED. See LICENSE.
-->

# Tool sources

A **tool source** provides tools, a prompt fragment and a tools-menu group to the chat
orchestrator. Changes I (identity MCP), J (Knowledge, Contentstack, Algolia, Stripe), K (Nimbus),
L (BigQuery, image upload) and M (composed pages) each add one. The contract is in `types.ts`;
the runtime is `registry.ts`.

## What a source provides

| Member | Meaning |
|---|---|
| `name` | Registry key, tools-menu group id and key of `session.disabledTools`. Unique, lower-case kebab or camel, stable across releases. |
| `displayName`, `description?` | Shown to the orchestrator in the generated preamble. |
| `kind?` | `'integration'` marks an optional external data source (counted as a "connected source" for suggestions). |
| `order` | Ascending merge order; ties by name. Built-ins use 100-130. |
| `isEnabled(ctx)` | `false` = contributes nothing. Must not throw. |
| `getTools(ctx)` | The tool set; the keys are the tool names shown in the menu. |
| `listForMenu(ctx)` | `{ toolNames }` or `null` (no menu group). Independent of `isEnabled`. |
| `getPrompt(ctx)` | Prompt fragment, `''` when none. **Never embed the project system prompt**: the orchestrator adds it once. |

## What the registry does for you (do not re-implement)

- calls `isEnabled` and `getTools` concurrently, with a 15 s timeout per source, and skips a
  source that throws or hangs (warning naming it);
- merges in `order`, whatever the completion order; a tool-name collision is won by the
  **later** source and logged, so coordinate names (`query_aggregated_data` is used by L and M);
- removes the tools the session switched off (`disabledTools[name]`, or all of them for the
  sentinel `all_tools`): a source never filters by session;
- adds your prompt fragment only when you still have a tool after filtering;
- normalises the merged tool schemas for Gemini once (`schema/normalize-tool-set.ts`);
- wraps every tool so it is aborted at the soft deadline of the request-time budget
  (`{ error: 'Stopped: time limit reached' }`). Use `ctx.abortSignal` for your own I/O.

## Writing a source

```ts
// service/src/tool-sources/weather.source.ts
import { tool } from 'ai';
import { z } from 'zod';
import type { ToolSource } from './types';

export const weatherSource: ToolSource = {
  name: 'weather',
  displayName: 'Weather',
  description: 'Current weather for a city.',
  kind: 'integration',
  order: 300,
  isEnabled: async (ctx) => ctx.config.providers.stripe !== undefined, // your gate
  getTools: async (ctx) => ({
    get_weather: tool({
      description: 'Current weather for a city',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }, { abortSignal }) => fetchWeather(city, abortSignal),
    }),
  }),
  listForMenu: async () => ({ toolNames: ['get_weather'] }),
  getPrompt: (ctx) => `Use get_weather for weather questions. Locale: ${ctx.locale}.`,
};
```

Register it with one line in `index.ts`: `registerToolSource(weatherSource);`.
Test it with `tests/helpers/stub-tool-source.ts` (`StubToolSource`, `makeToolContext`) and
`createToolSourceRegistry()`.

## Image generation

`imageGeneration` is registered but enabled only while `setImageUploader(...)` (change L) has
been called. `ImageUploader.upload` returns the value stored in the file part (public URL, or a
service-relative `/files/...` path in private mode); the optional `toModelMessages` converts
stored relative image parts to base64 before the model sees them.
