/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NimbusProvider } from '@commercetools/nimbus';
import { DetailLevelControl } from './detail-level-control';

type Mode = 'none' | 'thinking' | 'tools' | 'all';

let mockIsAdmin = true;
let mockSaveResult = true;
let mockError: string | null = null;
// What the closure of `saveConfig` saw when it ran: the stale-closure bug this component
// avoids by saving from an effect would show up as `false` here.
const mockSeenHasChanges: boolean[] = [];

// A minimal stand-in for the real provider: same shape, same dependency on its own state.
// Defined inside the factory so the hooks live in a function named like a hook.
jest.mock('../../../contexts/tool-call-logs-config', () => ({
  useToolCallLogsConfigContext: function useStandIn() {
    const { useCallback, useState } = jest.requireActual<typeof React>('react');
    const [mode, setMode] = useState<Mode>('tools');
    const [saved, setSaved] = useState<Mode>('tools');
    const saveConfig = useCallback(async () => {
      mockSeenHasChanges.push(mode !== saved);
      if (mode === saved) return false;
      if (mockSaveResult) {
        setSaved(mode);
        return true;
      }
      return false;
    }, [mode, saved]);
    return {
      state: {
        mode,
        hasChanges: mode !== saved,
        isSaving: false,
        isLoading: false,
        error: mockError,
      },
      setMode,
      saveConfig,
    };
  },
}));
jest.mock('../../../hooks/use-assistant-admin', () => ({
  useIsAssistantAdmin: () => mockIsAdmin,
}));

const renderControl = () =>
  render(
    <NimbusProvider>
      <DetailLevelControl />
    </NimbusProvider>
  );

const pressed = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed');

beforeEach(() => {
  mockIsAdmin = true;
  mockSaveResult = true;
  mockError = null;
  mockSeenHasChanges.length = 0;
});

describe('DetailLevelControl', () => {
  it('is absent for a member who is not an administrator', () => {
    mockIsAdmin = false;
    renderControl();
    expect(screen.queryByText('How much detail to show')).toBeNull();
  });

  it('shows the current level as pressed', () => {
    renderControl();
    expect(pressed('Summary')).toBe('true');
    expect(pressed('Detailed')).toBe('false');
  });

  it('saves once, from the effect, after the new mode is in state', async () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Detailed' }));

    await waitFor(() => expect(mockSeenHasChanges).toHaveLength(1));
    // The save saw the NEW mode as a change: it ran after the state update.
    expect(mockSeenHasChanges).toEqual([true]);
    await waitFor(() => expect(pressed('Detailed')).toBe('true'));
    expect(mockSeenHasChanges).toHaveLength(1);
  });

  it('puts the previous mode back when the save is refused', async () => {
    mockSaveResult = false;
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Detailed' }));

    await waitFor(() => expect(mockSeenHasChanges).toHaveLength(1));
    await waitFor(() => expect(pressed('Summary')).toBe('true'));
    expect(pressed('Detailed')).toBe('false');
  });

  it('does not save when the active level is pressed again', () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Summary' }));
    expect(mockSeenHasChanges).toHaveLength(0);
  });

  it('shows the save error', () => {
    mockError = 'Administrator access required';
    renderControl();
    expect(screen.getByText('Administrator access required')).toBeTruthy();
  });
});
