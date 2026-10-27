/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { feedbackFromValue, feedbackToValue, feedbackListItem } from '../../../src/persistence/types/feedback';
import { messageFromValue, messageToValue } from '../../../src/persistence/types/message';
import { sessionFromValue, sessionToValue } from '../../../src/persistence/types/session';
import { settingsFromValue, settingsToValue } from '../../../src/persistence/types/settings';
import { suggestionFromValue } from '../../../src/persistence/types/suggestion';
import {
  stateFromValue,
  stateToValue,
  tokenFromValue,
  tokenToValue,
} from '../../../src/persistence/types/identity';

const wire = <T>(v: T): unknown => JSON.parse(JSON.stringify(v));
const env = { v: 1 as const, kind: 'identity-tokens' as const, kid: 'k', iv: 'i', tag: 't', ct: 'c' };

describe('codecs', () => {
  it('round trips a session and defaults missing fields', () => {
    const s = {
      id: 's1',
      userId: 'u',
      userLabel: 'Ann',
      createdAt: 1,
      updatedAt: 2,
      title: 'T',
      nextPrompts: [{ text: 'a', prompt: 'b' }],
      featureFlags: { customView: 'x' },
      disabledTools: { g: ['t'] },
      temporaryTables: [{ tableRef: 'r', toolName: 'n', args: '{}' }],
      schemaVersion: 1 as const,
    };
    const back = sessionFromValue(wire(sessionToValue(s)));
    expect(back).toMatchObject(s);
    const sparse = sessionFromValue({ id: 's', userId: 'u', unknownField: 1 });
    expect(sparse.createdAt).toBe(0);
    expect(sparse.title).toBeUndefined();
    expect(sessionFromValue(null).id).toBe('');
  });

  it('round trips a message through partsJson', () => {
    const m = { id: 'm', role: 'assistant' as const, timestamp: 5, parts: [{ a: null }] };
    const value = messageToValue(m);
    expect(typeof value.partsJson).toBe('string');
    expect(messageFromValue(wire(value))).toEqual(m);
    expect(messageFromValue({ partsJson: 'not json' }).parts).toEqual([]);
  });

  it('round trips settings with numeric dates', () => {
    const s = {
      schemaVersion: 1 as const,
      systemPrompt: 'p',
      toolCallLogs: 'tools' as const,
      updatedAt: 9,
    };
    expect(settingsFromValue(wire(settingsToValue(s)))).toEqual({ ...s, identityMcp: undefined });
    expect(settingsFromValue({ toolCallLogs: 'verbose' }).toolCallLogs).toBe('all');
  });

  it('round trips tokens and auth states (state is not stored)', () => {
    const t = {
      userId: 'u',
      serverKey: 'sk',
      encryptedTokens: env,
      hasRefreshToken: true,
      issuedAt: 1,
      updatedAt: 2,
    };
    expect(tokenFromValue(wire(tokenToValue(t)))).toEqual(t);
    const a = {
      state: 'plain-state',
      userId: 'u',
      encryptedVerifier: env,
      redirectUri: 'https://x.example.test',
      createdAt: 1,
      expiresAt: 2,
    };
    const value = wire(stateToValue(a));
    expect(JSON.stringify(value)).not.toContain('plain-state');
    expect(stateFromValue('plain-state', value)).toEqual(a);
    expect(stateFromValue('s', 'garbage')).toBeNull();
  });

  it('round trips feedback and projects the list item', () => {
    const f = {
      id: 'f',
      sessionId: 's',
      userId: 'u',
      comment: '',
      createdAt: 1,
      createdAtIso: 'x',
      snapshotSource: 'client' as const,
      messageCount: 1,
      chunkCount: 1,
      snapshotBytes: 5,
      clientMessageCount: 1,
      storedMessageCount: 1,
      truncated: false,
      systemPrompt: 'secret prompt',
      schemaVersion: 1 as const,
    };
    const back = feedbackFromValue(wire(feedbackToValue(f)));
    expect(back).toEqual(f);
    expect(feedbackListItem(f)).not.toHaveProperty('systemPrompt');
    expect(feedbackFromValue(null)).toBeNull();
  });

  it('reads a suggestion value, rejects junk', () => {
    expect(suggestionFromValue({ suggestions: [], generatedAt: 1, locale: 'en', basedOn: [] })).toEqual({
      suggestions: [],
      generatedAt: 1,
      locale: 'en',
      basedOn: [],
    });
    expect(suggestionFromValue({ nope: 1 })).toBeNull();
  });
});
