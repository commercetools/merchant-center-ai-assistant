/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useState, useMemo } from 'react';
import { Alert, Button, Card, Flex, Stack, Text } from '@commercetools/nimbus';
import { BarChart, ExpandLess, ExpandMore } from '@commercetools/nimbus-icons';
import { ChartRenderer } from './chart-renderer';
import { VisualizationResult, VisualizationData } from './types';

interface VisualizationPartProps {
  output: unknown;
}

// Type guard for visualization data
const isVisualizationData = (output: unknown): output is VisualizationData => {
  if (!output || typeof output !== 'object') return false;
  const obj = output as Record<string, unknown>;
  return (
    obj.success === true &&
    typeof obj.chartType === 'string' &&
    obj.data !== undefined &&
    typeof obj.data === 'object'
  );
};

// Type guard for visualization error
const isVisualizationError = (
  output: unknown
): output is { success: false; error: string; hint: string } => {
  if (!output || typeof output !== 'object') return false;
  const obj = output as Record<string, unknown>;
  return obj.success === false && typeof obj.error === 'string';
};

/**
 * A chart produced by the visualize-data tool, behind a collapsible header.
 *
 * FIXED HERE - the header used to be a clickable `<div>` (`VisualizationHeader onClick`)
 * containing `ExpandButton`, a real `<button>` with no handler on it at all. Keyboard and
 * screen-reader users could reach the chevron but activating it did nothing, and the only
 * thing that did work was a mouse click on a `div` that announced itself as nothing. The
 * header is now the button, with the chevron as a plain icon inside it, so there is exactly
 * one control and exactly one activation path. Turning the chevron itself into an
 * `IconButton` would have been the other option and the wrong one: it would sit inside the
 * header button and fire the toggle twice per click.
 *
 * `aria-expanded` reflects the state the click changes, which the hand-rolled version never
 * exposed. The chart is unmounted rather than hidden with `display: none` (what
 * `ChartContent` did): Google Charts measures its container to size itself, so a chart that
 * first lays out while hidden comes back at zero width.
 *
 * Starts expanded, as before - the chart is the answer, not an aside.
 */
export const VisualizationPart: React.FC<VisualizationPartProps> = ({
  output,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // Parse and validate the visualization data
  const visualizationResult = useMemo((): VisualizationResult | null => {
    if (isVisualizationData(output)) {
      return output;
    }
    if (isVisualizationError(output)) {
      return output;
    }
    return null;
  }, [output]);

  if (!visualizationResult) {
    return null;
  }

  // Handle error state
  //
  // `ErrorBlock`/`ErrorTitle`/`ErrorMessage`/`ErrorHint` are an `Alert`, which brings
  // `role="alert"` and the critical icon with it. The ⚠️ and 💡 emoji are dropped: the icon
  // is now the alert's own, and a screen reader used to read "warning sign" and
  // "light bulb" out loud in the middle of the sentence.
  if (!visualizationResult.success) {
    return (
      <Alert.Root colorPalette="critical">
        <Alert.Title>Visualization Error</Alert.Title>
        <Alert.Description>
          {visualizationResult.error}
          {visualizationResult.hint && (
            <Text fontSize="300" fontStyle="italic" color="neutral.11">
              {visualizationResult.hint}
            </Text>
          )}
        </Alert.Description>
      </Alert.Root>
    );
  }

  // Success state - render the chart
  const { chartType, data, options } = visualizationResult;
  const title = options.title || `${chartType} Visualization`;

  return (
    <Card.Root
      variant="outlined-muted"
      colorPalette="info"
      size="sm"
      my="400"
      overflow="hidden"
    >
      <Card.Header p="0">
        <Button
          variant="ghost"
          colorPalette="info"
          width="100%"
          height="auto"
          justifyContent="space-between"
          borderRadius="0"
          px="400"
          py="300"
          onPress={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
        >
          <Flex align="center" gap="300" minW="0">
            <BarChart />
            <Stack direction="column" gap="50" alignItems="flex-start" minW="0">
              <Text fontSize="350" fontWeight="500" color="neutral.12" truncate>
                {title}
              </Text>
              <Text fontSize="300" fontFamily="mono" color="neutral.11">
                {chartType}
              </Text>
            </Stack>
          </Flex>
          {isExpanded ? <ExpandLess /> : <ExpandMore />}
        </Button>
      </Card.Header>

      {isExpanded && (
        <Card.Body>
          <ChartRenderer chartType={chartType} data={data} options={options} />
        </Card.Body>
      )}
    </Card.Root>
  );
};

export default VisualizationPart;
