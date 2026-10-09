/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useEffect, useRef } from 'react';
import { Box, Button, Flex, Stack, Text } from '@commercetools/nimbus';
import { useToolCallLogsConfigContext } from '../../../contexts/tool-call-logs-config';
import type { ToolCallLogsMode } from '../../../hooks/use-chat-service-connector/types';
import { useIsAssistantAdmin } from '../../../hooks/use-assistant-admin';
import { useMotion } from '../../../motion';
import { ConfigError } from '../../configure-mcp/form-parts';

type Level = {
  label: string;
  mode: ToolCallLogsMode;
  hint: string;
};

/**
 * Three levels, not the four modes the service accepts.
 *
 * The stored value has always been one of `none | thinking | tools | all`, which is two
 * independent switches (tool calls, reasoning) flattened into one list - and "Only
 * thinking" is a combination nobody chose deliberately: seeing the model's reasoning but
 * not what it actually did is the least useful of the four. The control now offers the
 * three that describe real intentions, and `thinking` survives only as a value an older
 * project may still have stored.
 */
const LEVELS: Level[] = [
  {
    label: 'Off',
    mode: 'none',
    hint: 'Only the answer. Failures are still reported.',
  },
  {
    label: 'Summary',
    mode: 'tools',
    hint: 'One line per step, expandable when you want the detail.',
  },
  {
    label: 'Detailed',
    mode: 'all',
    hint: 'Every tool call and its parameters, shown inline.',
  },
];

/**
 * How much of the assistant's work to show while it is working.
 *
 * Administrators only: the setting is project-wide (it is stored by the service and applies
 * to every member), so for everyone else the control is absent. Their transcript still
 * follows the effective mode, which the tool-call-logs context reads from the service.
 *
 * Saves on selection rather than behind a Save button: it is a single preference with an
 * immediately visible effect. The save runs from an effect, after the new mode is in the
 * context state: calling `saveConfig` in the click handler would run the closure of the
 * previous render, see "no changes" and save nothing. A refused or failed save (for example
 * 403 `ADMIN_REQUIRED`) puts the previous mode back and shows the error.
 */
export const DetailLevelControl: React.FC = () => {
  const motion = useMotion();
  const isAssistantAdmin = useIsAssistantAdmin();
  const { state, setMode, saveConfig } = useToolCallLogsConfigContext();
  const pendingSave = useRef<ToolCallLogsMode | null>(null);

  useEffect(() => {
    const previous = pendingSave.current;
    if (previous === null || !state.hasChanges || state.isSaving) return;
    pendingSave.current = null;
    void saveConfig().then((saved) => {
      if (!saved) setMode(previous);
    });
  }, [state.hasChanges, state.isSaving, state.mode, saveConfig, setMode]);

  if (!isAssistantAdmin) return null;

  const current =
    LEVELS.find((level) => level.mode === state.mode) ?? LEVELS[1];

  const handleSelect = (mode: ToolCallLogsMode) => {
    if (mode === state.mode) return;
    pendingSave.current = state.mode;
    setMode(mode);
  };

  return (
    <Stack direction="column" gap="200">
      <Text fontWeight="600" fontSize="350">
        How much detail to show
      </Text>
      <Text fontSize="300" color="neutral.11">
        Choose what everyone sees while the assistant works on a request.
      </Text>

      <Flex
        backgroundColor="neutral.3"
        borderRadius="200"
        padding="50"
        gap="50"
        role="group"
        aria-label="Detail level"
      >
        {LEVELS.map((level) => {
          const isActive = level.mode === state.mode;
          return (
            <Button
              key={level.mode}
              flex="1"
              size="xs"
              variant={isActive ? 'solid' : 'ghost'}
              colorPalette={isActive ? 'primary' : 'neutral'}
              aria-pressed={isActive}
              isDisabled={state.isSaving}
              onPress={() => handleSelect(level.mode)}
              {...motion.tint()}
            >
              {level.label}
            </Button>
          );
        })}
      </Flex>

      <Box>
        <Text fontSize="300" color="neutral.11">
          {current.hint}
        </Text>
      </Box>

      {state.error && <ConfigError>{state.error}</ConfigError>}
    </Stack>
  );
};
