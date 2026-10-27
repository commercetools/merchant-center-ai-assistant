/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { lazy } from 'react';

const ComposedPageView = lazy(
  () =>
    import('./composed-page-view' /* webpackChunkName: "composed-page-view" */)
);

export default ComposedPageView;
