/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Router, type Request, type Response } from 'express';
import { pipeline } from 'node:stream';
import { z } from 'zod';
import { isOwner } from '../auth/ownership';
import { getServices } from '../services/registry';
import type { AuthenticatedRequest } from '../types/request.types';
import { fail } from '../utils/api-response';
import { logger } from '../utils/logger.utils';
import {
  FILE_NAME_PATTERN,
  IMAGE_OBJECT_PREFIX,
  TYPE_BY_EXTENSION,
} from './constants';
import { bucket, errorCode, type BucketPort } from './ports';

export interface FilesRouteDeps {
  /** The session record (any owner); the route itself decides who may read. */
  getSession(sessionId: string): Promise<{ userId?: string } | null | undefined>;
  bucket(): BucketPort;
}

const sessionIdSchema = z.string().uuid();

const defaultDeps = (): FilesRouteDeps => ({
  getSession: (id) => getServices().persistence.sessions.get(id),
  bucket,
});

const notFound = (res: Response): Response => fail(res, 404, 'File not found');

/**
 * `GET /service/files/:sessionId/:fileName`: streams a private image to its owner (or an
 * administrator). Mounted behind the verified Merchant Center session; the only inputs are the
 * two validated path parameters (no query parameter, header or body field is ever read), so a
 * forged label or e-mail grants nothing. Every miss is a 404: existence is never revealed.
 */
export function createFilesRouter(deps: FilesRouteDeps = defaultDeps()): Router {
  const router = Router();

  router.get('/:sessionId/:fileName', async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const sessionId = sessionIdSchema.safeParse(req.params.sessionId);
    const fileName = req.params.fileName;
    if (!sessionId.success || !FILE_NAME_PATTERN.test(fileName)) {
      notFound(res);
      return;
    }

    try {
      const session = await deps.getSession(sessionId.data);
      if (!session || !(isOwner(session, user) || user?.isAdmin === true)) {
        notFound(res);
        return;
      }

      const file = deps
        .bucket()
        .file(`${IMAGE_OBJECT_PREFIX}${sessionId.data}/${fileName}`);
      let size: string | number | undefined;
      try {
        [{ size }] = await file.getMetadata();
      } catch (error) {
        if (errorCode(error) === 404) {
          notFound(res);
          return;
        }
        throw error;
      }

      // The content type comes from the validated extension, never from object metadata.
      const extension = fileName.slice(fileName.lastIndexOf('.') + 1);
      res.status(200);
      res.setHeader('Content-Type', TYPE_BY_EXTENSION[extension]);
      if (size !== undefined) res.setHeader('Content-Length', String(size));
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cache-Control', 'private, no-store');

      const stream = file.createReadStream();
      // A client that goes away before the end must not keep the storage stream open.
      res.on('close', () => {
        if (!res.writableFinished) stream.destroy();
      });
      pipeline(stream, res, (error) => {
        if (error && !res.writableFinished) {
          logger.warn('Image stream ended early');
          res.destroy();
        }
      });
    } catch (error) {
      logger.error('Image read failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
      if (res.headersSent) {
        res.destroy();
      } else {
        fail(res, 500, 'Failed to read file');
      }
    }
  });

  return router;
}
