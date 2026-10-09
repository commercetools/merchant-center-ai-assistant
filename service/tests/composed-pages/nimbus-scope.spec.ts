/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, test } from '@jest/globals';
import {
  auditNimbusScope,
  isCompoundComponent,
  NIMBUS_COMPOUND_REFERENCE,
  NIMBUS_SCOPE_BULLETS,
  NIMBUS_SCOPE_LINES,
} from '../../src/composed-pages/prompt/nimbus-scope';
import { NIMBUS_COMPOUND_COMPONENTS } from '../../src/composed-pages/prompt/nimbus-surface.generated';
import { getCommercetoolsUIPrompt } from '../../src/composed-pages/prompt/commercetools-ui.prompt';
import { composedPageTool } from '../../src/composed-pages/tool';

/**
 * The bug these guard against: the scope lists advertised `PageContent` as a component.
 * It is `{ Root, Column }` - a plain object - so every generated page opened with
 * `<PageContent>` and died on React error #130 before rendering a single child.
 */
describe('Nimbus scope advertised to the model', () => {
  test('every advertised name exists in Nimbus and is renderable', () => {
    const { unknown, notComponents } = auditNimbusScope();

    expect(unknown).toEqual([]);
    expect(notComponents).toEqual([]);
  });

  test('compound components are marked in both scope lists', () => {
    const compoundNames = Object.keys(NIMBUS_COMPOUND_COMPONENTS);

    // Guards against a Nimbus upgrade turning an advertised component into a namespace.
    for (const list of [NIMBUS_SCOPE_BULLETS, NIMBUS_SCOPE_LINES]) {
      for (const name of compoundNames) {
        const advertisedFlat = new RegExp(`(^|[ ,*])${name}(?![*\\w])`, 'm');
        expect({ name, advertisedFlat: advertisedFlat.test(list) }).toEqual({
          name,
          advertisedFlat: false,
        });
      }
    }
  });

  test('PageContent - the name that broke - is advertised as compound with its parts', () => {
    expect(isCompoundComponent('PageContent')).toBe(true);
    expect(NIMBUS_SCOPE_BULLETS).toContain('PageContent*');
    expect(NIMBUS_COMPOUND_REFERENCE).toMatch(/PageContent\s+\.Root \.Column/);
  });

  /**
   * The JSX the model copies from: fenced code blocks and the `componentBody` strings in the
   * tool's examples. Prose may show `<Card>` as the thing *not* to write; an example may not.
   */
  const exampleCode = (text: string): string =>
    [
      ...(text.match(/```[\s\S]*?```/g) ?? []),
      ...(text.match(/"componentBody": "[^\n]*"/g) ?? []),
    ].join('\n');

  test('no prompt example shows a compound component as a bare JSX tag', () => {
    const examples = [
      [
        'system prompt',
        exampleCode(getCommercetoolsUIPrompt({ locale: 'en' })),
      ],
      // One description now: the warehouse-on/off split went with the BigQuery data
      // source, so the tool takes no options.
      ['tool description', exampleCode(String(composedPageTool().description))],
    ] as const;

    for (const [label, code] of examples) {
      expect(code.length).toBeGreaterThan(0);

      for (const name of Object.keys(NIMBUS_COMPOUND_COMPONENTS)) {
        // `<Card.Root>` is correct, `<Card>` and `<Card ` are React error #130.
        const bareTag = new RegExp(`<${name}(?![\\w.])`);
        expect({ label, name, bareTag: bareTag.test(code) }).toEqual({
          label,
          name,
          bareTag: false,
        });
      }
    }
  });
});
