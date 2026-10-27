/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Accordion, Link, Stack, Text } from '@commercetools/nimbus';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { entryPointUriPath } from '../../../constants';
import { useIsAssistantAdmin } from '../../../hooks/use-assistant-admin';
import { ConfigureSystemPrompt } from '../../configuration/configure-system-prompt';

/**
 * The project-wide settings that change how the assistant behaves for everyone, rather
 * than what one person sees.
 *
 * Administrators only: the whole section is absent for everyone else (the service refuses
 * a non-admin write with 403 `ADMIN_REQUIRED` regardless). Folded away because it is rare
 * and consequential - a custom system prompt rewrites every reply. It also holds the link
 * to the backoffice (conversation and feedback review), which is the app's only entry to it.
 */
export const AdvancedSection: React.FC = () => {
  const isAssistantAdmin = useIsAssistantAdmin();
  const projectKey = useApplicationContext((context) => context.project?.key);

  if (!isAssistantAdmin) return null;

  return (
    <Accordion.Root>
      <Accordion.Item value="advanced">
        {/* `Header` IS the trigger in Nimbus 3.5.x - there is no `Accordion.Trigger`,
          whatever the documentation site shows. */}
        <Accordion.Header>Advanced</Accordion.Header>
        <Accordion.Content>
          <Stack direction="column" gap="600" paddingTop="300">
            <Stack direction="column" gap="200">
              <Text fontWeight="600" fontSize="350">
                System prompt
              </Text>
              <Text fontSize="300" color="neutral.11">
                Extra instructions added to every conversation in this project.
              </Text>
              <ConfigureSystemPrompt />
            </Stack>

            <Stack direction="column" gap="200">
              <Text fontWeight="600" fontSize="350">
                Review
              </Text>
              <Text fontSize="300" color="neutral.11">
                Browse conversations and feedback from this project.
              </Text>
              <Link href={`/${projectKey}/${entryPointUriPath}/backoffice`}>
                Open backoffice
              </Link>
            </Stack>
          </Stack>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
};
