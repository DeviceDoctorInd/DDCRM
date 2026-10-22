import React from 'react';

export const HELVETICA_FONT = 'Helvetica, "Helvetica Neue", Arial, sans-serif';

/**
 * Standard High-Contrast Chart Tooltip props for Recharts <Tooltip />
 * Guarantees crisp deep black text on solid pure white card with solid black border.
 * Eliminates dark-on-dark or low-contrast illegibility.
 */
export const chartTooltipProps = {
  contentStyle: {
    backgroundColor: '#ffffff',
    border: '1.5px solid #000000',
    borderRadius: '4px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    padding: '8px 12px',
    fontFamily: HELVETICA_FONT,
    color: '#000000',
  },
  labelStyle: {
    color: '#000000',
    fontWeight: 700,
    fontSize: '12px',
    fontFamily: HELVETICA_FONT,
    marginBottom: '4px',
  },
  itemStyle: {
    color: '#000000',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: HELVETICA_FONT,
    paddingTop: '2px',
    paddingBottom: '2px',
  },
};

/**
 * High-Contrast XAxis standard props with deep black Helvetica ticks
 */
export const chartXAxisProps = {
  tick: {
    fill: '#000000',
    fontSize: 10,
    fontFamily: HELVETICA_FONT,
    fontWeight: 500,
  },
  tickLine: { stroke: '#cbd5e1' },
  axisLine: { stroke: '#000000' },
};

/**
 * High-Contrast YAxis standard props with deep black Helvetica ticks
 */
export const chartYAxisProps = {
  tick: {
    fill: '#000000',
    fontSize: 10,
    fontFamily: HELVETICA_FONT,
    fontWeight: 500,
  },
  tickLine: { stroke: '#cbd5e1' },
  axisLine: { stroke: '#000000' },
};

/**
 * High-Contrast CartesianGrid standard props
 */
export const chartGridProps = {
  strokeDasharray: '3 3',
  stroke: '#e2e8f0',
  opacity: 0.9,
};

/**
 * High-Contrast Legend formatter
 */
export const renderHighContrastLegend = (value: string) => (
  <span
    style={{
      color: '#000000',
      fontFamily: HELVETICA_FONT,
      fontWeight: 600,
      fontSize: '11px',
    }}
  >
    {value}
  </span>
);

/**
 * High-contrast monochrome & grayscale palette for charts and segment slices
 */
export const MONOCHROME_CHART_PALETTE = [
  '#000000', // Pitch Black
  '#374151', // Charcoal Slate
  '#6b7280', // Slate Gray
  '#9ca3af', // Light Slate
  '#111827', // Deep Slate
  '#4b5563', // Cool Dark Gray
  '#d1d5db', // Silver Gray
  '#1f2937', // Zinc Charcoal
];

/**
 * Standard pie slice boundaries with crisp white border
 */
export const PIE_SLICE_BORDER = {
  stroke: '#ffffff',
  strokeWidth: 2,
};
