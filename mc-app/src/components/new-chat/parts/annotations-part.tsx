/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { Accordion, Stack, Text } from '@commercetools/nimbus';
import type { AnnotationsData } from '../../preview-annotations/annotation-payload';
import { JsonBlock } from './json-block';

interface AnnotationsPartRendererProps {
  data: AnnotationsData;
}

/**
 * Annotations the user left on the preview, shown in their own message.
 *
 * The notes are the point, so they read as a plain list - this is the author's own voice and
 * belongs in the bubble. Everything else in the payload (CSS paths, nearby text, class
 * names, the current source of each annotated component) is there for the model, so it goes
 * behind a disclosure: collapsed, but present, because the transcript should still be able
 * to show exactly what was sent.
 *
 * That disclosure is `JsonBlock` - the same component tool payloads and other `data-` parts
 * use - rather than anything that reformats the payload. The point of carrying a typed part
 * is that nobody has to reformat it: this reads Agentation's own fields, and what is shown
 * is literally what was sent.
 */
export const AnnotationsPartRenderer: React.FC<
  AnnotationsPartRendererProps
> = ({ data }) => (
  <Stack direction="column" gap="200" width="100%">
    <Stack direction="column" gap="100">
      {data.annotations.map((annotation, index) => (
        <Text key={annotation.id ?? index}>
          {annotation.element} - {annotation.comment || '(no comment)'}
        </Text>
      ))}
    </Stack>

    <Accordion.Root size="sm">
      <Accordion.Item value="annotation-detail">
        <Accordion.Header>Details sent to the assistant</Accordion.Header>
        <Accordion.Content>
          <JsonBlock data={data} />
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  </Stack>
);
