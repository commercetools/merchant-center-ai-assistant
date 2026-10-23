/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import request from 'supertest';
import { runWithContext } from '../../src/context/request-context';
import { MAX_SYSTEM_PROMPT_CHARS } from '../../src/services/settings.service';
import { asUser, makeGApp, resetGApp } from '../helpers/g-app';
import { captureLogs } from '../helpers/log-capture';

const ADMIN = asUser('admin-1', true);
const MEMBER = asUser('member-1', false);

afterEach(resetGApp);

describe('system prompt', () => {
  it('is empty when unset and visible to a member', async () => {
    const { app } = makeGApp();
    const res = await request(app).get('/service/system-prompt').set(MEMBER);
    expect(res.body).toEqual({ success: true, data: { systemPrompt: '' } });
  });

  it('an admin sets it and a member reads it back', async () => {
    const { app } = makeGApp();
    const put = await request(app).put('/service/system-prompt').set(ADMIN).send({ systemPrompt: 'Be brief.' });
    expect(put.status).toBe(200);
    expect(put.body.data).toMatchObject({ systemPrompt: 'Be brief.' });
    const get = await request(app).get('/service/system-prompt').set(MEMBER);
    expect(get.body.data.systemPrompt).toBe('Be brief.');
  });

  it('a non-admin gets 403 ADMIN_REQUIRED and nothing is stored', async () => {
    const { app, persistence } = makeGApp();
    const res = await request(app).put('/service/system-prompt').set(MEMBER).send({ systemPrompt: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ADMIN_REQUIRED');
    expect(res.body.success).toBe(false);
    expect((await persistence.settings.get()).systemPrompt).toBe('');
  });

  it('rejects a non-string and an over-long prompt', async () => {
    const { app } = makeGApp();
    const bad = await request(app).put('/service/system-prompt').set(ADMIN).send({ systemPrompt: 5 });
    expect(bad.status).toBe(400);
    const long = await request(app)
      .put('/service/system-prompt')
      .set(ADMIN)
      .send({ systemPrompt: 'x'.repeat(MAX_SYSTEM_PROMPT_CHARS + 1) });
    expect(long.status).toBe(400);
    const edge = await request(app)
      .put('/service/system-prompt')
      .set(ADMIN)
      .send({ systemPrompt: 'x'.repeat(MAX_SYSTEM_PROMPT_CHARS) });
    expect(edge.status).toBe(200);
  });

  it('writes an audit line without an e-mail address', async () => {
    const { app } = makeGApp();
    const capture = captureLogs();
    try {
      await request(app).put('/service/system-prompt').set(ADMIN).send({ systemPrompt: 'x' });
    } finally {
      capture.stop();
    }
    const audit = capture.lines.find((l) => l.includes('audit.admin_action'));
    expect(audit).toContain('PUT /system-prompt');
    expect(audit).toContain('"outcome":"ok"');
  });
});

describe('tool-call-logs', () => {
  it('defaults to all without writing', async () => {
    const { app, mem } = makeGApp();
    const before = (await mem.query('ai-assistant-settings', { filters: [], limit: 10 })).results.length;
    const res = await request(app).get('/service/tool-call-logs').set(MEMBER);
    expect(res.body.data).toEqual({ mode: 'all' });
    const after = (await mem.query('ai-assistant-settings', { filters: [], limit: 10 })).results.length;
    expect(after).toBe(before);
    expect(after).toBe(0);
  });

  it('an admin sets a valid mode, an invalid mode is 400 listing the four', async () => {
    const { app } = makeGApp();
    const ok = await request(app).put('/service/tool-call-logs').set(ADMIN).send({ mode: 'none' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.mode).toBe('none');
    expect((await request(app).get('/service/tool-call-logs').set(MEMBER)).body.data.mode).toBe('none');
    const bad = await request(app).put('/service/tool-call-logs').set(ADMIN).send({ mode: 'verbose' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain('none, thinking, tools, all');
  });

  it('a non-admin mode write is 403 and the stored mode is unchanged', async () => {
    const { app, persistence } = makeGApp();
    await request(app).put('/service/tool-call-logs').set(ADMIN).send({ mode: 'tools' });
    const res = await request(app).put('/service/tool-call-logs').set(MEMBER).send({ mode: 'none' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ADMIN_REQUIRED');
    expect((await persistence.settings.get()).toolCallLogs).toBe('tools');
  });
});

describe('settings object', () => {
  it('writing the prompt preserves identityMcp and the log mode', async () => {
    const { app, persistence } = makeGApp();
    await persistence.settings.update((cur) => ({
      ...cur,
      toolCallLogs: 'thinking',
      identityMcp: {
        serverKey: 'k',
        url: 'https://example.test/mcp',
        majorVersion: '1',
        authenticationMode: 'CommercetoolsIdentity',
        connectedAt: 5,
      },
    }));
    await request(app).put('/service/system-prompt').set(ADMIN).send({ systemPrompt: 'Hi' });
    const settings = await persistence.settings.get();
    expect(settings.systemPrompt).toBe('Hi');
    expect(settings.toolCallLogs).toBe('thinking');
    expect(settings.identityMcp?.serverKey).toBe('k');
    expect(settings.schemaVersion).toBe(1);
  });

  it('two reads in one request context hit the store once', async () => {
    const { services, persistence } = makeGApp();
    let reads = 0;
    const original = persistence.settings.get.bind(persistence.settings);
    persistence.settings.get = async () => {
      reads += 1;
      return original();
    };
    await runWithContext({ requestId: 'r', correlationId: 'c' }, async () => {
      await services.settings.getSystemPrompt();
      await services.settings.getToolCallLogs();
      await services.settings.get();
    });
    expect(reads).toBe(1);
  });

  it('a write inside a request context refreshes the memo', async () => {
    const { services } = makeGApp();
    await runWithContext({ requestId: 'r', correlationId: 'c' }, async () => {
      expect(await services.settings.getSystemPrompt()).toBe('');
      await services.settings.setSystemPrompt('new');
      expect(await services.settings.getSystemPrompt()).toBe('new');
    });
  });
});
