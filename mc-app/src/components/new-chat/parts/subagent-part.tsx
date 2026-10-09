/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { ToolInvocationPart } from '../types';
import { TextPartRenderer } from './text-part';
import { FilePartRenderer } from './file-part';
import {
  SourceUrlPartRenderer,
  SourceDocumentPartRenderer,
} from './source-part';
import { ReasoningPartRenderer } from './reasoning-part';
import { VisualizationPart } from './visualization/visualization-part';
import { ExportPart } from './export-part';
import { ComposedUiPartHandler, isComposedUiOutput } from './gen-ui-part';
import { VISUALIZE_DATA_TOOL, EXPORT_DATA_TOOL } from '../tools';
import { useToolCallLogsConfigContext } from '../../../contexts/tool-call-logs-config';
import { ChatMessage } from '@commercetools/nimbus';

interface SubagentPartRendererProps {
  part: ToolInvocationPart;
}

/**
 * A part of the subagent's nested message, as far as this renderer reads it. The service
 * sends a full `UIMessage`; only the fields below are used, each checked by `type` first.
 */
type NestedPart = {
  type: string;
  text: string;
  state?:
    | 'streaming'
    | 'done'
    | 'input-streaming'
    | 'input-available'
    | 'output-available'
    | 'output-error';
  toolName?: string;
  output?: unknown;
  url: string;
  mediaType: string;
  filename?: string;
  title: string;
};

/**
 * Renders the output of a subagent tool.
 *
 * Subagent tools produce a UIMessage as their output (via readUIMessageStream).
 * This component extracts the nested parts from the output and renders them inline,
 * handling both streaming (preliminary) and complete states.
 *
 * The nested parts are handed to the same renderers the top-level dispatch in index.tsx
 * uses, so the Nimbus conversion of those files applies here unchanged; this file only
 * decides which of them to call.
 *
 * The old `StreamingCursor` - a 2px `<span>` with a blink keyframe standing in for "still
 * working" - is now `ChatMessage.Typing`, the same affordance typing-indicator/index.tsx
 * uses for the agent's own turn. That retires the last keyframe in this directory, and the
 * dots are `aria-hidden` where the caret was an unannounced flicker. It is always rendered
 * inside the `ChatMessage.Body` that message.tsx puts around every part, which is where it
 * needs to be for its slot styles to resolve.
 */
export const SubagentPartRenderer: React.FC<SubagentPartRendererProps> = ({
  part,
}) => {
  const { showReasoning } = useToolCallLogsConfigContext();

  const isStreaming =
    part.state === 'output-available' && part.preliminary === true;
  const hasOutput = part.state === 'output-available' && part.output;

  // While input is still streaming or the tool hasn't started yet, show nothing
  if (part.state === 'input-streaming') {
    return null;
  }

  // If the tool is running but hasn't produced output yet, show a typing indicator
  if (part.state === 'input-available') {
    return <ChatMessage.Typing />;
  }

  // If there's an error, show it
  if (part.state === 'output-error') {
    return null;
  }

  // Render the subagent's output parts
  if (hasOutput) {
    const output = part.output as { parts?: unknown } | undefined;
    const parts = output?.parts;

    if (!Array.isArray(parts)) {
      // Fallback: if output doesn't have parts, render nothing
      // (the message's tool-steps pill accounts for the call either way)
      return null;
    }

    return (
      <>
        {(parts as NestedPart[]).map((nestedPart, index) => {
          // Text parts
          if (nestedPart.type === 'text') {
            return (
              <TextPartRenderer
                key={index}
                text={nestedPart.text}
                isUser={false}
                state={isStreaming ? 'streaming' : 'done'}
              />
            );
          }

          // Reasoning parts
          if (nestedPart.type === 'reasoning') {
            if (!showReasoning) return null;
            return (
              <ReasoningPartRenderer
                key={index}
                text={nestedPart.text}
                state={nestedPart.state as 'streaming' | 'done' | undefined}
              />
            );
          }

          // Tool parts from the subagent (its domain tool calls)
          if (
            typeof nestedPart.type === 'string' &&
            nestedPart.type.startsWith('tool-') &&
            'state' in nestedPart
          ) {
            const toolName =
              nestedPart.toolName || nestedPart.type.replace('tool-', '');

            // Always show ComposedUI output
            if (
              nestedPart.state === 'output-available' &&
              nestedPart.output &&
              isComposedUiOutput(nestedPart.output)
            ) {
              return (
                <ComposedUiPartHandler key={index} output={nestedPart.output} />
              );
            }

            // Always show visualization output
            if (
              toolName === VISUALIZE_DATA_TOOL &&
              nestedPart.state === 'output-available' &&
              nestedPart.output
            ) {
              return (
                <VisualizationPart key={index} output={nestedPart.output} />
              );
            }

            // Always show export output
            if (
              toolName === EXPORT_DATA_TOOL &&
              nestedPart.state === 'output-available' &&
              nestedPart.output
            ) {
              return <ExportPart key={index} output={nestedPart.output} />;
            }

            // Everything else the subagent called is flattened into the message's one
            // disclosure pill (parts/tool-steps), which walks into these nested parts.
            // Rendering it here too would show the same call twice, once inside a box
            // inside another box.
            return null;
          }

          // File parts
          if (nestedPart.type === 'file') {
            if (nestedPart.url?.startsWith('data:')) return null;
            return (
              <FilePartRenderer
                key={index}
                mediaType={nestedPart.mediaType}
                url={nestedPart.url}
                filename={nestedPart.filename}
              />
            );
          }

          // Source parts
          if (nestedPart.type === 'source-url') {
            return (
              <SourceUrlPartRenderer
                key={index}
                url={nestedPart.url}
                title={nestedPart.title}
              />
            );
          }
          if (nestedPart.type === 'source-document') {
            return (
              <SourceDocumentPartRenderer
                key={index}
                title={nestedPart.title}
                mediaType={nestedPart.mediaType}
                filename={nestedPart.filename}
              />
            );
          }

          return null;
        })}
        {isStreaming && <ChatMessage.Typing />}
      </>
    );
  }

  return null;
};
