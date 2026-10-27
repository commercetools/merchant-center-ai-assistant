/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { EXPORT_DATA_TOOL } from '../tools/export.tool';
import { VISUALIZE_DATA_TOOL } from '../tools/visualize.tool';

export { ANNOTATIONS_PART_TYPE } from './annotation-part';

/** Stored messages handed to the model per turn. */
export const CHAT_HISTORY_MESSAGES = 20;

/**
 * Window of the aggregation analyzer. A DIFFERENT window from the chat history above: do not
 * confuse the two.
 */
export const ANALYZER_HISTORY_MESSAGES = 10;

/** Model steps (a model call plus its tool executions) one turn may take. */
export const CHAT_MAX_STEPS = 50;

/**
 * Name of the composed-page tool. Hard-coded here so the storage filter keeps its terminal
 * output; the tool MUST keep this name.
 */
export const CREATE_COMPOSED_PAGE_TOOL = 'create_composed_page';

/** Tools whose terminal output is persisted with the message. */
export const STORABLE_TOOLS: readonly string[] = [
  VISUALIZE_DATA_TOOL,
  EXPORT_DATA_TOOL,
  CREATE_COMPOSED_PAGE_TOOL,
];

/**
 * Subagent tools: their output is a UIMessage with nested parts that need special storage
 * handling. Only `imageGeneration` is one today.
 */
export const SUBAGENT_TOOL_NAMES: readonly string[] = ['imageGeneration'];

/** Persisted marker the stream appends when the time budget ended the reply. */
export const TURN_STATUS_PART_TYPE = 'data-turn-status';

/** Transient heartbeat; never stored. */
export const KEEPALIVE_PART_TYPE = 'data-keepalive';

/** Text appended after a reply cut by the hard deadline. */
export const TIME_LIMIT_NOTICE =
  '_The time limit for a single reply was reached, so this answer may be incomplete. Ask me to continue._';

/**
 * How many of the newest generated images (outputs of the image tool) are sent back to the
 * model with the history, so they can be edited. Older ones are text only (cost bound).
 */
export const HISTORY_IMAGES_FOR_MODEL = 2;
