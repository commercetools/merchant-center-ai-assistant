/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Agentation's own preference store, pre-set before its first mount.
 *
 * The package persists its settings panel to `localStorage` and merges whatever it finds
 * over its defaults. Two of those defaults are wrong for us:
 *
 * - `webhooksEnabled` ships ON. Nothing is sent without a `webhookUrl`, but leaving a
 *   one-field-away egress path for rendered Merchant Center content enabled by default is
 *   not a decision to leave to whoever opens the settings panel. Forced off on every mount.
 * - `reactEnabled` collects React component names from dev metadata. Composed pages are
 *   model-authored JSX compiled by `@babel/standalone` at runtime, so that metadata
 *   describes the renderer rather than the page - noise in the payload, and misleading
 *   noise at that.
 *
 * Everything else is seeded only when the key is absent, because it is also the user's
 * preference store and overwriting a deliberate choice on every mount would be rude.
 */

const SETTINGS_KEY = 'feedback-toolbar-settings';
const THEME_KEY = 'feedback-toolbar-theme';

/** Set once, on first run, then left to the user. */
const SEEDED_DEFAULTS = {
  /** `compact` drops the metadata we do not use; `detailed` and `forensic` are enormous. */
  outputDetail: 'standard',
  /** Closest of the seven built-in swatches to Nimbus primary; see `use-agentation-theme`. */
  annotationColorId: 'indigo',
  /** Keep notes after a copy - the user may still want to send them. */
  autoClearAfterCopy: false,
};

/** Re-applied on every mount, because these are safety properties rather than preferences. */
const ENFORCED = {
  webhooksEnabled: false,
  webhookUrl: '',
  reactEnabled: false,
};

export const seedAgentationDefaults = (isDark: boolean) => {
  try {
    const stored = window.localStorage.getItem(SETTINGS_KEY);
    const saved = stored ? JSON.parse(stored) : null;

    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ ...SEEDED_DEFAULTS, ...(saved ?? {}), ...ENFORCED })
    );

    /*
     * Read once at mount by Agentation, never again - so this follows the Merchant Center
     * colour mode across remounts, but not a switch made while the toolbar is open. Light
     * and dark are separate rule sets inside its shadow root, not custom properties, so
     * there is nothing `use-agentation-theme` can do about that half.
     */
    if (window.localStorage.getItem(THEME_KEY) === null) {
      window.localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    }
  } catch {
    // Private mode, disabled storage, a quota wall: Agentation falls back to its own
    // defaults, which is a worse toolbar rather than a broken one.
  }
};
