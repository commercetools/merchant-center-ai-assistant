/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { randomBytes } from 'node:crypto';
import { resetConfigurationForTests } from '../../../src/config';
import { freshConfig, TEST_ENCRYPTION_KEY } from '../../helpers/env';

beforeEach(() => resetConfigurationForTests());

const key = () => randomBytes(32).toString('base64');

describe('persistence configuration', () => {
  it('applies defaults', () => {
    const p = freshConfig().persistence;
    expect(p.driver).toBe('memory');
    expect(p.concurrency).toBe(8);
    expect(p.settingsCacheTtlMs).toBe(5000);
    expect(p.encryptionKey.reveal()).toHaveLength(32);
    expect(p.previousEncryptionKeys).toEqual([]);
  });

  it('enforces bounds', () => {
    expect(() => freshConfig({ PERSISTENCE_CONCURRENCY: '33' })).toThrow(
      /PERSISTENCE_CONCURRENCY/
    );
    expect(() => freshConfig({ PERSISTENCE_CONCURRENCY: '0' })).toThrow(
      /PERSISTENCE_CONCURRENCY/
    );
    expect(() => freshConfig({ SETTINGS_CACHE_TTL_MS: '60001' })).toThrow(
      /SETTINGS_CACHE_TTL_MS/
    );
    expect(freshConfig({ SETTINGS_CACHE_TTL_MS: '0' }).persistence.settingsCacheTtlMs).toBe(0);
  });

  it('rejects a weak key without echoing it', () => {
    let message = '';
    try {
      freshConfig({ ENCRYPTION_KEY: 'password' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('ENCRYPTION_KEY');
    expect(message).not.toContain('password');
  });

  it('rejects a missing key and a key of the wrong length', () => {
    expect(() => freshConfig({ ENCRYPTION_KEY: '' })).toThrow(/ENCRYPTION_KEY: is required/);
    const short = randomBytes(16).toString('base64');
    expect(() => freshConfig({ ENCRYPTION_KEY: short })).toThrow(/ENCRYPTION_KEY/);
  });

  it('rejects junk characters that Buffer.from would silently ignore', () => {
    const junky = TEST_ENCRYPTION_KEY.slice(0, 20) + '!!' + TEST_ENCRYPTION_KEY.slice(22);
    expect(() => freshConfig({ ENCRYPTION_KEY: junky })).toThrow(/ENCRYPTION_KEY/);
  });

  it('parses previous keys and reports a bad entry by position', () => {
    const a = key();
    const b = key();
    const p = freshConfig({ ENCRYPTION_KEY_PREVIOUS: `${a}, ${b}` }).persistence;
    expect(p.previousEncryptionKeys).toHaveLength(2);
    expect(() => freshConfig({ ENCRYPTION_KEY_PREVIOUS: `${a},nope` })).toThrow(
      /ENCRYPTION_KEY_PREVIOUS: entry 2/
    );
  });

  it('never exposes the key through JSON', () => {
    const p = freshConfig().persistence;
    expect(JSON.stringify(p)).not.toContain(TEST_ENCRYPTION_KEY);
  });
});
