/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { SimpleGrid, Skeleton, Stack } from '@commercetools/nimbus';
import { SectionLabel } from './section-label';
import { SuggestionCard } from './suggestion-card';
import type { PromptSuggestion } from '../../../hooks/use-chat-service-connector/types';
import { DEFAULT_SUGGESTIONS } from './default-suggestions';

type Props = {
  suggestions?: PromptSuggestion[];
  isLoading?: boolean;
  onPick: (prompt: string) => void;
};

/**
 * The "start with" grid.
 *
 * Falls back to {@link DEFAULT_SUGGESTIONS} whenever personalised ones are missing, so the
 * screen is never empty and never shows an error - a failed suggestions call should cost
 * the user relevance, not the feature.
 */
export const SuggestionCards: React.FC<Props> = ({
  suggestions,
  isLoading = false,
  onPick,
}) => {
  const items = suggestions?.length ? suggestions : DEFAULT_SUGGESTIONS;

  return (
    <Stack direction="column" gap="300">
      <SectionLabel>Start with</SectionLabel>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap="300">
        {isLoading
          ? Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} height="86px" borderRadius="300" />
            ))
          : items.map((suggestion, index) => (
              <SuggestionCard
                key={`${suggestion.title}-${index}`}
                suggestion={suggestion}
                index={index}
                onPick={onPick}
              />
            ))}
      </SimpleGrid>
    </Stack>
  );
};
