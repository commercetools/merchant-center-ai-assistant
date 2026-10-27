/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Text } from '@commercetools/nimbus';
import { formatRelative } from '../../../utils/relative-time';

type Props = {
  toolCount: number;
  createdAt?: number;
  locale: string;
};

/**
 * The quiet second line under the session title: when this started, and what the
 * assistant can currently reach.
 *
 * The tool count answers the question the transcript cannot - "does it even have access
 * to my orders?" - without the user opening the tools panel to find out. `createdAt` is
 * absent on rows served by the pre-digest fallback, in which case the line is just the
 * tool count rather than a gap.
 */
export const SessionMeta: React.FC<Props> = ({
  toolCount,
  createdAt,
  locale,
}) => {
  const tools =
    toolCount === 1 ? '1 tool available' : `${toolCount} tools available`;
  const started =
    createdAt === undefined
      ? null
      : `Started ${formatRelative(createdAt, locale)}`;

  return (
    <Text fontSize="300" color="neutral.11">
      {started ? `${started} · ${tools}` : tools}
    </Text>
  );
};
