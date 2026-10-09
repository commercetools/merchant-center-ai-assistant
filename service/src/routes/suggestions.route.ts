/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { RequestHandler, Router } from 'express';
import { userOf } from '../controllers/session.controller';
import { getServices } from '../services/registry';
import { DEFAULT_SUGGESTIONS } from '../services/suggestions.service';
import { ok } from '../utils/api-response';
import { logger } from '../utils/logger.utils';

export const suggestionsRouter = Router();

const MAX_LOCALE_CHARS = 35;

/**
 * `GET /service/suggestions`: always 200 with four cards. A cold cache, no history, a
 * failing model or a failing store all yield the static set.
 */
const getSuggestions: RequestHandler = async (req, res) => {
  const raw = typeof req.query.locale === 'string' ? req.query.locale.trim() : '';
  const locale = raw && raw.length <= MAX_LOCALE_CHARS ? raw : 'en';
  try {
    ok(res, await getServices().suggestions.getForUser(userOf(req), locale));
  } catch (error) {
    // The service never throws; this guards getServices() itself.
    logger.error('Error building prompt suggestions', error);
    ok(res, { suggestions: DEFAULT_SUGGESTIONS, personalised: false });
  }
};

suggestionsRouter.get('/', getSuggestions);
