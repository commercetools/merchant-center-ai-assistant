/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import {
  decodeCode,
  isUsableTranspiledCode,
  parseComposedPageUri,
} from '../../src/composed-pages/contract';
import {
  composedPageTool,
  createComposedPage,
} from '../../src/composed-pages/tool';

const base = {
  title: 'Orders',
  components: [
    {
      name: 'Main',
      imports: [{ source: 'react', items: ['useState'] }],
      componentBody: 'const [n] = useState(1);\nreturn <Text>{n}</Text>;',
    },
  ],
};

const callOptions = { toolCallId: 'c1', messages: [], context: {} } as never;

describe('create_composed_page', () => {
  it('creates a new page at /v1 with a uuid key', async () => {
    const result = await createComposedPage(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.uri).toMatch(/^ui:\/\/composed-page\/[0-9a-f-]{36}\/v1$/);
      expect(result.schema.version).toBe('5.0');
      expect(result.schema.description).toBe('');
      const [main] = result.schema.components;
      expect(decodeCode(main.code.text)).toContain('useState');
      const script = decodeCode(main.code.transpiledCode);
      expect(script).toContain('function Main(');
      expect(isUsableTranspiledCode(script, 'Main')).toBe(true);
    }
  });

  it('edits an existing page: previousVersion + 1', async () => {
    const result = await createComposedPage({
      ...base,
      key: 'abc',
      previousVersion: 2,
    });
    expect(result.success && parseComposedPageUri(result.uri)).toEqual({
      key: 'abc',
      version: 3,
    });
  });

  it('uses 1 for a supplied key without previousVersion, and an injected key', async () => {
    const withKey = await createComposedPage({ ...base, key: 'abc' });
    expect(withKey.success && withKey.uri).toBe('ui://composed-page/abc/v1');
    const injected = await createComposedPage(base, {
      generateKey: () => 'fixed',
    });
    expect(injected.success && injected.uri).toBe(
      'ui://composed-page/fixed/v1'
    );
  });

  it('returns schema errors as data', async () => {
    const result = await createComposedPage({
      ...base,
      components: [{ ...base.components[0], name: 'statsCard' }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0].path).toBe('components[0].name');
      expect(result.hint).toBeTruthy();
    }
  });

  it('returns code and query violations as data', async () => {
    const result = await createComposedPage({
      title: 'x',
      components: [
        {
          name: 'Main',
          componentBody: 'window.x = 1; return null;',
          dataSources: [{ id: 'd', name: 'd', query: 'mutation { a }' }],
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.map((e) => e.path)).toEqual([
        'components[0].componentBody',
        'components[0].dataSources[0].query',
      ]);
    }
  });

  it('is an AI SDK tool whose description says 5.0 and never 4.0', async () => {
    const t = composedPageTool({ generateKey: () => 'k' });
    expect(t.description).toContain('5.0');
    expect(t.description).not.toContain('4.0');
    const out = await t.execute?.(base, callOptions);
    expect((out as { uri: string }).uri).toBe('ui://composed-page/k/v1');
    // Invalid input reaches execute and comes back as data; the SDK does not throw.
    const bad = await t.execute?.({ title: 1 } as never, callOptions);
    expect((bad as { success: boolean }).success).toBe(false);
  });

  it('mentions the Nimbus lookup tools only when asked', () => {
    expect(composedPageTool({ nimbusTools: true }).description).toContain(
      'get_components'
    );
    expect(composedPageTool({ nimbusTools: false }).description).not.toContain(
      'get_components'
    );
  });
});
