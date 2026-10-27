/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { KEYFRAMES, MOTION } from './tokens';

/**
 * The style props a preset produces. These are Chakra/Nimbus system props, so the object is
 * spread straight onto any Nimbus component: `<Box {...motion.enter()} />`.
 */
export type MotionProps = {
  animationName?: string;
  animationDirection?: string;
  animationDuration?: string;
  animationDelay?: string;
  animationTimingFunction?: string;
  animationFillMode?: string;
  animationIterationCount?: string;
  transitionProperty?: string;
  transitionDuration?: string;
  transitionTimingFunction?: string;
};

/** Nothing animates. Returned by every preset when the user asked for reduced motion. */
const STILL: MotionProps = {};

const delayMs = (ms?: number): string | undefined =>
  ms && ms > 0 ? `${Math.round(ms)}ms` : undefined;

export type PresetOptions = {
  /** Collapse to no animation. Callers get this wired automatically via `useMotion`. */
  reduced?: boolean;
  /** Extra delay before the animation starts. */
  delay?: number;
};

/** Fade and rise into place. The default entrance for cards, rows, chips and panels. */
export const enter = ({ reduced, delay }: PresetOptions = {}): MotionProps =>
  reduced
    ? STILL
    : {
        animationName: KEYFRAMES.riseIn,
        animationDuration: MOTION.duration.enter,
        animationTimingFunction: MOTION.easing.standard,
        animationFillMode: 'both',
        animationDelay: delayMs(delay),
      };

/**
 * `enter` for item `index` of a list, each one starting a beat after the last. The delay
 * stops growing past `MOTION.staggerMaxItems` so a long list still finishes promptly.
 */
export const enterStagger = (
  index: number,
  { reduced, delay = 0 }: PresetOptions = {}
): MotionProps =>
  enter({
    reduced,
    delay: delay + Math.min(index, MOTION.staggerMaxItems) * MOTION.staggerMs,
  });

/** Entrance for a large surface: a drawer body, a result card. Slower, same curve. */
export const enterLarge = ({
  reduced,
  delay,
}: PresetOptions = {}): MotionProps =>
  reduced
    ? STILL
    : {
        animationName: KEYFRAMES.riseIn,
        animationDuration: MOTION.duration.enterSlow,
        animationTimingFunction: MOTION.easing.standard,
        animationFillMode: 'both',
        animationDelay: delayMs(delay),
      };

/** Fade out. Uses the accelerating curve, because it is leaving. */
export const exit = ({ reduced, delay }: PresetOptions = {}): MotionProps =>
  reduced
    ? STILL
    : {
        animationName: KEYFRAMES.fadeOut,
        animationDuration: MOTION.duration.slow,
        animationTimingFunction: MOTION.easing.in,
        animationFillMode: 'both',
        animationDelay: delayMs(delay),
      };

/** A left-edge drawer sliding in. */
export const drawerIn = ({ reduced }: PresetOptions = {}): MotionProps =>
  reduced
    ? STILL
    : {
        animationName: KEYFRAMES.slideFromLeft,
        animationDuration: MOTION.duration.enterSlow,
        animationTimingFunction: MOTION.easing.standard,
        animationFillMode: 'both',
      };

/** A plain fade, no movement. For overlays and backdrops. */
export const fadeIn = ({ reduced, delay }: PresetOptions = {}): MotionProps =>
  reduced
    ? STILL
    : {
        animationName: KEYFRAMES.fadeIn,
        animationDuration: MOTION.duration.enter,
        animationTimingFunction: MOTION.easing.standard,
        animationFillMode: 'both',
        animationDelay: delayMs(delay),
      };

/** An indefinite spinner. Kept at full speed under reduced motion is wrong, so it stops. */
export const spin = ({ reduced }: PresetOptions = {}): MotionProps =>
  reduced
    ? STILL
    : {
        animationName: KEYFRAMES.spin,
        animationDuration: '700ms',
        animationTimingFunction: 'linear',
        animationIterationCount: 'infinite',
      };

/** A slow attention pulse, e.g. the composed-page highlight. */
export const pulse = ({ reduced }: PresetOptions = {}): MotionProps =>
  reduced
    ? STILL
    : {
        animationName: KEYFRAMES.pulse,
        animationDuration: '2s',
        animationTimingFunction: MOTION.easing.standard,
        animationIterationCount: 'infinite',
      };

/**
 * A soft pulse for a caret or a "still typing" marker.
 *
 * Built on the stock `pulse` keyframe, which dips to 0.5 and back. The previous version
 * used `fade-in` with `step-end` and `alternate`, which holds the `from` value for a whole
 * cycle - so the marker was at opacity ZERO for half of every 800ms, and at a small size
 * that does not read as blinking, it reads as an icon that is missing. A caret should stay
 * legible while it animates.
 */
export const caret = ({ reduced }: PresetOptions = {}): MotionProps =>
  reduced
    ? STILL
    : {
        animationName: KEYFRAMES.pulse,
        animationDuration: '1100ms',
        animationTimingFunction: MOTION.easing.standard,
        animationIterationCount: 'infinite',
      };

/**
 * Hover and press feedback for a card or tile: the transition half of the effect. The
 * component still supplies the `_hover` / `_active` values it wants; this makes sure every
 * surface eases them identically, and that none of them move at all under reduced motion.
 */
export const interactive = ({ reduced }: PresetOptions = {}): MotionProps =>
  reduced
    ? {
        transitionProperty:
          'background-color, border-color, color, box-shadow' as const,
        transitionDuration: MOTION.duration.fast,
        transitionTimingFunction: MOTION.easing.standard,
      }
    : {
        transitionProperty:
          'background-color, border-color, color, box-shadow, transform',
        transitionDuration: MOTION.duration.base,
        transitionTimingFunction: MOTION.easing.standard,
      };

/** Colour-only transition, for text and icon buttons that must not move. */
export const tint = ({ reduced }: PresetOptions = {}): MotionProps => ({
  transitionProperty: 'background-color, border-color, color, opacity',
  transitionDuration: reduced ? '0ms' : MOTION.duration.fast,
  transitionTimingFunction: MOTION.easing.standard,
});
