/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { isIP } from 'node:net';

/**
 * Syntactic SSRF guard for an operator-supplied URL. DNS rebinding is NOT solved: the host
 * name is not resolved. The thrown message names the rule that failed and never contains the
 * URL.
 */

const ipv4Blocked = (octets: number[]): boolean => {
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
};

const parseIpv4 = (host: string): number[] | undefined => {
  const parts = host.split('.').map(Number);
  return parts.length === 4 && parts.every((n) => Number.isInteger(n))
    ? parts
    : undefined;
};

const ipv6Blocked = (host: string): boolean => {
  const h = host.toLowerCase();
  if (h === '::1' || h === '::') return true;
  // IPv4-mapped: ::ffff:a.b.c.d, or the hex form ::ffff:7f00:1 that `new URL` produces.
  const mapped = /^::ffff:(.+)$/.exec(h);
  if (mapped) {
    const v4 = parseIpv4(mapped[1]);
    if (v4) return ipv4Blocked(v4);
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(mapped[1]);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return ipv4Blocked([hi >> 8, hi & 255, lo >> 8, lo & 255]);
    }
    return true;
  }
  const first = parseInt(h.split(':')[0] || '0', 16);
  // fc00::/7 unique local, fe80::/10 link local
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
};

export const assertPublicHttpsUrl = (raw: string): void => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('not a valid URL');
  }
  if (url.protocol !== 'https:') throw new Error('must use https');
  if (url.username || url.password) {
    throw new Error('must not contain user-info');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    host === '' ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    throw new Error('host is not public');
  }
  const kind = isIP(host);
  if (kind === 4 && ipv4Blocked(host.split('.').map(Number))) {
    throw new Error('host is not public');
  }
  if (kind === 6 && ipv6Blocked(host)) throw new Error('host is not public');
};

export const isPublicHttpsUrl = (raw: string): boolean => {
  try {
    assertPublicHttpsUrl(raw);
    return true;
  } catch {
    return false;
  }
};
