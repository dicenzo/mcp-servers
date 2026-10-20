import { z } from 'zod';

// Base geometry types
export const RectangleSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().min(0),
  height: z.number().min(0)
});

export const PointSchema = z.object({
  x: z.number(),
  y: z.number()
});

export const SizeSchema = z.object({
  width: z.number().min(0),
  height: z.number().min(0)
});

// Constraint types
export const LayoutConstraintSchema = z.object({
  type: z.enum(['position', 'size', 'spacing', 'alignment']),
  element: z.string(),
  property: z.string(),
  value: z.union([z.number(), z.string()]),
  relation: z.enum(['equal', 'greater', 'less']).optional(),
  target: z.string().optional(),
  priority: z.number().min(0).max(1000).default(500)
});

// CSS Grid configuration
export const GridConfigSchema = z.object({
  columns: z.string(), // CSS grid-template-columns
  rows: z.string(), // CSS grid-template-rows
  gap: z.string().default('0'),
  rowGap: z.string().optional(),
  columnGap: z.string().optional(),
  areas: z.array(z.array(z.string())).optional(),
  autoColumns: z.string().optional(),
  autoRows: z.string().optional(),
  autoFlow: z.enum(['row', 'column', 'row dense', 'column dense']).default('row')
});

export const GridElementSchema = z.object({
  id: z.string(),
  gridArea: z.string().optional(),
  gridColumn: z.string().optional(),
  gridRow: z.string().optional(),
  gridColumnStart: z.union([z.number(), z.string()]).optional(),
  gridColumnEnd: z.union([z.number(), z.string()]).optional(),
  gridRowStart: z.union([z.number(), z.string()]).optional(),
  gridRowEnd: z.union([z.number(), z.string()]).optional(),
  justifySelf: z.enum(['start', 'end', 'center', 'stretch']).optional(),
  alignSelf: z.enum(['start', 'end', 'center', 'stretch']).optional(),
  content: z.record(z.any()).optional(),
  minWidth: z.number().optional(),
  minHeight: z.number().optional(),
  maxWidth: z.number().optional(),
  maxHeight: z.number().optional()
});

// Flexbox configuration
export const FlexConfigSchema = z.object({
  direction: z.enum(['row', 'row-reverse', 'column', 'column-reverse']).default('row'),
  wrap: z.enum(['nowrap', 'wrap', 'wrap-reverse']).default('nowrap'),
  justifyContent: z.enum(['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly']).default('flex-start'),
  alignItems: z.enum(['flex-start', 'flex-end', 'center', 'stretch', 'baseline']).default('stretch'),
  alignContent: z.enum(['flex-start', 'flex-end', 'center', 'stretch', 'space-between', 'space-around']).default('stretch'),
  gap: z.string().default('0'),
  rowGap: z.string().optional(),
  columnGap: z.string().optional()
});

export const FlexElementSchema = z.object({
  id: z.string(),
  flexGrow: z.number().min(0).default(0),
  flexShrink: z.number().min(0).default(1),
  flexBasis: z.union([z.number(), z.string()]).default('auto'),
  alignSelf: z.enum(['auto', 'flex-start', 'flex-end', 'center', 'stretch', 'baseline']).optional(),
  order: z.number().optional(),
  content: z.record(z.any()).optional(),
  minWidth: z.number().optional(),
  minHeight: z.number().optional(),
  maxWidth: z.number().optional(),
  maxHeight: z.number().optional()
});

// Layout element (generic)
export const LayoutElementSchema = z.object({
  id: z.string(),
  type: z.enum(['div', 'span', 'text', 'image', 'svg']).default('div'),
  bounds: RectangleSchema.optional(),
  content: z.record(z.any()).optional(),
  styles: z.record(z.string()).optional(),
  children: z.array(z.string()).optional(),
  constraints: z.array(LayoutConstraintSchema).optional()
});

// Breakpoint configuration
export const BreakpointSchema = z.object({
  name: z.string(),
  minWidth: z.number().min(0),
  maxWidth: z.number().optional(),
  columns: z.number().min(1).optional(),
  gutter: z.number().min(0).optional()
});

// Layout types
export const GridLayoutSchema = z.object({
  type: z.literal('grid'),
  config: GridConfigSchema,
  elements: z.array(GridElementSchema),
  bounds: RectangleSchema,
  computedGrid: z.object({
    tracks: z.object({
      columns: z.array(z.object({
        start: z.number(),
        size: z.number()
      })),
      rows: z.array(z.object({
        start: z.number(),
        size: z.number()
      }))
    }),
    areas: z.record(RectangleSchema).optional()
  }).optional()
});

export const FlexLayoutSchema = z.object({
  type: z.literal('flex'),
  config: FlexConfigSchema,
  elements: z.array(FlexElementSchema),
  bounds: RectangleSchema,
  computedFlex: z.object({
    mainAxis: z.enum(['horizontal', 'vertical']),
    crossAxis: z.enum(['horizontal', 'vertical']),
    elementPositions: z.array(z.object({
      id: z.string(),
      bounds: RectangleSchema,
      flexValues: z.object({
        grow: z.number(),
        shrink: z.number(),
        basis: z.number()
      })
    }))
  }).optional()
});

export const LayoutSchema = z.union([GridLayoutSchema, FlexLayoutSchema]);

export const ResponsiveLayoutSchema = z.object({
  breakpoints: z.array(BreakpointSchema),
  layouts: z.record(LayoutSchema) // keyed by breakpoint name
});

// Layout metrics
export const LayoutMetricsSchema = z.object({
  totalBounds: RectangleSchema,
  elementCount: z.number(),
  overflowElements: z.array(z.string()),
  performance: z.object({
    calculationTime: z.number(),
    constraintsSolved: z.number(),
    iterationsRequired: z.number()
  }),
  warnings: z.array(z.string()).optional()
});

// Auto-layout configuration
export const AutoLayoutConfigSchema = z.object({
  direction: z.enum(['horizontal', 'vertical', 'grid']).default('vertical'),
  spacing: z.number().min(0).default(8),
  padding: z.object({
    top: z.number().min(0).default(0),
    right: z.number().min(0).default(0),
    bottom: z.number().min(0).default(0),
    left: z.number().min(0).default(0)
  }).default({ top: 0, right: 0, bottom: 0, left: 0 }),
  alignment: z.enum(['start', 'center', 'end', 'stretch']).default('start'),
  distribution: z.enum(['start', 'center', 'end', 'space-between', 'space-around', 'space-evenly']).default('start'),
  maxWidth: z.number().optional(),
  maxHeight: z.number().optional(),
  responsive: z.boolean().default(false)
});

// TypeScript type exports
export type Rectangle = z.infer<typeof RectangleSchema>;
export type Point = z.infer<typeof PointSchema>;
export type Size = z.infer<typeof SizeSchema>;
export type LayoutConstraint = z.infer<typeof LayoutConstraintSchema>;
export type GridConfig = z.infer<typeof GridConfigSchema>;
export type GridElement = z.infer<typeof GridElementSchema>;
export type FlexConfig = z.infer<typeof FlexConfigSchema>;
export type FlexElement = z.infer<typeof FlexElementSchema>;
export type LayoutElement = z.infer<typeof LayoutElementSchema>;
export type Breakpoint = z.infer<typeof BreakpointSchema>;
export type GridLayout = z.infer<typeof GridLayoutSchema>;
export type FlexLayout = z.infer<typeof FlexLayoutSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
export type ResponsiveLayout = z.infer<typeof ResponsiveLayoutSchema>;
export type LayoutMetrics = z.infer<typeof LayoutMetricsSchema>;
export type AutoLayoutConfig = z.infer<typeof AutoLayoutConfigSchema>;

// Error types
export enum LayoutErrorCode {
  INVALID_CONFIG = 'INVALID_CONFIG',
  CONSTRAINT_CONFLICT = 'CONSTRAINT_CONFLICT',
  UNSOLVABLE_LAYOUT = 'UNSOLVABLE_LAYOUT',
  PERFORMANCE_TIMEOUT = 'PERFORMANCE_TIMEOUT',
  INVALID_DIMENSIONS = 'INVALID_DIMENSIONS',
  CIRCULAR_DEPENDENCY = 'CIRCULAR_DEPENDENCY'
}

export interface LayoutError {
  code: LayoutErrorCode;
  message: string;
  element?: string;
  constraint?: LayoutConstraint;
}