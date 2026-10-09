/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { z } from 'zod';

export const VISUALIZE_DATA_TOOL = 'visualize_data';

const ChartType = z.enum([
  'LineChart',
  'BarChart',
  'ColumnChart',
  'PieChart',
  'AreaChart',
  'Table',
  'ScatterChart',
  'ComboChart',
  'SteppedAreaChart',
  'Histogram',
  'CandlestickChart',
  'DonutChart',
  'GeoChart',
  'Gauge',
  'TreeMap',
  'Timeline',
]);

const ColumnType = z.enum([
  'string',
  'number',
  'boolean',
  'date',
  'datetime',
  'timeofday',
]);

/**
 * Column definition for Google Charts DataTable
 */
const ColumnSchema = z.object({
  id: z.string().optional().describe('Unique identifier for the column'),
  label: z
    .string()
    .describe('Display label for the column (shown in legends, headers)'),
  type: ColumnType.describe('Data type of the column values'),
  pattern: z
    .string()
    .optional()
    .describe('Format pattern for the column (e.g., "#,##0.00" for numbers)'),
  role: z
    .string()
    .optional()
    .describe('Column role (e.g., "annotation", "tooltip", "style")'),
});

/**
 * Cell value in Google Charts format
 * Can be a primitive value or an object with value (v), formatted value (f), and properties (p)
 */
const CellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.object({
    v: z
      .union([z.string(), z.number(), z.boolean(), z.null()])
      .describe('The cell value'),
    f: z.string().optional().describe('Formatted string version of the value'),
    p: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Custom properties for the cell'),
  }),
]);

/**
 * Row definition for Google Charts DataTable
 */
const RowSchema = z.object({
  c: z.array(CellValueSchema).describe('Array of cell values for this row'),
});

/**
 * Google Charts DataTable structure
 * @see https://developers.google.com/chart/interactive/docs/reference#DataTable
 */
const DataTableSchema = z.object({
  cols: z.array(ColumnSchema).describe('Array of column definitions'),
  rows: z.array(RowSchema).describe('Array of row data'),
});

/**
 * Chart options schema (common options across chart types)
 * @see https://developers.google.com/chart/interactive/docs/reference
 */
const ChartOptionsSchema = z
  .object({
    title: z.string().optional().describe('Chart title displayed at the top'),
    subtitle: z.string().optional().describe('Chart subtitle'),
    width: z
      .union([z.number(), z.string()])
      .optional()
      .describe('Chart width in pixels or percentage'),
    height: z
      .union([z.number(), z.string()])
      .optional()
      .describe('Chart height in pixels or percentage'),
    colors: z
      .array(z.string())
      .optional()
      .describe('Array of colors for the chart series'),
    backgroundColor: z
      .string()
      .optional()
      .describe('Background color of the chart'),
    legend: z
      .union([
        z.string(),
        z.object({
          position: z
            .enum(['top', 'bottom', 'left', 'right', 'in', 'none'])
            .optional(),
          alignment: z.enum(['start', 'center', 'end']).optional(),
          textStyle: z
            .object({
              color: z.string().optional(),
              fontSize: z.number().optional(),
              bold: z.boolean().optional(),
            })
            .optional(),
        }),
      ])
      .optional()
      .describe('Legend configuration'),
    hAxis: z
      .object({
        title: z.string().optional(),
        format: z.string().optional(),
        gridlines: z
          .object({
            count: z.number().optional(),
            color: z.string().optional(),
          })
          .optional(),
        minValue: z.number().optional(),
        maxValue: z.number().optional(),
        slantedText: z.boolean().optional(),
        slantedTextAngle: z.number().optional(),
      })
      .optional()
      .describe('Horizontal axis configuration'),
    vAxis: z
      .object({
        title: z.string().optional(),
        format: z.string().optional(),
        gridlines: z
          .object({
            count: z.number().optional(),
            color: z.string().optional(),
          })
          .optional(),
        minValue: z.number().optional(),
        maxValue: z.number().optional(),
      })
      .optional()
      .describe('Vertical axis configuration'),
    chartArea: z
      .object({
        left: z.union([z.number(), z.string()]).optional(),
        top: z.union([z.number(), z.string()]).optional(),
        width: z.union([z.number(), z.string()]).optional(),
        height: z.union([z.number(), z.string()]).optional(),
        backgroundColor: z.string().optional(),
      })
      .optional()
      .describe('Chart drawing area configuration'),
    is3D: z
      .boolean()
      .optional()
      .describe('Enable 3D effect (for supported chart types)'),
    isStacked: z
      .union([z.boolean(), z.enum(['percent', 'relative', 'absolute'])])
      .optional()
      .describe('Stack series (for bar/column/area charts)'),
    curveType: z
      .enum(['none', 'function'])
      .optional()
      .describe('Line curve type (for line charts)'),
    pointSize: z
      .number()
      .optional()
      .describe('Size of data points (for line/scatter charts)'),
    pieHole: z.number().optional().describe('Hole size for donut charts (0-1)'),
    pieSliceText: z
      .enum(['percentage', 'value', 'label', 'none'])
      .optional()
      .describe('Text shown on pie slices'),
    animation: z
      .object({
        startup: z.boolean().optional(),
        duration: z.number().optional(),
        easing: z.enum(['linear', 'in', 'out', 'inAndOut']).optional(),
      })
      .optional()
      .describe('Chart animation settings'),
    tooltip: z
      .object({
        trigger: z.enum(['focus', 'selection', 'none']).optional(),
        isHtml: z.boolean().optional(),
        showColorCode: z.boolean().optional(),
      })
      .optional()
      .describe('Tooltip configuration'),
  })
  .passthrough()
  .describe('Chart display options');

/**
 * Input schema for the visualize tool
 */
const visualizeDataSchema = z.object({
  chartType: ChartType.describe(
    'The type of Google Chart to render. Choose based on data characteristics: ' +
      'LineChart for trends over time, BarChart/ColumnChart for comparisons, ' +
      'PieChart for parts of a whole, AreaChart for cumulative data, ' +
      'Table for detailed data view, ScatterChart for correlations.'
  ),
  data: DataTableSchema.describe(
    'The data in Google Charts DataTable format. Must include cols (column definitions) ' +
      'and rows (data rows). Each column needs at minimum a label and type. ' +
      'Row values should match column order and types.'
  ),
  options: ChartOptionsSchema.describe(
    'Chart display options including title, dimensions, colors, axes configuration, ' +
      'legend settings, and chart-specific options.'
  ),
});

/**
 * Output structure for Google Charts visualization
 */
interface VisualizationOutput {
  success: true;
  chartType: z.infer<typeof ChartType>;
  data: z.infer<typeof DataTableSchema>;
  options: z.infer<typeof ChartOptionsSchema>;
}

interface VisualizationError {
  success: false;
  error: string;
  hint: string;
}

type VisualizationResult = VisualizationOutput | VisualizationError;

export const visualizeDataTool = {
  description: `Generate a Google Charts-compatible JSON visualization specification from aggregated data.

CRITICAL INSTRUCTIONS:
- This tool DIRECTLY renders a chart in the user's interface.
- After calling this tool, DO NOT output any text, explanation, or JSON.
- DO NOT describe the chart or repeat the data in your response.
- DO NOT say "Here is the visualization" or similar phrases.
- The chart will be automatically displayed to the user - no further action needed.
- Simply call this tool and STOP. The user will see the chart immediately.

WHEN TO USE:
- Use ONLY when the user explicitly asks for a chart, graph, or visualization.
- Use at the END of an analysis chain after data has been aggregated.

INPUT REQUIREMENTS:
- chartType: Select appropriate chart type for the data
- data: Google Charts DataTable format with cols and rows
- options: Chart configuration (title, dimensions, etc.)

CHART TYPE GUIDE:
- LineChart: Time series, trends
- BarChart: Horizontal comparisons
- ColumnChart: Vertical comparisons
- PieChart/DonutChart: Parts of whole
- AreaChart: Cumulative trends
- Table: Detailed data display

EXAMPLE:
{
  "cols": [{"label": "Week", "type": "string"}, {"label": "Orders", "type": "number"}],
  "rows": [{"c": [{"v": "Week 1"}, {"v": 150}]}]
}`,

  inputSchema: visualizeDataSchema,

  execute: async ({
    chartType,
    data,
    options,
  }: z.infer<typeof visualizeDataSchema>): Promise<VisualizationResult> => {
    try {
      // Validate that data has the required structure
      if (!data.cols || data.cols.length === 0) {
        return {
          success: false,
          error:
            'Invalid data structure: cols array is required and must not be empty',
          hint: 'Ensure the data object includes a "cols" array with at least one column definition containing "label" and "type".',
        };
      }

      if (!data.rows) {
        return {
          success: false,
          error: 'Invalid data structure: rows array is required',
          hint: 'Ensure the data object includes a "rows" array. It can be empty for no-data states.',
        };
      }

      // Validate row data matches column count
      for (let i = 0; i < data.rows.length; i++) {
        const row = data.rows[i];
        if (row.c.length !== data.cols.length) {
          return {
            success: false,
            error: `Row ${i} has ${row.c.length} cells but ${data.cols.length} columns are defined`,
            hint: 'Each row must have exactly the same number of cells as there are columns defined.',
          };
        }
      }

      // Build the visualization output
      const result: VisualizationOutput = {
        success: true,
        chartType,
        data,
        options: {
          // Apply sensible defaults if not provided
          title: options.title || '',
          width: options.width || '100%',
          height: options.height || 400,
          ...options,
        },
      };

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        success: false,
        error: `Visualization creation failed: ${errorMessage}`,
        hint: 'Check that the data format follows Google Charts DataTable specification. Ensure all column types are valid and row data matches column definitions.',
      };
    }
  },
};
