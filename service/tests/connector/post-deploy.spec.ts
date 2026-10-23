/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { resetEnsureDatasetForTests } from '../../src/analytics/bigquery/ensure-dataset';
import { setBigQueryForTests } from '../../src/analytics/bigquery/ports';
import { resetTablesForTests } from '../../src/analytics/bigquery/tables';
import { checkGcpAnalytics, type GcpAnalyticsReport } from '../../src/analytics/self-check';
import { resetConfigurationForTests } from '../../src/config';
import { resetEnsureBucketForTests } from '../../src/storage/ensure-bucket';
import { setStorageForTests } from '../../src/storage/ports';
import { FakeBigQuery } from '../helpers/bigquery-fake';
import { useGcpEnv } from '../helpers/gcp-env';
import { FakeStorage } from '../helpers/storage-fake';
import type { ReadinessReport } from '../../src/gcp/readiness';
import { PostDeployDeps, run } from '../../src/connector/post-deploy';
import { createLifecycleApiRoot, runProbe } from '../../src/connector/checks/custom-object-probe';
import { readLifecycleEnv } from '../../src/connector/env';
import { fakeKeyBase64, fakeKeyJson } from '../helpers/gcp';
import { customObjectHandlers, lifecycleEnv, tokenHandler } from '../helpers/lifecycle';

const SERVICE_URL = 'https://service-abc.us-central1.gcp.commercetools.app/service';
const ORIGIN = 'https://service-abc.us-central1.gcp.commercetools.app';
const KEY_B64 = fakeKeyBase64();
const GREEN: ReadinessReport = {
  ok: true,
  checks: [
    { name: 'decode', ok: true, detail: 'ok' },
    { name: 'token', ok: true, detail: 'ok' },
    { name: 'vertex', ok: true, detail: 'ok' },
    { name: 'bigquery', ok: true, detail: 'ok' },
    { name: 'storage', ok: true, detail: 'ok' },
  ],
};

const ALL_OK: GcpAnalyticsReport = { bigquery: 'ok', storage: 'ok', visibility: 'ok' };

function deps(
  extraEnv: NodeJS.ProcessEnv = {},
  overrides: Partial<PostDeployDeps> = {}
): { deps: PostDeployDeps; lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    deps: {
      readEnv: () => readLifecycleEnv(lifecycleEnv({ GCP_SA_KEY_BASE64: KEY_B64, ...extraEnv })),
      log: (line) => lines.push(line),
      checkVertex: async () => ({ ok: true }),
      runProbe: async () => ({ ok: true }),
      gcpReadiness: async () => GREEN,
      gcpAnalytics: async () => ALL_OK,
      ...overrides,
    },
  };
}

describe('post-deploy run()', () => {
  it('post-deploy: all green exits 0', async () => {
    const { deps: d, lines } = deps({ CONNECT_SERVICE_URL: SERVICE_URL });
    expect(await run(d)).toBe(0);
    expect(lines[lines.length - 1]).toBe('post-deploy: OK');
    expect(lines.every((l) => l.startsWith('post-deploy:'))).toBe(true);
    expect(lines).toContain(`post-deploy: service origin ${ORIGIN}`);
  });

  it('post-deploy: malformed key fails', async () => {
    const vertex = jest.fn(async () => ({ ok: true as const }));
    const { deps: d, lines } = deps({ GCP_SA_KEY_BASE64: 'not base64 !!!' }, { checkVertex: vertex });
    expect(await run(d)).toBe(1);
    expect(lines).toContain('post-deploy: FAILED sa-key: not valid base64');
    expect(lines.join('\n')).not.toContain('not base64 !!!');
    expect(vertex).not.toHaveBeenCalled();
  });

  it('post-deploy: vertex 4xx fails', async () => {
    const { deps: d, lines } = deps(
      {},
      { checkVertex: async () => ({ ok: false, status: 403, hint: 'grant roles/aiplatform.user' }) }
    );
    expect(await run(d)).toBe(1);
    expect(lines).toContain('post-deploy: FAILED vertex: HTTP 403: grant roles/aiplatform.user');
  });

  it('post-deploy: vertex 5xx warns', async () => {
    const { deps: d, lines } = deps({}, { checkVertex: async () => ({ ok: true, warning: 'answered HTTP 503' }) });
    expect(await run(d)).toBe(0);
    expect(lines.some((l) => l.startsWith('post-deploy: warning: vertex'))).toBe(true);
  });

  it('post-deploy: probe failure fails', async () => {
    const { deps: d, lines } = deps(
      {},
      { runProbe: async () => ({ ok: false, reason: 'missing manage_key_value_documents scope on the generated API client' }) }
    );
    expect(await run(d)).toBe(1);
    expect(lines.some((l) => l.startsWith('post-deploy: FAILED probe:'))).toBe(true);
  });

  it('post-deploy: logs the service origin and never fails on it', async () => {
    const { deps: d, lines } = deps({ CONNECT_SERVICE_URL: SERVICE_URL });
    expect(await run(d)).toBe(0);
    expect(lines).toContain(`post-deploy: service origin ${ORIGIN}`);
    expect(lines.join('\n')).not.toContain('FAILED audience');
  });

  it('post-deploy: an unset service url is reported, not fatal', async () => {
    const { deps: d, lines } = deps({});
    expect(await run(d)).toBe(0);
    expect(lines).toContain('post-deploy: CONNECT_SERVICE_URL is not set; the service origin is unknown');
  });

  it('post-deploy: a missing environment variable fails naming it', async () => {
    const lines: string[] = [];
    const code = await run({
      ...deps().deps,
      log: (l) => lines.push(l),
      readEnv: () => readLifecycleEnv({}),
    });
    expect(code).toBe(1);
    expect(lines[0]).toContain('FAILED env');
    expect(lines[0]).toContain('CTP_PROJECT_KEY');
  });

  it('post-deploy: analytics self-check missing resource warns only, naming the fix', async () => {
    const report: GcpAnalyticsReport = {
      bigquery: 'bigquery access denied: grant roles/bigquery.jobUser and roles/bigquery.dataEditor on the project to the service account',
      storage: 'bucket b is missing and the service account cannot create it (storage.buckets.create): gcloud storage buckets create gs://b',
      visibility: 'ok',
    };
    const { deps: d, lines } = deps({}, { gcpAnalytics: async () => report });
    expect(await run(d)).toBe(0);
    const analytics = lines.filter((l) => l.startsWith('post-deploy: gcp analytics:'));
    expect(analytics).toHaveLength(2);
    expect(analytics[0]).toContain('bigquery: ');
    expect(analytics[0]).toContain('roles/bigquery.jobUser');
    expect(analytics[1]).toContain('storage: ');
    expect(analytics[1]).toContain('storage.buckets.create');
  });

  it('post-deploy: a publicly readable private bucket is reported as a visibility warning', async () => {
    const { deps: d, lines } = deps({}, { gcpAnalytics: async () => ({ ...ALL_OK, visibility: 'bucket is publicly readable although IMAGE_URL_MODE=private' }) });
    expect(await run(d)).toBe(0);
    expect(lines.some((l) => l.startsWith('post-deploy: gcp analytics: visibility:'))).toBe(true);
  });

  it('post-deploy: analytics self-check creates dataset and bucket when permitted', async () => {
    // The real self-check over fake Google clients: a fresh project, a service account that may create.
    useGcpEnv();
    const bq = new FakeBigQuery();
    const st = new FakeStorage();
    bq.datasetExists = false;
    st.bucketExists = false;
    setBigQueryForTests(bq);
    setStorageForTests(st);
    resetEnsureDatasetForTests();
    resetEnsureBucketForTests();
    resetTablesForTests();
    try {
      const { deps: d, lines } = deps(
        {},
        { gcpAnalytics: () => checkGcpAnalytics({ head: async () => 403 }) }
      );
      expect(await run(d)).toBe(0);
      expect(bq.createDatasetCalls).toHaveLength(1);
      expect(st.createBucketCalls).toHaveLength(1);
      // Everything was created and the probes removed: no warning line at all.
      expect(lines.some((l) => l.startsWith('post-deploy: gcp analytics:'))).toBe(false);
      expect(lines[lines.length - 1]).toBe('post-deploy: OK');
      expect(st.objects.size).toBe(0);
    } finally {
      setBigQueryForTests(undefined);
      setStorageForTests(undefined);
      resetConfigurationForTests();
    }
  });

  it('post-deploy: analytics self-check passes silently when permitted and present', async () => {
    const { deps: d, lines } = deps();
    expect(await run(d)).toBe(0);
    expect(lines.some((l) => l.startsWith('post-deploy: gcp analytics:'))).toBe(false);
  });

  it('post-deploy: analytics self-check that cannot run warns only', async () => {
    const { deps: d, lines } = deps({}, { gcpAnalytics: async () => undefined });
    expect(await run(d)).toBe(0);
    expect(lines.some((l) => l.includes('gcp analytics skipped'))).toBe(true);
    const { deps: thrown, lines: l2 } = deps({}, { gcpAnalytics: async () => { throw new Error('boom'); } });
    expect(await run(thrown)).toBe(0);
    expect(l2.some((l) => l.includes('gcp analytics could not run'))).toBe(true);
  });

  it('post-deploy: readiness that cannot run warns only', async () => {
    const { deps: d, lines } = deps({}, { gcpReadiness: async () => undefined });
    expect(await run(d)).toBe(0);
    expect(lines.some((l) => l.includes('gcp readiness skipped'))).toBe(true);
    const { deps: thrown, lines: l2 } = deps({}, { gcpReadiness: async () => { throw new Error('boom'); } });
    expect(await run(thrown)).toBe(0);
    expect(l2.some((l) => l.includes('gcp readiness could not run'))).toBe(true);
  });

  it('post-deploy: failed readiness token or vertex checks are warnings', async () => {
    const report: ReadinessReport = {
      ok: false,
      checks: [{ name: 'decode', ok: true, detail: 'ok' }, { name: 'token', ok: false, detail: 'access token could not be minted' }],
    };
    const { deps: d, lines } = deps({}, { gcpReadiness: async () => report });
    expect(await run(d)).toBe(0);
    expect(lines).toContain('post-deploy: warning: gcp readiness token: access token could not be minted');
  });

  it('post-deploy: reports providers without values', async () => {
    const { deps: d, lines } = deps({ STRIPE_SECRET_KEY: 'sk_test_SENTINEL' });
    expect(await run(d)).toBe(0);
    expect(lines).toContain('post-deploy: providers stripe: configured');
    expect(lines).toContain(
      'post-deploy: providers contentstack: not configured (missing: CONTENTSTACK_API_KEY, CONTENTSTACK_MANAGEMENT_TOKEN)'
    );
    expect(lines.join('\n')).not.toContain('SENTINEL');
  });

  it('post-deploy: logs never contain key material', async () => {
    const pem = String(fakeKeyJson().private_key);
    const secrets = [KEY_B64, pem, pem.split('\n')[1], 'svc@fake-project-123.iam.gserviceaccount.com', 'csecret-value', '-----BEGIN'];
    for (const overrides of [
      {},
      { checkVertex: async () => ({ ok: false as const, status: 403, hint: 'x' }) },
      { runProbe: async () => ({ ok: false as const, reason: 'x' }) },
    ]) {
      const { deps: d, lines } = deps({ CONNECT_SERVICE_URL: SERVICE_URL }, overrides);
      await run(d);
      const text = lines.join('\n');
      for (const secret of secrets) expect(text).not.toContain(secret);
    }
    const bad = deps({ GCP_SA_KEY_BASE64: Buffer.from('{"type":"service_account","private_key":"LEAK-ME"}').toString('base64') });
    await run(bad.deps);
    expect(bad.lines.join('\n')).not.toContain('LEAK-ME');
  });

  it('post-deploy: an unexpected exception is reported by class only', async () => {
    const { deps: d, lines } = deps({}, { runProbe: async () => { throw new TypeError('contains SECRET-TEXT'); } });
    expect(await run(d)).toBe(1);
    expect(lines).toContain('post-deploy: FAILED probe: unexpected error (TypeError)');
    expect(lines.join('\n')).not.toContain('SECRET-TEXT');
  });

  it('post-deploy: project mismatch only warns', async () => {
    const { deps: d, lines } = deps({ GCP_PROJECT_ID: 'another-project-9' });
    expect(await run(d)).toBe(0);
    expect(lines.some((l) => l.startsWith('post-deploy: warning: GCP_PROJECT_ID differs'))).toBe(true);
  });
});

describe('post-deploy against a fake commercetools API', () => {
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('post-deploy: idempotent twice', async () => {
    const store = new Map<string, { container: string; key: string; value: unknown }>();
    let listed = 0;
    server.use(
      tokenHandler,
      http.get('https://api.example.test/p1/custom-objects/ai-assistant-lifecycle', () => {
        listed += 1;
        return HttpResponse.json({ results: [...store.values()], count: store.size });
      }),
      ...customObjectHandlers(store)
    );
    for (let i = 0; i < 2; i += 1) {
      const lines: string[] = [];
      const { deps: d } = deps({}, {
        log: (l) => lines.push(l),
        runProbe: (env) => runProbe(createLifecycleApiRoot(env)),
      });
      expect(await run(d)).toBe(0);
      expect(lines[lines.length - 1]).toBe('post-deploy: OK');
    }
    expect(store.size).toBe(0);
    expect(listed).toBe(0);
  });
});
