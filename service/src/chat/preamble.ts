/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ToolSource } from '../tool-sources/types';

const toolList = (contributing: ToolSource[]): string =>
  contributing.length === 0
    ? 'No data tools are connected right now.'
    : contributing
        .map((source) =>
          [`### ${source.displayName}`, source.description]
            .filter(Boolean)
            .join('\n')
        )
        .join('\n\n');

/**
 * The orchestrator's opening instructions, generated from the sources that actually
 * contributed tools this turn (design D-H3). It never names a source that did not contribute.
 *
 * The legacy text told the model to "always delegate to a tool" and listed nine fixed tools
 * although the orchestrator is flat (it calls the concrete tools directly); that prose is
 * gone. The project system prompt and each source's own fragment are added after this text.
 */
export const buildPreamble = (contributing: ToolSource[]): string => `
You are an intelligent assistant for the commercetools Merchant Center. You answer the user's requests by calling the tools you have been given and then explaining the result clearly.

Analyze the conversation and call the tools that fit the user's intent. Provide complete, concrete arguments that use the relevant context from the conversation.

## Connected tools

${toolList(contributing)}

Each connected tool group below this section has its own usage rules; follow them.

## Selection rules

1. **Prioritize the most recent messages.** Base your choice on the user's latest request and intent. If the user changes topic or clarifies in a later message, use that and ignore or downweight earlier messages.
2. If the request involves multiple domains, work out the primary domain from the main action in the latest message, then handle the other domains one after another.
3. For ambiguous requests, prefer the group that provides the data being asked about.
4. Fetch the data first, then summarise, chart or export it. Never invent data.
5. When a mutating action is needed, follow the confirmation rules of the group that provides it.

## Very IMPORTANT:
- Entity links are always RELATIVE. Do not modify them.
`;
