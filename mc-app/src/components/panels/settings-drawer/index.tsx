/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useEffect } from 'react';
import {
  Drawer,
  LoadingSpinner,
  Separator,
  Stack,
  Text,
} from '@commercetools/nimbus';
import { useMcpProviders } from '../../../contexts/mcp-providers';
import { useSystemPromptConfigContext } from '../../../contexts/system-prompt-config';
import { useToolCallLogsConfigContext } from '../../../contexts/tool-call-logs-config';
import { useIsAssistantAdmin } from '../../../hooks/use-assistant-admin';
import { AccountCard } from './account-card';
import { AboutSection } from './about-section';
import { AdvancedSection } from './advanced-section';
import { ConnectedSources } from './connected-sources';
import { DetailLevelControl } from './detail-level-control';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

/**
 * Settings, ordered by how often anyone changes them: who you are, how much you want to
 * see, what the assistant can reach, and then the project-wide switches nobody touches
 * twice.
 *
 * Controlled rather than using `Drawer.Trigger`: the button that opens this is in the left
 * rail, several components away, and the open flag is lifted to the chat shell.
 *
 * There is no `if (!isOpen) return null`. That unmounted the panel before its exit
 * animation could run, so the slide-out never actually played; Drawer owns mounting.
 */
export const SettingsDrawer: React.FC<Props> = ({ isOpen, onClose }) => {
  const isAssistantAdmin = useIsAssistantAdmin();
  const { loading: isProvidersLoading, ensureProvidersLoaded } =
    useMcpProviders();
  const { state: toolCallLogsState } = useToolCallLogsConfigContext();
  const { state: systemPromptState, ensureLoaded: ensureSystemPromptLoaded } =
    useSystemPromptConfigContext();

  // These settings are fetched when the drawer is first opened, not on page load - see
  // the providers. This component stays mounted while closed (Drawer owns mounting, so
  // the exit animation can run), so mounting is not the signal; `isOpen` is.
  useEffect(() => {
    if (!isOpen) return;
    void ensureProvidersLoaded();
    // The system prompt is an administrators' setting; nobody else needs to fetch it.
    if (isAssistantAdmin) void ensureSystemPromptLoaded();
  }, [
    isOpen,
    isAssistantAdmin,
    ensureProvidersLoaded,
    ensureSystemPromptLoaded,
  ]);

  const isLoading =
    isProvidersLoading ||
    toolCallLogsState.isLoading ||
    (isAssistantAdmin && systemPromptState.isLoading);

  return (
    <Drawer.Root
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="left"
    >
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>Settings</Drawer.Title>
          <Drawer.CloseTrigger />
        </Drawer.Header>

        <Drawer.Body>
          {isLoading ? (
            <Stack
              direction="column"
              gap="400"
              alignItems="center"
              padding="800"
            >
              <LoadingSpinner />
              <Text color="neutral.11">Loading settings…</Text>
            </Stack>
          ) : (
            <Stack direction="column" gap="600">
              <AccountCard />
              <Separator />
              {isAssistantAdmin && (
                <>
                  <DetailLevelControl />
                  <Separator />
                </>
              )}
              <ConnectedSources />
              <Separator />
              {isAssistantAdmin && (
                <>
                  <AdvancedSection />
                  <Separator />
                </>
              )}
              <AboutSection isAdmin={isAssistantAdmin} />
            </Stack>
          )}
        </Drawer.Body>
      </Drawer.Content>
    </Drawer.Root>
  );
};

export default SettingsDrawer;
