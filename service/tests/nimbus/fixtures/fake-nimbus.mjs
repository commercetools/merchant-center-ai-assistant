/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// A controllable stand-in for @commercetools/nimbus-mcp (stdio MCP server with the 7 tools).
// It must not import service code.
//
// search_docs { query }:  'hang'  never answers
//                         'die'   exits the process with code 1
//                         'noise' writes a line to stderr, then answers
//                         'env'   answers with the names of its environment variables
// FAKE_NIMBUS_MISSING=<tool>   removes that tool
// FAKE_NIMBUS_EXTRA=<tool>     adds a tool
// FAKE_NIMBUS_PID_FILE=<path>  appends the pid of every started process
import { appendFileSync } from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

if (process.env.FAKE_NIMBUS_PID_FILE) {
  appendFileSync(process.env.FAKE_NIMBUS_PID_FILE, `${process.pid}\n`);
}

const NAMES = [
  'list_components',
  'get_component',
  'get_docs_page',
  'search_docs',
  'get_tokens',
  'search_icons',
  'migrate_from_uikit',
];
const names = NAMES.filter((n) => n !== process.env.FAKE_NIMBUS_MISSING);
if (process.env.FAKE_NIMBUS_EXTRA) names.push(process.env.FAKE_NIMBUS_EXTRA);

const server = new Server(
  { name: 'fake-nimbus', version: '0.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: names.map((name) => ({
    name,
    description: `fake ${name}`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        name: { type: 'string' },
        section: { type: 'string' },
      },
    },
  })),
}));

const text = (value) => ({ content: [{ type: 'text', text: value }] });

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  if (name === 'search_docs') {
    if (args.query === 'hang') return new Promise(() => undefined);
    if (args.query === 'die') process.exit(1);
    if (args.query === 'noise') {
      process.stderr.write('deprecation notice\n');
      return text('noisy');
    }
    if (args.query === 'env') return text(Object.keys(process.env).join(','));
  }
  if (name === 'get_component' && args.name === 'Unknown') {
    throw new Error('Component not found: Unknown');
  }
  return text(`${name}:${JSON.stringify(args)}`);
});

process.stdin.on('end', () => process.exit(0));
await server.connect(new StdioServerTransport());
