/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import * as llm from '../../../src/llm';

describe('llm module contract', () => {
  it('exports the documented functions', () => {
    for (const name of ['getModel', 'getModelName', 'getProviderOptions', 'countTokens']) {
      expect(typeof (llm as Record<string, unknown>)[name]).toBe('function');
    }
  });
});
