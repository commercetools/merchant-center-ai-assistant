/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Annotation } from 'agentation';

/**
 * The annotation data part: what the annotation toolbar puts on a chat message.
 *
 * MIRRORED CONTRACT - the consumer is the service module defined by change H
 * (`annotation-part`), which hands it to the model. There is no shared package between the
 * frontend and the service, so a change here needs the matching change there. The service
 * also has to let the part through when it stores messages, or it is dropped from history.
 *
 * Why a data part rather than more text in the message: the message text is rendered
 * verbatim in the transcript, so selectors, class names and component source appeared in the
 * author's own bubble as a wall of markup. A `data-` part is carried alongside the text -
 * persisted verbatim for user messages (the service stores `parts` as given),
 * rendered by whatever component we choose, and handed to the model through
 * `convertToModelMessages`'s `convertDataPart` hook. Nothing is parsed back out of a string.
 *
 * The annotations themselves are Agentation's own objects, carried through unrenamed.
 * `Pick` rather than the whole `Annotation` because the rest of it - `computedStyles`,
 * `nearbyElements`, `accessibility`, `fullPath`, `frame`, `elementBoundingBoxes` - would be
 * persisted into the conversation forever AND re-sent to the model on every later turn, for
 * a page the assistant can already see the source of.
 */

/**
 * `data-` prefix required: `convertToModelMessages` recognises a data part by it, and
 * without it the part would be silently dropped on the way to the model.
 */
export const ANNOTATIONS_PART_TYPE = 'data-ct-annotations' as const;

/** One of Agentation's annotations, plus the only thing it cannot know. */
export type CarriedAnnotation = Pick<
  Annotation,
  | 'id'
  | 'element'
  | 'comment'
  | 'elementPath'
  | 'selectedText'
  | 'nearbyText'
  | 'cssClasses'
  | 'attributes'
> & {
  /**
   * The `schema.components[]` entries that rendered this element.
   *
   * Resolved by walking up to the nearest `[data-ct-component]` - see
   * `use-annotation-scope`. Usually one; several for a Cmd-click multi-select; none when the
   * user dragged a region rather than picking an element.
   */
  componentNames: string[];
};

export type AnnotationsData = {
  pageTitle: string;
  annotations: CarriedAnnotation[];
  /** Current source of the annotated components only, already length-capped. */
  components: { name: string; source: string }[];
  /** How many annotated components had to be left out to stay within budget. */
  omittedComponents: number;
};

export type AnnotationsPart = {
  type: typeof ANNOTATIONS_PART_TYPE;
  data: AnnotationsData;
};

/**
 * Narrow an unknown message part to ours.
 *
 * The shape is checked, not just the type. This part comes back out of Firestore, where it
 * was written by whatever version of the app was deployed at the time - and the payload HAS
 * changed shape once already during development. A part that does not match falls through to
 * the generic `data-` renderer in `new-chat/parts`, which shows it as JSON; a guard that
 * only looked at `type` let a stale payload reach `.map` and take the whole transcript down
 * with it, which is a wildly disproportionate outcome for one old message.
 *
 * That is also what the signature was already claiming - `part is AnnotationsPart` while
 * checking only the type was a lie to the type system, and this is where it got paid for.
 */
export const isAnnotationsPart = (part: {
  type: string;
  data?: unknown;
}): part is AnnotationsPart =>
  part.type === ANNOTATIONS_PART_TYPE &&
  typeof part.data === 'object' &&
  part.data !== null &&
  Array.isArray((part.data as AnnotationsData).annotations);
