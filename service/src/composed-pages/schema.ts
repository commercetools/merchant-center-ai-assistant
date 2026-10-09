/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { z } from 'zod';
import { QUERY_AGGREGATED_DATA_TOOL } from './constants';

export const MAX_COMPONENTS = 20;
export const MAX_DATA_SOURCES = 10;
export const MAX_BODY_CHARS = 20_000;

/** Data source targets. A tuple so a later change can extend it without touching callers. */
export const DATA_SOURCE_TARGETS = ['COMMERCETOOLS_PLATFORM'] as const;

const GraphQLVariableSchema = z.object({
  name: z.string().describe('Variable name used in the GraphQL query'),
  type: z
    .enum(['string', 'number', 'boolean', 'array'])
    .describe('Data type of the variable'),
  value: z.unknown().optional().describe('Default value for the variable'),
  fromContext: z
    .enum(['projectKey', 'dataLocale', 'userId'])
    .optional()
    .describe('Populate value from context instead of using default'),
  fromUrl: z
    .string()
    .optional()
    .describe('Populate value from URL parameter (e.g., ":orderId")'),
});

const DataSourceSchema = z.object({
  id: z
    .string()
    .describe(
      'Unique identifier of the data source, read via renderData.data.<id>'
    ),
  name: z.string().describe('Human-readable name for the data source'),
  query: z
    .string()
    .describe('Read-only GraphQL query for the commercetools API'),
  variables: z
    .array(GraphQLVariableSchema)
    .optional()
    .describe('Variables to pass to the GraphQL query'),
  /**
   * Kept as a one-member enum: stored pages carry `target` on every data source and the
   * frontend switches on it; dropping it would reinterpret persisted data sources.
   */
  target: z
    .enum(DATA_SOURCE_TARGETS)
    .optional()
    .describe(
      'Target data source. COMMERCETOOLS_PLATFORM (default) is the only option.'
    ),
  pollInterval: z
    .number()
    .optional()
    .describe('Auto-refresh interval in milliseconds'),
});

const ImportDefinitionSchema = z.object({
  source: z
    .enum(['react', 'commercetools', 'react-router-dom', 'custom', 'library'])
    .describe(
      'Import source type: react, commercetools (Nimbus), react-router-dom, custom, library'
    ),
  items: z
    .array(z.string())
    .describe('Names used (e.g., ["useState", "useEffect"])'),
  from: z.string().optional().describe('Package name for library imports'),
});

const COMPONENT_BODY_DESCRIPTION = `The FULL BODY of the component function: hooks, state, logic and a TOP-LEVEL \`return\` with the JSX.
Do NOT include a function declaration, an arrow-function component or import/export statements - the tool wraps the body as
\`function Name({ renderData, dispatchUIAction }) { BODY }\`.
Not available: eval, Function, window, document, globalThis, localStorage, sessionStorage, fetch, XMLHttpRequest, WebSocket.

Pure JSX component:
return (
  <Stack direction="column" gap="600">
    <Heading as="h1">Title</Heading>
  </Stack>
);

With state and effects:
const [term, setTerm] = useState('');
useEffect(() => {
  dispatchUIAction({ type: 'refetchDataSource', dataSourceId: 'products', variables: { search: term } });
}, [term]);
return <SearchInput value={term} onChange={setTerm} placeholder="Search..." />;

There is no usePaginationState hook; track pagination with useState.
Wrong: a function wrapper, React.createElement calls, legacy UI Kit names (Spacings.Stack, Text.Headline), imports.`;

const ComponentDefinitionSchema = z.object({
  name: z
    .string()
    .regex(
      /^[A-Z][a-zA-Z0-9]*$/,
      'Component name must be PascalCase (e.g., "OrderList", "OrderDetail")'
    )
    .describe('Component name in PascalCase (e.g., "Main", "OrderList")'),
  dataSources: z
    .array(DataSourceSchema)
    .max(MAX_DATA_SOURCES, `At most ${MAX_DATA_SOURCES} data sources per page`)
    .optional()
    .describe(
      'GraphQL data sources for THIS component only, fetched when it renders (lazy). Read via renderData.data.<id>, renderData.loading.<id>, renderData.errors.<id>'
    ),
  imports: z
    .array(ImportDefinitionSchema)
    .optional()
    .describe(
      'Declarative metadata shown in the code view; every in-scope name works regardless. Example: [{ "source": "react", "items": ["React", "useState"] }, { "source": "commercetools", "items": ["Stack", "Heading"] }]'
    ),
  componentBody: z
    .string()
    .min(1, 'componentBody must not be empty')
    .max(
      MAX_BODY_CHARS,
      `componentBody is limited to ${MAX_BODY_CHARS} characters`
    )
    .describe(COMPONENT_BODY_DESCRIPTION),
});

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const composedPageInputSchema = z
  .object({
    title: z.string().describe('Page title shown in the header'),
    description: z
      .string()
      .optional()
      .describe('Brief description of what the page does'),
    key: z
      .string()
      .regex(
        KEY_RE,
        'key must be a UUID or a URL-safe slug (lowercase letters, digits, hyphens)'
      )
      .optional()
      .describe(
        'OMIT when creating a new page. When editing an existing page pass the key from the last ui://composed-page/<key>/v<n> uri in the conversation.'
      ),
    previousVersion: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'When editing: the <n> of the last ui://composed-page/<key>/v<n> uri. The new version is n + 1.'
      ),
    components: z
      .array(ComponentDefinitionSchema)
      .min(1, 'At least one component is required')
      .max(MAX_COMPONENTS, `At most ${MAX_COMPONENTS} components per page`)
      .describe(
        `Component definitions. The FIRST is the entry point (usually routing) and can render the others, passing renderData and dispatchUIAction down. Each has its own imports and dataSources.
Inside a component: renderData.data.<id>, renderData.loading.<id>, renderData.errors.<id>, renderData.routeInfo.baseUrl, dispatchUIAction.
A page cannot run SQL: run ${QUERY_AGGREGATED_DATA_TOOL} in the conversation and embed the rows as literal data in componentBody.`
      ),
    props: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Optional default props to pass to the component'),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.components.forEach((component, index) => {
      if (seen.has(component.name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['components', index, 'name'],
          message: `Duplicate component name: "${component.name}"`,
        });
      }
      seen.add(component.name);
    });
    const sources = value.components.reduce(
      (n, component) => n + (component.dataSources?.length ?? 0),
      0
    );
    if (sources > MAX_DATA_SOURCES) {
      ctx.addIssue({
        code: 'custom',
        path: ['components'],
        message: `At most ${MAX_DATA_SOURCES} data sources per page (got ${sources})`,
      });
    }
  });

export type ComposedPageInput = z.infer<typeof composedPageInputSchema>;
export type ComponentInput = ComposedPageInput['components'][number];

export interface ValidationIssue {
  path: string;
  message: string;
}

const formatPath = (path: readonly PropertyKey[]): string =>
  path.reduce<string>(
    (acc, part) =>
      typeof part === 'number'
        ? `${acc}[${part}]`
        : acc === ''
          ? String(part)
          : `${acc}.${String(part)}`,
    ''
  );

/** `safeParse` that reports `{ path, message }[]` (paths like `components[0].name`). */
export const parseComposedPageInput = (
  input: unknown
):
  | { success: true; data: ComposedPageInput }
  | { success: false; errors: ValidationIssue[] } => {
  const result = composedPageInputSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((issue) => ({
      path: formatPath(issue.path),
      message: issue.message,
    })),
  };
};
