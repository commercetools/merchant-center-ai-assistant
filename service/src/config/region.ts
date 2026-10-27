/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export type McCloudIdentifier =
  | 'gcp-us'
  | 'gcp-eu'
  | 'gcp-au'
  | 'aws-eu'
  | 'aws-us';

/** commercetools API host spelling -> Merchant Center cloud identifier. */
const API_REGION_TO_MC: Record<string, McCloudIdentifier> = {
  'us-central1.gcp': 'gcp-us',
  'europe-west1.gcp': 'gcp-eu',
  'australia-southeast1.gcp': 'gcp-au',
  'eu-central-1.aws': 'aws-eu',
  'us-east-2.aws': 'aws-us',
};

export const API_REGIONS: readonly string[] = Object.keys(API_REGION_TO_MC);

export function apiRegionToCloudIdentifier(
  region: string
): McCloudIdentifier | undefined {
  return Object.prototype.hasOwnProperty.call(API_REGION_TO_MC, region)
    ? API_REGION_TO_MC[region]
    : undefined;
}

export function cloudIdentifierToApiRegion(
  id: string
): string | undefined {
  return API_REGIONS.find((r) => API_REGION_TO_MC[r] === id);
}
