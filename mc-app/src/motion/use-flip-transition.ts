/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { MOTION } from './tokens';
import { useReducedMotion } from './use-reduced-motion';

export type FlipOptions = {
  duration?: string;
  easing?: string;
  /** Set false to record positions without animating (e.g. while the element is hidden). */
  enabled?: boolean;
};

/**
 * Animate an element between two layout positions - the FLIP technique.
 *
 * The element is *not* moved by this hook. Something else changes the layout (a flex column
 * becoming a sticky footer, a grid row disappearing), React commits it, and this hook makes
 * the jump look like a glide: it measures where the element used to be, transforms it back
 * there instantly, then releases it to its new home over one transition.
 *
 * Built for the composer, which is one mounted instance in both the empty state (centred in
 * the column) and the conversation (pinned to the bottom). Keeping a single instance is the
 * point: focus stays in the textarea, typed text and attached files survive, and there is no
 * cross-fade between two composers to get wrong.
 *
 * `key` is whatever value flips when the layout changes - pass the same boolean that drives
 * the layout. Positions are re-measured on every commit where `key` changes.
 */
export const useFlipTransition = (
  ref: RefObject<HTMLElement | null>,
  key: unknown,
  {
    duration = MOTION.duration.move,
    easing = MOTION.easing.standard,
    enabled = true,
  }: FlipOptions = {}
): void => {
  const previousRect = useRef<DOMRect | null>(null);
  const frame = useRef<number | null>(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const next = node.getBoundingClientRect();
    const previous = previousRect.current;
    previousRect.current = next;

    // First measurement, motion switched off, or the user asked for less of it: record only.
    if (!previous || !enabled || reduced) return;

    const dx = previous.left - next.left;
    const dy = previous.top - next.top;

    // Sub-pixel drift is not a move. Animating it would fight the browser's own rounding.
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

    // Invert: put it back where the user last saw it, with no transition to animate the jump.
    node.style.transition = 'none';
    node.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;

    // Play: two frames, so the inverted transform is painted before the transition is armed.
    // One frame is enough in most browsers and not all; two is the reliable form.
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        node.style.transition = `transform ${duration} ${easing}`;
        node.style.transform = 'translate3d(0, 0, 0)';
      });
    });
  }, [ref, key, enabled, reduced, duration, easing]);

  // Hand the element back to the stylesheet once it has arrived, so a stale inline
  // `transform` cannot interfere with the next layout change or with hover transforms.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== node || event.propertyName !== 'transform') return;
      node.style.transition = '';
      node.style.transform = '';
    };

    node.addEventListener('transitionend', onTransitionEnd);
    return () => {
      node.removeEventListener('transitionend', onTransitionEnd);
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
      node.style.transition = '';
      node.style.transform = '';
    };
  }, [ref]);
};
