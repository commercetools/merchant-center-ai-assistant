/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Handyman } from '@commercetools/nimbus-icons';
import { Badge, Button } from '@commercetools/nimbus';

type Props = {
  /** How many sources currently have at least one tool switched on. */
  sourceCount: number;
  isOpen: boolean;
  onToggle: () => void;
};

/**
 * Opens the tool switchboard inside the composer.
 *
 * The badge counts SOURCES, not tools. A Managed MCP Server alone contributes over a
 * hundred tools, and "135" next to a button reads as a warning rather than as information;
 * "2" answers the question the user actually has, which is what the assistant can reach.
 */
export const ToolsButton: React.FC<Props> = ({
  sourceCount,
  isOpen,
  onToggle,
}) => (
  <Button
    variant="ghost"
    size="xs"
    onPress={onToggle}
    aria-expanded={isOpen}
    title="Choose what the assistant can reach"
  >
    <Handyman />
    Tools
    {sourceCount > 0 && (
      <Badge colorPalette="primary" size="2xs">
        {sourceCount}
      </Badge>
    )}
  </Button>
);
