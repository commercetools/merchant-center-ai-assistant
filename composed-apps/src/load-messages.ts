/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  type TMessageTranslations,
  parseChunkImport,
} from '@commercetools-frontend/i18n';

// English only: the app has no translations of its own beyond what the shell provides.
const loadMessages = async (): Promise<TMessageTranslations> => {
  try {
    const chunkImport = await import(
      /* webpackChunkName: "app-i18n-en" */
      './i18n/data/en.json'
    );
    return parseChunkImport(chunkImport);
  } catch {
    // Missing app messages are not fatal: the shell falls back to its own translations.
    return {};
  }
};

export default loadMessages;
