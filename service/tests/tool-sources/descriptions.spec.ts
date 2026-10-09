/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import { buildPreamble } from '../../src/chat/preamble';
import { registry } from '../../src/tool-sources';
import type { ToolSource } from '../../src/tool-sources/types';

describe('registered tool sources: routing quality', () => {
  const sources = registry.list();

  it('has the expected set of sources registered', () => {
    expect(sources.length).toBeGreaterThanOrEqual(10);
  });

  it.each(sources.map((s) => [s.name, s] as const))(
    '%s has a non-empty one-line description',
    (_name, source) => {
      expect(typeof source.description).toBe('string');
      expect((source.description ?? '').trim().length).toBeGreaterThan(10);
      expect(source.description).not.toContain('\n');
    }
  );

  it.each(sources.map((s) => [s.name, s] as const))(
    '%s has routing hints that fit on one line',
    (_name, source) => {
      // The entity-link helper is never routed to by keyword.
      if (source.name === 'entity-link') return;
      expect((source.routingHints ?? '').trim().length).toBeGreaterThan(10);
      expect(source.routingHints).not.toContain('\n');
    }
  );

  it('the composed preamble mentions every enabled source with its description', () => {
    const text = buildPreamble(sources);
    for (const source of sources) {
      expect(text).toContain(`### ${source.displayName}`);
      expect(text).toContain(source.description as string);
    }
  });

  it('the preamble carries the legacy routing keywords and prerequisites', () => {
    const text = buildPreamble(sources);
    expect(text).toContain('Keywords: product, order, customer');
    expect(text).toContain('Keywords: payment, invoice, subscription');
    expect(text).toContain('Prerequisite: fetch the data first');
  });

  it('prints routing hints on their own line after the description', () => {
    const source: ToolSource = {
      ...(sources[0] as ToolSource),
      displayName: 'Demo',
      description: 'Does demo things.',
      routingHints: 'Keywords: demo.',
    };
    expect(buildPreamble([source])).toContain(
      '### Demo\nDoes demo things.\nKeywords: demo.'
    );
  });
});
