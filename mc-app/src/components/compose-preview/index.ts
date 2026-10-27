/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { lazy } from 'react';

/**
 * Split out of the initial bundle, following `composed-page-view`.
 *
 * This view renders a composed page, which means it pulls in `page-renderer` and through
 * it `@babel/standalone` - an in-browser JSX compiler that was 58% of the app's largest
 * chunk (5.2 MB of source). It was reaching the first-paint graph because
 * `interactive-tab-content` imported this statically, even though the Preview tab is not
 * the one the app opens on.
 */
const ComposePreview = lazy(
  () => import('./compose-preview' /* webpackChunkName: "compose-preview" */)
);

export default ComposePreview;
