/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export interface AudienceResult {
  ok: boolean;
  /** Why it failed (names both origins on a mismatch). */
  failure?: string;
  /** Log lines (already prefixed). */
  lines: string[];
  /** The origin of CONNECT_SERVICE_URL when known. */
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
 * MC_AUDIENCE is the service origin (no path); the forward-to JWT audience is origin + path.
 * Mismatch is a failure (the service would reject every Merchant Center request); an unset
 * value is only a hint with the exact value to configure (phase 1 of the deployment).
 */
export function checkAudience(input: { mcAudience?: string; serviceUrl?: string }): AudienceResult {
  const lines: string[] = [];
  const serviceOrigin = input.serviceUrl ? originOf(input.serviceUrl) : undefined;

  if (input.serviceUrl && !serviceOrigin) {
    lines.push('post-deploy: CONNECT_SERVICE_URL is not a valid https URL; audience not verified');
  }
  if (serviceOrigin) lines.push(`post-deploy: service origin ${serviceOrigin}`);

  if (!input.mcAudience) {
    lines.push(
      serviceOrigin
        ? `post-deploy: MC_AUDIENCE is not set. Set it to ${serviceOrigin} (redeploy: finalize)`
        : 'post-deploy: MC_AUDIENCE is not set. Set it to the origin of the service URL (redeploy: finalize)'
    );
    return { ok: true, lines, serviceOrigin };
  }

  const configured = originOf(input.mcAudience);
  if (!configured) {
    return { ok: false, failure: 'MC_AUDIENCE is not a valid https URL', lines, serviceOrigin };
  }
  if (serviceOrigin && configured !== serviceOrigin) {
    return {
      ok: false,
      failure: `MC_AUDIENCE origin ${configured} does not match the service origin ${serviceOrigin}`,
      lines,
      serviceOrigin,
    };
  }
  if (!serviceOrigin) {
    lines.push('post-deploy: MC_AUDIENCE is set; CONNECT_SERVICE_URL is unavailable, not compared');
  } else {
    lines.push(`post-deploy: MC_AUDIENCE matches the service origin`);
  }
  return { ok: true, lines, serviceOrigin };
}
