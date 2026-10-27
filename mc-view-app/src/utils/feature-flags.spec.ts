/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  applyFeatureFlagsToUrl,
  CUSTOM_VIEW_FLAG,
  encodeHostUrl,
} from './feature-flags';

const decode = (value: string) => Buffer.from(value, 'base64').toString('utf8');

describe('encodeHostUrl', () => {
  it('encodes ASCII like btoa', () => {
    const url = 'https://mc.example.invalid/my-project/products/abc';
    expect(encodeHostUrl(url)).toBe(btoa(url));
    expect(decode(encodeHostUrl(url))).toBe(url);
  });

  it('round-trips non-Latin-1 characters without throwing', () => {
    const url = 'https://mc.example.invalid/p/products/テスト-ü\u{1f600}';
    expect(() => btoa(url)).toThrow();
    expect(decode(encodeHostUrl(url))).toBe(url);
  });
});

describe('applyFeatureFlagsToUrl', () => {
  const base = 'https://service.example.invalid/ai-chat/s1/message/stream';

  it('returns the url untouched without flags', () => {
    expect(applyFeatureFlagsToUrl(base, undefined)).toBe(base);
    expect(applyFeatureFlagsToUrl(base, {})).toBe(base);
  });

  it('keeps the existing query and appends the flag', () => {
    const result = new URL(
      applyFeatureFlagsToUrl(`${base}?locale=en-US`, {
        [CUSTOM_VIEW_FLAG]: 'abc',
      })
    );
    expect(result.searchParams.get('locale')).toBe('en-US');
    expect(result.searchParams.get(CUSTOM_VIEW_FLAG)).toBe('abc');
  });

  it('skips undefined values', () => {
    const result = new URL(
      applyFeatureFlagsToUrl(base, {
        [CUSTOM_VIEW_FLAG]: 'abc',
        other: undefined,
      })
    );
    expect(result.searchParams.has('other')).toBe(false);
  });

  it('percent-encodes + / and = of base64 values and they round-trip', () => {
    const value = 'a+b/c==';
    const url = applyFeatureFlagsToUrl(base, { [CUSTOM_VIEW_FLAG]: value });
    expect(url).toContain('customView=a%2Bb%2Fc%3D%3D');
    expect(new URL(url).searchParams.get(CUSTOM_VIEW_FLAG)).toBe(value);
  });

  it('never adds anything but the given flags (no e-mail)', () => {
    const url = applyFeatureFlagsToUrl(base, { [CUSTOM_VIEW_FLAG]: 'x' });
    expect(Array.from(new URL(url).searchParams.keys())).toEqual([
      CUSTOM_VIEW_FLAG,
    ]);
  });
});
