/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * The single source of motion values for the chat surface.
 *
 * Every duration, easing, distance and stagger step in the app comes from here. Components
 * import presets (see `presets.ts`), never these raw values, and never declare their own
 * `animationDuration` / `transition` strings. See `README.md` for the rule.
 *
 * The numbers are the redesign's own motion tokens, copied from the design system's
 * `colors_and_type.css` (`--motion-fast|base|slow|easing|easing-in`) plus the entrance scale
 * the redesign document defines inline (`--anim`, `--anim-slow`, `--rise`). Nimbus itself
 * publishes no motion token scale - its recipes inline cubic-beziers - which is precisely why
 * this file exists rather than re-exporting something from the design system.
 */
export const MOTION = {
  duration: {
    /** Colour, background and opacity swaps on hover. */
    fast: '120ms',
    /** Small transforms and state changes: press, chevron rotation, toggle knobs. */
    base: '180ms',
    /** Larger interaction transitions: disclosure open/close, panel reveal. */
    slow: '280ms',
    /** Element entrance: fade plus rise. */
    enter: '320ms',
    /** Entrance for large surfaces: drawers, result cards. */
    enterSlow: '460ms',
    /** FLIP layout moves, e.g. the composer travelling from centre to bottom. */
    move: '460ms',
  },
  easing: {
    /** Decelerating curve for anything entering or settling. The default. */
    standard: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
    /** Accelerating curve for anything leaving the screen. */
    in: 'cubic-bezier(0.55, 0.05, 0.68, 0.53)',
  },
  /** How far a rising element travels on entrance. Matches the design's `--rise`. */
  rise: '14px',
  /** Delay added per item when a list or grid enters one item at a time. */
  staggerMs: 60,
  /** Cap on stagger so a long list does not take seconds to finish arriving. */
  staggerMaxItems: 8,
} as const;

/**
 * Keyframe names. `fade-*`, `scale-*` and `slide-*` come from the Nimbus theme; `spin`,
 * `pulse` and `bounce` come from the Chakra base the theme is built on. Both resolve through
 * the `animationName` style prop, so no `@keyframes` is ever declared in this codebase.
 */
export const KEYFRAMES = {
  fadeIn: 'fade-in',
  fadeOut: 'fade-out',
  scaleIn: 'scale-in',
  scaleOut: 'scale-out',
  riseIn: 'fade-in, slide-from-bottom',
  slideFromLeft: 'fade-in, slide-from-left',
  slideFromRight: 'fade-in, slide-from-right',
  spin: 'spin',
  pulse: 'pulse',
  bounce: 'bounce',
} as const;
