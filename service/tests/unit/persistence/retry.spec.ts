/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { jest } from '@jest/globals';
import { UnavailableError } from '../../../src/persistence/gateway/errors';
import { backoffMs, withTransportRetry } from '../../../src/persistence/gateway/retry';

const httpError = (statusCode: number, headers?: Record<string, string>) =>
  Object.assign(new Error(`http ${statusCode}`), { statusCode, headers });

describe('withTransportRetry', () => {
  it('returns on success without sleeping', async () => {
    const sleep = jest.fn(async () => undefined);
    await expect(withTransportRetry(async () => 7, { sleep })).resolves.toBe(7);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('honours Retry-After seconds', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const result = await withTransportRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw httpError(503, { 'retry-after': '1' });
        return 'ok';
      },
      { sleep: async (ms) => void sleeps.push(ms) }
    );
    expect(result).toBe('ok');
    expect(calls).toBe(2);
    expect(sleeps).toEqual([1000]);
  });

  it('backs off exponentially with jitter otherwise', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    await withTransportRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw httpError(502);
        return 1;
      },
      { sleep: async (ms) => void sleeps.push(ms), random: () => 0.5, baseMs: 100 }
    );
    expect(sleeps).toEqual([100, 200]);
  });

  it('retries network errors', async () => {
    let calls = 0;
    await withTransportRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error('reset'), { code: 'ECONNRESET' });
        return 1;
      },
      { sleep: async () => undefined }
    );
    expect(calls).toBe(2);
  });

  it('gives up with UnavailableError after the last attempt', async () => {
    let calls = 0;
    await expect(
      withTransportRetry(
        async () => {
          calls += 1;
          throw httpError(429);
        },
        { sleep: async () => undefined }
      )
    ).rejects.toBeInstanceOf(UnavailableError);
    expect(calls).toBe(3);
  });

  it('does not retry other statuses', async () => {
    let calls = 0;
    await expect(
      withTransportRetry(
        async () => {
          calls += 1;
          throw httpError(500);
        },
        { sleep: async () => undefined }
      )
    ).rejects.toThrow('http 500');
    expect(calls).toBe(1);
  });

  it('jitter stays within +-50 percent', () => {
    expect(backoffMs(2, 100, () => 0)).toBe(200);
    expect(backoffMs(2, 100, () => 1)).toBe(600);
  });
});
