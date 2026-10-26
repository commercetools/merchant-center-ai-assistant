/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import bodyParser from 'body-parser';
import express, { type Express } from 'express';
import { startBudget } from '../../src/chat/budget.middleware';
import {
  createSendAiChatMessage,
  type ChatControllerDeps,
} from '../../src/chat/chat.controller';
import { setChatModelForTests } from '../../src/chat/orchestrator';
import {
  cancelChatStream,
  replayChatStream,
} from '../../src/chat/stream-resume.controller';
import { initRequestContext } from '../../src/middleware/context.middleware';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { loadSession } from '../../src/middleware/load-session.middleware';
import {
  createServices,
  setServicesForTests,
  type Services,
} from '../../src/services/registry';
import type { ToolSourceRegistry } from '../../src/tool-sources/registry';
import { fakeAuth } from './g-app';
import type { Chunk } from './mock-model';
import { scriptedModel } from './mock-model';
import { makePersistence } from './persistence';

export interface ChatApp {
  app: Express;
  services: Services;
  model: ReturnType<typeof scriptedModel>;
  digests: Array<Parameters<ChatControllerDeps['runTurnDigest']>[0]>;
}

/**
 * The real chat route chain (budget, auth stand-in, loadSession, controller) over in-memory
 * persistence and a scripted model.
 */
export const makeChatApp = (o: {
  registry: ToolSourceRegistry;
  turns: Array<Chunk[] | (() => Chunk[] | ReadableStream<Chunk>)>;
  runTurnDigest?: ChatControllerDeps['runTurnDigest'];
  runTurnDigestBeforeClose?: ChatControllerDeps['runTurnDigestBeforeClose'];
}): ChatApp => {
  const { p } = makePersistence();
  const services = createServices(p);
  setServicesForTests(services);

  const model = scriptedModel(o.turns);
  setChatModelForTests(() => ({ model: model.model }));

  const digests: ChatApp['digests'] = [];
  const runTurnDigest: ChatControllerDeps['runTurnDigest'] =
    o.runTurnDigest ?? ((params) => void digests.push(params));

  const app = express();
  app.use(initRequestContext);
  app.use(bodyParser.json());
  app.post(
    '/service/ai-chat/:sessionId/message/stream',
    startBudget,
    fakeAuth,
    loadSession,
    createSendAiChatMessage(o.registry, {
      runTurnDigest,
      runTurnDigestBeforeClose: o.runTurnDigestBeforeClose,
    })
  );
  app.get(
    '/service/ai-chat/:sessionId/message/stream',
    fakeAuth,
    loadSession,
    replayChatStream
  );
  app.delete(
    '/service/ai-chat/:sessionId/message/stream',
    fakeAuth,
    loadSession,
    cancelChatStream
  );
  app.use(errorMiddleware);
  return { app, services, model, digests };
};
