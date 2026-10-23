/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Secret } from '../secret';
import { McCloudIdentifier, API_REGIONS, apiRegionToCloudIdentifier } from '../region';
import { str } from '../parse';
import { SectionParser } from '../types';

export interface CtpConfig {
  projectKey: string;
  /** API-host spelling, for example us-central1.gcp. */
  region: string;
  mcCloudIdentifier: McCloudIdentifier;
  /** Absent only when PERSISTENCE_DRIVER=memory (tests, local runs). */
  clientId?: string;
  clientSecret?: Secret<string>;
  scope?: string;
  apiUrl?: string;
  authUrl?: string;
}

export const parseCtp: SectionParser<CtpConfig> = (env) => {
  const errors: string[] = [];
  // Raw read only to relax requirements; the persistence section validates it.
  const memory = str(env, 'PERSISTENCE_DRIVER') === 'memory';

  const projectKey = str(env, 'CTP_PROJECT_KEY');
  if (!projectKey) errors.push('CTP_PROJECT_KEY: required');

  const region = str(env, 'CTP_REGION');
  let mcCloudIdentifier: McCloudIdentifier | undefined;
  if (!region) {
    errors.push('CTP_REGION: required');
  } else {
    mcCloudIdentifier = apiRegionToCloudIdentifier(region);
    if (!mcCloudIdentifier) {
      errors.push(`CTP_REGION: must be one of ${API_REGIONS.join(', ')}`);
    }
  }

  const need = (key: string): string | undefined => {
    const v = str(env, key);
    if (!v && !memory) errors.push(`${key}: required`);
    return v;
  };
  const url = (key: string): string | undefined => {
    const v = need(key);
    if (v && !v.startsWith('https://')) {
      errors.push(`${key}: must start with https://`);
    }
    return v;
  };

  const clientId = need('CTP_CLIENT_ID');
  const clientSecret = need('CTP_CLIENT_SECRET');
  const scope = need('CTP_SCOPE');
  const apiUrl = url('CTP_API_URL');
  const authUrl = url('CTP_AUTH_URL');

  if (errors.length > 0 || !projectKey || !region || !mcCloudIdentifier) {
    return { errors };
  }
  return {
    errors,
    value: {
      projectKey,
      region,
      mcCloudIdentifier,
      clientId,
      clientSecret: clientSecret ? new Secret(clientSecret) : undefined,
      scope,
      apiUrl,
      authUrl,
    },
  };
};
