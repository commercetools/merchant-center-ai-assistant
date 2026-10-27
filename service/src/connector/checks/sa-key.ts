/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  ServiceAccountKey,
  ServiceAccountKeyError,
  parseServiceAccountKey,
} from '../../gcp/service-account';

export type SaKeyResult =
  | { ok: true; warnings: string[]; key: ServiceAccountKey; projectId: string }
  | { ok: false; reason: string };

/**
 * Decodes the Base64 service-account JSON with `parseServiceAccountKey` (closed list of
 * reasons, no input is ever echoed). The effective project is
 * `configuredProjectId ?? key.project_id`; a differing GCP_PROJECT_ID is a warning because
 * the key's account may be granted access to another project.
 */
export function checkSaKey(base64: string, configuredProjectId?: string): SaKeyResult {
  try {
    const key = parseServiceAccountKey(base64);
    const warnings: string[] = [];
    if (configuredProjectId !== undefined && configuredProjectId !== key.project_id) {
      warnings.push(
        'GCP_PROJECT_ID differs from the project of the service-account key (allowed when the account has access to that project)'
      );
    }
    return { ok: true, warnings, key, projectId: configuredProjectId ?? key.project_id };
  } catch (error) {
    if (error instanceof ServiceAccountKeyError) return { ok: false, reason: error.reason };
    return { ok: false, reason: 'service-account key could not be read' };
  }
}
