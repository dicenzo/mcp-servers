import { z } from 'zod';

/**
 * Input size limits shared by every tool. They bound memory use and keep the
 * worst-case running time of the string processing below about one second.
 */
export const SVG_LIMITS = {
  /** Maximum length of SVG markup accepted as input (1 MB) */
  MAX_SVG_LENGTH: 1024 * 1024,
  /** Maximum length of SVG path data (256 KB) */
  MAX_PATH_LENGTH: 256 * 1024,
  /** Maximum length of text content and diagram source (64 KB) */
  MAX_TEXT_LENGTH: 64 * 1024,
  /** Maximum length of ids, class names, colors, font names and selectors */
  MAX_SHORT_STRING_LENGTH: 256,
  /** Maximum number of elements in a document, counting group children */
  MAX_ELEMENTS: 1000,
  /** Maximum number of points in a polygon or polyline */
  MAX_POINTS: 10000,
  /** Maximum nesting depth of groups */
  MAX_GROUP_DEPTH: 32,
  /** Maximum number of transforms in a single request */
  MAX_TRANSFORMS: 100,
  /** Maximum number of coordinates per path in boolean path operations (O(n*m)) */
  MAX_PATH_COORDINATES: 5000
} as const;

const shortString = () => z.string().max(SVG_LIMITS.MAX_SHORT_STRING_LENGTH);

// Base SVG Types
export const SVGDimensionsSchema = z.object({
  width: z.number().min(1).max(10000),
  height: z.number().min(1).max(10000)
});

export const SVGViewBoxSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().min(1),
  height: z.number().min(1)
});

// SVG Element Types
export const SVGBasicPropertiesSchema = z.object({
  id: shortString().optional(),
  className: shortString().optional(),
  fill: shortString().optional(),
  stroke: shortString().optional(),
  strokeWidth: z.number().optional(),
  opacity: z.number().min(0).max(1).optional()
});

export const SVGTransformSchema = z.object({
  type: z.enum(['translate', 'rotate', 'scale', 'skewX', 'skewY', 'matrix']),
  values: z.array(z.number()).max(6)
});

export const SVGRectSchema = SVGBasicPropertiesSchema.extend({
  type: z.literal('rect'),
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().min(0),
  height: z.number().min(0),
  rx: z.number().min(0).optional(),
  ry: z.number().min(0).optional()
});

export const SVGCircleSchema = SVGBasicPropertiesSchema.extend({
  type: z.literal('circle'),
  cx: z.number().default(0),
  cy: z.number().default(0),
  r: z.number().min(0)
});

export const SVGEllipseSchema = SVGBasicPropertiesSchema.extend({
  type: z.literal('ellipse'),
  cx: z.number().default(0),
  cy: z.number().default(0),
  rx: z.number().min(0),
  ry: z.number().min(0)
});

export const SVGLineSchema = SVGBasicPropertiesSchema.extend({
  type: z.literal('line'),
  x1: z.number().default(0),
  y1: z.number().default(0),
  x2: z.number().default(0),
  y2: z.number().default(0)
});

export const SVGPolygonSchema = SVGBasicPropertiesSchema.extend({
  type: z.literal('polygon'),
  points: z.array(z.object({ x: z.number(), y: z.number() })).max(SVG_LIMITS.MAX_POINTS)
});

export const SVGPolylineSchema = SVGBasicPropertiesSchema.extend({
  type: z.literal('polyline'),
  points: z.array(z.object({ x: z.number(), y: z.number() })).max(SVG_LIMITS.MAX_POINTS)
});

export const SVGPathSchema = SVGBasicPropertiesSchema.extend({
  type: z.literal('path'),
  d: z.string().max(SVG_LIMITS.MAX_PATH_LENGTH)
});

export const SVGTextSchema = SVGBasicPropertiesSchema.extend({
  type: z.literal('text'),
  x: z.number().default(0),
  y: z.number().default(0),
  content: z.string().max(SVG_LIMITS.MAX_TEXT_LENGTH),
  fontSize: z.number().min(1).optional(),
  fontFamily: shortString().optional(),
  textAnchor: z.enum(['start', 'middle', 'end']).optional()
});

type SVGLeafElementSchema =
  | typeof SVGRectSchema
  | typeof SVGCircleSchema
  | typeof SVGEllipseSchema
  | typeof SVGLineSchema
  | typeof SVGPolygonSchema
  | typeof SVGPolylineSchema
  | typeof SVGPathSchema
  | typeof SVGTextSchema;

type SVGGroupBase = z.infer<typeof SVGBasicPropertiesSchema> & { type: 'group' };
type SVGGroupBaseInput = z.input<typeof SVGBasicPropertiesSchema> & { type: 'group' };

export type SVGGroupElement = SVGGroupBase & { elements: SVGElement[] };
export type SVGElement = z.infer<SVGLeafElementSchema> | SVGGroupElement;
type SVGElementInput = z.input<SVGLeafElementSchema> | (SVGGroupBaseInput & { elements: SVGElementInput[] });

// Group children are validated with the full element schema, recursively
export const SVGGroupSchema = SVGBasicPropertiesSchema.extend({
  type: z.literal('group'),
  elements: z
    .array(z.lazy((): z.ZodType<SVGElement, z.ZodTypeDef, SVGElementInput> => SVGElementSchema))
    .max(SVG_LIMITS.MAX_ELEMENTS)
});

export const SVGElementSchema = z.discriminatedUnion('type', [
  SVGRectSchema,
  SVGCircleSchema,
  SVGEllipseSchema,
  SVGLineSchema,
  SVGPolygonSchema,
  SVGPolylineSchema,
  SVGPathSchema,
  SVGTextSchema,
  SVGGroupSchema
]);

// SVG Document Schema
export const SVGDocumentSchema = z.object({
  width: z.number().min(1),
  height: z.number().min(1),
  viewBox: SVGViewBoxSchema.optional(),
  elements: z.array(SVGElementSchema).max(SVG_LIMITS.MAX_ELEMENTS),
  metadata: z.object({
    title: z.string().max(SVG_LIMITS.MAX_TEXT_LENGTH).optional(),
    description: z.string().max(SVG_LIMITS.MAX_TEXT_LENGTH).optional(),
    keywords: z.array(shortString()).max(100).optional()
  }).optional()
});

// Tool Input/Output Schemas
export const SVGCreateInputSchema = SVGDocumentSchema;

export const SVGOptimizeInputSchema = z.object({
  svg: z.string().max(SVG_LIMITS.MAX_SVG_LENGTH),
  options: z.object({
    removeComments: z.boolean().default(true),
    removeEmptyElements: z.boolean().default(true),
    mergePaths: z.boolean().default(true),
    precision: z.number().min(1).max(10).default(3),
    removeUnusedDefs: z.boolean().default(true),
    minifyStyles: z.boolean().default(true)
  }).optional()
});

/** XML Name subset accepted for `#id` selectors (no regex or markup metacharacters) */
export const SVG_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;

export const SVGTransformInputSchema = z.object({
  svg: z.string().max(SVG_LIMITS.MAX_SVG_LENGTH),
  transforms: z.array(z.object({
    type: z.enum(['translate', 'rotate', 'scale', 'skewX', 'skewY']),
    values: z.array(z.number()).max(6),
    element: shortString()
      .refine(
        selector => !selector.startsWith('#') || SVG_ID_PATTERN.test(selector.slice(1)),
        { message: 'Invalid id selector: ids must match [A-Za-z_][A-Za-z0-9_.:-]*' }
      )
      .optional() // CSS selector for target element
  })).max(SVG_LIMITS.MAX_TRANSFORMS)
});

export const SVGPathOperationsInputSchema = z.object({
  path1: z.string().max(SVG_LIMITS.MAX_PATH_LENGTH), // SVG path data
  path2: z.string().max(SVG_LIMITS.MAX_PATH_LENGTH), // SVG path data
  operation: z.enum(['union', 'intersect', 'subtract', 'exclude'])
});

// Type exports
export type SVGDimensions = z.infer<typeof SVGDimensionsSchema>;
export type SVGViewBox = z.infer<typeof SVGViewBoxSchema>;
export type SVGDocument = z.infer<typeof SVGDocumentSchema>;
export type SVGCreateInput = z.infer<typeof SVGCreateInputSchema>;
export type SVGOptimizeInput = z.infer<typeof SVGOptimizeInputSchema>;
export type SVGTransformInput = z.infer<typeof SVGTransformInputSchema>;
export type SVGPathOperationsInput = z.infer<typeof SVGPathOperationsInputSchema>;

// Error types
export enum SVGErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_SVG = 'INVALID_SVG',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  OPTIMIZATION_FAILED = 'OPTIMIZATION_FAILED',
  TRANSFORMATION_FAILED = 'TRANSFORMATION_FAILED',
  PATH_OPERATION_FAILED = 'PATH_OPERATION_FAILED',
  PERFORMANCE_TIMEOUT = 'PERFORMANCE_TIMEOUT'
}

export interface SVGError {
  code: SVGErrorCode;
  message: string;
  details?: Record<string, unknown>;
  suggestions?: string[];
}

// SVGO Configuration Types
export interface SVGOOptions {
  precision?: number;
  removeComments?: boolean;
  removeEmptyElements?: boolean;
  removeUnusedDefs?: boolean;
  minifyStyles?: boolean;
  mergePaths?: boolean;
  removeMetadata?: boolean;
  removeViewBox?: boolean;
  aggressive?: boolean;
}

export interface SVGOConfig {
  multipass: boolean;
  precision: number;
  plugins: (string | { name: string; params: Record<string, unknown> })[];
}

// Path Operation Types
export interface PathOperationOptions {
  precision: number;
  tolerance: number;
}

export interface PathOperationArgs {
  precision?: number;
  tolerance?: number;
}