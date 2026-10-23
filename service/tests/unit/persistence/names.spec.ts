/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { InvalidIdError } from '../../../src/persistence/gateway/errors';
import {
  assertSafeId,
  assertSafeName,
  containers,
  stateKey,
} from '../../../src/persistence/names';

describe('names', () => {
  it.each(['../x', 'a b', 'a'.repeat(101), '', 'a/b', 'a:b', 'é', 'a@b'])(
    'rejects id %j',
    (id) => {
      expect(() => assertSafeId(id)).toThrow(InvalidIdError);
    }
  );

  it('accepts uuid-like ids', () => {
    expect(assertSafeId('3f2b8c1e-aaaa-bbbb-cccc-0123456789ab')).toBeTruthy();
    expect(assertSafeId('a_b-C9')).toBe('a_b-C9');
  });

  it('accepts and rejects container and key names', () => {
    expect(assertSafeName('a_b.c~d-e')).toBe('a_b.c~d-e');
    expect(() => assertSafeName('a b')).toThrow(InvalidIdError);
    expect(() => assertSafeName('a'.repeat(257))).toThrow(InvalidIdError);
    expect(assertSafeName('a'.repeat(256))).toHaveLength(256);
  });

  it('hashes a state to 64 lowercase hex characters', () => {
    const k = stateKey('abc+/=');
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(stateKey('abc+/=')).toBe(k);
    expect(stateKey('abc+/')).not.toBe(k);
  });

  it('builds container names with an overridable prefix', () => {
    const c = containers();
    expect(c.sessions()).toBe('ai-assistant-sessions');
    expect(c.messages('s1')).toBe('ai-assistant-messages-s1');
    expect(containers('ai-assistant-it-x').settings()).toBe('ai-assistant-it-x-settings');
    expect(() => c.messages('../x')).toThrow(InvalidIdError);
    const longest = c.feedbackSnap('3f2b8c1e-aaaa-bbbb-cccc-0123456789ab');
    expect(longest.length).toBeLessThan(256);
  });
});
