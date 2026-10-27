/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useCallback, useEffect, useRef, type RefObject } from 'react';

/**
 * Confine Agentation's element picking to one subtree, and remember what was picked.
 *
 * Agentation has no scoping API. Its picker hit-tests with `document.elementFromPoint`,
 * registers `document.addEventListener('mousedown', h, true)`, and walks up to
 * `document.body` looking for something big enough to annotate - so left alone it will
 * happily let the user annotate the app rail, the tab bar or the Merchant Center chrome.
 *
 * The fix is to stop those events before Agentation ever sees them. A listener on `window`
 * in the CAPTURE phase runs at the very first step of propagation, strictly before any
 * listener on `document` in either phase, so `stopPropagation()` here means nothing
 * downstream - Agentation, React's root listener, or anything else - is called at all.
 *
 * That is deliberately heavy-handed: while annotation is armed, the rest of the app is
 * inert. Agentation takes the same posture internally (`blockInteractions` is on in its own
 * defaults), and it is the behaviour you want - the user is pointing at the page, not using
 * it. Everything outside the scope root stays interactive the moment the mode is disarmed.
 *
 * Known gap: Agentation also crawls the page for same-origin iframes and attaches its
 * listeners to each frame's own document. Events inside a frame never reach this window, so
 * a frame OUTSIDE the preview would stay annotatable. There are none in this application
 * today; if one ever appears next to the preview, this guard has to be mounted inside it
 * too.
 */

/**
 * Agentation's own surfaces, which must keep working.
 *
 * Its UI lives in an open shadow root whose host is `<agentation-toolbar>`, inside a
 * `[data-agentation-portal]` wrapper appended to `document.body`. Events raised inside a
 * shadow root are retargeted to the host before they reach us, so matching the host is
 * enough - but the markers and popup are matched too, because they are portalled
 * separately. This list mirrors the package's own internal `TOOLBAR` selector.
 */
const AGENTATION_UI = [
  'agentation-toolbar',
  '[data-agentation-portal]',
  '[data-agentation-root]',
  '[data-feedback-toolbar]',
  '[data-annotation-popup]',
  '[data-annotation-marker]',
  '[data-agentation-settings-panel]',
].join(',');

/**
 * Host controls that must stay clickable while armed - above all the toggle that turns the
 * mode off again, which lives outside the scope root and would otherwise lock the user in.
 */
const EXEMPT = '[data-annotation-exempt]';

/**
 * Only the events Agentation actually listens to, plus the ones that would let a blocked
 * element react anyway (`click` follows a swallowed `mousedown` otherwise).
 *
 * `wheel` and `scroll` are deliberately absent: the preview is its own scroll container and
 * blocking those would break scrolling inside the very region being annotated.
 */
const GUARDED_EVENTS = [
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'mousemove',
  'pointerdown',
  'pointerup',
  'pointermove',
  'contextmenu',
] as const;

/** Clicks recorded but not yet claimed by an annotation. Bounded; see `recordPick`. */
const MAX_PENDING_PICKS = 32;

export type AnnotationPick = {
  element: HTMLElement;
  /** The `schema.components[]` entry this element was rendered by, if any. */
  componentName: string | null;
};

export type AnnotationScope = {
  /**
   * The clicks made since the last call, oldest first, and clears them.
   *
   * Agentation reports a finished annotation through `onAnnotationAdd` but does not say
   * which element it was attached to, and `elementPath` is a readable path rather than a
   * selector that can be resolved back. So we watch the picks ourselves: every click inside
   * the scope is recorded here, and the annotation that follows claims them. One click for
   * a normal annotation, several for a Cmd-click multi-select, none for an area drag over
   * empty space.
   */
  takePicks: () => AnnotationPick[];
  /** Whether an element is inside the annotatable region. */
  isInScope: (element: Element | null | undefined) => boolean;
};

export const useAnnotationScope = (
  scopeRef: RefObject<HTMLElement | null>,
  armed: boolean
): AnnotationScope => {
  const picksRef = useRef<AnnotationPick[]>([]);

  useEffect(() => {
    if (!armed) {
      picksRef.current = [];
      return;
    }

    const guard = (event: Event) => {
      const root = scopeRef.current;
      const target = event.target;

      if (!root || !(target instanceof Element)) {
        return;
      }

      if (target.closest(AGENTATION_UI) || target.closest(EXEMPT)) {
        return;
      }

      if (!root.contains(target)) {
        event.stopPropagation();
        return;
      }

      if (event.type === 'mousedown' && target instanceof HTMLElement) {
        recordPick(picksRef.current, target, event as MouseEvent);
      }
    };

    GUARDED_EVENTS.forEach((type) =>
      window.addEventListener(type, guard, true)
    );

    return () => {
      GUARDED_EVENTS.forEach((type) =>
        window.removeEventListener(type, guard, true)
      );
    };
  }, [armed, scopeRef]);

  const takePicks = useCallback(() => {
    const picks = picksRef.current;
    picksRef.current = [];
    return picks;
  }, []);

  const isInScope = useCallback(
    (element: Element | null | undefined) =>
      Boolean(element && scopeRef.current?.contains(element)),
    [scopeRef]
  );

  return { takePicks, isInScope };
};

/**
 * Note the element and the composed page component that rendered it.
 *
 * A plain click REPLACES the pending list; only a Cmd/Ctrl-click adds to it. That mirrors
 * Agentation's own multi-select rule, and it is what keeps an abandoned attempt from
 * contaminating the next note: click a button, think better of it, dismiss the popup, then
 * annotate something else - without the reset, the annotation that eventually lands would
 * claim both elements and name a component the user never commented on.
 *
 * The cap is for the remaining case, a long Cmd-click run, and drops the oldest - the most
 * recent clicks are the ones the next annotation is about.
 */
function recordPick(
  picks: AnnotationPick[],
  element: HTMLElement,
  event: MouseEvent
) {
  if (!event.metaKey && !event.ctrlKey) {
    picks.length = 0;
  }

  const tagged = element.closest('[data-ct-component]');

  picks.push({
    element,
    componentName: tagged?.getAttribute('data-ct-component') ?? null,
  });

  if (picks.length > MAX_PENDING_PICKS) {
    picks.splice(0, picks.length - MAX_PENDING_PICKS);
  }
}
