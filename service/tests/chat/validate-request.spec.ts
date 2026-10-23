/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import type { Request } from 'express';
import { validateChatRequest } from '../../src/chat/validate-request';

const req = (body: unknown, contentType?: string): Request =>
  ({
    body,
    headers: contentType ? { 'content-type': contentType } : {},
    params: { sessionId: 's1' },
  }) as unknown as Request;

describe('validateChatRequest', () => {
  it('accepts a user message', () => {
    const result = validateChatRequest(
      req(
        {
          id: 's1',
          message: {
            id: 'm1',
            role: 'user',
            parts: [{ type: 'text', text: 'hi' }],
          },
        },
        'application/json'
      )
    );
    expect(result).toEqual({
      ok: true,
      message: {
        id: 'm1',
        role: 'user',
        parts: [{ type: 'text', text: 'hi' }],
      },
    });
  });

  it('lists the received keys when the message is missing', () => {
    const result = validateChatRequest(req({}, 'application/json'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Request body must include a `message`');
      expect(result.error).toContain('Received keys: []');
    }
    const other = validateChatRequest(req({ id: 's1' }, 'application/json'));
    expect(!other.ok && other.error).toContain('[id]');
  });

  it('says the body was not parsed when the content type is not JSON', () => {
    const result = validateChatRequest(req({}, 'text/plain'));
    expect(!result.ok && result.error).toContain(
      'Content-Type: application/json'
    );
    const none = validateChatRequest(req(undefined));
    expect(!none.ok && none.error).toContain('Content-Type: application/json');
  });

  it('treats a duplicated content type as unparsed', () => {
    const result = validateChatRequest(
      req({}, 'application/json, application/json')
    );
    expect(!result.ok && result.error).toContain('not parsed as JSON');
  });

  it('rejects the system role', () => {
    const result = validateChatRequest(
      req(
        { message: { id: 'm1', role: 'system', parts: [] } },
        'application/json'
      )
    );
    expect(!result.ok && result.error).toContain(
      'System messages are not accepted'
    );
  });

  it.each([
    [{ role: 'user', parts: [] }, 'message.id'],
    [{ id: '', role: 'user', parts: [] }, 'message.id'],
    [{ id: 'm', role: 'user' }, 'message.parts'],
    [{ id: 'm', role: 'robot', parts: [] }, 'message.role'],
  ])('rejects an invalid message %j', (message, field) => {
    const result = validateChatRequest(req({ message }, 'application/json'));
    expect(!result.ok && result.error).toContain(field);
  });

  it('never reads identity from the body', () => {
    const result = validateChatRequest(
      req(
        {
          userId: 'attacker',
          projectKey: 'other',
          message: { id: 'm', role: 'user', parts: [], userId: 'attacker' },
        },
        'application/json'
      )
    );
    expect(result.ok && JSON.stringify(result.message)).not.toContain(
      'attacker'
    );
  });
});
