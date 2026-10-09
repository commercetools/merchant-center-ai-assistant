/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useEffect, type RefObject } from 'react';
import { whenAgentationReady } from './agentation-shadow-root';

/**
 * Repaint Agentation's toolbar in Nimbus colours and type.
 *
 * Its UI renders inside an OPEN shadow root (host: `<agentation-toolbar>`) whose stylesheet
 * is CSS modules with hashed class names - `.styles-module__controlButton___8Q0jc` and the
 * like. Those names change between releases, so styling against them would be a time bomb.
 *
 * What is stable is the handful of custom properties the package declares for its own
 * palette, and the data attributes it puts on its structural elements. This hook pushes one
 * adopted stylesheet into the shadow root that redefines only those properties, plus the
 * font family. That covers colour and type; it does not cover spacing, radii or control
 * shapes, which are reachable only by vendoring the package.
 *
 * `!important` is not decoration. The accent is declared inside the shadow root as
 * `[data-agentation-accent="indigo"] { --agentation-color-accent: ... }`, which lands on
 * the same element our rule targets - inheriting a value from the host would lose to it,
 * and matching specificity alone would depend on sheet order we do not control.
 *
 * Values are read off live Nimbus-styled probe elements rather than from `--nimbus-*`
 * variable names, because Chakra generates those names at runtime and the prefix is not
 * part of Nimbus's public surface.
 */

/** Agentation palette slot -> the `data-nimbus-token` probe that supplies its colour. */
const COLOR_SLOTS: Record<string, string> = {
  accent: 'accent',
  indigo: 'accent',
  blue: 'info',
  cyan: 'info',
  green: 'positive',
  yellow: 'warning',
  orange: 'warning',
  red: 'critical',
};

export const useAgentationTheme = (
  probeRef: RefObject<HTMLElement | null>,
  active: boolean
) => {
  useEffect(() => {
    if (!active || typeof CSSStyleSheet === 'undefined') {
      return;
    }

    const probe = probeRef.current;
    if (!probe) {
      return;
    }

    const sheet = new CSSStyleSheet();
    let applied: ShadowRoot | null = null;

    const stopWaiting = whenAgentationReady((shadow) => {
      sheet.replaceSync(buildThemeCss(probe));
      shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
      applied = shadow;
    });

    return () => {
      stopWaiting();
      detach(applied, sheet);
    };
  }, [probeRef, active]);
};

function detach(shadow: ShadowRoot | null, sheet: CSSStyleSheet) {
  if (!shadow) {
    return;
  }
  shadow.adoptedStyleSheets = shadow.adoptedStyleSheets.filter(
    (candidate) => candidate !== sheet
  );
}

function buildThemeCss(probe: HTMLElement): string {
  const declarations = Object.entries(COLOR_SLOTS)
    .map(([slot, token]) => {
      const colour = readProbeColour(probe, token);
      return colour ? `--agentation-color-${slot}: ${colour} !important;` : '';
    })
    .filter(Boolean)
    .join('\n    ');

  const fontFamily = window.getComputedStyle(probe).fontFamily;

  return `
  :host,
  [data-agentation-root] {
    ${declarations}
  }

  [data-agentation-root],
  [data-agentation-root] * {
    font-family: ${fontFamily};
  }
`;
}

function readProbeColour(probe: HTMLElement, token: string): string | null {
  const element = probe.querySelector<HTMLElement>(
    `[data-nimbus-token="${token}"]`
  );
  if (!element) {
    return null;
  }

  const { color } = window.getComputedStyle(element);

  // A probe that has not been painted yet reports the inherited or initial colour. Better
  // to leave Agentation's own palette in place than to paint it transparent black.
  return color && color !== 'rgba(0, 0, 0, 0)' ? color : null;
}
