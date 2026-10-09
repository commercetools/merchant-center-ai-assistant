/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { TextPart } from 'ai';

/**
 * Annotations the user left on a composed page preview.
 *
 * MIRRORED CONTRACT - the producer is
 *   mc-app/src/components/preview-annotations/annotation-payload.ts
 * There is no shared package between the frontend and the service (Connect apps are built
 * independently), so a change to the shape needs the matching change there.
 *
 * The toolbar sends this as a `data-` part beside a one-line text part, because the message
 * text is rendered verbatim in the user's own transcript and this is machine detail. Data
 * parts are invisible to the model by default; `convertAnnotationDataPart` is what makes
 * them visible, wired into `convertToModelMessages` by `history.ts`.
 *
 * The part must also survive `processMessagesForStorage` in `storage-filter.ts`, or the
 * annotations vanish from history after the turn that carried them - and a follow-up
 * ("make that one bigger too") would arrive with nothing to resolve "that one" against.
 *
 * The annotation objects are NOT reformatted here. They are the annotation tool's own
 * records, and they go to the model as the JSON they already are - there is no per-field
 * formatter to drift out of step with the prompt that describes them, and the shape above is
 * only read, never rebuilt. Component source is the exception: it is lifted out into fenced
 * blocks, because source inside a JSON string arrives as one line of `\\n` escapes, which
 * is both harder to edit and more tokens than the code it encodes.
 */

export const ANNOTATIONS_PART_TYPE = 'data-ct-annotations';

type AnnotationsData = {
  pageTitle: string;
  annotations: unknown[];
  components: { name: string; source: string }[];
  omittedComponents: number;
};

/** Tolerant of a malformed part: the alternative is taking a whole turn down over one. */
const isAnnotationsData = (value: unknown): value is AnnotationsData =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as AnnotationsData).annotations);

/**
 * Render the part into the text the model reads.
 *
 * Returns `undefined` for anything else, which is how `convertToModelMessages` is told to
 * ignore a data part - so this is safe to pass for every data part the app might grow.
 */
export const convertAnnotationDataPart = (part: {
  type: string;
  data?: unknown;
}): TextPart | undefined => {
  if (part.type !== ANNOTATIONS_PART_TYPE || !isAnnotationsData(part.data)) {
    return undefined;
  }

  const { pageTitle, annotations, components, omittedComponents } = part.data;

  const sections = [
    `## Annotations on the preview of "${pageTitle}"`,
    'The user pointed at elements of the rendered page and left a note on each. These are ' +
      "the annotation tool's own records. `comment` is what the user wrote; " +
      '`componentNames` is the `name` of the `components[]` entry that rendered the ' +
      'element; `elementPath`, `nearbyText`, `selectedText`, `cssClasses` and `attributes` ' +
      'locate it within that component.',
    codeBlock('json', JSON.stringify(annotations, null, 2)),
  ];

  if (components?.length) {
    sections.push(
      '## Current source of the annotated components',
      components
        .map(({ name, source }) => `### ${name}\n\n${codeBlock('tsx', source)}`)
        .join('\n\n')
    );
  }

  if (omittedComponents) {
    sections.push(
      `_${omittedComponents} further annotated component(s) omitted for length; read them from the page schema if needed._`
    );
  }

  return { type: 'text', text: sections.join('\n\n') };
};

const codeBlock = (language: string, body: string) =>
  `\`\`\`${language}\n${body}\n\`\`\``;
