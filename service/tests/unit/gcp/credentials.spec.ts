/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { resetConfigurationForTests } from '../../../src/config';
import { GcpNotConfiguredError, getGoogleCredentials } from '../../../src/gcp/credentials';
import { captureLogs } from '../../helpers/log-capture';
import { useEnv } from '../../helpers/use-env';
import { fakeKeyBase64, fakeKeyJson } from '../../helpers/gcp';

describe('getGoogleCredentials', () => {
  beforeEach(() => resetConfigurationForTests());
  afterEach(() => resetConfigurationForTests());

  it('returns the decoded key, project, location and auth options', () => {
    useEnv({ GCP_SA_KEY_BASE64: fakeKeyBase64(), GCP_VERTEX_LOCATION: 'europe-west1' });
    const c = getGoogleCredentials();
    expect(c.projectId).toBe('fake-project-123');
    expect(c.location).toBe('europe-west1');
    expect(c.credentials).toEqual({
      client_email: 'svc@fake-project-123.iam.gserviceaccount.com',
      private_key: fakeKeyJson().private_key,
    });
    expect(c.googleAuthOptions).toEqual({
      projectId: 'fake-project-123',
      credentials: c.credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  });

  it('uses GCP_PROJECT_ID when set', () => {
    useEnv({ GCP_SA_KEY_BASE64: fakeKeyBase64(), GCP_PROJECT_ID: 'other-project' });
    expect(getGoogleCredentials().projectId).toBe('other-project');
  });

  it('throws GcpNotConfiguredError (503) without a key', () => {
    useEnv({});
    expect(() => getGoogleCredentials()).toThrow(GcpNotConfiguredError);
    try {
      getGoogleCredentials();
    } catch (e) {
      expect((e as GcpNotConfiguredError).statusCode).toBe(503);
    }
  });

  it('writes nothing to the log', () => {
    useEnv({ GCP_SA_KEY_BASE64: fakeKeyBase64() });
    const logs = captureLogs();
    getGoogleCredentials();
    logs.stop();
    expect(logs.lines).toEqual([]);
  });
});
