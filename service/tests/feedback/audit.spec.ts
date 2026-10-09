/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { resetConfigurationForTests } from '../../src/config';
import { auditAdminAction, auditSubmission } from '../../src/utils/audit';
import { freshConfig } from '../helpers/env';
import { captureLogs } from '../helpers/log-capture';

beforeEach(() => {
  freshConfig();
});
afterAll(() => resetConfigurationForTests());

const base = { userId: 'u-1', action: 'feedback.read', route: '/r', outcome: 'ok' as const };

describe('audit helpers', () => {
  it('logs an admin action with ids only', () => {
    const logs = captureLogs();
    auditAdminAction({ ...base, feedbackId: 'fb1', count: 3, flag: true, skipped: undefined });
    logs.stop();
    const text = logs.lines.join('');
    expect(text).toContain('audit.admin_action');
    expect(text).toContain('u-1');
    expect(text).toContain('fb1');
    expect(text).not.toContain('skipped');
  });

  it('logs a submission', () => {
    const logs = captureLogs();
    auditSubmission({
      userId: 'u-1',
      feedbackId: 'fb1',
      sessionId: 's1',
      sessionUserId: 'u-2',
      messageCount: 1,
      chunkCount: 1,
      snapshotBytes: 10,
      snapshotSource: 'client',
    });
    logs.stop();
    expect(logs.lines.join('')).toContain('audit.feedback_submitted');
  });

  it.each(['comment', 'messages', 'content', 'userLabel', 'email', 'userEmail', 'Comment'])(
    'rejects the forbidden key %s in test mode',
    (key) => {
      expect(() => auditAdminAction({ ...base, [key]: 'x' })).toThrow(/not allowed/);
    }
  );

  it('rejects an e-mail looking value', () => {
    expect(() => auditAdminAction({ ...base, sessionUserId: 'eve@example.com' })).toThrow(
      /e-mail/
    );
    expect(() =>
      auditSubmission({
        userId: 'eve@example.com',
        feedbackId: 'f',
        sessionId: 's',
        sessionUserId: 'u',
        messageCount: 0,
        chunkCount: 1,
        snapshotBytes: 2,
        snapshotSource: 'server',
      })
    ).toThrow(/e-mail/);
  });
});
