/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { MultilineTextInput, Stack, Text } from '@commercetools/nimbus';
import { useSystemPromptConfigContext } from '../../contexts/system-prompt-config';
import { useIsAssistantAdmin } from '../../hooks/use-assistant-admin';
import { ConfigError, SaveActions } from '../configure-mcp/form-parts';

/**
 * Configure System Prompt Component
 * Allows administrators to set a custom system prompt for the AI assistant.
 *
 * Admin-only: for everyone else it renders nothing (no field, no text). The service
 * enforces the same rule; a 403 `ADMIN_REQUIRED` on save shows "Administrator access
 * required" and keeps the stored value.
 */
export const ConfigureSystemPrompt: React.FC = () => {
  const isAssistantAdmin = useIsAssistantAdmin();
  const { state, setSystemPrompt, saveConfig } = useSystemPromptConfigContext();

  if (!isAssistantAdmin) return null;

  return (
    <Stack direction="column" gap="400">
      <Text color="neutral.11" textStyle="sm">
        Provide a custom system prompt to guide the AI assistant&apos;s
        behavior. This prompt is prepended to every conversation for this
        project.
      </Text>

      {/* MultilineTextInput's root is inline-flex with no intrinsic width, so it
          shrink-wraps unless width is given. `rows` replaces the old min-height:120px.
          onChange hands over the value, not a change event. There is no visible label:
          the drawer section heading ("System Prompt") names this field, so the control
          carries an aria-label instead. */}
      <MultilineTextInput
        width="100%"
        rows={5}
        value={state.systemPrompt}
        onChange={setSystemPrompt}
        placeholder="Enter a system prompt..."
        aria-label="System prompt"
        isDisabled={state.isLoading || state.isSaving}
      />

      {state.error && <ConfigError>{state.error}</ConfigError>}

      <SaveActions
        onSave={saveConfig}
        isSaving={state.isSaving}
        hasChanges={state.hasChanges}
      />
    </Stack>
  );
};

export default ConfigureSystemPrompt;
