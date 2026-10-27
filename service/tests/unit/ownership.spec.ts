/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { isOwner } from '../../src/auth/ownership';
import { LEGACY_IDENTITY_QUERY_KEYS } from '../../src/types/request.types';

describe('isOwner', () => {
  it('is true for the same user id', () => {
    expect(isOwner({ userId: 'a' }, { userId: 'a' })).toBe(true);
  });
  it('is false for a different user id', () => {
    expect(isOwner({ userId: 'a' }, { userId: 'b' })).toBe(false);
  });
  it.each([undefined, ''])('is false for everyone when the owner is %j', (owner) => {
    expect(isOwner({ userId: owner }, { userId: 'a' })).toBe(false);
    expect(isOwner({ userId: owner }, { userId: '' })).toBe(false);
  });
});

describe('LEGACY_IDENTITY_QUERY_KEYS', () => {
  it('lists the identity-looking query keys', () => {
    expect([...LEGACY_IDENTITY_QUERY_KEYS]).toEqual(['userEmail', 'userId', 'projectKey']);
  });
});
