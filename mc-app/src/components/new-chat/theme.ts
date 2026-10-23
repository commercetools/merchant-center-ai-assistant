/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// ============================================================================
// Chart palette
// ============================================================================
//
// What is left of the old hand-rolled design-token object. Everything that
// styled the DOM through it is now Nimbus, so the only surviving consumer is
// `new-chat/parts/visualization/chart-renderer.tsx`: Google Charts turns these
// strings into SVG presentation attributes, which cannot resolve the CSS custom
// properties a Nimbus colour token compiles down to.
//
// Do not import this for anything that renders DOM - use Nimbus tokens.

export const theme = {
  colors: {
    textPrimary: '#0d0d0d',
    textSecondary: '#6b6b6b',
    border: 'rgba(0, 0, 0, 0.1)',
  },
};
