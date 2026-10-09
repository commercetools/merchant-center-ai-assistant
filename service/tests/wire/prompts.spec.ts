/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import {
  getAlgoliaPrompt,
  getBigqueryPrompt,
  getCommercetoolsPrompt,
  getContentstackPrompt,
  getExportPrompt,
  getImageGenerationPrompt,
  getProjectSystemPromptSection,
  getStripePrompt,
  getTemporaryTablesSection,
  getVisualizePrompt,
} from '../../src/agents/prompts';
import { getImageGenerationRules } from '../../src/agents/prompts/image-generation.prompt';
import { makeToolContext } from '../helpers/stub-tool-source';

const contexts: Array<{ dispose: () => void }> = [];
afterEach(() => {
  while (contexts.length) contexts.pop()?.dispose();
});

describe('base prompt', () => {
  it('returns an empty string for a blank project prompt', () => {
    expect(getProjectSystemPromptSection(undefined)).toBe('');
    expect(getProjectSystemPromptSection('   ')).toBe('');
  });

  it('wraps a non-blank project prompt in developer_instructions', () => {
    const section = getProjectSystemPromptSection('Be brief.');
    expect(section).toContain('<developer_instructions>');
    expect(section).toContain('Be brief.');
  });

  it('omits the temporary tables section when there are none', () => {
    expect(getTemporaryTablesSection([])).toBe('');
    expect(getTemporaryTablesSection(['table one'])).toContain('table one');
  });
});

describe('source prompts', () => {
  const builders: Record<
    string,
    (ctx: ReturnType<typeof makeToolContext>) => string
  > = {
    commercetools: (ctx) => getCommercetoolsPrompt(ctx),
    contentstack: getContentstackPrompt,
    algolia: getAlgoliaPrompt,
    stripe: getStripePrompt,
    visualize: getVisualizePrompt,
    bigquery: getBigqueryPrompt,
    export: getExportPrompt,
    imageGeneration: getImageGenerationPrompt,
  };

  it.each(Object.keys(builders))(
    '%s is non-empty, carries the locale and never injects the project prompt',
    (name) => {
      const ctx = makeToolContext({
        locale: 'de-DE',
        projectSystemPrompt: 'SECRET-DEV-RULES',
      });
      contexts.push(ctx);
      const text = builders[name](ctx);
      expect(text.length).toBeGreaterThan(100);
      expect(text).toContain('de-DE');
      expect(text).not.toContain('developer_instructions');
      expect(text).not.toContain('SECRET-DEV-RULES');
    }
  );

  it('the commercetools prompt embeds the optional developer tips (change J)', () => {
    const ctx = makeToolContext();
    contexts.push(ctx);
    expect(
      getCommercetoolsPrompt(
        ctx,
        '<commercetools_api_tips>T</commercetools_api_tips>'
      )
    ).toContain('<commercetools_api_tips>T');
    expect(getCommercetoolsPrompt(ctx)).not.toContain('commercetools_api_tips');
  });

  it('the image prompt lists the URL references', () => {
    const ctx = makeToolContext({
      urlReferences: [{ messageId: 'm1', url: '/files/s1/a.png' }],
    });
    contexts.push(ctx);
    const text = getImageGenerationRules(ctx);
    expect(text).toContain('Message ID: m1');
    expect(text).toContain('/files/s1/a.png');
  });
});
