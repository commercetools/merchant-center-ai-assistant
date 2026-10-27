/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  clearStoredSessionId,
  readStoredSessionId,
  writeStoredSessionId,
} from './session-storage';

describe('session-storage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('round-trips a session id', () => {
    writeStoredSessionId('s1');
    expect(readStoredSessionId()).toBe('s1');
    clearStoredSessionId();
    expect(readStoredSessionId()).toBeNull();
  });

  it('does not throw and reads null when localStorage throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readStoredSessionId()).toBeNull();
    expect(() => writeStoredSessionId('s1')).not.toThrow();
    expect(() => clearStoredSessionId()).not.toThrow();
  });
});
