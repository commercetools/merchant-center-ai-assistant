/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Flex,
  LoadingSpinner,
  Text,
} from '@commercetools/nimbus';
import { Save } from '@commercetools/nimbus-icons';

/**
 * Shared Nimbus primitives of the settings drawer: a read-only status card, an error
 * banner and a save row.
 *
 * The provider credential forms and their `ToggleCard` are gone: provider credentials are
 * Connect deployment configuration and never pass through this app. `StatusCard` is the
 * only card left; `ConfigError` and `SaveActions` are used by the system prompt form.
 */

/** A red-bordered banner above the form it belongs to. */
export const ConfigError: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Alert.Root colorPalette="critical" variant="outlined">
    <Alert.Description>{children}</Alert.Description>
  </Alert.Root>
);

/**
 * A read-only card: a label, a badge, and optional lines of text. No Switch, no input and
 * no body control. Whether a source is on is worth seeing, because it explains what the
 * assistant can do; changing it is the operator's business, done in the deployment.
 */
export const StatusCard: React.FC<{
  label: string;
  isEnabled: boolean;
  /** Badge text; defaults to Enabled / Disabled. */
  badgeText?: string;
  children?: React.ReactNode;
}> = ({ label, isEnabled, badgeText, children }) => (
  <Card.Root
    variant="outlined"
    width="100%"
    // Explicit border colour rather than `colorPalette`, so the palette does not
    // cascade into the Badge inside the card.
    borderColor={isEnabled ? 'primary.9' : 'neutral.6'}
  >
    <Card.Header>
      <Flex alignItems="center" justifyContent="space-between" gap="400">
        <Text fontWeight="600">{label}</Text>
        <Badge colorPalette={isEnabled ? 'positive' : 'neutral'} size="xs">
          {badgeText ?? (isEnabled ? 'Enabled' : 'Disabled')}
        </Badge>
      </Flex>
    </Card.Header>

    {children && (
      <Card.Body borderTopWidth="1px" borderTopColor="neutral.6" pt="400">
        {children}
      </Card.Body>
    )}
  </Card.Root>
);

interface SaveActionsProps {
  onSave: () => void | Promise<unknown>;
  isSaving: boolean;
  hasChanges: boolean;
}

/**
 * The save row. Nimbus `Button` has no `isLoading`, so the saving state is a
 * `LoadingSpinner` child plus `isDisabled` (which the "no changes" case needs anyway).
 */
export const SaveActions: React.FC<SaveActionsProps> = ({
  onSave,
  isSaving,
  hasChanges,
}) => (
  <Flex
    justifyContent="flex-end"
    gap="400"
    mt="800"
    pt="600"
    borderTopWidth="1px"
    borderTopColor="neutral.6"
  >
    <Button
      data-testid="admin-config-save"
      variant="solid"
      colorPalette="primary"
      onPress={() => {
        void onSave();
      }}
      isDisabled={!hasChanges || isSaving}
    >
      {isSaving ? <LoadingSpinner size="sm" colorPalette="white" /> : <Save />}
      {isSaving ? 'Saving...' : 'Save Changes'}
    </Button>
  </Flex>
);
