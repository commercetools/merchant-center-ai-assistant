/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

const RETRYABLE = new Set([502, 503, 504]);

/**
 * GET <origin>/service/status with retries for cold start (network errors, 502/503/504).
 * 401/403/404 are NOT retried: they mean a wrong path or auth, not a cold start.
 * Returns `{ok:true, attempts}` or throws with the last reason.
 */
export async function smoke({ fetch, sleep, origin, attempts = 10, delayMs = 10_000, onAttempt = () => {} }) {
  let reason = 'no attempt made';
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const response = await fetch(`${origin}/service/status`);
      if (response.status === 200) {
        const body = await response.json().catch(() => undefined);
        // The service answers {status:'UP'}; 'ok' is accepted as well.
        if (/^(up|ok)$/i.test(String(body?.status))) return { ok: true, attempts: i };
        throw new Error('status endpoint answered 200 without a healthy status field');
      }
      reason = `HTTP ${response.status}`;
      if (!RETRYABLE.has(response.status)) throw new Error(`smoke check failed: ${reason}`);
    } catch (error) {
      if (String(error?.message).startsWith('smoke check failed') || String(error?.message).startsWith('status endpoint')) {
        throw error;
      }
      reason = `network error (${error?.name ?? 'Error'})`;
    }
    onAttempt(i, reason);
    if (i < attempts) await sleep(delayMs);
  }
  throw new Error(`smoke check failed after ${attempts} attempts: ${reason}`);
}
