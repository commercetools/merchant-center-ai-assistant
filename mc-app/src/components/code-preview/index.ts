/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { lazy } from 'react';

/** Split out of the initial bundle; see the note in `compose-preview/index.ts`. */
const CodePreview = lazy(
  () => import('./code-preview' /* webpackChunkName: "code-preview" */)
);

export default CodePreview;
