/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  LoadingSpinner,
  SearchInput,
  Stack,
  Text,
} from '@commercetools/nimbus';
import { useSession } from '../../../contexts/session';
import { GroupedSessionTools } from '../../../hooks/use-chat-service-connector/types';
import MCPGroup from './group';

/**
 * The per-session tool switchboard: every tool the assistant can reach, grouped by source,
 * each one switchable.
 *
 * Content only. It used to own its own anchoring - an absolutely positioned card, a
 * full-screen click-catcher and a z-index stack - because it hung off a small icon button
 * in the composer. It now renders inline inside the composer card, which the composer
 * expands to make room for, so all of that positioning is gone. Closing is the composer's
 * business.
 *
 * Unsaved toggles are still discarded when the panel closes, because closing unmounts this
 * component and its local copy of the tool list with it. That is deliberate and unchanged:
 * the explicit Save is the only thing that writes.
 */
export const ToolsPanel: React.FC = () => {
  const { sessionTools, isLoadingTools, updateTools } = useSession();
  const [localTools, setLocalTools] = useState<GroupedSessionTools[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    setLocalTools(sessionTools);
    setHasChanges(false);
  }, [sessionTools]);

  const handleToggleTool = useCallback((mcpName: string, toolName: string) => {
    setLocalTools((prev) =>
      prev.map((group) => {
        if (group.mcp !== mcpName) return group;
        return {
          ...group,
          tools: group.tools.map((tool) =>
            tool.toolName === toolName
              ? { ...tool, enabled: !tool.enabled }
              : tool
          ),
        };
      })
    );
    setHasChanges(true);
  }, []);

  const handleToggleAll = useCallback((mcpName: string) => {
    setLocalTools((prev) =>
      prev.map((group) => {
        if (group.mcp !== mcpName) return group;
        const allEnabled = group.tools.every((tool) => tool.enabled);
        return {
          ...group,
          tools: group.tools.map((tool) => ({ ...tool, enabled: !allEnabled })),
        };
      })
    );
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await updateTools(localTools);
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  }, [localTools, updateTools]);

  const needle = filterText.trim().toLowerCase();
  const filteredTools = needle
    ? localTools.reduce<GroupedSessionTools[]>((groups, group) => {
        const tools = group.tools.filter((tool) =>
          tool.toolName.toLowerCase().includes(needle)
        );
        if (tools.length > 0) groups.push({ ...group, tools });
        return groups;
      }, [])
    : localTools;

  return (
    <Stack direction="column" gap="200">
      <Stack direction="row" alignItems="center" gap="200">
        <Box flex="1" minWidth="0">
          <SearchInput
            aria-label="Filter tools"
            placeholder="Filter tools…"
            value={filterText}
            onChange={setFilterText}
            onClear={() => setFilterText('')}
            width="100%"
            size="sm"
          />
        </Box>
        <Button
          variant="solid"
          colorPalette="primary"
          size="xs"
          onPress={handleSave}
          isDisabled={!hasChanges || isSaving}
        >
          {isSaving && <LoadingSpinner size="2xs" />}
          Save
        </Button>
      </Stack>

      <Box maxHeight="320px" overflowY="auto">
        {isLoadingTools ? (
          <Stack direction="column" alignItems="center" gap="200" padding="600">
            <LoadingSpinner />
            <Text color="neutral.11">Loading tools…</Text>
          </Stack>
        ) : localTools.length === 0 ? (
          <Text color="neutral.11" padding="600" textAlign="center">
            No tools available
          </Text>
        ) : filteredTools.length === 0 ? (
          <Text color="neutral.11" padding="600" textAlign="center">
            No tools match &quot;{filterText}&quot;
          </Text>
        ) : (
          filteredTools.map((group) => (
            <MCPGroup
              key={group.mcp}
              group={group}
              onToggleTool={handleToggleTool}
              onToggleAll={handleToggleAll}
            />
          ))
        )}
      </Box>
    </Stack>
  );
};

export default ToolsPanel;
