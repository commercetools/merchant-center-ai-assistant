/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useMemo } from 'react';
import * as presets from './presets';
import type { MotionProps, PresetOptions } from './presets';
import { useReducedMotion } from './use-reduced-motion';

type Bound = {
  enter: (options?: Omit<PresetOptions, 'reduced'>) => MotionProps;
  enterStagger: (
    index: number,
    options?: Omit<PresetOptions, 'reduced'>
  ) => MotionProps;
  enterLarge: (options?: Omit<PresetOptions, 'reduced'>) => MotionProps;
  exit: (options?: Omit<PresetOptions, 'reduced'>) => MotionProps;
  drawerIn: () => MotionProps;
  fadeIn: (options?: Omit<PresetOptions, 'reduced'>) => MotionProps;
  spin: () => MotionProps;
  caret: () => MotionProps;
  pulse: () => MotionProps;
  interactive: () => MotionProps;
  tint: () => MotionProps;
  /** True when the user asked for reduced motion, for the rare layout that must branch. */
  reduced: boolean;
};

/**
 * The presets, already bound to the user's reduced-motion preference.
 *
 * This is how components consume motion:
 *
 *   const motion = useMotion();
 *   <Card {...motion.enterStagger(index)} {...motion.interactive()} />
 *
 * Nothing else in the app should reference durations, easings or keyframe names.
 */
export const useMotion = (): Bound => {
  const reduced = useReducedMotion();

  return useMemo(
    () => ({
      enter: (options) => presets.enter({ ...options, reduced }),
      enterStagger: (index, options) =>
        presets.enterStagger(index, { ...options, reduced }),
      enterLarge: (options) => presets.enterLarge({ ...options, reduced }),
      exit: (options) => presets.exit({ ...options, reduced }),
      drawerIn: () => presets.drawerIn({ reduced }),
      fadeIn: (options) => presets.fadeIn({ ...options, reduced }),
      spin: () => presets.spin({ reduced }),
      caret: () => presets.caret({ reduced }),
      pulse: () => presets.pulse({ reduced }),
      interactive: () => presets.interactive({ reduced }),
      tint: () => presets.tint({ reduced }),
      reduced,
    }),
    [reduced]
  );
};
