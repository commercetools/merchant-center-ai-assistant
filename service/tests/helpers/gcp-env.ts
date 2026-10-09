/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { fakeKeyBase64 } from './gcp';
import { useEnv } from './use-env';

/** Fake project `fake-project-123`, dataset `aiassistant`, bucket `fake-project-123-ai-assistant-images`. */
export const FAKE_PROJECT = 'fake-project-123';
export const FAKE_DATASET = 'aiassistant';
export const FAKE_BUCKET = 'fake-project-123-ai-assistant-images';

export function useGcpEnv(extra: NodeJS.ProcessEnv = {}): void {
  useEnv({ GCP_SA_KEY_BASE64: fakeKeyBase64(), ...extra });
}

export const sessionTableRef = (suffix: string): string =>
  `${FAKE_PROJECT}.${FAKE_DATASET}.${suffix}`;
