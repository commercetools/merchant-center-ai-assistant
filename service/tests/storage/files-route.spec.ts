/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import express from 'express';
import type { AddressInfo } from 'node:net';
import http from 'node:http';
import { Readable } from 'node:stream';
import request from 'supertest';
import { resetConfigurationForTests } from '../../src/config';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { initRequestContext } from '../../src/middleware/context.middleware';
import { createFilesRouter } from '../../src/storage/files-route';
import { setStorageForTests, storage } from '../../src/storage/ports';
import { useGcpEnv } from '../helpers/gcp-env';
import { fakeAuth, asUser } from '../helpers/session-app';
import { FakeStorage } from '../helpers/storage-fake';

const SESSION = '3f2b8c1e-aaaa-4bbb-8ccc-1234567890ab';
const FILE = '1700000000000-ab12cd34.png';
const BYTES = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
let st: FakeStorage;
let sessions: Record<string, { userId: string }>;

const makeApp = () => {
  const app = express();
  app.use(initRequestContext);
  app.use('/service/files', fakeAuth, createFilesRouter({
    getSession: async (id) => sessions[id],
    bucket: () => storage().bucket('b'),
  }));
  app.use(errorMiddleware);
  return app;
};

beforeEach(() => {
  useGcpEnv();
  st = new FakeStorage();
  st.objects.set(`images/${SESSION}/${FILE}`, { data: BYTES, options: {} });
  setStorageForTests(st);
  sessions = { [SESSION]: { userId: 'owner' } };
});
afterEach(() => {
  setStorageForTests(undefined);
  resetConfigurationForTests();
});

const get = (path: string, headers: Record<string, string> = asUser('owner')) =>
  request(makeApp()).get(`/service/files/${path}`).set(headers);

describe('GET /service/files/:sessionId/:fileName', () => {
  it('owner: 200 with the exact bytes and every hardening header', async () => {
    const res = await get(`${SESSION}/${FILE}`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body as Buffer, BYTES)).toBe(0);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-length']).toBe(String(BYTES.length));
    expect(res.headers['content-disposition']).toBe('inline');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('another user: 404 File not found, and the bucket stream is never opened', async () => {
    const res = await get(`${SESSION}/${FILE}`, asUser('someone-else'));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'File not found' });
    expect(st.readStreams).toHaveLength(0);
  });

  it('forged admin e-mail header, query parameter and body field grant nothing', async () => {
    const res = await request(makeApp())
      .get(`/service/files/${SESSION}/${FILE}?userEmail=admin@example.test&userLabel=admin`)
      .set({ ...asUser('someone-else'), 'x-admin-email': 'admin@example.test' })
      .send({ userLabel: 'admin@example.test' });
    expect(res.status).toBe(404);
    expect(st.readStreams).toHaveLength(0);
  });

  it('administrator (isAdmin from the verified id): 200', async () => {
    const res = await get(`${SESSION}/${FILE}`, asUser('boss', true));
    expect(res.status).toBe(200);
  });

  it('unknown session and unknown object: 404', async () => {
    const other = '9a9a9a9a-aaaa-4bbb-8ccc-1234567890ab';
    expect((await get(`${other}/${FILE}`)).status).toBe(404);
    expect((await get(`${SESSION}/1700000000001-ffffffff.png`)).status).toBe(404);
  });

  it('bad names and traversal attempts: 404 without a storage call', async () => {
    for (const p of [`${SESSION}/a.svg`, `${SESSION}/..%2F..%2Fother.png`, `not-a-uuid/${FILE}`, `${SESSION}/${FILE}.exe`]) {
      expect((await get(p)).status).toBe(404);
    }
    expect(st.readStreams).toHaveLength(0);
  });

  it('no session token: 401, bucket not read', async () => {
    const res = await request(makeApp()).get(`/service/files/${SESSION}/${FILE}`);
    expect(res.status).toBe(401);
    expect(st.readStreams).toHaveLength(0);
  });

  it('a client abort destroys the storage stream', async () => {
    // A stream that never ends, so the abort happens while it is open.
    const never = new Readable({ read: () => undefined });
    never.push(Buffer.from('first'));
    st.createReadStreamOverride = () => never;
    const server = makeApp().listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      await new Promise<void>((resolve, reject) => {
        const req = http.get({ port, path: `/service/files/${SESSION}/${FILE}`, headers: asUser('owner') }, (res) => {
          res.once('data', () => {
            req.destroy();
            resolve();
          });
        });
        req.on('error', () => undefined);
        req.setTimeout(3000, () => reject(new Error('timeout')));
      });
      await new Promise((r) => setTimeout(r, 100));
      expect(never.destroyed).toBe(true);
    } finally {
      server.close();
    }
  });
});
