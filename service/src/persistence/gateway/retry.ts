/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { UnavailableError } from './errors';

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** +-50 % jitter around `base * 2^attempt`. */
export function backoffMs(attempt: number, base: number, random = Math.random): number {
  const nominal = base * 2 ** attempt;
  return Math.round(nominal * (0.5 + random()));
}

export interface TransientInfo {
  /** HTTP status when the failure was an HTTP answer. */
  status?: number;
  /** Seconds from a `Retry-After` header. */
  retryAfterSeconds?: number;
  /** True for connection resets, timeouts and other network errors. */
  network?: boolean;
}

const TRANSIENT_STATUS = new Set([429, 502, 503, 504]);
const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function headerValue(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const h = headers as Record<string, unknown> & { get?: (n: string) => unknown };
  const raw = typeof h.get === 'function' ? h.get(name) : (h[name] ?? h[name.toLowerCase()]);
  return typeof raw === 'string' ? raw : undefined;
}

/** Reads status, Retry-After and network-ness off an SDK or fetch error without trusting its shape. */
export function describeError(e: unknown): TransientInfo {
  if (typeof e !== 'object' || e === null) return {};
  const err = e as {
    statusCode?: unknown;
    status?: unknown;
    code?: unknown;
    name?: unknown;
    headers?: unknown;
    cause?: unknown;
    error?: unknown;
  };
  const statusRaw = err.statusCode ?? err.status;
  const status = typeof statusRaw === 'number' ? statusRaw : undefined;
  const retryRaw = headerValue(err.headers, 'retry-after');
  const retryNum = retryRaw === undefined ? NaN : Number(retryRaw);
  const cause = err.cause as { code?: unknown } | undefined;
  const code = typeof err.code === 'string' ? err.code : typeof cause?.code === 'string' ? cause.code : undefined;
  // The SDK client reports an unparsable (for example empty) response body as
  // `{ body: null, error: NetworkError }` without a status.
  const wrapped = err.error as { name?: unknown } | undefined;
  const sdkNetworkError = status === undefined && wrapped?.name === 'NetworkError';
  return {
    status,
    retryAfterSeconds: Number.isFinite(retryNum) && retryNum >= 0 ? retryNum : undefined,
    network:
      sdkNetworkError ||
      (code !== undefined && NETWORK_CODES.has(code)) ||
      err.name === 'TimeoutError' ||
      err.name === 'AbortError' ||
      (status === undefined && err.name === 'TypeError'),
  };
}

export function isTransient(info: TransientInfo): boolean {
  return (info.status !== undefined && TRANSIENT_STATUS.has(info.status)) || info.network === true;
}

export interface RetryOptions {
  attempts?: number;
  baseMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Maps an error to transient information; defaults to {@link describeError}. */
  classify?: (e: unknown) => TransientInfo;
}

/**
 * Retries 429/502/503/504 and network errors (`attempts` total tries, default 3), honouring
 * Retry-After. Anything else is rethrown untouched; running out of tries throws
 * `UnavailableError` (the original error is not attached: it may carry request details).
 */
export async function withTransportRetry<T>(
  fn: () => Promise<T>,
  o: RetryOptions = {}
): Promise<T> {
  const attempts = o.attempts ?? 3;
  const baseMs = o.baseMs ?? 200;
  const wait = o.sleep ?? sleep;
  const classify = o.classify ?? describeError;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const info = classify(e);
      if (!isTransient(info)) throw e;
      if (attempt + 1 >= attempts) {
        throw new UnavailableError('commercetools is temporarily unavailable');
      }
      const delay =
        info.retryAfterSeconds !== undefined
          ? Math.min(info.retryAfterSeconds * 1000, 30000)
          : backoffMs(attempt, baseMs, o.random);
      await wait(delay);
    }
  }
}
