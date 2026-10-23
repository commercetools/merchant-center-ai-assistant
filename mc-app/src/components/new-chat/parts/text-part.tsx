/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Markdown } from '@commercetools/nimbus';

interface TextPartRendererProps {
  text: string;
  isUser: boolean;
  state?: 'streaming' | 'done';
}

/**
 * Assistant text, rendered as markdown.
 *
 * Nimbus `Markdown` replaces a bare `react-markdown` plus ~75 lines of descendant CSS that
 * used to live in `MessageContent`. `isStreaming` is the reason to prefer it: it completes
 * unterminated inline constructs (a half-written `**bold` or an unclosed fence) via `remend`
 * so partial tokens do not flash as literal asterisks, memoizes finished blocks so only the
 * last one re-parses per token, and manages `aria-busy` on the container.
 *
 * The `state` prop was declared here from the start and never read - this is the first thing
 * that uses it.
 *
 * The previous `code`/`pre` overrides are gone deliberately: Nimbus renders both natively, and
 * keeping a hand-styled dark block would reintroduce exactly the custom CSS this removes.
 *
 * User text is intentionally NOT markdown - rendering what someone typed as markdown would let
 * their own asterisks and underscores silently restyle their message.
 *
 * `maxWidth: 100%` bounds the markdown by the *content* box of `ChatMessage.Body` - i.e. the
 * space actually available inside the bubble, its `px="600"` padding already subtracted.
 * Nimbus's `Markdown` root carries no width of its own, so as a shrink-to-fit item in the
 * body's flex column its intrinsic width is a long line's max-content. That was harmless
 * while the body was capped at 632px and doing the clamping; now that message.tsx lets the
 * bubble grow to the chat column, the markdown has to carry its own ceiling or a wide block
 * would set the bubble's width and spill past the padding.
 */
export const TextPartRenderer: React.FC<TextPartRendererProps> = ({
  text,
  isUser,
  state,
}) => {
  if (isUser) {
    return <>{text}</>;
  }

  return (
    <Markdown maxWidth="100%" isStreaming={state === 'streaming'}>
      {text}
    </Markdown>
  );
};
