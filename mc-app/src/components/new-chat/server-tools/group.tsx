/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useState } from 'react';
import {
  KeyboardArrowDown,
  KeyboardArrowRight,
} from '@commercetools/nimbus-icons';
import {
  Badge,
  Box,
  Checkbox,
  Code,
  IconButton,
  Stack,
  Text,
} from '@commercetools/nimbus';
import { GroupedSessionTools } from '../../../hooks/use-chat-service-connector/types';

/**
 * MCP Group Component - handles a single MCP's tools
 */
interface MCPGroupProps {
  group: GroupedSessionTools;
  onToggleTool: (mcpName: string, toolName: string) => void;
  onToggleAll: (mcpName: string) => void;
  /**
   * Set when the service reports the provider as not configured (`GET mcp/providers`).
   * The group is greyed out and its checkboxes are disabled: switching them on would do
   * nothing. Missing key names are shown, never values.
   */
  unconfigured?: { missingKeys: string[] };
}

const MCPGroup: React.FC<MCPGroupProps> = ({
  group,
  onToggleTool,
  onToggleAll,
  unconfigured,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const enabledCount = group.tools.filter((t) => t.enabled).length;
  const allEnabled =
    group.tools.length > 0 && enabledCount === group.tools.length;
  const someEnabled = enabledCount > 0 && enabledCount < group.tools.length;

  return (
    <Box
      data-unconfigured={unconfigured ? 'true' : undefined}
      opacity={unconfigured ? 0.6 : undefined}
      borderBottomWidth="25"
      borderBottomStyle="solid"
      borderBottomColor="neutral.6"
      _last={{ borderBottomWidth: '0' }}
    >
      {/*
       * The expander and the select-all are SEPARATE controls. They used to be a clickable
       * header <div> with a checkbox inside it, which meant every select-all click had to
       * stopPropagation to avoid also toggling the expander. Two sibling controls need no
       * such coordination, and both are reachable by keyboard.
       */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        gap="200"
        paddingY="100"
      >
        <Stack direction="row" alignItems="center" gap="100" minWidth="0">
          <IconButton
            aria-label={
              isExpanded ? `Collapse ${group.mcp}` : `Expand ${group.mcp}`
            }
            aria-expanded={isExpanded}
            size="2xs"
            variant="ghost"
            onPress={() => setIsExpanded((open) => !open)}
          >
            {isExpanded ? <KeyboardArrowDown /> : <KeyboardArrowRight />}
          </IconButton>
          <Text fontWeight="600" truncate>
            {group.mcp}
          </Text>
          <Badge size="2xs">
            {enabledCount}/{group.tools.length}
          </Badge>
          {unconfigured && (
            <Badge size="2xs" colorPalette="warning">
              Not configured
            </Badge>
          )}
        </Stack>

        <Checkbox
          aria-label={`Toggle all ${group.mcp} tools`}
          isSelected={allEnabled}
          isIndeterminate={someEnabled}
          isDisabled={Boolean(unconfigured)}
          onChange={() => onToggleAll(group.mcp)}
        />
      </Stack>

      {unconfigured && unconfigured.missingKeys.length > 0 && (
        <Text fontSize="xs" color="neutral.11" paddingLeft="600">
          Missing: {unconfigured.missingKeys.join(', ')}
        </Text>
      )}

      {isExpanded && (
        <Stack
          direction="column"
          gap="50"
          paddingLeft="600"
          paddingBottom="200"
        >
          {[...group.tools]
            .sort((a, b) => a.toolName.localeCompare(b.toolName))
            .map((tool) => (
              <Checkbox
                key={`${group.mcp}:${tool.toolName}`}
                isSelected={tool.enabled}
                isDisabled={Boolean(unconfigured)}
                onChange={() => onToggleTool(group.mcp, tool.toolName)}
              >
                <Code variant="plain" size="xs">
                  {tool.toolName}
                </Code>
              </Checkbox>
            ))}
        </Stack>
      )}
    </Box>
  );
};

export default MCPGroup;
