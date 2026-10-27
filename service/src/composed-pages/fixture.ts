/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  COMPOSED_PAGES_CONTAINER_KEY,
  COMPOSED_PAGE_SCHEMA_VERSION,
  type TComposedPageStoredValue,
} from './contract';
import { createComposedPage } from './tool';

/** The fixed key and inputs the shared fixture is produced from. No clocks, no random ids. */
export const FIXTURE_KEY = 'fixture-page';

export const FIXTURE_INPUT = {
  title: 'Fixture page',
  description: 'Shared contract fixture for the service and the frontends',
  key: FIXTURE_KEY,
  components: [
    {
      name: 'Main',
      imports: [
        { source: 'react', items: ['useState', 'useEffect'] },
        { source: 'commercetools', items: ['Stack', 'Heading', 'Text'] },
      ],
      dataSources: [
        {
          id: 'products',
          name: 'Products',
          query: 'query($limit:Int){ products(limit:$limit){ total } }',
          variables: [{ name: 'limit', type: 'number', value: 5 }],
          target: 'COMMERCETOOLS_PLATFORM',
        },
      ],
      componentBody:
        'const [count, setCount] = useState(0);\nuseEffect(() => {\n  setCount(renderData.data.products?.products?.total ?? 0);\n}, [renderData.data.products]);\nreturn (\n  <Stack direction="column" gap="400">\n    <Heading as="h1">Products: {count}</Heading>\n    <Footer renderData={renderData} dispatchUIAction={dispatchUIAction} />\n  </Stack>\n);',
    },
    {
      name: 'Footer',
      imports: [{ source: 'commercetools', items: ['Text'] }],
      componentBody: 'return <Text>Hi</Text>;',
    },
  ],
};

export interface ComposedPageFixture {
  containerKey: string;
  schemaVersion: string;
  /** What the tool returns for FIXTURE_INPUT. */
  output: unknown;
  /** The Custom Object value a frontend writes for that output. */
  storedValue: TComposedPageStoredValue;
}

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sortKeys(entry)])
    );
  }
  return value;
};

/** The exact text of `service/contract/composed-page.fixture.json`. */
export const buildComposedPageFixtureJson = async (): Promise<string> => {
  const output = await createComposedPage(FIXTURE_INPUT);
  if (!output.success) {
    throw new Error(
      `Fixture input is invalid: ${JSON.stringify(output.errors)}`
    );
  }
  const fixture: ComposedPageFixture = {
    containerKey: COMPOSED_PAGES_CONTAINER_KEY,
    schemaVersion: COMPOSED_PAGE_SCHEMA_VERSION,
    output,
    storedValue: {
      name: 'Fixture page',
      icon: 'Page',
      schema: output.schema,
      isPublished: false,
      createdBy: 'fixture-user',
    },
  };
  return `${JSON.stringify(sortKeys(fixture), null, 2)}\n`;
};
