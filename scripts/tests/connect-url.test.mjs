/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOUD_IDENTIFIER_BY_REGION, cloudIdentifierFor } from '../connect/lib/regions.mjs';
import { authHost, connectApiHost, mcApplicationUrls, originOf, serviceUrlFrom } from '../connect/lib/url.mjs';

test('region: maps all five', () => {
  assert.deepEqual(CLOUD_IDENTIFIER_BY_REGION, {
    'us-central1.gcp': 'gcp-us',
    'europe-west1.gcp': 'gcp-eu',
    'australia-southeast1.gcp': 'gcp-au',
    'us-east-2.aws': 'aws-us',
    'eu-central-1.aws': 'aws-eu',
  });
  assert.equal(cloudIdentifierFor('eu-central-1.aws'), 'aws-eu');
});

test('region: rejects unknown', () => {
  assert.throws(() => cloudIdentifierFor('moon-1.gcp'), /unknown Connect region/);
  assert.throws(() => cloudIdentifierFor('constructor'), /unknown Connect region/);
});

test('url: origin strips path', () => {
  assert.equal(
    originOf('https://service-abc.us-central1.gcp.commercetools.app/service'),
    'https://service-abc.us-central1.gcp.commercetools.app'
  );
  assert.equal(originOf('https://h.example'), 'https://h.example');
});

test('url: rejects http', () => {
  assert.throws(() => originOf('http://h.example/service'), /https/);
});

test('url: picks service application', () => {
  const d = {
    applications: [
      { applicationName: 'mc-app', url: 'https://mc.example' },
      { applicationName: 'service', url: 'https://svc.example/service' },
    ],
  };
  assert.equal(serviceUrlFrom(d), 'https://svc.example/service');
  assert.deepEqual(mcApplicationUrls(d).map((x) => x.applicationName), ['mc-app', 'composed-apps', 'mc-view-app']);
});

test('url: undefined while empty', () => {
  assert.equal(serviceUrlFrom({ applications: [{ applicationName: 'service', url: '' }] }), undefined);
  assert.equal(serviceUrlFrom({ applications: [] }), undefined);
  assert.equal(serviceUrlFrom(undefined), undefined);
});

test('url: hosts', () => {
  assert.equal(connectApiHost('us-central1.gcp'), 'https://connect.us-central1.gcp.commercetools.com');
  assert.equal(authHost('us-central1.gcp'), 'https://auth.us-central1.gcp.commercetools.com');
});
