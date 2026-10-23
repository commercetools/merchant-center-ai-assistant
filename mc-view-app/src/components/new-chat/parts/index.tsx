/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Derived from mc-app/src/components/new-chat/parts/index.tsx without annotations and
// generated-UI (composed page) parts.

import React from 'react';
import {
  isTextUIPart,
  isFileUIPart,
  isReasoningUIPart,
  isToolUIPart,
} from 'ai';
import { PartRendererProps, extractToolPartProps } from '../types';
import { TextPartRenderer } from './text-part';
import { ReasoningPartRenderer } from './reasoning-part';
import { FilePartRenderer } from './file-part';
import {
  SourceUrlPartRenderer,
  SourceDocumentPartRenderer,
} from './source-part';
import {
  VISUALIZE_DATA_TOOL,
  EXPORT_DATA_TOOL,
  SUBAGENT_TOOLS,
} from '../tools';
import { VisualizationPart } from './visualization/visualization-part';
import { ExportPart } from './export-part';
import { SubagentPartRenderer } from './subagent-part';
import { JsonBlock } from './json-block';
import { useToolCallLogsConfigContext } from '../../../contexts/tool-call-logs-config';

export const PartRenderer: React.FC<PartRendererProps> = ({
  part,
  isUser,
  isStreaming,
}) => {
  const { showReasoning } = useToolCallLogsConfigContext();

  // Text part
  if (isTextUIPart(part)) {
    return (
      <TextPartRenderer
        text={part.text}
        isUser={isUser}
        state={isStreaming ? 'streaming' : part.state}
      />
    );
  }

  // Reasoning part - conditionally render based on config
  if (isReasoningUIPart(part)) {
    if (!showReasoning) {
      return null;
    }
    return <ReasoningPartRenderer text={part.text} state={part.state} />;
  }

  // Tool invocation part - conditionally render based on config
  if (isToolUIPart(part)) {
    const toolPart = extractToolPartProps(part);
    if (toolPart) {
      // Subagent tools - render their output parts inline
      if (toolPart.toolName && SUBAGENT_TOOLS.includes(toolPart.toolName)) {
        return <SubagentPartRenderer part={toolPart} />;
      }
      // Always show visualization output, regardless of config
      if (
        toolPart.toolName === VISUALIZE_DATA_TOOL &&
        toolPart.state === 'output-available' &&
        toolPart.output
      ) {
        return <VisualizationPart output={toolPart.output} />;
      }
      // Always show export output, regardless of config
      if (
        toolPart.toolName === EXPORT_DATA_TOOL &&
        toolPart.state === 'output-available' &&
        toolPart.output
      ) {
        return <ExportPart output={toolPart.output} />;
      }
      // Every other tool call is accounted for by the one disclosure pill above the
      // message (parts/tool-steps). Rendering it here as well would put the same call on
      // screen twice - and a stack of per-tool cards between the question and the answer
      // is exactly what the pill exists to remove.
      return null;
    }
  }

  // File part - only render if URL is a web URL (not base64 data URL)
  if (isFileUIPart(part)) {
    // Skip base64 data URLs - only render web URLs
    if (part.url.startsWith('data:')) {
      return null;
    }
    return (
      <FilePartRenderer
        mediaType={part.mediaType}
        url={part.url as string}
        filename={part.filename}
      />
    );
  }

  // Source URL part
  if ('type' in part && part.type === 'source-url') {
    const sourcePart = part as { url: string; title?: string };
    return (
      <SourceUrlPartRenderer url={sourcePart.url} title={sourcePart.title} />
    );
  }

  // Source document part
  if ('type' in part && part.type === 'source-document') {
    const docPart = part as {
      title: string;
      mediaType: string;
      filename?: string;
    };
    return (
      <SourceDocumentPartRenderer
        title={docPart.title}
        mediaType={docPart.mediaType}
        filename={docPart.filename}
      />
    );
  }

  // Step start part - render as a subtle divider
  if ('type' in part && part.type === 'step-start') {
    return null; // Or return a subtle step indicator if needed
  }

  // Data part - render based on type
  if (
    'type' in part &&
    typeof part.type === 'string' &&
    part.type.startsWith('data-')
  ) {
    const dataPart = part as { type: string; data: unknown };
    // `ToolContent` + a bare `<pre>` and a local `formatData` copy; `JsonBlock` is both,
    // shared with tool-part.tsx.
    return <JsonBlock data={dataPart.data} />;
  }

  return null;
};
