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
  x: z.number().describe('X position in px'),
  y: z.number().describe('Y position in px'),
  width: z.number().min(0).describe('Width in px'),
  height: z.number().min(0).describe('Height in px')
});

/** Optional size limits shared by grid and flex elements; negative sizes are rejected */
const sizeLimits = {
  minWidth: z.number().min(0).optional().describe('Minimum width constraint in pixels'),
  minHeight: z.number().min(0).optional().describe('Minimum height constraint in pixels'),
  maxWidth: z.number().min(0).optional().describe('Maximum width constraint in pixels'),
  maxHeight: z.number().min(0).optional().describe('Maximum height constraint in pixels')
};

const elementContent = () => z.record(z.string(), z.any()).optional()
  .describe('Element content for size calculation and rendering');

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
  type: z.enum(['position', 'size', 'spacing', 'alignment']).describe('Type of constraint to apply'),
  element: identifier().describe('Target element ID for this constraint'),
  property: identifier().describe('Property to constrain (e.g., "x", "width", "center-x")'),
  value: z.union([z.number(), identifier()]).describe('Constraint value'),
  relation: z.enum(['equal', 'greater', 'less']).optional().describe('Relationship type for the constraint'),
  target: identifier().optional().describe('Reference element ID for relative constraints'),
  priority: z.number().min(0).max(1000).default(500)
    .describe('Constraint priority (higher = more important); constraints are applied lowest first, so the highest wins a conflict')
});

// CSS Grid configuration
export const GridConfigSchema = z.object({
  columns: gridTemplate().meta({
    description: 'CSS grid-template-columns value (e.g., "1fr 2fr 1fr", "repeat(3, 1fr)")',
    examples: ['1fr 2fr 1fr', 'repeat(3, 1fr)', '200px auto 100px', 'minmax(100px, 1fr) 2fr']
  }),
  rows: gridTemplate().meta({
    description: 'CSS grid-template-rows value (e.g., "auto 1fr auto")',
    examples: ['auto 1fr auto', 'repeat(4, 100px)', '50px auto 50px']
  }),
  gap: cssValue().default('0').describe('Grid gap: one value, or "row column" (e.g., "16px", "1rem", "8px 16px")'),
  rowGap: cssValue().optional().describe('Row-specific gap (overrides gap for rows)'),
  columnGap: cssValue().optional().describe('Column-specific gap (overrides gap for columns)'),
  areas: z.array(z.array(identifier()).max(MAX_GRID_AREA_DIMENSION)).max(MAX_GRID_AREA_DIMENSION).optional()
    .describe('Grid template areas as 2D array (e.g., [["header", "header"], ["sidebar", "main"]])'),
  autoColumns: gridTemplate().optional().describe('grid-auto-columns value for implicit columns'),
  autoRows: gridTemplate().optional().describe('grid-auto-rows value for implicit rows'),
  autoFlow: z.enum(['row', 'column', 'row dense', 'column dense']).default('row')
    .describe('grid-auto-flow value (dense is placed as sparse)')
});

export const GridElementSchema = z.object({
  id: identifier().describe('Unique identifier for the element'),
  gridArea: identifier().optional().describe('Named grid area (must match area in config.areas)'),
  gridColumn: identifier().optional().describe('grid-column value (e.g., "1 / 3", "span 2")'),
  gridRow: identifier().optional().describe('grid-row value (e.g., "1 / 3", "span 2")'),
  gridColumnStart: z.union([z.number(), identifier()]).optional().describe('grid-column-start value (line number or name)'),
  gridColumnEnd: z.union([z.number(), identifier()]).optional().describe('grid-column-end value (line number or name)'),
  gridRowStart: z.union([z.number(), identifier()]).optional().describe('grid-row-start value (line number or name)'),
  gridRowEnd: z.union([z.number(), identifier()]).optional().describe('grid-row-end value (line number or name)'),
  justifySelf: z.enum(['start', 'end', 'center', 'stretch']).optional().describe('justify-self alignment within grid area'),
  alignSelf: z.enum(['start', 'end', 'center', 'stretch']).optional().describe('align-self alignment within grid area'),
  content: elementContent(),
  ...sizeLimits
});

// Flexbox configuration
export const FlexConfigSchema = z.object({
  direction: z.enum(['row', 'row-reverse', 'column', 'column-reverse']).default('row').describe('flex-direction value'),
  wrap: z.enum(['nowrap', 'wrap', 'wrap-reverse']).default('nowrap').describe('flex-wrap value'),
  justifyContent: z.enum(['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly']).default('flex-start')
    .describe('justify-content value for main axis alignment'),
  alignItems: z.enum(['flex-start', 'flex-end', 'center', 'stretch', 'baseline']).default('stretch')
    .describe('align-items value for cross axis alignment'),
  alignContent: z.enum(['flex-start', 'flex-end', 'center', 'stretch', 'space-between', 'space-around']).default('stretch')
    .describe('align-content value for multi-line alignment'),
  gap: cssValue().default('0').describe('Gap value (e.g., "16px", "1rem")'),
  rowGap: cssValue().optional().describe('Row-specific gap (overrides gap for rows)'),
  columnGap: cssValue().optional().describe('Column-specific gap (overrides gap for columns)')
});

export const FlexElementSchema = z.object({
  id: identifier().describe('Unique identifier for the element'),
  flexGrow: z.number().min(0).default(0).describe('flex-grow value - how much element should grow'),
  flexShrink: z.number().min(0).default(1).describe('flex-shrink value - how much element can shrink'),
  flexBasis: z.union([z.number(), cssValue()]).default('auto')
    .describe('flex-basis value - initial main size (e.g., "200px", "50%", "auto")'),
  alignSelf: z.enum(['auto', 'flex-start', 'flex-end', 'center', 'stretch', 'baseline']).optional()
    .describe('align-self override for individual element'),
  order: z.number().optional().describe('Visual order of the element (lower numbers first)'),
  content: elementContent(),
  ...sizeLimits
});

// Layout element (generic)
export const LayoutElementSchema = z.object({
  id: identifier().describe('Unique identifier for the element'),
  type: z.enum(['div', 'span', 'text', 'image', 'svg']).default('div').describe('Element type for rendering context'),
  bounds: RectangleSchema.optional().describe('Initial element bounds (optional, will be calculated if not provided)'),
  content: elementContent(),
  styles: z.record(identifier(), z.string().max(MAX_STYLE_VALUE_LENGTH)).optional()
    .describe('CSS styles to apply to the element'),
  children: z.array(identifier()).max(MAX_ELEMENTS).optional().describe('Child element IDs for hierarchical layouts'),
  constraints: z.array(LayoutConstraintSchema).max(MAX_ELEMENT_CONSTRAINTS).optional()
    .describe('Constraints to apply to this element')
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
    areas: z.record(z.string(), RectangleSchema).optional(),
    elementPositions: z.array(z.object({
      id: identifier(),
      bounds: RectangleSchema
    })).max(MAX_ELEMENTS).optional()
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

// Layouts passed back into a tool advertise only the fields it reads, which keeps
// the tool listing small. Extra fields (such as the rest of a layout.createGrid
// result) are accepted and stripped.

const ElementPositionsSchema = z.array(z.object({
  id: identifier(),
  bounds: RectangleSchema
})).max(MAX_ELEMENTS);

/** What layout.measure reads: the type, the container and the computed element positions */
export const MeasuredLayoutSchema = z.union([
  z.object({
    type: z.literal('grid'),
    bounds: RectangleSchema,
    computedGrid: z.object({ elementPositions: ElementPositionsSchema.optional() }).optional()
      .describe('Element positions from layout.createGrid, used when no element has bounds')
  }),
  z.object({
    type: z.literal('flex'),
    bounds: RectangleSchema,
    computedFlex: z.object({ elementPositions: ElementPositionsSchema }).optional()
      .describe('Element positions from layout.createFlex, used when no element has bounds')
  })
]);

/** What layout.responsive reads: the grid or flex definition; positions are recomputed per breakpoint */
export const BaseLayoutSchema = z.union([
  GridLayoutSchema.omit({ computedGrid: true }),
  FlexLayoutSchema.omit({ computedFlex: true })
]);

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
  maxWidth: z.number().min(0).optional(),
  maxHeight: z.number().min(0).optional(),
  responsive: z.boolean().default(false)
});

// Bounded tool input lists
export const GridElementListSchema = z.array(GridElementSchema).max(MAX_ELEMENTS);
export const FlexElementListSchema = z.array(FlexElementSchema).max(MAX_ELEMENTS);
export const LayoutElementListSchema = z.array(LayoutElementSchema).max(MAX_ELEMENTS);
export const LayoutConstraintListSchema = z.array(LayoutConstraintSchema).max(MAX_CONSTRAINTS);
export const BreakpointListSchema = z.array(BreakpointSchema).max(MAX_BREAKPOINTS);

// Tool inputs: what each tool's handler validates, and (via toolInputSchema) what
// it advertises to MCP clients as its inputSchema.
const optimizeOption = () => z.boolean().default(true).describe('Whether to optimize the layout for performance');

export const CreateGridInputSchema = z.object({
  config: GridConfigSchema,
  elements: GridElementListSchema.describe('Array of elements to place in the grid'),
  bounds: RectangleSchema.describe('Container bounds for the grid layout'),
  optimize: optimizeOption()
});

export const CreateFlexInputSchema = z.object({
  config: FlexConfigSchema,
  elements: FlexElementListSchema.describe('Array of elements to place in the flex container'),
  bounds: RectangleSchema.describe('Container bounds for the flex layout'),
  optimize: optimizeOption()
});

export const AddConstraintsInputSchema = z.object({
  elements: LayoutElementListSchema.describe('Array of elements to position with constraints'),
  constraints: LayoutConstraintListSchema.default([]).describe('Global constraints to apply across elements'),
  bounds: RectangleSchema.describe('Container bounds for constraint solving')
});

export const AutoLayoutInputSchema = z.object({
  elements: LayoutElementListSchema.describe('Elements to arrange'),
  bounds: RectangleSchema.describe('Container bounds'),
  config: AutoLayoutConfigSchema.optional().describe('Direction, spacing, padding and alignment; defaults to a vertical stack 8px apart')
});

export const ResponsiveInputSchema = z.object({
  elements: LayoutElementListSchema.describe('Elements in the layout'),
  baseLayout: BaseLayoutSchema.describe('Grid or flex layout to adapt at each breakpoint, such as the `layout` returned by layout.createGrid or layout.createFlex'),
  breakpoints: BreakpointListSchema.optional()
    .describe('Breakpoints to use; when omitted (and generateOptimal is false) mobile 0-767, tablet 768-1023 and desktop 1024+'),
  generateOptimal: z.boolean().default(false).describe('Generate optimal breakpoints automatically'),
  minViewport: z.number().min(200).default(320).describe('Smallest viewport width for generated breakpoints'),
  maxViewport: z.number().min(800).default(1920).describe('Largest viewport width for generated breakpoints')
});

export const MeasureInputSchema = z.object({
  layout: MeasuredLayoutSchema.describe('Layout to analyze, such as the `layout` returned by layout.createGrid or layout.createFlex'),
  elements: LayoutElementListSchema.describe('Elements with their computed positions'),
  includeQualityReport: z.boolean().default(true).describe('Include detailed quality analysis and recommendations'),
  includeAccessibilityCheck: z.boolean().default(true).describe('Include accessibility metrics analysis'),
  includePerformanceAnalysis: z.boolean().default(true).describe('Include performance optimization suggestions')
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
export type MeasuredLayout = z.infer<typeof MeasuredLayoutSchema>;
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