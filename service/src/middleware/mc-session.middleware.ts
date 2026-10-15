/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createSessionAuthVerifier } from '@commercetools-backend/express';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { isAdminUser } from '../auth/admin';
import { isConfiguredProject } from '../auth/project-guard';
import { readConfiguration } from '../config';
import type { AuthConfig } from '../config/sections/auth';
import { setUserInContext } from '../context/request-context';
import CustomError from '../errors/custom.error';
import type { AuthenticatedRequest, RequestUser } from '../types/request.types';
import { logger } from '../utils/logger.utils';

type Verifier = (req: Request) => Promise<void>;

// One verifier per configuration object so the JWKS cache is reused.
const verifiers = new WeakMap<AuthConfig, Verifier>();

function verifierFor(auth: AuthConfig): Verifier {
  let verifier = verifiers.get(auth);
  if (!verifier) {
    verifier = createSessionAuthVerifier({
      audience: auth.mcAudience as string,
      issuer: auth.issuerCloudIdentifier,
      audiencePolicy: 'forward-url-full-path',
      inferIssuer: false,
    }) as unknown as Verifier;
    verifiers.set(auth, verifier);
  }
  return verifier;
}

let lastFailureLogAt = 0;
function logFailureOncePerMinute(
  req: Request,
  auth: AuthConfig,
  reason: string
): void {
  const now = Date.now();
  if (now - lastFailureLogAt < 60_000) return;
  lastFailureLogAt = now;
  // The audience is public; the token is never logged.
  const path = (req.originalUrl ?? req.url).split('?')[0];
  logger.warn('MC session verification failed', {
    reason,
    expectedAudience: `${auth.mcAudience}${path}`,
  });
}

const headerOf = (req: Request, name: string): string | undefined => {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
};

/** Only the user id and project key of the library's session object are read. */
function readSession(req: Request): { userId?: string; projectKey?: string } {
  const session = (req as Request & { session?: Record<string, unknown> })
    .session;
  const userId = session?.userId;
  const projectKey = session?.projectKey;
  return {
    userId: typeof userId === 'string' && userId !== '' ? userId : undefined,
    projectKey:
      typeof projectKey === 'string' && projectKey !== ''
        ? projectKey
        : undefined,
  };
}

function attachUser(req: Request, res: Response, user: RequestUser): void {
  (req as AuthenticatedRequest).user = user;
  setUserInContext(user);
  res.setHeader('Vary', 'Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

/**
 * Authenticates a request that came through the Merchant Center gateway
 * (/proxy/forward-to): verifies the signed JWT, guards the project and sets
 * req.user. Fails closed. Nothing from the request body, query or custom
 * headers is trusted (the one exception is the local development bypass).
 */
export const verifyMcSession: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const config = readConfiguration();
  const auth = config.auth;

  if (auth.authDisabled) {
    // Unreachable in production: readConfiguration() refuses the flag there.
    const userId = headerOf(req, 'x-dev-user-id') ?? 'dev-user';
    // The direct browser path cannot set x-dev-admin, so the allowlist counts here too.
    const isAdmin =
      headerOf(req, 'x-dev-admin') === 'true' ||
      isAdminUser(userId, auth.adminUserIds);
    logger.debug('MC_AUTH_DISABLED bypass used');
    attachUser(req, res, { userId, projectKey: config.ctp.projectKey, isAdmin });
    return next();
  }

  if (!auth.mcAudience) {
    return next(
      new CustomError(401, 'Service is not configured for authentication')
    );
  }

  try {
    // The library also accepts a raw token; only "Bearer <token>" is valid here.
    if (!/^Bearer \S+$/.test(req.headers.authorization ?? '')) {
      throw new Error('Authorization header is not a Bearer token');
    }
    await verifierFor(auth)(req);
  } catch (error) {
    logFailureOncePerMinute(req, auth, (error as Error).message);
    return next(
      new CustomError(401, 'Missing or invalid Merchant Center session')
    );
  }

  const session = readSession(req);
  if (!session.userId || !session.projectKey) {
    return next(new CustomError(401, 'Merchant Center session is incomplete'));
  }
  if (!isConfiguredProject(session.projectKey, config.ctp.projectKey)) {
    return next(
      new CustomError(
        403,
        'This assistant is not available for the requested project'
      )
    );
  }

  const isAdmin = isAdminUser(session.userId, auth.adminUserIds);
  logger.debug('MC session admin check', {
    userId: session.userId,
    allowlistSize: auth.adminUserIds.size,
    isAdmin,
  });
  attachUser(req, res, {
    userId: session.userId,
    projectKey: session.projectKey,
    isAdmin,
  });
  next();
};
