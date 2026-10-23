/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Compose Preview Component
 *
 * Renders composed page content from chat tool outputs in two tabs:
 * - Preview: Live rendering using BabelRenderer
 * - Code: Raw JSON view of the schema
 */

import React from 'react';

// Import shared components

// Import contexts and hooks
import { useComposePreviewContext } from '../../contexts/compose-preview-context';

// Import utilities
import { formatSchemaForDisplay } from '../../utils/schema-helpers';
import { Code, Flex, Heading, Text } from '@commercetools/nimbus';

// Import types

/**
 * Main ComposePreview component with tabs
 */
const CodePreview: React.FC = () => {
  const { previewData } = useComposePreviewContext();

  if (!previewData) {
    return (
      <Flex direction="column" flex="1" minWidth="400px">
        <Flex
          direction="column"
          alignItems="center"
          justifyContent="center"
          height="100%"
          textAlign="center"
          p="1000"
          color="neutral.11"
        >
          <Heading as="h3">No Preview Available</Heading>
          <Text>
            Chat with the AI to generate a UI component.
            <br />
            The preview will appear here.
          </Text>
        </Flex>
      </Flex>
    );
  }

  return (
    <Flex direction="column" flex="1" minWidth="400px">
      {/*
       * Code is inline-flex by default (it is built for inline snippets), so a
       * multi-line JSON dump needs display="block" plus the wrapping rules.
       */}
      <Code
        as="pre"
        variant="subtle"
        colorPalette="neutral"
        display="block"
        maxWidth="900px"
        marginX="auto"
        p="400"
        borderRadius="200"
        overflow="auto"
        whiteSpace="pre-wrap"
        wordBreak="break-word"
        lineHeight="1.5"
      >
        {JSON.stringify(formatSchemaForDisplay(previewData), null, 2)}
      </Code>
    </Flex>
  );
};

export default CodePreview;
