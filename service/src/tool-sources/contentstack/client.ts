/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ContentstackRegion } from '../../mcp-providers/types';
import type { ApiError, ContentstackErrorResponse } from './types';

/** Content Management API base URLs per region (https://www.contentstack.com/docs/administration/api-endpoints). */
export const CONTENTSTACK_BASE_URLS: Record<ContentstackRegion, string> = {
  na: 'https://api.contentstack.io/v3',
  eu: 'https://eu-api.contentstack.com/v3',
  au: 'https://au-api.contentstack.com/v3',
  'azure-na': 'https://azure-na-api.contentstack.com/v3',
  'azure-eu': 'https://azure-eu-api.contentstack.com/v3',
  'gcp-na': 'https://gcp-na-api.contentstack.com/v3',
  'gcp-eu': 'https://gcp-eu-api.contentstack.com/v3',
};

export const baseUrlFor = (region: string): string =>
  CONTENTSTACK_BASE_URLS[region as ContentstackRegion] ??
  CONTENTSTACK_BASE_URLS.na;

/** Per-request ceiling so a hanging Content Management API cannot hold a turn. */
const REQUEST_TIMEOUT_MS = 30_000;

export type FetchImpl = typeof fetch;

export interface ContentstackClientOptions {
  apiKey: string;
  managementToken: string;
  branch?: string;
  region?: string;
  /** Test seam; defaults to the global fetch. */
  fetchImpl?: FetchImpl;
}

/**
 * Thin seam under the 15 tools: base URL by region, auth headers, the injectable `fetch`,
 * and one error formatter. Error text never contains header values.
 */
export class ContentstackClient {
  readonly apiBaseUrl: string;
  readonly headers: Record<string, string>;
  private readonly fetchImpl: FetchImpl;

  constructor(options: ContentstackClientOptions) {
    this.apiBaseUrl = baseUrlFor(options.region ?? 'na');
    this.headers = {
      'Content-Type': 'application/json',
      api_key: options.apiKey,
      authorization: options.managementToken,
      ...(options.branch ? { branch: options.branch } : {}),
    };
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** `fetch` with a default timeout; tools pass `this.headers` themselves. */
  fetch = (url: string, init?: RequestInit): Promise<Response> =>
    this.fetchImpl(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  /** Turns a non-2xx response into the error shape `handleError` understands. */
  toApiError = async (response: Response): Promise<ApiError> => {
    let data: ContentstackErrorResponse;
    try {
      data = (await response.json()) as ContentstackErrorResponse;
    } catch {
      data = { error_message: `HTTP ${response.status}` };
    }
    return Object.assign(new Error(`HTTP ${response.status}`), {
      response: { status: response.status, data },
    });
  };

  handleError = (error: ApiError): string => {
    if (error.response) {
      return `API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`;
    }
    if (error.request) {
      return 'No response received from Contentstack';
    }
    if (error.error_message) {
      return (
        `Error: ${error.error_message}` +
        (error.errors ? ` - ${JSON.stringify(error.errors)}` : '')
      );
    }
    return `Error: ${error.message}`;
  };
}
