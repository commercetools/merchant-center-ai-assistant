/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Connect region -> Merchant Center cloud identifier (design E9). One table, one test.
export const CLOUD_IDENTIFIER_BY_REGION = {
  'us-central1.gcp': 'gcp-us',
  'europe-west1.gcp': 'gcp-eu',
  'australia-southeast1.gcp': 'gcp-au',
  'us-east-2.aws': 'aws-us',
  'eu-central-1.aws': 'aws-eu',
};

export function cloudIdentifierFor(region) {
  const id = Object.hasOwn(CLOUD_IDENTIFIER_BY_REGION, region)
    ? CLOUD_IDENTIFIER_BY_REGION[region]
    : undefined;
  if (!id) {
    throw new Error(
      `unknown Connect region '${region}' (expected one of ${Object.keys(CLOUD_IDENTIFIER_BY_REGION).join(', ')})`
    );
  }
  return id;
}

/** The published docs list only the GCP regions for `--supported-regions` (design E1). */
export function isGcpRegion(region) {
  return region.endsWith('.gcp');
}
