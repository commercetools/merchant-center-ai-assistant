/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import express from 'express';
import request from 'supertest';
import {
  featureFlagsMiddleware,
  RESERVED_QUERY_KEYS,
  sessionHasNoFeatureFlags,
  sessionMatchesFeatureFlagsQuery,
  sessionVisibleFor,
} from '../../src/middleware/feature-flags.middleware';

const app = () => {
  const a = express();
  a.get('/', featureFlagsMiddleware, (_req, res) => {
    res.json({ flags: res.locals.featureFlags ?? null });
  });
  return a;
};

describe('feature flags from the query string', () => {
  it('customView becomes a flag', async () => {
    const res = await request(app()).get('/?customView=L3Byb2R1Y3Rz');
    expect(res.body.flags).toEqual({ customView: 'L3Byb2R1Y3Rz' });
  });

  it('reserved keys are never flags', async () => {
    const res = await request(app()).get(
      '/?limit=3&offset=1&since=5&locale=de&userId=x&projectKey=y'
    );
    expect(res.body.flags).toBeNull();
  });

  it('the legacy identity key is reserved without being written in this file', () => {
    expect(RESERVED_QUERY_KEYS.has(['user', 'Email'].join(''))).toBe(true);
  });

  it('true and false become booleans', async () => {
    const res = await request(app()).get('/?a=true&b=false');
    expect(res.body.flags).toEqual({ a: true, b: false });
  });

  it('a malformed escape does not throw', async () => {
    const res = await request(app()).get('/?customView=%E0%A4%A');
    expect(res.status).toBe(200);
    expect(typeof res.body.flags.customView).toBe('string');
  });

  it('nested query objects are ignored', async () => {
    const res = await request(app()).get('/?a[b]=c');
    expect(res.body.flags).toBeNull();
  });
});

describe('matching', () => {
  it('a request without flags sees only plain sessions', () => {
    expect(sessionVisibleFor({}, undefined)).toBe(true);
    expect(sessionVisibleFor({ featureFlags: { customView: 'X' } }, undefined)).toBe(false);
  });

  it('a request with flags sees only matching sessions', () => {
    expect(sessionVisibleFor({ featureFlags: { customView: 'X' } }, { customView: 'X' })).toBe(true);
    expect(sessionVisibleFor({}, { customView: 'X' })).toBe(false);
    expect(sessionMatchesFeatureFlagsQuery({ featureFlags: { customView: 'Y' } }, { customView: 'X' })).toBe(false);
  });

  it('empty or null flags count as none', () => {
    expect(sessionHasNoFeatureFlags({ featureFlags: {} })).toBe(true);
    expect(sessionHasNoFeatureFlags({ featureFlags: null })).toBe(true);
  });
});
