/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

process.env.ENABLE_NEW_JSX_TRANSFORM = 'true';

/**
 * @type {import('@jest/types').Config.ProjectConfig}
 */
module.exports = {
  preset: '@commercetools-frontend/jest-preset-mc-app/typescript',
  // The preset transforms `uuid` and `@faker-js/faker`; the AI SDK ships ES modules only, and
  // `chat-area.spec.tsx` runs the real `useChat`.
  setupFiles: ['<rootDir>/jest.setup-web-streams.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(uuid|@faker-js/faker|\\.pnpm|ai|@ai-sdk|@vercel|@workflow|eventsource-parser|zod|@standard-schema)/)',
  ],
};
