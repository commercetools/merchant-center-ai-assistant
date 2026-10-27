/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { randomUUID } from 'node:crypto';
import { jsonSchema, tool } from 'ai';
import { z } from 'zod';
import {
  CREATE_COMPOSED_PAGE_TOOL,
  NIMBUS_LOOKUP_TOOLS,
  QUERY_AGGREGATED_DATA_TOOL,
} from './constants';
import {
  COMPOSED_PAGE_SCHEMA_VERSION,
  buildComposedPageUri,
  encodeCode,
  type TComponentDefinition,
  type TComposedPageError,
  type TComposedPageOutput,
} from './contract';
import {
  NIMBUS_COMPOUND_RULE,
  NIMBUS_SCOPE_LINES,
  NIMBUS_SCOPE_VERSION,
} from './prompt/nimbus-scope';
import {
  composedPageInputSchema,
  type ComponentInput,
  parseComposedPageInput,
  type ValidationIssue,
} from './schema';
import { transpileComponent } from './transpile';
import {
  describeBodyError,
  validateComponentBody,
  validateDataSourceQuery,
} from './validate';

export { CREATE_COMPOSED_PAGE_TOOL };

export interface ComposedPageToolOptions {
  /** Mention the Nimbus lookup tools (the Nimbus source contributed them). Default true. */
  nimbusTools?: boolean;
  /** Key generator for new pages (tests and the fixture inject a fixed one). */
  generateKey?: () => string;
}

export type ComposedPageResult = TComposedPageOutput | TComposedPageError;

const errorResult = (
  errors: ValidationIssue[],
  hint: string
): TComposedPageError => ({ success: false, errors, hint });

const collectComponentIssues = (
  components: ComponentInput[]
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  components.forEach((component, index) => {
    const body = validateComponentBody(component.componentBody, component.name);
    if (!body.valid) {
      issues.push({
        path: `components[${index}].componentBody`,
        message: describeBodyError(body.error),
      });
    }
    (component.dataSources ?? []).forEach((source, sourceIndex) => {
      const check = validateDataSourceQuery(source);
      if (!check.valid) {
        issues.push({
          path: `components[${index}].dataSources[${sourceIndex}].query`,
          message: check.error,
        });
      }
    });
  });
  return issues;
};

type DataSourceInput = NonNullable<ComponentInput['dataSources']>[number];
type ImportInput = NonNullable<ComponentInput['imports']>[number];

const toDataSource = (source: DataSourceInput) => ({
  id: source.id,
  name: source.name,
  query: source.query,
  variables: (source.variables ?? []).map((variable) => ({
    name: variable.name,
    type: variable.type,
    ...(variable.value !== undefined ? { value: variable.value } : {}),
    ...(variable.fromContext ? { fromContext: variable.fromContext } : {}),
    ...(variable.fromUrl ? { fromUrl: variable.fromUrl } : {}),
  })),
  ...(source.target ? { target: source.target } : {}),
  ...(source.pollInterval !== undefined && source.pollInterval > 0
    ? { pollInterval: source.pollInterval }
    : {}),
});

const toImport = (entry: ImportInput) => ({
  source: entry.source,
  items: entry.items,
  ...(entry.from ? { from: entry.from } : {}),
});

/**
 * The whole tool, without the AI SDK wrapper: validate, transpile, build `{ uri, schema }`.
 * Errors are RETURNED so the model can fix and retry in the same turn.
 */
export const createComposedPage = async (
  rawInput: unknown,
  options: Pick<ComposedPageToolOptions, 'generateKey'> = {}
): Promise<ComposedPageResult> => {
  const parsed = parseComposedPageInput(rawInput);
  if (!parsed.success) {
    return errorResult(
      parsed.errors,
      'Fix the listed fields and call the tool again. Component names are PascalCase, at most 20 components, 10 data sources, 20000 characters per body.'
    );
  }
  const input = parsed.data;

  const issues = collectComponentIssues(input.components);
  if (issues.length > 0) {
    return errorResult(
      issues,
      'Component bodies need a top-level return, no imports/exports and no browser globals; data sources are read-only GraphQL queries.'
    );
  }

  const components: TComponentDefinition[] = [];
  for (const [index, component] of input.components.entries()) {
    const result = await transpileComponent(
      component.name,
      component.componentBody
    );
    if (!result.success) {
      return errorResult(
        [
          {
            path: `components[${index}].componentBody`,
            message: result.error,
          },
        ],
        `Check the syntax of component "${component.name}": unclosed tags, invalid expressions, missing quotes.`
      );
    }
    components.push({
      name: component.name,
      dataSources: (component.dataSources ?? []).map(toDataSource),
      imports: (component.imports ?? []).map(toImport),
      code: {
        text: encodeCode(component.componentBody),
        transpiledCode: encodeCode(result.code),
      },
    });
  }

  const key = input.key ?? (options.generateKey ?? randomUUID)();
  const version =
    input.key !== undefined && input.previousVersion !== undefined
      ? input.previousVersion + 1
      : 1;

  return {
    success: true,
    uri: buildComposedPageUri(key, version),
    schema: {
      version: COMPOSED_PAGE_SCHEMA_VERSION,
      title: input.title,
      description: input.description ?? '',
      components,
      props: input.props ?? {},
    },
  };
};

export const buildComposedPageToolDescription = (
  nimbusTools: boolean
): string => `Create or edit a composed page for the commercetools Merchant Center with live preview (page schema version ${COMPOSED_PAGE_SCHEMA_VERSION}).

CRITICAL INSTRUCTIONS:
- This tool generates a UI page that is rendered in the user's browser as a live preview in the chat.
- ALWAYS use this tool - never output raw JSON schemas.
- Each component has its OWN imports and dataSources (data is fetched lazily when it renders).
- "componentBody" is the FULL function body: hooks, state, logic, AND a top-level return with JSX. No function wrapper, no import/export.
- No window, document, globalThis, fetch, localStorage, sessionStorage, eval or Function in component code.
- If the result has success:false, read "errors", fix them and call the tool again.

VERSION MANAGEMENT:
- NEW page: omit "key" and "previousVersion". The result uri is ui://composed-page/<key>/v1.
- EDIT: pass the same "key" and "previousVersion" = the number after /v in the last ui:// uri of this conversation. The new uri ends with /v<previousVersion + 1>.

WHEN TO USE: custom pages for orders, products, customers; dashboards; forms; editing an existing page or its data sources; nested routes with detail views.

AVAILABLE COMPONENTS (commercetools Nimbus ${NIMBUS_SCOPE_VERSION} - all in scope, no imports needed; generated from the Nimbus package):
${NIMBUS_SCOPE_LINES}
${NIMBUS_COMPOUND_RULE}
Charts: Chart   |   React Hooks: useState, useEffect, useMemo, useCallback, useRef
Icons: the Icons namespace, e.g. <Icons.Add />, <Icons.Search /> (never a bare <Add />)
Router: Route, Switch, useParams, useHistory, Redirect, RouterLink, NavLink

NIMBUS IDIOMS: children not label; onPress not onClick; isDisabled not disabled; numeric spacing tokens (gap="400" = 16px) not scale="m"; Button needs BOTH variant="solid" and colorPalette="primary" for a primary action.
Legacy UI Kit names (Spacings.*, Text.Headline, PrimaryButton, ContentNotification, SelectField, TextField, usePaginationState) are NOT in scope and fail to render.${
  nimbusTools
    ? `
Call the Nimbus tools (${NIMBUS_LOOKUP_TOOLS.getComponents}, ${NIMBUS_LOOKUP_TOOLS.listComponents}, ${NIMBUS_LOOKUP_TOOLS.getTokens}, ${NIMBUS_LOOKUP_TOOLS.searchIcons}) to confirm props before generating, batching all components into one ${NIMBUS_LOOKUP_TOOLS.getComponents} call.`
    : ''
}

DATA SOURCES (per component): GraphQL ONLY and read-only (a query, never a mutation).
- target: "COMMERCETOOLS_PLATFORM" (default and only value); query: GraphQL string; variables: with type info.
- Access via renderData.data.<sourceId>, renderData.loading.<sourceId>, renderData.errors.<sourceId>.
A page CANNOT run SQL. If the answer needs aggregation over history, run ${QUERY_AGGREGATED_DATA_TOOL} in this conversation first and embed the rows as literal data in componentBody.

CHARTS: use the Chart component. Types: LineChart, BarChart, ColumnChart, PieChart, AreaChart, DonutChart, Table, ScatterChart. Data: data.cols = [{ label, type }], data.rows = [{ c: [{ v: value }, ...] }].

WHAT THE TOOL DOES: validates the code, wraps each body in a React function component, transpiles JSX with Babel, base64 encodes the source and the script, and returns { success: true, uri, schema }.

EXAMPLE (single component):
{
  "title": "Orders Dashboard",
  "components": [
    {
      "name": "Main",
      "imports": [{ "source": "commercetools", "items": ["Stack", "Heading", "DataTable", "SkeletonText"] }],
      "dataSources": [{ "id": "orders", "name": "Orders", "query": "query { orders(limit: 10) { results { id orderNumber } } }" }],
      "componentBody": "return (\\n  <Stack direction=\\"column\\" gap=\\"600\\">\\n    <Heading as=\\"h1\\">Orders Dashboard</Heading>\\n    {renderData.loading.orders ? <SkeletonText noOfLines={5} /> : <Text>{renderData.data.orders?.orders?.results?.length} orders</Text>}\\n  </Stack>\\n);"
    }
  ]
}

EXAMPLE (state and effects, compound Card):
{
  "title": "Product Search",
  "components": [
    {
      "name": "Main",
      "imports": [{ "source": "react", "items": ["useState", "useEffect"] }],
      "dataSources": [{ "id": "products", "name": "Products", "query": "query($search: String) { products(where: $search, limit: 50) { results { id } } }", "variables": [{ "name": "search", "type": "string" }] }],
      "componentBody": "const [term, setTerm] = useState('');\\n\\nuseEffect(() => {\\n  dispatchUIAction({ type: 'refetchDataSource', dataSourceId: 'products', variables: { search: term } });\\n}, [term]);\\n\\nreturn (\\n  <Card.Root variant=\\"outlined\\">\\n    <Card.Body>\\n      <SearchInput value={term} onChange={setTerm} placeholder=\\"Search...\\" />\\n    </Card.Body>\\n  </Card.Root>\\n);"
    }
  ]
}

EDIT EXAMPLE: the previous reply produced ui://composed-page/6c1e2d1a-0000-4000-8000-000000000000/v2, so call again with { "key": "6c1e2d1a-0000-4000-8000-000000000000", "previousVersion": 2, ... } to get /v3.`;

/** The AI SDK tool. Input is validated inside `execute`, so failures reach the model as data. */
export const composedPageTool = (options: ComposedPageToolOptions = {}) =>
  tool({
    description: buildComposedPageToolDescription(options.nimbusTools ?? true),
    // Not a zod schema: the AI SDK would throw on invalid input, but the model should get
    // `{ success: false, errors }` and retry in the same turn.
    inputSchema: jsonSchema<unknown>(
      z.toJSONSchema(composedPageInputSchema, { io: 'input' }) as Parameters<
        typeof jsonSchema
      >[0]
    ),
    execute: async (input: unknown): Promise<ComposedPageResult> =>
      createComposedPage(input, { generateKey: options.generateKey }),
  });
