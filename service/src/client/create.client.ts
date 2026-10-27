/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  ByProjectKeyRequestBuilder,
  createApiBuilderFromCtpClient,
} from '@commercetools/platform-sdk';
import { readConfiguration } from '../config';
import { buildClient } from './build.client';

let root: ByProjectKeyRequestBuilder | undefined;

/** Built once per process; never per request. */
export function getApiRoot(): ByProjectKeyRequestBuilder {
  if (!root) {
    const { ctp } = readConfiguration();
    root = createApiBuilderFromCtpClient(buildClient(ctp)).withProjectKey({
      projectKey: ctp.projectKey,
    });
  }
  return root;
}

export function resetApiRootForTests(): void {
  root = undefined;
}
