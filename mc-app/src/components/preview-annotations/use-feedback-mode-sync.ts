/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useEffect, useRef } from 'react';
import { whenAgentationReady } from './agentation-shadow-root';

/**
 * Keep Agentation's own picking mode in step with our toggle.
 *
 * Mounting the toolbar is not the same as starting it. Left alone, Agentation comes up
 * collapsed to an unlabelled 44px circle in the corner of the screen, and nothing happens
 * on hover or click until that circle is found and clicked - so a toggle that says
 * "Annotate preview" would arm the scope guard, make the rest of the application inert, and
 * appear to do nothing at all. It is started here instead, so our toggle is the only control
 * the user needs.
 *
 * The reverse direction matters too: Agentation has its own Exit button, and a user who
 * leaves through it would otherwise strand our toggle in the armed state - still saying
 * "Done annotating", still holding the rest of the app inert. `onExit` hands that back.
 *
 * Both halves lean on an implementation detail - a button Agentation labels
 * "Start feedback mode" - so both are written to fail safely. If that label ever changes,
 * the start click is skipped and the user is back to clicking the circle themselves, and the
 * exit is simply not noticed. Neither weakens the scope guard, which is the one thing here
 * that must not silently stop working.
 */

/** Agentation's own accessible name for the control that begins picking. */
const START_BUTTON =
  'button[aria-label="Start feedback mode"], button[title="Start feedback mode"]';

/**
 * How long to keep looking for that button, in animation frames (~1s).
 *
 * The toolbar plays a 750ms entrance animation on its first mount of the page, and the
 * control is not necessarily in the first commit after the shadow root attaches.
 */
const MAX_FRAMES = 60;

export const useFeedbackModeSync = (active: boolean, onExit: () => void) => {
  // Kept in a ref so a new `onExit` identity does not tear down and re-arm the whole thing.
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    if (!active) {
      return;
    }

    let disposed = false;
    let frame = 0;
    let attempts = 0;
    let observer: MutationObserver | undefined;

    const stopWaiting = whenAgentationReady((shadow) => {
      const findStart = () =>
        shadow.querySelector<HTMLButtonElement>(START_BUTTON);

      /*
       * Only once picking has been SEEN to be on does the button coming back mean the user
       * left. Without that latch, a start click that did not take would read as an
       * immediate exit and disarm the mode the user just asked for - the toggle would flick
       * straight back off, which is a far more confusing failure than one extra click.
       */
      let confirmedActive = false;

      const watch = () => {
        observer = new MutationObserver(() => {
          if (disposed) {
            return;
          }
          if (!confirmedActive) {
            confirmedActive = !findStart();
            return;
          }
          if (findStart()) {
            onExitRef.current();
          }
        });
        observer.observe(shadow, { childList: true, subtree: true });
      };

      const start = () => {
        if (disposed) {
          return;
        }

        const button = findStart();
        if (button) {
          button.click();
          watch();
          return;
        }

        if (attempts++ < MAX_FRAMES) {
          frame = requestAnimationFrame(start);
        }
      };

      start();
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      stopWaiting();
    };
  }, [active]);
};
