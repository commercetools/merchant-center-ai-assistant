/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Annotation } from 'agentation';
import { isPageSchemaV5, type TPageSchema } from '../../types/composed-page';
import { decodeBase64 } from '../../utils/babel-renderer';
import {
  ANNOTATIONS_PART_TYPE,
  type AnnotationsData,
  type AnnotationsPart,
  type CarriedAnnotation,
} from './annotation-payload';

/**
 * Turn annotations into the message the assistant receives.
 *
 * Two pieces: a one-line text part, which is all the transcript shows as the author's own
 * words, and a data part carrying Agentation's own annotation objects - see
 * `annotation-payload` for why that split exists and who reads the other end.
 *
 * The annotations are NOT reshaped. They are selected down to the fields that matter and
 * passed through under Agentation's own field names, so there is no parallel vocabulary to
 * keep in step across two repositories. The only things added are `componentNames`, which
 * Agentation cannot know, and the current source of those components, which it has no
 * access to.
 */

/** An annotation paired with the composed page components it was attached to. */
export type AnnotationRecord = {
  annotation: Annotation;
  componentNames: string[];
};

/**
 * Rough ceiling on the component source carried with a message.
 *
 * Source is the only unbounded part of the payload. A page whose source does not fit is
 * still worth sending - the assistant can read the schema it just produced from the
 * conversation above - so oversized components are counted out rather than truncated
 * mid-expression, which would be worse than absent.
 */
const MAX_SOURCE_CHARS = 16000;

/**
 * Cap on the free-text context fields.
 *
 * `nearbyText` in particular is whatever happened to sit around the element, and this
 * payload is persisted into the conversation permanently and replayed to the model on every
 * later turn. Trimming, not converting: the field keeps its name and meaning.
 */
const MAX_CONTEXT_TEXT_CHARS = 160;

export const buildAnnotationMessage = (
  records: AnnotationRecord[],
  schema: TPageSchema | undefined
): { text: string; part: AnnotationsPart } => {
  const pageTitle =
    typeof schema?.title === 'string' ? schema.title : 'this page';

  const annotations = records.map(carryAnnotation);

  const data: AnnotationsData = {
    pageTitle,
    annotations,
    ...collectComponentSources(records, schema),
  };

  return {
    /*
     * Plain prose, and short. The transcript renders user text verbatim rather than as
     * markdown - a deliberate choice, so that nobody's own asterisks restyle their message -
     * which means any markup here would show up as literal punctuation. The notes
     * themselves are not repeated: the data part carries them, and `annotations-part`
     * renders them into the same bubble.
     */
    text: `Feedback on ${annotations.length} element${
      annotations.length === 1 ? '' : 's'
    } of the preview of "${pageTitle}".`,
    part: { type: ANNOTATIONS_PART_TYPE, data },
  };
};

/** Agentation's annotation, narrowed to the carried fields and tagged with its component. */
function carryAnnotation({
  annotation,
  componentNames,
}: AnnotationRecord): CarriedAnnotation {
  return {
    id: annotation.id,
    element: annotation.element,
    comment: annotation.comment.trim(),
    elementPath: annotation.elementPath,
    componentNames,
    ...(annotation.selectedText && {
      selectedText: clamp(annotation.selectedText),
    }),
    ...(annotation.nearbyText && { nearbyText: clamp(annotation.nearbyText) }),
    ...(annotation.cssClasses && { cssClasses: clamp(annotation.cssClasses) }),
    ...(annotation.attributes && { attributes: annotation.attributes }),
  };
}

/**
 * The current source of the components that were actually annotated.
 *
 * Only those: a six-component page would otherwise spend most of the turn's budget
 * restating code the assistant already wrote and nobody commented on.
 */
function collectComponentSources(
  records: AnnotationRecord[],
  schema: TPageSchema | undefined
): Pick<AnnotationsData, 'components' | 'omittedComponents'> {
  if (!schema || !isPageSchemaV5(schema)) {
    return { components: [], omittedComponents: 0 };
  }

  const wanted = new Set(records.flatMap((record) => record.componentNames));
  const components: AnnotationsData['components'] = [];
  let remaining = MAX_SOURCE_CHARS;
  let omittedComponents = 0;

  for (const definition of schema.components) {
    if (!wanted.has(definition.name)) {
      continue;
    }

    const source = decodeBase64(definition.code.text);
    if (source.length > remaining) {
      omittedComponents += 1;
      continue;
    }

    components.push({ name: definition.name, source });
    remaining -= source.length;
  }

  return { components, omittedComponents };
}

function clamp(value: string): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_CONTEXT_TEXT_CHARS
    ? `${collapsed.slice(0, MAX_CONTEXT_TEXT_CHARS)}...`
    : collapsed;
}
