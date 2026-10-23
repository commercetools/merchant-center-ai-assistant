/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import {
  ANNOTATIONS_PART_TYPE,
  convertAnnotationDataPart,
} from '../../src/chat/annotation-part';

const payload = {
  pageTitle: 'Landing',
  annotations: [{ comment: 'make it bigger', elementPath: 'div > h1' }],
  components: [{ name: 'Hero', source: 'export const Hero = () => null;' }],
  omittedComponents: 0,
};

describe('convertAnnotationDataPart', () => {
  it('renders a valid payload as text starting with the section heading', () => {
    const part = convertAnnotationDataPart({
      type: ANNOTATIONS_PART_TYPE,
      data: payload,
    });
    expect(part?.type).toBe('text');
    expect(
      part?.text.startsWith('## Annotations on the preview of "Landing"')
    ).toBe(true);
    expect(part?.text).toContain('make it bigger');
  });

  it('renders component source as a fenced tsx block', () => {
    const text = convertAnnotationDataPart({
      type: ANNOTATIONS_PART_TYPE,
      data: payload,
    })?.text;
    expect(text).toContain('### Hero');
    expect(text).toContain('```tsx\nexport const Hero = () => null;\n```');
  });

  it('notes omitted components', () => {
    const text = convertAnnotationDataPart({
      type: ANNOTATIONS_PART_TYPE,
      data: { ...payload, omittedComponents: 3 },
    })?.text;
    expect(text).toContain('3 further annotated component(s) omitted');
  });

  it('ignores parts of another type', () => {
    expect(
      convertAnnotationDataPart({ type: 'data-other', data: payload })
    ).toBeUndefined();
  });

  it('ignores a malformed payload', () => {
    expect(
      convertAnnotationDataPart({
        type: ANNOTATIONS_PART_TYPE,
        data: { ...payload, annotations: 'nope' },
      })
    ).toBeUndefined();
    expect(
      convertAnnotationDataPart({ type: ANNOTATIONS_PART_TYPE })
    ).toBeUndefined();
  });
});
