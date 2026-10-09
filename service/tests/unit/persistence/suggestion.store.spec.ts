/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { makePersistence } from '../../helpers/persistence';
import type { ObjectGateway } from '../../../src/persistence/gateway/types';
import { createPersistence } from '../../../src/persistence';
import { freshConfig } from '../../helpers/env';
import { captureLogs } from '../../helpers/log-capture';

const value = {
  suggestions: [{ icon: 'bolt', title: 't', detail: 'd', prompt: 'p' }],
  generatedAt: 5,
  locale: 'en',
  basedOn: ['s1'],
};

const failing: ObjectGateway = {
  get: async () => {
    throw new Error('down');
  },
  put: async () => {
    throw new Error('down');
  },
  delete: async () => {
    throw new Error('down');
  },
  query: async () => {
    throw new Error('down');
  },
};

describe('SuggestionStore', () => {
  it('round trips per user', async () => {
    const { p } = makePersistence();
    expect(await p.suggestions.get('u1')).toBeNull();
    await p.suggestions.set('u1', value);
    expect(await p.suggestions.get('u1')).toEqual(value);
    expect(await p.suggestions.get('u2')).toBeNull();
  });

  it('treats a failing read as a miss and swallows a failing write with a warning', async () => {
    const logs = captureLogs();
    const p = createPersistence(freshConfig(), { gateway: failing });
    expect(await p.suggestions.get('u1')).toBeNull();
    await expect(p.suggestions.set('u1', value)).resolves.toBeUndefined();
    expect(logs.lines.join('\n')).toContain('suggestion write failed');
    logs.stop();
  });
});
