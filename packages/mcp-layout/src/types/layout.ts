import { z } from 'zod';

// Input size limits. These bound the work a single tool call can trigger
// (track expansion, pairwise element analysis, regex matching).
export const MAX_GRID_TRACKS = 1000;
export const MAX_TEMPLATE_LENGTH = 1000;
export const MAX_CSS_VALUE_LENGTH = 64;
export const MAX_IDENTIFIER_LENGTH = 256;
export const MAX_STYLE_VALUE_LENGTH = 1024;
export const MAX_GRID_AREA_DIMENSION = 100;
export const MAX_ELEMENTS = 1000;
export const MAX_CONSTRAINTS = 5000;
export const MAX_ELEMENT_CONSTRAINTS = 100;
export const MAX_BREAKPOINTS = 50;

const identifier = () => z.string().max(MAX_IDENTIFIER_LENGTH);
const cssValue = () => z.string().max(MAX_CSS_VALUE_LENGTH);
const gridTemplate = () => z.string().max(MAX_TEMPLATE_LENGTH);

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
  element: identifier(),
  property: identifier(),
  value: z.union([z.number(), identifier()]),
  relation: z.enum(['equal', 'greater', 'less']).optional(),
  target: identifier().optional(),
  priority: z.number().min(0).max(1000).default(500)
});

// CSS Grid configuration
export const GridConfigSchema = z.object({
  columns: gridTemplate(), // CSS grid-template-columns
  rows: gridTemplate(), // CSS grid-template-rows
  gap: cssValue().default('0'),
  rowGap: cssValue().optional(),
  columnGap: cssValue().optional(),
  areas: z.array(z.array(identifier()).max(MAX_GRID_AREA_DIMENSION)).max(MAX_GRID_AREA_DIMENSION).optional(),
  autoColumns: gridTemplate().optional(),
  autoRows: gridTemplate().optional(),
  autoFlow: z.enum(['row', 'column', 'row dense', 'column dense']).default('row')
});

export const GridElementSchema = z.object({
  id: identifier(),
  gridArea: identifier().optional(),
  gridColumn: identifier().optional(),
  gridRow: identifier().optional(),
  gridColumnStart: z.union([z.number(), identifier()]).optional(),
  gridColumnEnd: z.union([z.number(), identifier()]).optional(),
  gridRowStart: z.union([z.number(), identifier()]).optional(),
  gridRowEnd: z.union([z.number(), identifier()]).optional(),
  justifySelf: z.enum(['start', 'end', 'center', 'stretch']).optional(),
  alignSelf: z.enum(['start', 'end', 'center', 'stretch']).optional(),
  content: z.record(z.string(), z.any()).optional(),
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
  gap: cssValue().default('0'),
  rowGap: cssValue().optional(),
  columnGap: cssValue().optional()
});

export const FlexElementSchema = z.object({
  id: identifier(),
  flexGrow: z.number().min(0).default(0),
  flexShrink: z.number().min(0).default(1),
  flexBasis: z.union([z.number(), cssValue()]).default('auto'),
  alignSelf: z.enum(['auto', 'flex-start', 'flex-end', 'center', 'stretch', 'baseline']).optional(),
  order: z.number().optional(),
  content: z.record(z.string(), z.any()).optional(),
  minWidth: z.number().optional(),
  minHeight: z.number().optional(),
  maxWidth: z.number().optional(),
  maxHeight: z.number().optional()
});

// Layout element (generic)
export const LayoutElementSchema = z.object({
  id: identifier(),
  type: z.enum(['div', 'span', 'text', 'image', 'svg']).default('div'),
  bounds: RectangleSchema.optional(),
  content: z.record(z.string(), z.any()).optional(),
  styles: z.record(identifier(), z.string().max(MAX_STYLE_VALUE_LENGTH)).optional(),
  children: z.array(identifier()).max(MAX_ELEMENTS).optional(),
  constraints: z.array(LayoutConstraintSchema).max(MAX_ELEMENT_CONSTRAINTS).optional()
});

// Breakpoint configuration
export const BreakpointSchema = z.object({
  name: identifier(),
  minWidth: z.number().min(0),
  maxWidth: z.number().optional(),
  columns: z.number().int().min(1).max(MAX_GRID_TRACKS).optional(),
  gutter: z.number().min(0).optional()
});

// Layout types
export const GridLayoutSchema = z.object({
  type: z.literal('grid'),
  config: GridConfigSchema,
  elements: z.array(GridElementSchema).max(MAX_ELEMENTS),
  bounds: RectangleSchema,
  computedGrid: z.object({
    tracks: z.object({
      columns: z.array(z.object({
        start: z.number(),
        size: z.number()
      })).max(MAX_GRID_TRACKS),
      rows: z.array(z.object({
        start: z.number(),
        size: z.number()
      })).max(MAX_GRID_TRACKS)
    }),
    areas: z.record(z.string(), RectangleSchema).optional()
  }).optional()
});

export const FlexLayoutSchema = z.object({
  type: z.literal('flex'),
  config: FlexConfigSchema,
  elements: z.array(FlexElementSchema).max(MAX_ELEMENTS),
  bounds: RectangleSchema,
  computedFlex: z.object({
    mainAxis: z.enum(['horizontal', 'vertical']),
    crossAxis: z.enum(['horizontal', 'vertical']),
    elementPositions: z.array(z.object({
      id: identifier(),
      bounds: RectangleSchema,
      flexValues: z.object({
        grow: z.number(),
        shrink: z.number(),
        basis: z.number()
      })
    })).max(MAX_ELEMENTS)
  }).optional()
});

export const LayoutSchema = z.union([GridLayoutSchema, FlexLayoutSchema]);

export const ResponsiveLayoutSchema = z.object({
  breakpoints: z.array(BreakpointSchema).max(MAX_BREAKPOINTS),
  layouts: z.record(z.string(), LayoutSchema) // keyed by breakpoint name
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

// Bounded tool input lists
export const GridElementListSchema = z.array(GridElementSchema).max(MAX_ELEMENTS);
export const FlexElementListSchema = z.array(FlexElementSchema).max(MAX_ELEMENTS);
export const LayoutElementListSchema = z.array(LayoutElementSchema).max(MAX_ELEMENTS);
export const LayoutConstraintListSchema = z.array(LayoutConstraintSchema).max(MAX_CONSTRAINTS);
export const BreakpointListSchema = z.array(BreakpointSchema).max(MAX_BREAKPOINTS);

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