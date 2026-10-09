/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ToolContext } from '../../tool-sources/types';

/**
 * Get the current date formatted for the locale
 */
export const getFormattedDate = (locale: string): string => {
  return new Date().toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/**
 * Base rules that apply to all agents
 */
export const getBaseRules = (locale: string): string => `
<rules>
  - Provide clear and concise answers
  - Be professional and helpful
  - Use markdown formatting for better readability
  - Today is ${getFormattedDate(locale)}
  - The user's locale is ${locale}. Use this to fetch the data in the right language for localized values.
  - Call as many tools as needed to answer the user's request.
</rules>

<error_recovery>
  You are a sub-agent so if a tool call fails or returns an error:
  1. DO NOT give up immediately. return the error to the main agent.
</error_recovery>
`;

/**
 * Confirmation required section for mutating operations
 */
export const getConfirmationSection = (updateTools: string[]): string => {
  if (updateTools.length === 0) return '';

  return `
<confirmation_required>
  - Only proceed with the mutating tool call if the user explicitly confirms with "yes", "confirm", "ok", "sure", or similar affirmative response.
  - If the user declines or says "no", "cancel", "stop", etc., do NOT execute the tool and inform the user that the action was cancelled.
</confirmation_required>`;
};

/**
 * Standard return format section
 */
export const getReturnFormatSection = (): string => `
<return_format>
  The answer to the user's request. Give the answer in natural language and easy to understand.
  ALWAYS use markdown formatting to make your response more readable.
</return_format>

IMPORTANT: When you have finished, write a clear summary of what you did as your final response.
This summary will be returned to the main agent, so include all relevant information.
Do not make up any information, only use the information provided by the tools.`;

/**
 * Temporary tables context section
 */
export const getTemporaryTablesSection = (
  temporaryTableMessages: string[]
): string => {
  if (!temporaryTableMessages || temporaryTableMessages.length === 0) return '';

  return `
<temporary_tables>
  You have access to the following temporary tables in BigQuery. These contain previously fetched data.
  - Don't create complicated queries to fetch Name, Email, etc. that might result in SQL errors
  - Create simple queries to fetch IDs, then use other tools to get full details
  - Do not output the table names or IDs to the user
  
  ${temporaryTableMessages.join('\n\n')}
</temporary_tables>`;
};

/**
 * Build the base context sections that many agents need
 */
export const getContextSections = (context: ToolContext): string => {
  const sections: string[] = [];

  if (context.temporaryTableMessages?.length > 0) {
    sections.push(getTemporaryTablesSection(context.temporaryTableMessages));
  }

  return sections.join('\n');
};

/**
 * Project system prompt section
 */
export const getProjectSystemPromptSection = (
  projectSystemPrompt?: string
): string => {
  if (!projectSystemPrompt || projectSystemPrompt.trim() === '') return '';

  return `
  IMPORTANT: Follow the developer instructions strictly.
<developer_instructions>
  ${projectSystemPrompt}
</developer_instructions>`;
};
