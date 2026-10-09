/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { resetConfigurationForTests } from '../../../src/config';
import { freshConfig, fullCtpEnv } from '../../helpers/env';
import { fakeKeyBase64, fakeKeyJson } from '../../helpers/gcp';

beforeEach(() => resetConfigurationForTests());

describe('gcp section', () => {
  it('applies every default without a key (development)', () => {
    const { gcp } = freshConfig();
    expect(gcp.serviceAccount).toBeUndefined();
    expect(gcp.projectId).toBeUndefined();
    expect(gcp.vertexLocation).toBe('us-central1');
    expect(gcp.bigquery).toEqual({ datasetId: 'aiassistant', location: 'us-central1' });
    expect(gcp.bucket).toEqual({ name: undefined, location: 'us-central1' });
    expect(gcp.imageUrlMode).toBe('private');
    expect(gcp.warnings).toEqual([]);
  });

  it('takes the project from the key and derives the bucket name', () => {
    const { gcp } = freshConfig({ GCP_SA_KEY_BASE64: fakeKeyBase64() });
    expect(gcp.projectId).toBe('fake-project-123');
    expect(gcp.bucket.name).toBe('fake-project-123-ai-assistant-images');
    expect(gcp.serviceAccount?.reveal().client_email).toContain('gserviceaccount.com');
  });

  it('lets GCP_PROJECT_ID override the key project', () => {
    const { gcp } = freshConfig({
      GCP_SA_KEY_BASE64: fakeKeyBase64(),
      GCP_PROJECT_ID: 'my-vertex-project',
    });
    expect(gcp.projectId).toBe('my-vertex-project');
    expect(gcp.bucket.name).toBe('my-vertex-project-ai-assistant-images');
  });

  it('lets an explicit bucket name win', () => {
    const { gcp } = freshConfig({
      GCP_SA_KEY_BASE64: fakeKeyBase64(),
      GCP_BUCKET_NAME: 'my-images',
      GCP_BUCKET_LOCATION: 'US',
    });
    expect(gcp.bucket).toEqual({ name: 'my-images', location: 'US' });
  });

  it('never prints the private key', () => {
    const config = freshConfig({ GCP_SA_KEY_BASE64: fakeKeyBase64() });
    const key = fakeKeyJson().private_key as string;
    expect(JSON.stringify(config)).not.toContain('BEGIN PRIVATE KEY');
    expect(JSON.stringify(config)).not.toContain(key.slice(40, 80));
  });

  it.each([
    ['GCP_VERTEX_LOCATION', 'Iowa'],
    ['GCP_PROJECT_ID', 'Bad_Project'],
    ['GCP_BIGQUERY_DATASET_ID', 'my-dataset;drop'],
    ['GCP_BIGQUERY_LOCATION', 'us central'],
    ['GCP_BUCKET_NAME', 'UPPER'],
    ['GCP_BUCKET_LOCATION', 'a b'],
    ['IMAGE_URL_MODE', 'signed'],
  ])('rejects an invalid %s', (key, value) => {
    expect(() => freshConfig({ [key]: value })).toThrow(new RegExp(key));
  });

  it.each(['global', 'us', 'eu', 'europe-west1'])('accepts Vertex location %s', (value) => {
    expect(freshConfig({ GCP_VERTEX_LOCATION: value }).gcp.vertexLocation).toBe(value);
  });

  it('accepts IMAGE_URL_MODE=public', () => {
    expect(freshConfig({ IMAGE_URL_MODE: 'public' }).gcp.imageUrlMode).toBe('public');
  });

  it('requires the key in production', () => {
    const env = {
      NODE_ENV: 'production',
      PERSISTENCE_DRIVER: 'custom-objects',
      ...fullCtpEnv,
    };
    expect(() => freshConfig(env)).toThrow(/GCP_SA_KEY_BASE64/);
    expect(() => freshConfig({ ...env, GCP_SA_KEY_BASE64: fakeKeyBase64() })).not.toThrow(
      /GCP_SA_KEY_BASE64/
    );
  });

  it('reports a bad key without echoing it', () => {
    let message = '';
    try {
      freshConfig({ GCP_SA_KEY_BASE64: Buffer.from('SENTINEL-DO-NOT-LEAK').toString('base64') });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('GCP_SA_KEY_BASE64: decoded value is not JSON');
    expect(message).not.toContain('SENTINEL');
  });

  it('refuses GOOGLE_VERTEX_API_KEY (express mode)', () => {
    expect(() => freshConfig({ GOOGLE_VERTEX_API_KEY: 'x' })).toThrow(/GOOGLE_VERTEX_API_KEY/);
  });

  it('warns once per stale legacy variable, naming it but not its value', () => {
    const { gcp } = freshConfig({
      GEMINI_API_KEY: 'secret-value-1',
      OPENAI_API_KEY: 'secret-value-2',
      GCP_LOCATION: 'europe-west1',
    });
    expect(gcp.warnings).toHaveLength(3);
    expect(gcp.warnings.join('\n')).toContain('GEMINI_API_KEY');
    expect(gcp.warnings.join('\n')).toContain('GCP_LOCATION');
    expect(gcp.warnings.join('\n')).not.toContain('secret-value');
    expect(gcp.vertexLocation).toBe('us-central1');
  });
});

describe('llm section', () => {
  it('has the documented defaults', () => {
    expect(freshConfig().llm).toEqual({
      mainModel: 'gemini-3.8-flash',
      agentModel: 'gemini-2.5-flash',
      liteModel: 'gemini-3.5-flash-lite',
      imageModel: 'gemini-2.5-flash-image',
      liteThinkingLevel: 'minimal',
    });
  });

  it('overrides one tier without touching the others', () => {
    const { llm } = freshConfig({ GEMINI_MODEL_NAME: 'custom-model' });
    expect(llm.mainModel).toBe('custom-model');
    expect(llm.agentModel).toBe('gemini-2.5-flash');
    expect(llm.liteModel).toBe('gemini-3.5-flash-lite');
    expect(llm.imageModel).toBe('gemini-2.5-flash-image');
  });

  it('rejects an invalid lite thinking level', () => {
    expect(() => freshConfig({ GEMINI_LITE_THINKING_LEVEL: 'extreme' })).toThrow(
      /GEMINI_LITE_THINKING_LEVEL/
    );
    expect(freshConfig({ GEMINI_LITE_THINKING_LEVEL: 'low' }).llm.liteThinkingLevel).toBe('low');
  });

  it('rejects an invalid model name', () => {
    expect(() => freshConfig({ GEMINI_AGENT_MODEL_NAME: 'bad name!' })).toThrow(
      /GEMINI_AGENT_MODEL_NAME/
    );
  });
});
