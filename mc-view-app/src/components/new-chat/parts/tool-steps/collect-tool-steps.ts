/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { isToolUIPart } from 'ai';
import type { MessagePart } from '../../types';
import { extractToolPartProps } from '../../types';
import { CUSTOM_RENDERED_TOOLS, SUBAGENT_TOOLS } from '../../tools';
import { labelForTool, summarizeToolCall } from './humanize-tool';

export type ToolStep = {
  id: string;
  toolName: string;
  label: string;
  call: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  isSubagent: boolean;
};

const toStep = (part: MessagePart, isSubagent: boolean): ToolStep | null => {
  const tool = extractToolPartProps(part);
  if (!tool?.toolName) return null;

  return {
    id: tool.toolCallId || `${tool.toolName}-${tool.state}`,
    toolName: tool.toolName,
    label: labelForTool(tool.toolName, isSubagent),
    call: summarizeToolCall(tool.toolName, tool.input),
    state: tool.state,
    input: tool.input,
    output: tool.output,
    errorText: tool.errorText,
    isSubagent,
  };
};

/**
 * Every tool call an assistant message made, flattened into one ordered list.
 *
 * The orchestrator delegates to subagents, and each subagent's output is itself a message
 * whose parts include the tools IT called. Rendered as the tree it really is, a single
 * reply becomes a stack of nested boxes several levels deep with the actual answer
 * somewhere at the bottom. Flattening gives one pill and one list of steps - which is how
 * a person describes what happened anyway: "it looked up the products, then read the
 * orders, then compared them".
 *
 * Tools with their own rendering - a chart, an export, a composed page - are NOT steps.
 * They produce visible output in the transcript, so listing them again as plumbing would
 * be describing something the user can already see.
 */
export const collectToolSteps = (parts: MessagePart[] = []): ToolStep[] => {
  const steps: ToolStep[] = [];

  for (const part of parts) {
    if (!isToolUIPart(part)) continue;

    const tool = extractToolPartProps(part);
    if (!tool?.toolName) continue;

    if (CUSTOM_RENDERED_TOOLS.includes(tool.toolName)) continue;

    const isSubagent = SUBAGENT_TOOLS.includes(tool.toolName);

    if (isSubagent) {
      const step = toStep(part, true);
      if (step) steps.push(step);

      // A subagent's output is a UIMessage. Its own tool calls are the interesting detail.
      const nested = (tool.output as { parts?: MessagePart[] })?.parts;
      if (Array.isArray(nested)) {
        steps.push(...collectToolSteps(nested));
      }
      continue;
    }

    const step = toStep(part, false);
    if (step) steps.push(step);
  }

  return steps;
};

/** Steps that finished cleanly, for the "checked N sources" summary. */
export const countCompleted = (steps: ToolStep[]): number =>
  steps.filter((step) => step.state === 'output-available').length;

export const hasFailure = (steps: ToolStep[]): boolean =>
  steps.some(
    (step) => step.state === 'output-error' || Boolean(step.errorText)
  );
