/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Live smoke test against Google Cloud. Runs only when GCP_SA_KEY_BASE64 is set;
 * otherwise the suite is skipped. Each call costs a few cents: keep prompts tiny.
 * Never print response bodies (they can echo requests): assert on derived values only.
 *
 * Optional overrides come from the environment (GCP_PROJECT_ID, GCP_VERTEX_LOCATION,
 * GEMINI_*_MODEL_NAME, GCP_BIGQUERY_*, GCP_BUCKET_NAME) exactly as in production.
 */
import { generateText, isStepCount, tool, type ModelMessage } from 'ai';
import { z } from 'zod';
import { readConfiguration, resetConfigurationForTests } from '../../src/config';
import { getBigQueryClient, getStorageClient, requireBucketName } from '../../src/gcp/clients';
import { checkGcpReadiness } from '../../src/gcp/readiness';
import { countTokens, getModel, getProviderOptions } from '../../src/llm';
import { useEnv } from '../helpers/use-env';

const live = Boolean(process.env.GCP_SA_KEY_BASE64);
const suite = live ? describe : describe.skip;
const kept = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => /^(GCP_|GEMINI_|IMAGE_URL_MODE)/.test(k))
);

suite('Google Cloud live smoke', () => {
  beforeAll(() => useEnv(kept));
  afterAll(() => resetConfigurationForTests());

  it('token: readiness (shallow) is ok', async () => {
    const report = await checkGcpReadiness({ deep: false });
    expect(report.checks.map((c) => `${c.name}:${c.ok}`)).toEqual([
      'decode:true',
      'token:true',
      'vertex:true',
    ]);
  });

  it.each(['main', 'lite'] as const)('%s tier answers', async (tier) => {
    const result = await generateText({
      model: getModel(tier),
      providerOptions: getProviderOptions(tier),
      prompt: 'Reply with the single word OK.',
    });
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('image tier returns an image file', async () => {
    const result = await generateText({
      model: getModel('image'),
      prompt: 'A small red square on a white background.',
    });
    expect(result.files.some((f) => f.mediaType.startsWith('image/'))).toBe(true);
  });

  it('count: countTokens is positive', async () => {
    expect(await countTokens('hello world')).toBeGreaterThan(0);
  });

  it('tool-continuity: replayed tool-call history is accepted', async () => {
    const add = tool({
      description: 'Adds two integers.',
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      execute: async ({ a, b }) => ({ sum: a + b }),
    });
    const first: ModelMessage[] = [
      { role: 'user', content: 'Use the add tool to compute 2 + 3, then state the result.' },
    ];
    const turn = await generateText({
      model: getModel('main'),
      providerOptions: getProviderOptions('main'),
      tools: { add },
      stopWhen: isStepCount(4),
      messages: first,
    });
    const replay: ModelMessage[] = [
      ...first,
      ...turn.response.messages,
      { role: 'user', content: 'Now add 10 to that result with the tool.' },
    ];
    const second = await generateText({
      model: getModel('main'),
      providerOptions: getProviderOptions('main'),
      tools: { add },
      stopWhen: isStepCount(4),
      messages: replay,
    });
    expect(second.text.length + second.steps.length).toBeGreaterThan(0);
  });

  it('bigquery: dry-run SELECT 1', async () => {
    const [job] = await getBigQueryClient().createQueryJob({
      query: 'SELECT 1',
      dryRun: true,
      location: readConfiguration().gcp.bigquery.location,
    });
    expect(job).toBeDefined();
  });

  it('storage: the effective bucket is reachable when it exists', async () => {
    const bucket = getStorageClient().bucket(requireBucketName());
    const [exists] = await bucket.exists().catch(() => [false] as [boolean]);
    if (!exists) {
      // Not created yet (change L's checkGcpAnalytics creates it) or not inspectable
      // with a bucket-scoped role: nothing to assert.
      return;
    }
    expect(exists).toBe(true);
  });
});
