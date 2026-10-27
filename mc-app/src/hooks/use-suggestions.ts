/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useEffect, useRef, useState } from 'react';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { useChatServiceConnector } from './use-chat-service-connector/use-chat-service-connector';
import type { PromptSuggestion } from './use-chat-service-connector/types';

type Result = {
  suggestions?: PromptSuggestion[];
  isLoading: boolean;
};

/**
 * Opening prompts for the empty state.
 *
 * Fetched once per mount of the empty state rather than on a timer or on every render:
 * the service caches per user per day, so asking again inside one sitting returns the same
 * four cards at the cost of a round trip.
 *
 * There is no error state. The service answers with static defaults when it cannot
 * personalise, and if the request itself fails the component falls back to its own copy of
 * those defaults - a blank empty state would be a worse outcome than a generic one.
 */
export const useSuggestions = (enabled: boolean): Result => {
  const { getSuggestions } = useChatServiceConnector();
  const dataLocale = useApplicationContext(
    (context) => context.dataLocale || 'en-US'
  );

  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>();
  const [isLoading, setIsLoading] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!enabled || hasFetched.current) return;
    hasFetched.current = true;

    let cancelled = false;
    setIsLoading(true);

    getSuggestions(dataLocale)
      .then((response) => {
        if (cancelled || !response?.success) return;
        setSuggestions(response.data.suggestions);
      })
      .catch(() => {
        // No error state: the empty state renders its built-in defaults.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, getSuggestions, dataLocale]);

  return { suggestions, isLoading };
};
