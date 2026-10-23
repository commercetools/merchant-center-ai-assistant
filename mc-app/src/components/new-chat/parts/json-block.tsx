/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Code } from '@commercetools/nimbus';

interface JsonBlockProps {
  data: unknown;
}

/**
 * A serialized payload (a tool's input, a tool's output, or a `data-*` part) shown verbatim.
 *
 * Replaces the `ToolContent` styled `div` and its nested `pre {}` rule. Nimbus `Code` is the
 * monospace surface; `as="pre"` keeps the whitespace of the serialized JSON, so the descendant
 * selector is no longer needed. `white-space: pre-wrap` + `word-break` are kept from the old
 * rule because tool payloads contain long unbroken strings (ids, URLs) that would otherwise
 * force the whole transcript to scroll sideways.
 *
 * The serialization lives here rather than at each call site so tool-part.tsx and index.tsx's
 * `data-*` branch cannot drift apart - both previously carried their own copy of `formatJson`.
 */
export const JsonBlock: React.FC<JsonBlockProps> = ({ data }) => {
  let text: string;
  try {
    text = JSON.stringify(data, null, 2);
  } catch {
    // Circular structures and BigInt both throw here; showing the coerced value beats
    // rendering nothing.
    text = String(data);
  }

  return (
    <Code
      as="pre"
      variant="subtle"
      colorPalette="neutral"
      display="block"
      width="100%"
      p="200"
      fontSize="300"
      overflowX="auto"
      whiteSpace="pre-wrap"
      wordBreak="break-word"
    >
      {text}
    </Code>
  );
};
