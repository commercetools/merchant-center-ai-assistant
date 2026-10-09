/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useCallback } from 'react';
import { AutoAwesome } from '@commercetools/nimbus-icons';
import { Flex, Button } from '@commercetools/nimbus';
import { useTabbedHeaderContext } from '../../../contexts';
import { VIEW_TABS, type TabId } from '../view-tabs';

type Props = {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
};

/**
 * Assistant / Preview / Code.
 *
 * Deliberately NOT Nimbus `Tabs`, and not `TabNav` either - this is the same reasoning the
 * strip carried before it moved into the header:
 *
 * - `Tabs.Root` would have to span both this switcher and the panels, which a different
 *   component renders. react-aria also unmounts the inactive panel unless `shouldForceMount`
 *   is set, and unmounting the assistant panel would destroy a chat that is mid-stream.
 * - `TabNav.Item` requires an `href`; these are not routes.
 *
 * So it is a toggle-button group in substance, with `aria-current` marking the active one.
 */
export const ViewSwitcher: React.FC<Props> = ({ activeTab, onTabChange }) => {
  const { highlightedTab, clearHighlight } = useTabbedHeaderContext();

  const handlePress = useCallback(
    (tab: TabId) => {
      if (highlightedTab === tab) clearHighlight();
      onTabChange(tab);
    },
    [highlightedTab, clearHighlight, onTabChange]
  );

  return (
    <Flex
      gap="50"
      padding="50"
      bg="neutral.3"
      borderRadius="200"
      role="group"
      aria-label="Assistant view"
    >
      {VIEW_TABS.map(({ id, label }) => (
        <Button
          key={id}
          size="xs"
          variant={activeTab === id ? 'solid' : 'ghost'}
          aria-current={activeTab === id ? 'true' : undefined}
          onPress={() => handlePress(id)}
        >
          {highlightedTab === id && <AutoAwesome />}
          {label}
        </Button>
      ))}
    </Flex>
  );
};
