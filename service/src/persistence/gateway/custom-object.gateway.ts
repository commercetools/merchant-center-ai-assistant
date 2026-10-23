/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ByProjectKeyRequestBuilder, CustomObject } from '@commercetools/platform-sdk';
import { getApiRoot } from '../../client/create.client';
import { assertSafeName } from '../names';
import { compileQuery } from './query';
import { ConflictError, PersistenceError, TooLargeError } from './errors';
import { describeError, RetryOptions, withTransportRetry } from './retry';
import { checkSize } from './size';
import { ObjectGateway, ObjectQuery, StoredObject } from './types';

export const REQUEST_TIMEOUT_MS = 15000;

class RequestTimeoutError extends Error {
  constructor() {
    super('Request timed out');
    this.name = 'TimeoutError';
  }
}

/** Error body shape of the platform: `{ errors: [{ code, currentVersion? }] }`. */
function platformErrors(e: unknown): Array<{ code?: string; currentVersion?: number }> {
  const body = (e as { body?: { errors?: unknown } } | null)?.body;
  return Array.isArray(body?.errors)
    ? (body.errors as Array<{ code?: string; currentVersion?: number }>)
    : [];
}

function toStored(o: CustomObject): StoredObject {
  return {
    id: o.id,
    version: o.version,
    container: o.container,
    key: o.key,
    value: o.value,
    createdAt: o.createdAt,
    lastModifiedAt: o.lastModifiedAt,
  };
}

/**
 * The only module that talks to the Custom Objects endpoints. Transport failures are retried
 * here (429/502/503/504, network); conflicts are not, because the caller must re-read and
 * re-merge (see `updateWithRetry`). The SDK's concurrent-modification middleware must stay off.
 */
export class CustomObjectGateway implements ObjectGateway {
  private readonly root: () => ByProjectKeyRequestBuilder;

  constructor(
    root?: ByProjectKeyRequestBuilder,
    private readonly retry: RetryOptions = {},
    private readonly timeoutMs: number = REQUEST_TIMEOUT_MS
  ) {
    this.root = root ? () => root : getApiRoot;
  }

  /** Runs one request with a timeout and the transport retry policy; maps status codes. */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await withTransportRetry(() => this.withTimeout(fn()), this.retry);
    } catch (e) {
      throw this.mapError(e);
    }
  }

  private withTimeout<T>(p: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new RequestTimeoutError()), this.timeoutMs);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
  }

  private mapError(e: unknown): unknown {
    if (e instanceof PersistenceError) return e;
    const { status } = describeError(e);
    if (status === 409) {
      const current = platformErrors(e).find((x) => x.currentVersion !== undefined);
      return new ConflictError('Conflict, please retry', current?.currentVersion);
    }
    if (status === 413 || platformErrors(e).some((x) => x.code === 'ResourceSizeLimitExceeded')) {
      return new TooLargeError('Stored object exceeds the size limit');
    }
    return e;
  }

  async get(container: string, key: string): Promise<StoredObject | null> {
    const c = assertSafeName(container);
    const k = assertSafeName(key);
    try {
      const res = await this.call(() =>
        this.root().customObjects().withContainerAndKey({ container: c, key: k }).get().execute()
      );
      return toStored(res.body);
    } catch (e) {
      if (describeError(e).status === 404) return null;
      throw e;
    }
  }

  async put(
    container: string,
    key: string,
    value: unknown,
    o?: { ifVersion?: number }
  ): Promise<StoredObject> {
    const c = assertSafeName(container);
    const k = assertSafeName(key);
    checkSize(c, value);
    const body = {
      container: c,
      key: k,
      value: value as CustomObject['value'],
      // `version` means "must match": never send a guess.
      ...(o?.ifVersion !== undefined ? { version: o.ifVersion } : {}),
    };
    const res = await this.call(() =>
      this.root().customObjects().post({ body }).execute()
    );
    return toStored(res.body);
  }

  async delete(
    container: string,
    key: string,
    o?: { ifVersion?: number }
  ): Promise<StoredObject | null> {
    const c = assertSafeName(container);
    const k = assertSafeName(key);
    const queryArgs = o?.ifVersion !== undefined ? { version: o.ifVersion } : {};
    try {
      const res = await this.call(() =>
        this.root()
          .customObjects()
          .withContainerAndKey({ container: c, key: k })
          .delete({ queryArgs })
          .execute()
      );
      return toStored(res.body);
    } catch (e) {
      if (describeError(e).status === 404) return null;
      throw e;
    }
  }

  async query(
    container: string,
    q: ObjectQuery
  ): Promise<{ results: StoredObject[]; total?: number }> {
    const c = assertSafeName(container);
    const cq = compileQuery(q);
    const queryArgs: Record<string, string | string[] | number | boolean> = {
      limit: cq.limit,
      offset: cq.offset,
      withTotal: cq.withTotal,
    };
    if (cq.where.length > 0) queryArgs.where = cq.where;
    if (cq.sort.length > 0) queryArgs.sort = cq.sort;
    for (const [name, v] of Object.entries(cq.vars)) queryArgs[`var.${name}`] = v;
    const res = await this.call(() =>
      this.root().customObjects().withContainer({ container: c }).get({ queryArgs }).execute()
    );
    return {
      results: res.body.results.map(toStored),
      total: res.body.total,
    };
  }
}
