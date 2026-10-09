/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { ArrowUpward } from '@commercetools/nimbus-icons';
import { IconButton } from '@commercetools/nimbus';

type Props = {
  isDisabled: boolean;
};

/**
 * Sends the message.
 *
 * `type="submit"` with NO press handler: the composer form's `onSubmit` is the single send
 * path, and adding `onPress` here would fire alongside it and send twice.
 */
export const SendButton: React.FC<Props> = ({ isDisabled }) => (
  <IconButton
    type="submit"
    aria-label="Send message"
    data-testid="chat-send"
    variant="solid"
    colorPalette="primary"
    size="xs"
    isDisabled={isDisabled}
  >
    <ArrowUpward />
  </IconButton>
);
