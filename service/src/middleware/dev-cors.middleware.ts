/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { RequestHandler } from 'express';

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Lets a browser on localhost call the service directly (the frontends skip
 * `/proxy/forward-to` for an http service in development). Only installed under
 * MC_AUTH_DISABLED, which config validation rejects in production.
 *
 * Answers the preflight itself, so it must sit before session verification. No
 * credentials are allowed: the direct path carries no cookie or token.
 */
export const devCors: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || !LOCAL_ORIGIN.test(origin)) return next();

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Expose-Headers', '*');
  res.vary('Origin');

  if (req.method === 'OPTIONS') {
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );
    const requested = req.headers['access-control-request-headers'];
    if (requested) res.setHeader('Access-Control-Allow-Headers', requested);
    res.vary('Access-Control-Request-Headers');
    res.setHeader('Access-Control-Max-Age', '600');
    res.status(204).end();
    return;
  }
  next();
};
