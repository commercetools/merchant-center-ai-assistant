/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, { useMemo } from 'react';
import type { FC, ReactNode } from 'react';
import { Chart, GoogleChartWrapperChartType } from 'react-google-charts';
import { Box, Flex, LoadingSpinner, Text } from '@commercetools/nimbus';
import type { SystemStyleObject } from '@chakra-ui/react';
// `theme` is still imported, but only for the Google Charts *options* below - those are
// JavaScript config handed to a third-party renderer, not CSS, and Google Charts needs
// concrete colour strings it can write into SVG attributes. Nimbus tokens are CSS custom
// properties, which SVG presentation attributes do not resolve, so they cannot be used
// there. Nothing in this file styles the DOM through `theme` any more.
import { theme } from '../../theme';
import type {
  ChartType,
  ChartDataTable,
  ChartOptions,
  ChartRow,
  CellValue,
} from '../../../../types/chart';

/**
 * The one place in this directory that genuinely needs an escape hatch.
 *
 * Google Charts injects its own SVG and tooltip DOM into this container, so the only way to
 * restyle it is descendant selectors against markup we do not own - there is no Nimbus prop
 * for "the `<text>` nodes Google Charts just created". Chakra's `css` prop takes arbitrary
 * nested selectors, which is exactly that hatch, but `Box`'s `css` prop cannot be used
 * directly here: this project has both emotion and styled-components installed, so the prop
 * resolves to an intersection of Chakra's `SystemStyleObject` with emotion's
 * `Interpolation<Theme>` and `tsc` gives up with "union type too complex to represent" on
 * *any* value, including `css={{ color: 'red' }}`. Re-typing `Box` with just the props used
 * here restores the check on the style object itself; the runtime component is untouched.
 *
 * The `!important`s stay: Google Charts writes its colours as inline attributes on the
 * elements it creates, and re-applies them on every redraw.
 */
type TCssBoxProps = { css?: SystemStyleObject; children?: ReactNode };
const CssBox = Box as FC<TCssBoxProps>;

const chartContainerCss: SystemStyleObject = {
  width: '100%',
  minHeight: '300px',
  bg: 'bg',
  borderRadius: '300',
  p: '400',
  overflow: 'hidden',

  // Override Google Charts' own text and tooltip styling
  '& text': {
    fill: 'neutral.11 !important',
  },

  '& .google-visualization-tooltip': {
    background: 'neutral.3 !important',
    border: 'solid-25 !important',
    borderColor: 'neutral.6 !important',
    borderRadius: '150 !important',
    boxShadow: '1 !important',
    color: 'neutral.12 !important',
  },
};

interface ChartRendererProps {
  chartType: ChartType;
  data: ChartDataTable;
  options: ChartOptions;
}

// Convert DataTable format to array format for react-google-charts
const convertDataTableToArray = (
  dataTable: ChartDataTable
): (string | number | boolean | null)[][] => {
  // Header row with column labels
  const headers = dataTable.cols.map((col) => col.label);

  // Data rows
  const rows = dataTable.rows.map((row: ChartRow) =>
    row.c.map((cell) => {
      if (cell === null || cell === undefined) {
        return null;
      }
      // Handle cell object with v, f, p properties
      if (typeof cell === 'object' && 'v' in cell) {
        const cellObj = cell as CellValue;
        return cellObj.v;
      }
      // Direct value
      return cell as string | number | boolean | null;
    })
  );

  return [headers, ...rows];
};

// Apply dark theme defaults to chart options
// Returns a generic object compatible with Google Charts options
const applyDarkThemeDefaults = (
  options: ChartOptions,
  chartType: ChartType
): Record<string, unknown> => {
  const themedOptions: Record<string, unknown> = {
    ...options,
    backgroundColor: options.backgroundColor || 'transparent',
    titleTextStyle: {
      color: theme.colors.textPrimary,
      fontSize: 14,
      bold: true,
    },
    legendTextStyle: {
      color: theme.colors.textSecondary,
    },
    hAxis: {
      ...options.hAxis,
      textStyle: { color: theme.colors.textSecondary },
      titleTextStyle: { color: theme.colors.textSecondary },
      gridlines: {
        color: theme.colors.border,
        ...options.hAxis?.gridlines,
      },
      baselineColor: theme.colors.border,
    },
    vAxis: {
      ...options.vAxis,
      textStyle: { color: theme.colors.textSecondary },
      titleTextStyle: { color: theme.colors.textSecondary },
      gridlines: {
        color: theme.colors.border,
        ...options.vAxis?.gridlines,
      },
      baselineColor: theme.colors.border,
    },
    legend: {
      textStyle: { color: theme.colors.textSecondary },
      ...(typeof options.legend === 'object' ? options.legend : {}),
      position:
        typeof options.legend === 'string'
          ? options.legend
          : options.legend?.position || 'bottom',
    },
    tooltip: {
      textStyle: { color: theme.colors.textPrimary },
      ...options.tooltip,
    },
    // Default colors that work well on dark background
    colors: options.colors || [
      '#60a5fa', // primary blue
      '#34d399', // success green
      '#f472b6', // accent pink
      '#fbbf24', // warning yellow
      '#a78bfa', // purple
      '#fb923c', // orange
      '#22d3d4', // cyan
      '#f87171', // red
    ],
    chartArea: {
      backgroundColor: 'transparent',
      ...options.chartArea,
    },
  };

  // Handle width/height - ensure they're numbers for Google Charts
  if (options.width) {
    themedOptions.width =
      typeof options.width === 'number' ? options.width : undefined;
  }
  if (options.height) {
    themedOptions.height =
      typeof options.height === 'number' ? options.height : undefined;
  }

  // Handle DonutChart by setting pieHole
  if (chartType === 'DonutChart') {
    themedOptions.pieHole = (options.pieHole as number | undefined) || 0.4;
  }

  return themedOptions;
};

// Map our chart types to Google Charts chart types
const getGoogleChartType = (
  chartType: ChartType
): GoogleChartWrapperChartType => {
  // DonutChart is a PieChart with pieHole option
  if (chartType === 'DonutChart') {
    return 'PieChart';
  }
  // All our chart types map directly to Google Chart types
  return chartType as GoogleChartWrapperChartType;
};

export const ChartRenderer: React.FC<ChartRendererProps> = ({
  chartType,
  data,
  options,
}) => {
  // Convert data to array format
  const chartData = useMemo(() => convertDataTableToArray(data), [data]);

  // Apply dark theme and merge with provided options
  const chartOptions = useMemo(
    () => applyDarkThemeDefaults(options, chartType),
    [options, chartType]
  );

  // Get the Google Charts chart type
  const googleChartType = useMemo(
    () => getGoogleChartType(chartType),
    [chartType]
  );

  // Determine chart height
  const chartHeight = typeof options.height === 'number' ? options.height : 400;

  return (
    <CssBox css={chartContainerCss}>
      <Chart
        chartType={googleChartType}
        data={chartData}
        options={chartOptions}
        width="100%"
        height={chartHeight}
        loader={
          // `LoadingContainer` was a centred div with a bare string in it. The spinner is
          // the design system's loading affordance and makes the wait legible as a wait.
          <Flex align="center" justify="center" minH="300px" gap="200">
            <LoadingSpinner size="sm" />
            <Text fontSize="350" color="neutral.11">
              Loading chart...
            </Text>
          </Flex>
        }
      />
    </CssBox>
  );
};

export default ChartRenderer;
