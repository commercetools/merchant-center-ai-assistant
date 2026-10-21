/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export interface ServiceOriginResult {
  /** Log lines (already prefixed). */
  lines: string[];
  /** The origin of CONNECT_SERVICE_URL when it is a usable https URL. */
  serviceOrigin?: string;
}

function originOf(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The service derives the audience of the Merchant Center token from CONNECT_SERVICE_URL, so
 * the lifecycle script only reports what Connect handed it. It never fails: there is nothing
 * configured to disagree with.
 */
export function checkServiceOrigin(input: { serviceUrl?: string }): ServiceOriginResult {
  if (!input.serviceUrl) {
    return { lines: ['post-deploy: CONNECT_SERVICE_URL is not set; the service origin is unknown'] };
  }
  const serviceOrigin = originOf(input.serviceUrl);
  if (!serviceOrigin) {
    return { lines: ['post-deploy: CONNECT_SERVICE_URL is not a valid https URL'] };
  }
  return { lines: [`post-deploy: service origin ${serviceOrigin}`], serviceOrigin };
}
