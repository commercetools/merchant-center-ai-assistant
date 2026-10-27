/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { GoogleAuth } from 'google-auth-library';

export type VertexResult =
  | { ok: true; warning?: string }
  | { ok: false; status: number; hint: string };

export interface VertexCheckInput {
  projectId: string;
  location: string;
  model: string;
  /** Returns a cloud-platform access token. Default: GoogleAuth with the decoded key. */
  getAccessToken: () => Promise<string | null | undefined>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Access-token source for a decoded service-account key (kept out of the check for tests). */
export function accessTokenSource(credentials: {
  client_email: string;
  private_key: string;
}): () => Promise<string | null | undefined> {
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  return () => auth.getAccessToken();
}

function hintFor(status: number, model: string, location: string): string {
  switch (status) {
    case 403:
      return 'Vertex AI refused the request: grant roles/aiplatform.user to the service account and enable the Vertex AI API';
    case 404:
      return `model ${model} was not found in ${location}: check GEMINI_LITE_MODEL_NAME and GCP_VERTEX_LOCATION`;
    case 401:
      return 'Vertex AI rejected the access token: check GCP_SA_KEY_BASE64';
    default:
      return 'Vertex AI rejected the request: check the model id, the location and the project';
  }
}

function statusOfAuthError(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * countTokens on the cheap model proves credentials, project, location and model in one call.
 * 400/401/403/404 are facts we can prove wrong (failure); 5xx, network errors and timeouts are
 * transient (warning only). Messages never contain the token or the response body.
 */
export async function checkVertex(input: VertexCheckInput): Promise<VertexResult> {
  const { projectId, location, model } = input;
  const doFetch = input.fetch ?? globalThis.fetch;
  const timeoutMs = input.timeoutMs ?? 10_000;

  let token: string | null | undefined;
  try {
    token = await input.getAccessToken();
  } catch (error) {
    const status = statusOfAuthError(error);
    if (status !== undefined && status >= 400 && status < 500) {
      return { ok: false, status, hint: 'the service-account key was rejected by Google: check GCP_SA_KEY_BASE64' };
    }
    return { ok: true, warning: 'could not obtain a Google access token (network problem?); not verified' };
  }
  if (!token) {
    return { ok: true, warning: 'no Google access token was returned; not verified' };
  }

  const url =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/locations/${location}/publishers/google/models/${encodeURIComponent(model)}:countTokens`;
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await doFetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }] }),
      signal,
    });
    if (response.status >= 200 && response.status < 300) return { ok: true };
    if ([400, 401, 403, 404].includes(response.status)) {
      return { ok: false, status: response.status, hint: hintFor(response.status, model, location) };
    }
    return { ok: true, warning: `Vertex AI answered HTTP ${response.status}; not verified` };
  } catch (error) {
    const timedOut = signal.aborted || (error instanceof Error && error.name === 'TimeoutError');
    return {
      ok: true,
      warning: `Vertex AI could not be reached (${timedOut ? 'timeout' : 'network error'}); not verified`,
    };
  }
}
