/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Box } from '@commercetools/nimbus';
import { ToolsPanel } from '../server-tools/tools-panel';
import { useMotion } from '../../../motion';

/**
 * The tool switchboard, revealed inside the composer card.
 *
 * Inline rather than floating. As an anchored popover it covered the transcript it was
 * describing, and dismissing it by clicking away silently discarded unsaved toggles - an
 * easy accident, because clicking the message you were reading counted as "away". Growing
 * the composer downward keeps both the conversation and the switches on screen, and the
 * only way to close it is the Tools button that opened it.
 */
export const SourcesPanel: React.FC = () => {
  const motion = useMotion();

  return (
    <Box
      marginTop="200"
      paddingTop="300"
      paddingX="150"
      borderTopWidth="25"
      borderTopStyle="solid"
      borderTopColor="neutral.4"
      {...motion.enter()}
    >
      <ToolsPanel />
    </Box>
  );
};
