/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, test } from '@jest/globals';
import { freshConfig } from '../helpers/env';

describe('NIMBUS_MCP_ENABLED', () => {
  test('defaults to true', () => {
    expect(freshConfig().nimbus.enabled).toBe(true);
  });
  test('false turns the kill switch on', () => {
    expect(freshConfig({ NIMBUS_MCP_ENABLED: 'false' }).nimbus.enabled).toBe(
      false
    );
  });
  test('anything but true/false is rejected naming the key', () => {
    expect(() => freshConfig({ NIMBUS_MCP_ENABLED: 'yes' })).toThrow(
      /NIMBUS_MCP_ENABLED/
    );
  });
});
