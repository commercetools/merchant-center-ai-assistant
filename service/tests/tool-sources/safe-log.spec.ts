/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import { logSourceFailure } from '../../src/tool-sources/safe-log';
import { fakeLog } from '../helpers/stub-tool-source';

describe('logSourceFailure', () => {
  it('logs provider, class and duration, never the error message', () => {
    const log = fakeLog();
    logSourceFailure(
      log,
      'stripe',
      new TypeError('rejected key sk_live_x'),
      Date.now() - 5
    );
    expect(log.warnings).toHaveLength(1);
    expect(log.warnings[0]).toMatch(
      /^TOOLSOURCE_FAILED provider=stripe class=TypeError ms=\d+$/
    );
    expect(log.messages.join('\n')).not.toContain('sk_live_x');
  });

  it('copes with a non-error throw', () => {
    const log = fakeLog();
    logSourceFailure(log, 'algolia', undefined, Date.now());
    expect(log.warnings[0]).toContain('class=Error');
  });
});
