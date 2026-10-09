/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { NimbusProvider } from '@commercetools/nimbus';
import { SendButton } from './send-button';
import { StopButton } from './stop-button';

const wrap = (node: React.ReactNode) =>
  render(<NimbusProvider>{node}</NimbusProvider>);

describe('StopButton', () => {
  it('calls the chat stop and carries the chat-stop test hook', () => {
    const onStop = jest.fn();
    wrap(<StopButton onStop={onStop} />);
    const button = screen.getByTestId('chat-stop');
    expect(button.getAttribute('type')).toBe('button');
    fireEvent.click(button);
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});

describe('SendButton', () => {
  it('is a submit button with the chat-send test hook', () => {
    wrap(<SendButton isDisabled={false} />);
    const button = screen.getByTestId('chat-send');
    expect(button.getAttribute('type')).toBe('submit');
    expect(screen.getByLabelText('Send message')).toBe(button);
  });
});
