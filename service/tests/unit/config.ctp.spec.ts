/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { inspect } from 'node:util';
import { readConfiguration, resetConfigurationForTests } from '../../src/config';
import { cloudIdentifierToApiRegion } from '../../src/config/region';
import { baseEnv, freshConfig, fullCtpEnv } from '../helpers/env';

beforeEach(() => resetConfigurationForTests());

describe('ctp section', () => {
  it.each([
    ['us-central1.gcp', 'gcp-us'],
    ['europe-west1.gcp', 'gcp-eu'],
    ['australia-southeast1.gcp', 'gcp-au'],
    ['eu-central-1.aws', 'aws-eu'],
    ['us-east-2.aws', 'aws-us'],
  ])('maps %s to %s', (region, id) => {
    expect(freshConfig({ CTP_REGION: region }).ctp.mcCloudIdentifier).toBe(id);
    expect(cloudIdentifierToApiRegion(id)).toBe(region);
  });

  it('rejects an unknown region', () => {
    expect(() => freshConfig({ CTP_REGION: 'mars-1.gcp' })).toThrow(/CTP_REGION/);
  });

  it('rejects an inherited property name as a region', () => {
    expect(() => freshConfig({ CTP_REGION: 'constructor' })).toThrow(/CTP_REGION/);
  });

  it('requires project key and region', () => {
    const env = baseEnv();
    delete env.CTP_PROJECT_KEY;
    delete env.CTP_REGION;
    expect(() => readConfiguration(env)).toThrow(
      /CTP_PROJECT_KEY: required; CTP_REGION: required/
    );
  });

  it('requires credentials unless the memory driver is used', () => {
    expect(() => freshConfig({ PERSISTENCE_DRIVER: 'custom-objects' })).toThrow(
      /CTP_CLIENT_ID: required.*CTP_CLIENT_SECRET.*CTP_SCOPE.*CTP_API_URL.*CTP_AUTH_URL/
    );
    expect(freshConfig().ctp.clientId).toBeUndefined();
  });

  it('requires https URLs', () => {
    expect(() =>
      freshConfig({
        PERSISTENCE_DRIVER: 'custom-objects',
        ...fullCtpEnv,
        CTP_API_URL: 'http://api.example.test',
      })
    ).toThrow(/CTP_API_URL: must start with https:\/\//);
  });

  it('never prints the client secret', () => {
    const c = freshConfig({ PERSISTENCE_DRIVER: 'custom-objects', ...fullCtpEnv });
    expect(c.ctp.clientSecret?.reveal()).toBe('csecret-value');
    expect(JSON.stringify(c)).toContain('[secret]');
    expect(JSON.stringify(c)).not.toContain('csecret-value');
    expect(inspect(c, { depth: 5 })).not.toContain('csecret-value');
    expect(`${c.ctp.clientSecret}`).toBe('[secret]');
  });
});
