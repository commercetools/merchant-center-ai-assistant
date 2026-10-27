/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { type ComponentType, type SVGProps } from 'react';
import { Button, Text } from '@commercetools/nimbus';
import { useMotion } from '../../../motion';
import { RailBadge } from './rail-badge';

type Props = {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  /** Appended to the accessible name, e.g. "12 conversations". */
  countLabel?: string;
  count?: number;
  isActive?: boolean;
  onPress: () => void;
  children?: React.ReactNode;
};

/**
 * One destination in the left rail: an icon over a label, with an optional count.
 *
 * The label is the point. The rail this replaces was four unlabelled icon buttons whose
 * meaning had to be discovered by hovering for a tooltip - not discoverable on touch, and
 * not discoverable at all for anyone who never hovers.
 *
 * A Nimbus `Button` stacked into a column rather than a `Box as="button"`: the button
 * recipe brings the focus ring and press handling, and its react-aria press behaviour is
 * what the parent `Toolbar`'s roving focus expects. `height="auto"` and the column
 * direction are the only things overridden on it.
 */
export const RailItem: React.FC<Props> = ({
  icon: Icon,
  label,
  countLabel,
  count,
  isActive = false,
  onPress,
  children,
}) => {
  const motion = useMotion();

  return (
    <Button
      variant="ghost"
      aria-label={countLabel ? `${label}, ${countLabel}` : label}
      aria-pressed={isActive}
      onPress={onPress}
      position="relative"
      width="100%"
      height="auto"
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap="100"
      paddingX="0"
      paddingY="200"
      borderRadius="300"
      backgroundColor={isActive ? 'primary.3' : 'transparent'}
      color={isActive ? 'primary.11' : 'neutral.11'}
      _hover={{ backgroundColor: 'primary.3', color: 'primary.11' }}
      {...motion.tint()}
    >
      <Icon width={22} height={22} />
      <Text fontSize="300" fontWeight="500" textAlign="center" lineHeight="400">
        {label}
      </Text>
      {typeof count === 'number' && <RailBadge count={count} />}
      {children}
    </Button>
  );
};
