/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Stop } from '@commercetools/nimbus-icons';
import { IconButton } from '@commercetools/nimbus';

type Props = {
  onStop: () => void;
};

/**
 * Stops the running turn. The composer shows it in place of the send button while the chat
 * is submitted or streaming; `onStop` is the chat's own `stop()`, which aborts the request.
 * It is a plain button (not `type="submit"`), so it never reaches the form's send path.
 */
export const StopButton: React.FC<Props> = ({ onStop }) => (
  <IconButton
    type="button"
    aria-label="Stop generating"
    data-testid="chat-stop"
    variant="solid"
    colorPalette="primary"
    size="xs"
    onPress={onStop}
  >
    <Stop />
  </IconButton>
);
