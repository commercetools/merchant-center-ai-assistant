/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Composed Page Chart Component
 *
 * A reusable chart component for composed pages that wraps react-google-charts.
 * Uses the same DataTable format as the visualize_data tool for consistency.
 */

import React, { useMemo } from 'react';
import { Chart, GoogleChartWrapperChartType } from 'react-google-charts';
import type {
  ChartType,
  ChartDataTable,
  ChartOptions,
  ChartRow,
  CellValue,
} from '../../types/chart';

// Re-export types for convenience
export type { ChartType, ChartDataTable, ChartOptions };

/**
 * Props for the ComposedPageChart component
 */
export interface ComposedPageChartProps {
  /** The type of chart to render */
  chartType: ChartType;
  /** Chart data in DataTable format (cols/rows) */
  data: ChartDataTable;
  /** Chart display options */
  options?: ChartOptions;
  /** Chart width (default: "100%") */
  width?: string | number;
  /** Chart height in pixels (default: 400) */
  height?: number;
}

// Default colors that work well on light backgrounds
const DEFAULT_COLORS = [
  '#4285f4', // Google blue
  '#34a853', // Google green
  '#ea4335', // Google red
  '#fbbc04', // Google yellow
  '#9334e6', // Purple
  '#ff6d01', // Orange
  '#46bdc6', // Cyan
  '#7baaf7', // Light blue
];

/**
 * Convert DataTable format to array format for react-google-charts
 */
function convertDataTableToArray(
  dataTable: ChartDataTable
): (string | number | boolean | null)[][] {
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
}

/**
 * Apply theme defaults to chart options
 */
function applyThemeDefaults(
  options: ChartOptions | undefined,
  chartType: ChartType
): Record<string, unknown> {
  const opts = options || {};

  const themedOptions: Record<string, unknown> = {
    ...opts,
    backgroundColor: opts.backgroundColor || 'transparent',
    titleTextStyle: {
      color: '#1a1a1a',
      fontSize: 14,
      bold: true,
    },
    legendTextStyle: {
      color: '#666666',
    },
    hAxis: {
      ...opts.hAxis,
      textStyle: { color: '#666666' },
      titleTextStyle: { color: '#666666' },
      gridlines: {
        color: '#e0e0e0',
        ...opts.hAxis?.gridlines,
      },
      baselineColor: '#e0e0e0',
    },
    vAxis: {
      ...opts.vAxis,
      textStyle: { color: '#666666' },
      titleTextStyle: { color: '#666666' },
      gridlines: {
        color: '#e0e0e0',
        ...opts.vAxis?.gridlines,
      },
      baselineColor: '#e0e0e0',
    },
    legend: {
      textStyle: { color: '#666666' },
      ...(typeof opts.legend === 'object' ? opts.legend : {}),
      position:
        typeof opts.legend === 'string'
          ? opts.legend
          : opts.legend?.position || 'bottom',
    },
    tooltip: {
      textStyle: { color: '#1a1a1a' },
      ...opts.tooltip,
    },
    colors: opts.colors || DEFAULT_COLORS,
    chartArea: {
      backgroundColor: 'transparent',
      ...opts.chartArea,
    },
  };

  // Handle DonutChart by setting pieHole
  if (chartType === 'DonutChart') {
    themedOptions.pieHole = (opts.pieHole as number | undefined) || 0.4;
  }

  return themedOptions;
}

/**
 * Map our chart types to Google Charts chart types
 */
function getGoogleChartType(chartType: ChartType): GoogleChartWrapperChartType {
  // DonutChart is a PieChart with pieHole option
  if (chartType === 'DonutChart') {
    return 'PieChart';
  }
  // All our chart types map directly to Google Chart types
  return chartType as GoogleChartWrapperChartType;
}

/**
 * ComposedPageChart - A chart component for use in composed pages
 *
 * Usage in JSX:
 * ```jsx
 * <Chart
 *   chartType="BarChart"
 *   data={{
 *     cols: [{ label: "Month", type: "string" }, { label: "Sales", type: "number" }],
 *     rows: [{ c: [{ v: "Jan" }, { v: 1000 }] }, { c: [{ v: "Feb" }, { v: 1500 }] }]
 *   }}
 *   options={{ title: "Monthly Sales" }}
 *   height={400}
 * />
 * ```
 */
export const ComposedPageChart: React.FC<ComposedPageChartProps> = ({
  chartType,
  data,
  options,
  width = '100%',
  height = 400,
}) => {
  // Convert data to array format
  const chartData = useMemo(() => {
    if (!data || !data.cols || !data.rows) {
      return [['No Data'], ['No data available']];
    }
    return convertDataTableToArray(data);
  }, [data]);

  // Apply theme defaults and merge with provided options
  const chartOptions = useMemo(
    () => applyThemeDefaults(options, chartType),
    [options, chartType]
  );

  // Get the Google Charts chart type
  const googleChartType = useMemo(
    () => getGoogleChartType(chartType),
    [chartType]
  );

  // Handle width - convert to string if needed
  const chartWidth = typeof width === 'number' ? `${width}px` : width;

  return (
    <div
      style={{
        width: chartWidth,
        minHeight: height,
        background: 'white',
        borderRadius: '8px',
        padding: '16px',
        overflow: 'hidden',
      }}
    >
      <Chart
        chartType={googleChartType}
        data={chartData}
        options={chartOptions}
        width="100%"
        height={height}
      />
    </div>
  );
};

export default ComposedPageChart;
