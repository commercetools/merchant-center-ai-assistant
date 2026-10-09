/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Shared Chart Types
 *
 * Types for Google Charts visualization data used by:
 * - chart-renderer.tsx (chat visualizations)
 * - composed-page-chart (composed page charts)
 *
 * @see https://developers.google.com/chart/interactive/docs/reference
 */

export type ChartType =
  | 'LineChart'
  | 'BarChart'
  | 'ColumnChart'
  | 'PieChart'
  | 'AreaChart'
  | 'Table'
  | 'ScatterChart'
  | 'ComboChart'
  | 'SteppedAreaChart'
  | 'Histogram'
  | 'CandlestickChart'
  | 'DonutChart'
  | 'GeoChart'
  | 'Gauge'
  | 'TreeMap'
  | 'Timeline';

export type ColumnType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'timeofday';

export interface ChartColumn {
  id?: string;
  label: string;
  type: ColumnType;
  pattern?: string;
  role?: string;
}

export interface CellValue {
  v: string | number | boolean | null;
  f?: string;
  p?: Record<string, unknown>;
}

export interface ChartRow {
  c: (string | number | boolean | null | CellValue)[];
}

export interface ChartDataTable {
  cols: ChartColumn[];
  rows: ChartRow[];
}

export interface LegendConfig {
  position?: 'top' | 'bottom' | 'left' | 'right' | 'in' | 'none';
  alignment?: 'start' | 'center' | 'end';
  textStyle?: {
    color?: string;
    fontSize?: number;
    bold?: boolean;
  };
}

export interface AxisConfig {
  title?: string;
  format?: string;
  gridlines?: {
    count?: number;
    color?: string;
  };
  minValue?: number;
  maxValue?: number;
  slantedText?: boolean;
  slantedTextAngle?: number;
}

export interface ChartAreaConfig {
  left?: number | string;
  top?: number | string;
  width?: number | string;
  height?: number | string;
  backgroundColor?: string;
}

export interface AnimationConfig {
  startup?: boolean;
  duration?: number;
  easing?: 'linear' | 'in' | 'out' | 'inAndOut';
}

export interface TooltipConfig {
  trigger?: 'focus' | 'selection' | 'none';
  isHtml?: boolean;
  showColorCode?: boolean;
}

export interface ChartOptions {
  title?: string;
  subtitle?: string;
  width?: number | string;
  height?: number | string;
  colors?: string[];
  backgroundColor?: string;
  legend?: string | LegendConfig;
  hAxis?: AxisConfig;
  vAxis?: AxisConfig;
  chartArea?: ChartAreaConfig;
  is3D?: boolean;
  isStacked?: boolean | 'percent' | 'relative' | 'absolute';
  curveType?: 'none' | 'function';
  pointSize?: number;
  pieHole?: number;
  pieSliceText?: 'percentage' | 'value' | 'label' | 'none';
  animation?: AnimationConfig;
  tooltip?: TooltipConfig;
  [key: string]: unknown;
}

// Visualization result types (used by chat visualization)
export interface VisualizationData {
  success: true;
  chartType: ChartType;
  data: ChartDataTable;
  options: ChartOptions;
  description?: string;
}

export interface VisualizationError {
  success: false;
  error: string;
  hint: string;
}

export type VisualizationResult = VisualizationData | VisualizationError;
