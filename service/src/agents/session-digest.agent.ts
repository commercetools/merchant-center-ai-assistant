/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { generateText, LanguageModel, ModelMessage, Output } from 'ai';
import { z } from 'zod';
import {
  DEFAULT_DIGEST_ICON,
  DIGEST_ICON_NAMES,
  DigestIconName,
} from '../constants/digest-icons';
import { getModel, getProviderOptions } from '../llm';
import type { NextPrompt, SessionDigest } from '../types/chat.types';
import { logger } from '../utils/logger.utils';
import { sanitizeMessages } from '../utils/message.utils';

/** How much of the conversation the digest reads. The tail is what the session is "about". */
export const DIGEST_HISTORY_CUTOFF = 20;

/** Hard caps applied after generation. See `clamp` for why these are not schema bounds. */
export const LIMITS = {
  title: 60,
  description: 140,
  summary: 400,
  promptText: 40,
  promptBody: 200,
} as const;

export const WANTED_PROMPTS = 3;

export const SessionDigestSchema = z.object({
  title: z
    .string()
    .describe(
      'A short name for this conversation, at most 6 words and 60 characters. Name the ' +
        'task, not the first message. No trailing punctuation. Example: "Underperforming ' +
        'products, September".'
    ),
  description: z
    .string()
    .describe(
      'One sentence, at most 140 characters, saying what was asked and what came back. ' +
        'Example: "Three products are tracking below their revenue target for the last 30 days."'
    ),
  icon: z
    .enum(DIGEST_ICON_NAMES)
    .describe('The icon that best fits the subject of the conversation.'),
  summary: z
    .string()
    .describe(
      'Two or three sentences capturing what the user is working on and where the ' +
        'conversation got to. Written for another assistant to read later, not for the ' +
        'user. Mention the entities involved. Do not invent numbers.'
    ),
  nextPrompts: z
    .array(
      z.object({
        text: z
          .string()
          .describe('Chip label, at most 5 words. Example: "Draft a 15% discount".'),
        prompt: z
          .string()
          .describe(
            'The full message sent when the chip is clicked. It must stand alone as the ' +
              "user's next turn, carrying any entity names or dates it needs."
          ),
      })
    )
    .describe(
      `Exactly ${WANTED_PROMPTS} follow-ups the user would plausibly want next. Each must be ` +
        'a concrete action in this conversation, not a generic offer of help. Never repeat ' +
        'something already answered.'
    ),
});

const SYSTEM_PROMPT = (locale: string) => `
You summarise a commercetools Merchant Center assistant conversation so it can be listed,
searched and continued.

Write every field in the language of the locale ${locale}. Keep to the length limits given
per field - they are shown in a narrow list and a chip row, and anything longer is cut off.

Rules:
- Describe the WHOLE conversation, weighted towards the most recent turns. The first message
  is often a vague opener and must not decide the title on its own.
- Use only facts present in the conversation. Never invent product names, figures or dates.
- If the assistant failed or the user only exchanged pleasantries, say so plainly and keep
  the follow-ups generic but still actionable.
- The follow-ups are the user's next message, written in the user's voice ("Draft a 15%
  discount for ..."), never the assistant's ("I can draft ...").
`;

/** Cut on a word boundary when one exists after 60% of the limit; the ellipsis is budgeted. */
export const clamp = (value: unknown, max: number): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

export const normaliseIcon = (icon: unknown): DigestIconName =>
  DIGEST_ICON_NAMES.find((name) => name === icon) ?? DEFAULT_DIGEST_ICON;

const field = (entry: unknown, key: string): unknown =>
  typeof entry === 'object' && entry !== null
    ? (entry as Record<string, unknown>)[key]
    : undefined;

const normalisePrompts = (prompts: unknown): NextPrompt[] => {
  if (!Array.isArray(prompts)) return [];
  return prompts
    .map((entry) => ({
      text: clamp(field(entry, 'text'), LIMITS.promptText),
      prompt: clamp(field(entry, 'prompt'), LIMITS.promptBody),
    }))
    .filter((entry) => entry.text && entry.prompt)
    .slice(0, WANTED_PROMPTS);
};

/**
 * Turns a raw model result into something safe to store. Lengths are clamped rather than
 * enforced as schema bounds on purpose: a schema violation throws away the whole digest
 * because one field ran four characters long.
 */
export const normaliseDigest = (raw: unknown): SessionDigest => ({
  title: clamp(field(raw, 'title'), LIMITS.title),
  description: clamp(field(raw, 'description'), LIMITS.description),
  icon: normaliseIcon(field(raw, 'icon')),
  summary: clamp(field(raw, 'summary'), LIMITS.summary),
  nextPrompts: normalisePrompts(field(raw, 'nextPrompts')),
});

export type GenerateSessionDigestParams = {
  /** Conversation history in any supported shape; sanitised and truncated here. */
  messages: unknown[];
  /** The request's data locale, so the digest matches the user's Merchant Center. */
  locale?: string;
  /** Injection point for tests. Production uses the `lite` tier. */
  model?: LanguageModel;
  /** Abort the model call after this long. */
  timeoutMs?: number;
};

/** Long enough for a slow lite call, short enough not to outlive the user's interest. */
export const DIGEST_TIMEOUT_MS = 20_000;

/**
 * Summarises a finished turn. Returns `null` (never throws) when there is nothing worth
 * summarising or the model call fails: the caller is fire-and-forget and a failed digest
 * just means the session keeps its title until the next turn.
 */
export const generateSessionDigest = async ({
  messages,
  locale = 'en',
  model,
  timeoutMs = DIGEST_TIMEOUT_MS,
}: GenerateSessionDigestParams): Promise<SessionDigest | null> => {
  const history = sanitizeMessages(messages, {
    maxMessages: DIGEST_HISTORY_CUTOFF,
    excludeToolMessages: true,
    filterEmpty: true,
  });
  if (history.length === 0) return null;

  // Sent as ONE user message holding a labelled transcript, not as a chat history. A
  // finished turn ends with the assistant's reply and Gemini rejects requests whose
  // contents end with a model turn; trimming back to a user turn can empty a window that
  // holds one prompt and many assistant steps. A transcript has neither problem.
  const transcript = history.map((m) => `${m.role}: ${m.content}`).join('\n\n');

  try {
    const result = await generateText({
      model: model ?? getModel('lite'),
      output: Output.object({ schema: SessionDigestSchema }),
      system: SYSTEM_PROMPT(locale),
      messages: [{ role: 'user', content: transcript }] as ModelMessage[],
      providerOptions: getProviderOptions('lite'),
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
    const digest = normaliseDigest(result.output);
    return digest.title ? digest : null;
  } catch (error) {
    logger.warn('Session digest generation failed', error);
    return null;
  }
};
